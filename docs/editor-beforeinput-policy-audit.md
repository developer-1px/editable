# Editor Beforeinput Policy Audit

작성일: 2026-06-22

범위: contenteditable 입력에서 `beforeinput`을 어느 정도 신뢰할지, ProseMirror-view의
최소 의존 전략과 Chrome Android uneditable-node Backspace fallback을 기준으로 정리한다.

## 판정

`beforeinput`은 primary truth가 아니라 intent signal이다. `inputType`은 "사용자가
무슨 편집 의도를 냈는지"를 분류하는 데 쓰고, 실제 document truth는 canonical
document/selection과 contenteditable view adapter의 flush/reset 결과가 결정한다.

따라서 우리 editor의 기본 순서는:

1. canonical selection/document를 먼저 읽는다.
2. `beforeinput`이 있으면 `inputType`, `data`, `dataTransfer`를 command 후보로
   분류한다.
3. active text leaf 안의 native typing/composition만 contenteditable에 맡긴다.
4. selection deletion, atom/block boundary deletion, paragraph split, transfer/history는
   command path로 처리하거나 명시적으로 native buffer를 flush한 뒤 처리한다.
5. browser가 DOM을 바꿨는지는 `input`/blur/command 전 flush와 future DOM observer가
   확인할 수 있지만, 그 자체가 document authority가 되지는 않는다.

## ProseMirror-view 근거

ProseMirror-view `input.ts`의 `beforeinput` handler는 일반 입력 처리에 거의 쓰지
않는다. 고정 커밋 `ca4c78e9` 기준으로 주석은 `beforeinput` 지원이 불균일해서 더
많이 쓰기 전까지 기다린다는 취지이고, 실제 처리는 Chrome Android에서 uneditable node
뒤 Backspace가 실패하는 특정 경우에 한정된다.

해당 fallback은 `inputType === "deleteContentBackward"`이고 Chrome Android일 때
`domObserver.flushSoon()`을 요청한 뒤, 50ms 뒤 DOM change count가 그대로이면 "native
delete가 효과를 내지 않았다"고 보고 blur/focus로 virtual keyboard를 복구한다. 이후
`handleKeyDown(Backspace)`를 먼저 시도하고, 없으면 cursor 직전 1 position delete라는
거친 fallback을 dispatch한다.

근거:

- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/input.ts#L806-L827
- 로컬 확인: `curl .../src/input.ts | nl -ba | sed -n '806,827p'`

해석: mature editor도 `beforeinput`을 "새 canonical input backend"로 보지 않는다. 특정
browser bug의 effect detector와 fallback trigger로 제한한다.

## 스펙과 호환성 근거

W3C Input Events는 `inputType`별 cancelability와 target range shape를 정의한다.
예를 들어 `insertCompositionText`는 IME composition 중이며 cancelable이 아니고,
`deleteContentBackward`, `deleteByCut`, `historyUndo` 등은 cancelable로 정의된다.
동시에 같은 spec은 browser가 모든 inputType을 지원한다는 뜻은 아니라고 둔다.

MDN은 `beforeinput`이 널리 지원된다고 정리하지만, 모든 사용자 수정에서 발생하지
않거나 non-cancelable일 수 있고, IME/자동수정/password manager 등은 browser/OS별로
다르므로 `input` event에서 되돌리는 경로도 필요하다고 경고한다.

근거:

- https://w3c.github.io/input-events/
- https://developer.mozilla.org/docs/Web/API/Element/beforeinput_event
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Element.json
- https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/InputEvent.json

## Browser Matrix

MDN browser-compat-data `main` 기준이다. 숫자는 feature availability이고, editor
correctness 신뢰도와는 다르다.

| Browser family | `beforeinput` | `getTargetRanges` | `dataTransfer` | `isComposing` | 신뢰도 판정 |
| --- | --- | --- | --- | --- | --- |
| Chrome / Chromium | 60 | 60 | 60 | 60 | intent 분류에는 사용. Android virtual keyboard와 uneditable boundary는 별도 fallback 필요. |
| Chrome Android / WebView | Chrome mirror | Chrome mirror | Chrome mirror | Chrome mirror | ProseMirror-view가 별도 hack을 둘 정도로 uneditable 뒤 Backspace effect를 불신해야 한다. |
| Firefox | 87 | 87 | 67 | 31 | feature는 있으나 MDN 경고대로 event 누락/non-cancelable 가능성을 열어 둔다. |
| Firefox Android | Firefox mirror | Firefox mirror | Firefox mirror | Firefox mirror | mobile keyboard event order는 real-device trace 없이는 닫지 않는다. |
| Safari | 10.1 | 10.1 | 10.1 | 16.4 | `isComposing`은 16.4부터라 IME path에서 event field만 신뢰하지 않는다. |
| iOS Safari / WebView iOS | Safari mirror | Safari mirror | Safari mirror | Safari mirror | virtual keyboard/selection handle은 desktop Safari와 분리해서 봐야 한다. |

## Chrome Android Uneditable Backspace Fixture

이 fixture는 jsdom replay로 만들면 안 된다. 실패 조건이 "real Chrome Android virtual
keyboard가 `beforeinput deleteContentBackward`를 발생시켰지만 contenteditable DOM
mutation이 실제로 일어나지 않는 것"이기 때문이다.

