# Editor Contenteditable Buffer Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `contentEditableViewEngine`이 빼면 안 되는
view adapter인지, 아니면 더 일반적인 input backend 추상화나 browser matrix 결정으로
남겨야 하는지 구분한다.

## 판정

`contentEditableViewEngine`은 public editor API가 아니라 React editor 내부의 DOM/view
adapter다. 현재 확정할 수 있는 interface는 "contenteditable native text buffer의
권한을 active text leaf 안으로 제한하고, release 시 canonical patch와 selection으로
되돌린다"까지다.

이 module을 삭제하거나 React event handler 안으로 다시 풀면 native DOM state,
composition phase, beforeinput classification, DOM selection mapping knowledge가
`BlockEditor`에 흩어진다. 반대로 지금 단계에서 generic `InputBackend`나
`EditContextBackend`를 만들면 실제 두 번째 backend 없이 개념 수만 늘어난다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| native text leaf gate | browser editing은 active text leaf 안에서만 `deferToContentEditable`로 허용한다. selection이 열린 일반 text insertion이나 다른 leaf로 이동한 active edit은 headless path로 돌아간다. | `contentEditableViewEngine.ts`, `contentEditableViewEngine.test.ts` |
| active mark guard | collapsed active mark insertion은 native DOM edit으로 맡기지 않고 command path로 보낸다. 그래야 inserted text에 canonical marks가 붙는다. | `contentEditableViewEngine.test.ts`, `BlockEditor.test.tsx` |
| one-patch flush | native text mutation은 release 시 text leaf `replace` patch 하나와 snapped selection으로 canonical state에 반영한다. per-keystroke model sync가 아니다. | `contentEditableViewEngine.test.ts`, `BlockEditor.test.tsx` |
| DOM restore | reset은 textContent가 같아도 foreign DOM wrapper를 제거하고 renderer-owned text node 형태로 되돌린다. read-only recovery도 이 경로를 쓴다. | `contentEditableViewEngine.test.ts`, `editor-read-only-policy-audit.md` |
| grapheme snapping | DOM selection과 flushed caret offset은 grapheme boundary로 snap한다. multi-code-unit text 중간 caret을 canonical offset으로 그대로 신뢰하지 않는다. | `contentEditableViewEngine.test.ts`, `cursor/selection tests` |
| composition phase | composition start/end, awaiting final commit, duplicate final commit 제거, differing final commit replacement, repeated-text preedit, stale composition end 방지를 engine-level tests가 고정한다. | `contentEditableViewEngine.ts`, `contentEditableViewEngine.test.ts` |
| retargeted composition | browser가 composition caret을 다른 text leaf로 옮기면 engine은 retargeted text leaf를 active path로 삼아 flush한다. | `contentEditableViewEngine.test.ts` |
| history beforeinput | `historyUndo`/`historyRedo`는 editor history decision으로 분리하고, composition이 active일 때는 browser history input을 ignore한다. | `contentEditableViewEngine.test.ts`, `BlockEditor.test.tsx` |
| transfer beforeinput | paste/drop beforeinput은 custom MIME, markdown, plain text transfer reader를 통해 input adapter에 전달할 text/format으로 정규화한다. | `contentEditableBeforeInputFromEvent`, `clipboard tests` |
| code block backing leaf | code block edge selection은 `/root/children/{index}/text` backing leaf로 mapping되어 native text buffer가 쓸 수 있다. | `contentEditableViewEngine.test.ts` |
| selection utilities | DOM selection read/set/scroll utilities는 text run, mark element boundary, empty text run, code block text leaf를 canonical cursor point와 연결한다. | `contentEditableSelection.ts`, `contentEditableViewEngine.test.ts`, `docs/editor-native-selection-bridge-audit.md` |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| `contentEditableViewEngine` module | 확정 | `BlockEditor.tsx`가 `createContentEditableViewEngine()`를 통해 beforeinput, input, composition, blur/history/toolbar 전 command flush를 한 view adapter로 사용한다. | Public editor API나 future generic input backend라는 뜻은 아니다. |
| active text leaf gate | 확정 | `contentEditableViewEngine.test.ts`가 active leaf 안의 native edit 허용, 다른 text leaf 이동 시 headless fallback, open range 일반 `insertText` headless fallback, composition open range 예외를 고정한다. | Browser별 native selection event ordering 전체를 닫은 것은 아니다. |
| active mark insertion guard | 확정 | Engine test는 active mark text insertion을 `runHeadless`로 보내고, `BlockEditor.test.tsx`는 keyboard shortcut/IME active mark 삽입이 marked text로 커밋됨을 확인한다. | Link input UX나 future mark set 확장은 별도 mark policy다. |
| one-patch native flush | 확정 | Engine test가 native mutation을 text leaf `replace` patch 하나와 snapped `selectionAfter`로 반환하고, React tests가 blur/history/copy/cut/paste/toolbar 전 flush를 검증한다. | Focus 유지 중 여러 native edit session의 automatic merge policy는 아직 닫지 않았다. |
| DOM restore/recovery | 확정 | Engine test가 matching textContent여도 foreign wrapper를 제거하고, React tests가 read-only 전환/조합 입력에서 DOM을 canonical view로 되돌리는 것을 검증한다. | MutationObserver 기반 외부 drift 감시 정책은 별도 설계가 필요하다. |
| grapheme-safe selection mapping | 확정 | Engine tests가 collapsed DOM selection과 flushed native caret offset을 grapheme boundary로 snap하고, mark element boundary/empty text run/code backing leaf mapping을 고정한다. | Complex browser DOM Range matrix나 multi-range selection은 닫지 않았다. |
| composition phase handling | 확정 | Engine tests가 final commit once, no-observed-text commit keep, duplicate final removal, differing final commit replacement, repeated-text preedit, stale composition end, retargeted composition을 닫는다. IME trace tests가 Korean replay를 보강한다. | Browser/OS IME 전체 matrix나 trace capture pipeline은 제품 QA 결정이다. |
| beforeinput transfer/history decision | 확정 | Engine tests가 paste/drop transfer reader와 history undo/redo decision, composition 중 history ignore를 고정하고, React tests가 beforeinput history undo/redo와 markdown paste path를 검증한다. | Full focus/blur/selectionchange/beforeinput/input ordering matrix는 별도 browser automation scope다. |
| generic input backend abstraction | 미정 | 현재 실제 backend는 contenteditable 하나뿐이고 두 번째 adapter가 없다. | Web EditContext 같은 실제 backend가 도입될 때 interface를 다시 설계해야 한다. |
| MutationObserver drift guard | 미정 | 현재 reset/flush/read path로 known drift를 처리하지만 renderer-owned mutation ignore strategy는 없다. | 외부 DOM mutation 감시가 필요해질 때 ownership policy와 함께 설계한다. |
| release-level IME/browser matrix | 미정 | Unit/React/trace replay 근거는 있으나 Safari/Firefox/Windows/Android/iOS IME 조합을 닫지 않는다. | Release gate로 승격하려면 real-browser matrix를 별도로 추가해야 한다. |

