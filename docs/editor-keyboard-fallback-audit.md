# Editor Keyboard Fallback Audit

작성일: 2026-06-22

범위: ignored DOM node, `contenteditable=false` atom, widget 주변에서 Arrow,
Backspace, Delete의 browser native default를 언제 막아야 하는지 정리한다.

## 판정

우리 editor는 ProseMirror-style ignored widget DOM을 contenteditable text flow 안에
넣는 구조가 아니다. 현재 위험 구간은 mention/figure atom처럼
`contentEditable={false}`로 렌더되는 atom 주변 cursor movement와 deletion이다.

따라서 현재 정책은 native browser cursor/delete default에 맡기지 않는 것이다.

- Arrow/Home/End/Page movement는 headless movement command가 canonical selection을
  계산한다.
- Shift+Arrow selection extension도 model cursor stream에서 atom을 one unit으로
  확장한다.
- Backspace/Delete/Enter/Tab/Escape는 editor-owned keydown이다.
- printable keydown과 active text leaf native input만 browser/contenteditable buffer에
  맡긴다.
- temporary DOM mutation rollback은 지금 쓰지 않는다. 실제 Safari/Android trace가
  나오기 전까지 `contenteditable=false`를 잠깐 `true`로 바꾸는 workaround는 보류한다.

## ProseMirror-view 근거

ProseMirror-view는 browser native cursor/delete가 ignored DOM이나 non-text node 주변에서
깨지는 것을 별도 key capture layer로 막는다.

| ProseMirror path | 하는 일 | 우리 쪽 해석 |
| --- | --- | --- |
| `skipIgnoredNodesBefore/After` | cursor가 ignored node 바로 앞뒤에 있으면 DOM selection focus를 이동시킨다. Gecko noneditable 앞 oddity도 별도 처리한다. | ignored zero-size widget을 editable flow 안에 넣으면 selection correction layer가 필요하다. |
| `stopNativeHorizontalDelete` | empty text selection이 textblock 끝이거나 non-text node 옆이면 native Backspace/Delete를 막고 transaction delete로 처리한다. | atom/block boundary deletion은 browser DOM delete가 아니라 canonical command가 해야 한다. |
| `safariDownArrowBug` | Safari가 textblock 시작 + uneditable node 뒤에서 Down Arrow를 잘못 처리하므로 20ms 동안 해당 node를 editable로 바꿨다가 되돌린다. | timed rollback workaround는 browser-specific trace 없이는 추가하지 않는다. |
| `captureKeyDown` | Backspace/Delete/Enter/Esc/Arrow/Mod-B/I/Y/Z 같은 dangerous native default를 keydown에서 캡처한다. | 우리 `isHeadlessKeyDown` + `editorKeymap` split과 같은 책임이다. |

근거:

- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/capturekeys.ts#L62-L157
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/capturekeys.ts#L266-L280
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/capturekeys.ts#L283-L304
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/capturekeys.ts#L306-L345

## Fixture

새 replay fixture:

- `p0-atom-keyboard-navigation`
- 파일: `src/editor/internal/fixtures/input/p0SelectionDeletionClipboardTrace.ts`
- 실행: `src/editor/internal/react/block-editor/BlockEditor.inputTrace.test.tsx`

이 fixture는 mention atom을 pointer로 선택한 뒤:

1. `ArrowRight`가 selected atom range를 browser default에 맡기지 않고 atom `after` edge로
   collapse하는지 확인한다.
2. `ArrowLeft`가 atom `after`에서 atom `before`로 이동하는지 확인한다.
3. `Shift+ArrowRight`가 atom `before`에서 atom 전체를 selected pointer로 확장하는지
   확인한다.

이름에 "ignored DOM"을 직접 넣지 않은 이유는 현재 editor에는 ProseMirror widget처럼
`size == 0`인 ignored view desc가 없다. 현재 실행 가능한 동등 위험 구간은
`contenteditable=false` atom이다.

## Suppression Criteria