Fixture spec:

| 항목 | 값 |
| --- | --- |
| fixture id | `android-chrome-uneditable-backspace-after-atom` |
| 환경 | real Chrome Android 또는 Android WebView, hardware keyboard가 아니라 virtual keyboard |
| document | inline atom 또는 block atom 뒤에 caret을 둔 문서. 예: `Plain [mention] after` 또는 `paragraph`, `figure`, `paragraph` |
| trigger | virtual keyboard Backspace |
| 기대 event | `beforeinput deleteContentBackward`; 가능하면 뒤따르는 `input`/mutation 없음도 기록 |
| 기대 editor policy | native DOM delete effect가 없으면 canonical selection 기준 `deleteBackward` command로 atom/cursor unit을 삭제하거나, command가 no-op이면 document를 mutate하지 않는다 |
| focus policy | keyboard가 닫히면 focus recovery를 별도 effect로 기록한다. document mutation과 섞지 않는다 |
| 자동화 레벨 | `verify:browser`가 아니라 manual device trace 또는 별도 mobile-device gate |

현재 실행 가능한 대체 근거는 `docs/editor-input-contract.md`의 `DEL-01`, `SEL-04`,
`MUT-02`와 `src/editor/internal/model/textCommands.test.ts`,
`src/editor/internal/model/inputAdapter.test.ts`,
`src/editor/internal/fixtures/input/p0SelectionDeletionClipboardTrace.ts`다. 이들은 atom을
cursor unit으로 삭제/선택/대체하는 model policy를 닫지만, Chrome Android native bug를
재현하지는 않는다.

## 우선순위

| 입력 상황 | 1순위 | 2순위 | 금지 |
| --- | --- | --- | --- |
| active text leaf typing | native contenteditable buffer를 허용하고 release 시 one-patch flush | `beforeinput`의 `data`/`inputType`은 phase 분류 | 매 keystroke model commit |
| IME composition | composition phase state와 recorded trace replay | `isComposing`/`insertCompositionText`는 보조 신호 | `isComposing` 단독 신뢰 |
| paste/drop | DataTransfer/plain text를 읽어 command path로 정규화 | `beforeinput insertFromPaste/Drop`도 같은 transfer reader 사용 | browser DOM paste 결과를 authority로 채택 |
| historyUndo/Redo | native edit flush 뒤 editor history command | `beforeinput historyUndo/Redo`와 keymap 둘 다 같은 command routing | browser undo stack에 맡기기 |
| collapsed text delete inside text leaf | leaf 내부면 native buffer 또는 command path | grapheme snapping과 command tests | DOM offset을 canonical offset으로 무검증 채택 |
| atom/block boundary delete | canonical cursor unit command | real browser effect가 없으면 fallback trigger | contenteditable DOM deletion 결과를 직접 source of truth로 채택 |
| Chrome Android uneditable 뒤 Backspace | native effect detector 후 command fallback | focus recovery는 별도 side effect | `beforeinput` 발생만으로 성공 처리 |
| non-cancelable/missing beforeinput | `input`/flush/reset으로 canonical 복구 | browser trace를 evidence로 남김 | 새 기대값을 자동 테스트에 고정 |

## 현재 코드 판정

| 경로 | 판정 |
| --- | --- |
| `contentEditableBeforeInputFromEvent` | `inputType`, `data`, transfer text, `isComposing`만 좁게 추출한다. |
| `contentEditableViewEngine.planBeforeInput` | history, composition commit, native text leaf defer, ignore, headless command를 분류한다. |
| `useBlockEditorController.handleBeforeInput` | read-only는 preventDefault, history는 flush 뒤 command, native leaf는 defer, 나머지는 preventDefault 후 `runInput`으로 보낸다. |
| `translateEditorInput` | `beforeinput`은 model command input 중 하나일 뿐이고 document mutation은 command result가 만든다. |
| DOM observer | 현재 document authority가 아니다. 외부 drift guard가 필요해질 때 renderer-owned mutation ignore policy와 같이 설계해야 한다. |

## 증거 강도

| 항목 | 강도 | 근거 |
| --- | --- | --- |
| `beforeinput` primary truth 금지 | 확정 | ProseMirror-view 최소 의존 전략, MDN non-cancelable/missing 경고, current adapter tests |
| `inputType` intent classifier | 확정 | W3C Input Events table, current `translateEditorInput` mapping |
| transfer/history beforeinput 처리 | 확정 | `contentEditableBeforeInputFromEvent`, `BlockEditor.test.tsx`, clipboard/history tests |
| active text leaf native buffer | 확정 | `docs/editor-contenteditable-buffer-audit.md`, `contentEditableViewEngine.test.ts` |
| browser support matrix | 부분근거 | MDN BCD availability는 feature 존재만 말하고 event order/cancelability correctness를 닫지 않는다 |
| Chrome Android uneditable Backspace | fixture spec 확정 / 실행 미정 | ProseMirror-view source로 bug class는 확인했지만 real device trace는 아직 없다 |
| DOMObserver fallback | 보류 | current code는 reset/flush/read path로 복구한다. MutationObserver 기반 authority는 아직 설계하지 않는다 |

