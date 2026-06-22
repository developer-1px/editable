# Editor Keyboard Input Policy Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. keyboard 입력이 브라우저 native 동작, React
event wiring, headless command adapter 중 어디에 속하는지 나누고, 확정 정책과
아직 제품 결정으로 남길 항목을 구분한다.

## 판정

keyboard input surface는 하나의 global shortcut map이 아니라 두 개의 좁은
interface로 확정한다.

- `isHeadlessKeyDown`은 view boundary의 keydown ownership gate다. 브라우저가
  native 편집을 실행하면 안 되는 keydown만 고른다.
- `translateEditorInput`은 model boundary의 input adapter다. keydown,
  beforeinput, paste를 canonical command 또는 selection result로 바꾼다.
- `BlockEditor`는 printable text를 keydown에서 직접 처리하지 않고 native
  contenteditable/beforeinput path로 둔다. structural editing, movement, mark
  shortcuts만 headless keydown으로 보낸다.

따라서 현재 확정은 "모든 shortcut을 앱이 잡는다"가 아니다. 확정은 editor-owned
입력과 browser/system-owned 입력을 분리해서 canonical document가 native DOM
mutation에 끌려가지 않게 하는 것이다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| keydown ownership gate | `Tab`, movement keys, `Escape`, `Cmd/Ctrl+A/B/I/E/K`, structural `Backspace`/`Delete`/`Enter`를 editor-owned keydown으로 본다. Unsupported structural modifier 조합도 native edit을 막기 위해 owned no-op으로 잡는다. | `editorKeyboardPolicy.ts`, `editorKeyboardPolicy.test.ts` |
| browser/system pass-through | `F1` 같은 function key, `Cmd/Ctrl+S`, `Cmd/Ctrl+P`, `Cmd/Ctrl+U`, `Alt+Tab`처럼 현재 editor command가 아닌 shortcut은 ownership gate에서 false다. | `editorKeyboardPolicy.test.ts`, `inputAdapter.test.ts`, ED-029 |
| model input adapter | owned keydown은 cursor movement, select-all, mark toggle, link toggle, list indent/outdent, delete, split, no-op selection result로 변환된다. | `inputAdapter.ts`, `inputAdapter.test.ts` |
| beforeinput adapter | `insertText`, `insertReplacementText`, paste/drop insertion, paragraph/line break, delete/cut, word delete variants는 command layer로 수렴한다. | `inputAdapter.ts`, `inputAdapter.test.ts` |
| React wiring | `BlockEditor`는 writable mode에서 printable keydown을 document mutation으로 쓰지 않는다. structural keydown은 flush 후 `translateEditorInput`으로 보내고 handled result일 때만 `preventDefault`한다. | `BlockEditor.tsx`, `BlockEditor.test.tsx` |
| composition guard | composing 중 keydown/beforeinput은 normal command path로 강제하지 않는다. IME commit은 별도 composition/beforeinput path가 맡는다. | `BlockEditor.imeTrace.test.tsx`, `inputAdapter.test.ts` |
| read-only guard | React read-only mode에서는 beforeinput/paste/delete/printable/mark/Tab mutation을 patch 없이 막고 movement/selection은 유지한다. | `inputAdapter.ts`, `inputAdapter.test.ts`, `editor-read-only-policy-audit.md` |
| line break/list policy | `Enter`, `insertParagraph`, `insertLineBreak`, list `Tab`/`Shift+Tab`, non-list `Tab` text insertion은 미정이 아니라 실행 테스트로 고정된 current policy다. | `editor-line-break-policy-audit.md`, `inputAdapter.test.ts` |

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| keydown ownership gate | 실행 테스트로 확정 | `editorKeyboardPolicy.test.ts`가 Tab, movement keys, Escape, supported mark/link/select-all shortcuts, structural editing keys를 editor-owned로 검증한다. |
| printable keydown pass-through | 실행 테스트로 확정 | `editorKeyboardPolicy.test.ts`가 plain printable keydown을 not-owned로 검증하고, `BlockEditor.test.tsx`가 printable keydown만으로 document mutation이 생기지 않음을 검증한다. |
| browser/system shortcut pass-through | 실행 테스트로 확정 | `editorKeyboardPolicy.test.ts`와 `inputAdapter.test.ts`가 F-key, `Cmd/Ctrl+S`, `Cmd/Ctrl+P`, writable `Cmd/Ctrl+U`, `Alt+Tab`을 editor command가 아닌 pass-through로 검증한다. |
| unsupported structural shortcut no-op | 실행 테스트로 확정 | `editorKeyboardPolicy.test.ts`와 `inputAdapter.test.ts`가 command Backspace/Delete, `Alt+Enter`를 editor-owned handled no-op으로 검증한다. |
| model input adapter mapping | 실행 테스트로 확정 | `inputAdapter.test.ts`가 movement/select-all/mark/link/list/delete/split/Escape keydown mapping을 command 또는 selection result로 검증한다. |
| beforeinput/paste adapter mapping | 실행 테스트로 확정 | `inputAdapter.test.ts`가 insert text, replacement text, paste/drop, paragraph/line break, delete/cut, word delete beforeinput을 canonical command path로 검증한다. |
| React keydown/beforeinput split | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 printable keydown은 native/beforeinput path에 맡기고 structural keydown은 headless command path로 처리한다고 검증한다. |
| composition guard | 실행 테스트로 확정 | `inputAdapter.test.ts`와 `BlockEditor.imeTrace.test.tsx`가 composing 중 normal keydown/beforeinput command path를 강제하지 않고 IME Enter confirmation이 paragraph split으로 새지 않음을 검증한다. |
| read-only keyboard/input guard | 실행 테스트로 확정 | `inputAdapter.test.ts`, `BlockEditor.test.tsx`, `docs/editor-read-only-policy-audit.md`가 read-only mutation no-op과 movement/selection 유지를 검증한다. |
| line break/list policy | 실행 테스트로 확정 | `docs/editor-line-break-policy-audit.md`, `docs/editor-block-command-audit.md`, `inputAdapter.test.ts`가 Enter/line break/list Tab/non-list Tab current policy를 검증한다. |
| global app shortcut layer | 미정 | pass-through는 editor command가 아니라는 뜻이며, future app shell 저장/검색/프린트 shortcut policy는 별도 layer 결정이다. |
| OS/browser shortcut matrix와 customization | 미정 | current tests는 editor-owned/pass-through 분리만 닫고, OS/browser별 native shortcut matrix나 user-configurable hotkey system은 닫지 않는다. |
| underline mark shortcut | 미정/future feature | schema/renderer/markdown/command에 underline mark가 없으므로 `Cmd/Ctrl+U`는 현재 writable editor command가 아니다. |
| assistive-tech keyboard announcement | 미정 | role/focus/read-only attribute와 visual affordance는 있지만 보조 기술별 announcement matrix는 별도 QA가 필요하다. |