| Event | writable policy | read-only policy | 이유 |
| --- | --- | --- | --- |
| printable keydown | pass-through | mutation key면 prevent/no-op | text 입력은 beforeinput/native buffer phase가 맡는다. |
| composition-owned keydown | prevent only when engine owns composition state | prevent/no-op | IME preedit을 normal key command로 처리하지 않는다. |
| ArrowLeft/Right/Up/Down | prevent when command handled | selection movement allowed | atom/edge/range collapse를 model cursor stream이 계산한다. |
| Shift+Arrow | prevent when command handled | range extension allowed | browser native range가 atom selection을 깨지 않게 한다. |
| Home/End/PageUp/PageDown | prevent when command handled | selection movement allowed | geometry adapter와 canonical selection이 authority다. |
| Backspace/Delete | prevent when handled, including no-op structural shortcut | mutation blocked/no-op | textblock edge, atom, block boundary native delete를 불신한다. |
| Enter | prevent when handled | mutation blocked/no-op | paragraph split/list policy는 model command다. |
| Tab/Shift+Tab | prevent when handled | mutation blocked/no-op | list depth/text tab policy가 browser focus movement보다 우선한다. |
| Escape | prevent when handled | selection no-op allowed | selection/cancel command ownership이다. |
| copy/cut keymap | prevent, custom clipboard/cut routing | copy allowed, cut no mutation | browser clipboard/delete coupling을 분리한다. |
| paste keymap | pass-through to paste event | paste mutation blocked at paste/beforeinput | keydown에서 삽입을 추측하지 않는다. |
| unsupported system shortcut | pass-through | pass-through unless mutation key | app/browser/system shortcut ownership을 만들지 않는다. |

## Rollback / Timed Fallback

현재는 20ms/50ms rollback fallback을 추가하지 않는다.

| 후보 | 판정 | 이유 |
| --- | --- | --- |
| ignored node skip after Arrow | 불필요 | renderer가 ignored zero-size widget을 editable flow에 넣지 않는다. Atom은 model cursor stop이다. |
| native horizontal delete fallback | command path로 대체 | Backspace/Delete는 `isHeadlessKeyDown`이 잡고 `translateEditorInput`이 delete command로 처리한다. |
| Safari temporary `contentEditable=true` hack | 보류 | current browser gate/trace에 해당 bug가 없다. Timed DOM mutation은 renderer authority를 흐린다. |
| Chrome Android no-effect delete detector | 별도 이슈 | `editor-beforeinput-policy-audit.md`의 Android fixture spec에서 다룬다. |

timed fallback을 추가할 조건은 하나뿐이다. 실제 browser trace가 "canonical command path로
막을 수 없는 native movement bug"를 보여주고, renderer-owned DOM mutation과 observer
pause/resume 범위를 명확히 둘 수 있어야 한다.

## 현재 코드 판정

| 경로 | 판정 |
| --- | --- |
| `DocumentRenderer.tsx` | mention과 figure는 `contentEditable={false}` atom으로 렌더된다. |
| `editorKeyboardPolicy.ts` | movement/editing structural keys를 editor-owned keydown으로 분리한다. |
| `editorKeymap.ts` | clipboard/history platform shortcut을 keymap registry로 분리한다. |
| `useBlockEditorController.handleKeyDown` | composition guard, keymap, read-only guard, headless keydown 순서로 native default를 제한한다. |
| `cursor.ts` / `cursorCommands.ts` | atom을 one cursor unit으로 보고 movement/range extension을 계산한다. |
| `textCommands.ts` / `inputAdapter.ts` | Backspace/Delete가 atom/block/text boundary를 command result로 처리한다. |
| `p0-atom-keyboard-navigation` | atom selection collapse와 Shift extension이 replay fixture로 고정됐다. |

## 증거 강도

| 항목 | 강도 | 근거 |
| --- | --- | --- |
| atom 주변 Arrow native suppression | 실행 테스트로 확정 | `p0-atom-keyboard-navigation`, cursor command tests, input adapter tests |
| atom 주변 Shift+Arrow selection extension | 실행 테스트로 확정 | `p0-atom-keyboard-navigation`, cursor command split tests |
| Backspace/Delete native suppression | 실행 테스트로 확정 | `editorKeyboardPolicy.test.ts`, inputAdapter split tests, text command split tests |
| ignored zero-size widget policy | 현재 불필요 | editor renderer가 ProseMirror widget decoration DOM을 쓰지 않는다 |
| timed rollback fallback | 보류 | ProseMirror source는 근거지만 우리 browser trace가 없다 |
| cross-browser native movement parity | 미정 | Playwright smoke와 jsdom replay는 있지만 Safari/Android device-specific arrow/delete bugs를 닫지 않는다 |