## 아직 애매하거나 제품/플랫폼 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| browser/OS IME matrix | engine-level composition cases와 Korean trace replay는 있지만 모든 browser/OS IME 조합을 제품 QA로 닫은 것은 아니다. | real-browser IME matrix를 release gate로 둘지 결정한다. |
| future backend abstraction | 현재 실제 backend는 contenteditable 하나뿐이다. `InputBackend`나 `EditContextBackend`는 두 번째 backend가 생기기 전까지 가설이다. | Web EditContext나 다른 input backend를 실제로 도입할 때 interface를 설계한다. |
| MutationObserver policy | design document는 MutationObserver를 "renderer self-mutation을 구분할 수 있을 때까지 보류"로 둔다. 현재 engine은 reset/flush/read 경로로 DOM drift를 다룬다. | 외부 DOM mutation 감시가 필요해지면 renderer-owned mutation ignore strategy와 같이 설계한다. |
| full browser event ordering | blur/focus/selectionchange/beforeinput/input/composition ordering 전체 조합을 자동 matrix로 닫지는 않았다. | browser automation QA 범위와 별도 gate를 정한다. |
| native buffer transaction merge | native edit은 release 시 one patch가 되지만 focus를 유지한 여러 native edit session을 timer/punctuation/composition 기준으로 자동 merge하는 정책은 history audit의 보류 항목이다. | typing merge policy가 필요하면 history grouping surface와 같이 결정한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `contentEditableViewEngine` | 유지 확정 | native text buffer, IME phase, beforeinput decision, text leaf flush를 한 adapter interface 뒤에 모은다. 삭제하면 React wiring에 DOM/browser state knowledge가 퍼진다. |
| `contentEditableSelection` utilities | 유지 확정 | DOM selection과 canonical cursor point를 연결하는 view adapter다. geometry, native range, empty text caret, mark element boundary tests가 의존한다. 세부 확정 범위는 `docs/editor-native-selection-bridge-audit.md`로 분리했다. |
| per-keystroke model sync | 제거 확정 | active native edit 동안 매 input을 model commit으로 만들지 않는 것이 ED-020의 확정 정책이다. |
| generic input backend abstraction | 보류 | 현재 두 번째 backend가 없어서 새 abstraction은 얕은 pass-through가 된다. |
| MutationObserver drift guard | 보류 | 현재 결함을 줄이는 확정 변경이 아니라 browser/renderer mutation ownership 설계가 필요하다. |

## 현재 결론

contenteditable buffer에서 빼면 안 되는 것은 active text leaf gate,
beforeinput decision, composition phase handling, one-patch flush, DOM restore,
selection mapping utilities다. 확정하면 안 되는 것은 browser/OS IME matrix 전체,
generic input backend abstraction, MutationObserver policy, full browser event-ordering
matrix, future native buffer transaction merge다.