## 아직 애매하거나 제품 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| global app shortcut policy | 현재 pass-through shortcut은 editor command가 아니라는 뜻이지, 미래 제품 앱이 `Cmd/Ctrl+S` 같은 global command를 절대 갖지 않는다는 뜻은 아니다. | 문서 저장/검색/프린트 같은 app shell command가 생기면 editor ownership gate와 별도 app shortcut layer를 설계한다. |
| platform/browser shortcut matrix | 현재 adapter는 `metaKey || ctrlKey`를 command intent로, `altKey`를 word/block movement intent로 취급한다. OS/browser별 native shortcut 전체 matrix를 제품 QA로 닫은 것은 아니다. | macOS/Windows/Linux/browser matrix가 필요하면 release QA gate로 분리한다. |
| writable `Cmd/Ctrl+U` behavior | schema에는 underline mark가 없고, ED-029 기준으로 unsupported command shortcut은 pass-through다. read-only는 mutation safety 때문에 더 보수적으로 막는다. | underline mark나 explicit browser underline block이 제품 요구가 되면 schema/renderer/markdown/adapter 전체를 같이 설계한다. |
| keyboard customization | 현재 key mapping은 user-configurable hotkey system이 아니다. | 제품에서 shortcut customization이 필요할 때 별도 configuration interface를 둔다. |
| assistive-tech announcement | role/focus/read-only attributes와 visual affordance는 있지만 보조 기술별 keyboard/focus announcement를 완료했다고 보기는 어렵다. | 접근성 QA matrix와 같이 확인한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `isHeadlessKeyDown` ownership gate | 유지 확정 | 브라우저 native edit을 막아야 하는 keydown만 React boundary가 가로채게 하는 작은 interface다. 삭제하면 printable keydown과 structural keydown 구분이 흐려진다. |
| `translateEditorInput` adapter | 유지 확정 | keyboard, beforeinput, paste를 canonical command/selection result로 모으는 model interface다. 삭제하면 React event handling에 command knowledge가 퍼진다. |
| unsupported command pass-through | 유지 확정 | ED-029가 F-key와 unsupported `Cmd/Ctrl` shortcut을 browser/system-owned로 남긴다. 전부 잡으면 app-level shortcut policy를 성급히 만든다. |
| separate global hotkey registry | 보류 | 현재 editor correctness를 위해 필요한 개념이 아니다. 저장/검색 같은 app command가 생기기 전에는 과잉 구조다. |
| underline mark shortcut | 보류 | schema/renderer/markdown에 underline mark가 없으므로 `Cmd/Ctrl+U`만 추가하면 얕은 shortcut이 된다. |

## 현재 결론

keyboard input에서 빼면 안 되는 것은 `isHeadlessKeyDown` ownership gate,
`translateEditorInput` adapter, React의 beforeinput/keydown 분리, composition/read-only
guards다. 확정하면 안 되는 것은 global app shortcut policy, OS/browser shortcut
matrix, underline mark, user-configurable hotkey system이다.
