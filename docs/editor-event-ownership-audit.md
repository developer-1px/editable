# Editor event ownership audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. ProseMirror `stopEvent`/event delegation 사례를
근거로, editor root가 처리해야 하는 DOM event와 custom node/widget이 소유해야 하는
event를 분리한다.

## 목적

contenteditable root는 key, pointer, clipboard, composition, beforeinput을 한 곳에서
받는다. 하지만 toolbar, widget button, resize handle, nested editor, shadow root
같은 surface가 생기면 모든 bubbling event를 editor가 처리하면 안 된다.

현재 editor에는 custom node view나 widget `stopEvent` hook이 없다. 이 문서는 current
event ownership을 확정하고, future custom owner가 들어올 때의 우선순위를 정한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| ProseMirror root event handler | root handler는 view에 속하고 custom handler를 통과한 event만 기본 handler로 보낸다. |
| ProseMirror `eventBelongsToView` | shadow boundary 또는 `pmViewDesc.stopEvent(event)`를 만나면 editor event가 아니라고 본다. |
| ProseMirror `NodeView.stopEvent` | node view에서 bubbling된 DOM event를 editor가 처리하지 않게 하는 hook이다. |
| ProseMirror widget `stopEvent` | widget decoration도 자체 event ownership을 선언할 수 있다. |
| `src/editor/internal/react/block-editor/BlockEditor.tsx` | editor root는 key/beforeinput/input/paste/drop/copy/cut/pointer/select/focus/composition handlers를 소유한다. |
| `src/editor/internal/view/editorKeyboardPolicy.ts` | root keydown ownership gate는 editor-owned key와 pass-through key를 나눈다. |
| `src/editor/internal/react/EditorToolbar.tsx` | toolbar는 editor root 밖 command UI이고 mouse down focus steal을 `preventDefault`로 막는다. |
| `src/editor/internal/view/blockEditorSelection.ts` | mention/figure atom pointer target은 root pointer handler가 document atom selection으로 처리한다. |
| `docs/editor-widget-decoration-lifecycle-audit.md` | 현재 overlay는 handler 없는 widget-like DOM이고, future widget은 event/destroy policy가 필요하다. |

## Event ownership decision table

| event source | current owner | 처리 |
| --- | --- | --- |
| editor root text/selection surface | editor root | key/beforeinput/input/paste/drop/copy/cut/pointer/select/composition handlers가 canonical command 또는 selection으로 변환한다. |
| plain printable keydown | browser/native input | root keydown gate에서 mutation으로 처리하지 않고 beforeinput/input path를 기다린다. |
| structural keydown | editor root | Enter/Backspace/Delete/movement/mark/link/select-all/history/clipboard keymap은 root가 소유한다. |
| unsupported system shortcut | browser/app shell | `Cmd/Ctrl+S`, `Cmd/Ctrl+P`, F-key 등 current editor command가 아닌 shortcut은 pass-through다. |
| mention/figure atom pointer | editor root | atom DOM은 document node이므로 root가 node selection/shift range selection으로 처리한다. |
| selection/cursor overlay | 없음 | overlay는 `aria-hidden`이고 event handler가 없다. Selection source가 아니다. |
| toolbar button mouse down | toolbar | focus steal 방지를 위해 toolbar가 `preventDefault`한다. editor root pointer selection이 아니다. |
| toolbar button click | toolbar command bridge | click은 toolbar command로 editor command를 호출한다. Native selection event가 아니다. |
| debug recorder hotkey | debug recorder capture handler | recording toggle은 global diagnostic handler가 소유한다. Editor text input으로 보내지 않는다. |
| future resize handle/widget button | widget/node view | 자체 UI event는 widget이 소유하고 root editor selection logic으로 보내지 않는다. |
| future nested editor/input | nested owner | key/composition/selection을 inner owner가 소유한다. outer editor는 focus/handoff boundary만 처리한다. |
| future shadow boundary | shadow owner | composed path가 outer editor root ownership을 벗어나면 outer root가 처리하지 않는다. |

## Priority policy

| 단계 | 정책 |
| --- | --- |
| 1. Event does not reach root | `stopPropagation`, shadow boundary, separate root 때문에 editor root handler에 도달하지 않으면 editor-owned event가 아니다. |
| 2. Future `stopEvent` equivalent | custom node/widget이 명시적으로 소유한 event는 editor root 기본 handler보다 먼저 배제한다. |
| 3. UI focus guard | toolbar처럼 root 밖 UI는 mouse down `preventDefault`로 native focus/selection 이동을 막는다. |
| 4. Root ownership gate | root에 도달한 keydown은 `editorKeyboardPolicy`; pointer는 selectable atom/geometry hit; transfer는 clipboard/drop reader가 소유 여부를 판단한다. |
| 5. Command dispatch | owned event만 canonical selection 또는 document command로 변환한다. |

현재 코드에는 2단계 hook이 없다. 실제 custom node/widget producer가 없기 때문이다.

## Current reproduction coverage

| scenario | coverage |
| --- | --- |
| toolbar button mouse down | BlockEditor split tests가 toolbar mouse down이 default-prevented되고 editor focus/selection을 유지한다고 검증한다. |
| toolbar callback focus guard | `EditorToolbar.test.tsx`가 toolbar button mouse down preventDefault와 click callback dispatch를 검증한다. |
| atom pointer selection | BlockEditor split tests가 mention atom pointer down이 node selection을 만들고 copy fallback을 유지한다고 검증한다. |
| stale native range vs atom selection | BlockEditor split tests가 stale native text range가 explicit atom selection을 덮지 못한다고 검증한다. |
| pass-through keyboard policy | `editorKeyboardPolicy.test.ts`와 input adapter tests가 system shortcuts와 owned keydown을 분리한다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current custom `stopEvent` hook 부재 | source 확정 | custom node view/widget registry가 없고 root React handlers가 직접 event를 받는다. | future widget producer가 생기면 별도 hook이 필요하다. |
| toolbar ownership | 실행 테스트로 확정 | toolbar mouse down preventDefault, editor focus/selection 유지, command callback dispatch가 테스트로 닫혀 있다. | floating toolbar/portal/shadow UI는 없다. |
| atom pointer ownership | 실행 테스트로 확정 | mention/figure atom DOM target은 root pointer handler가 document atom selection으로 처리한다. | atom 내부 button/resize handle은 현재 없다. |
| keyboard ownership gate | 실행 테스트로 확정 | owned structural key, pass-through system key, printable beforeinput path가 테스트로 닫혀 있다. | browser/OS shortcut matrix 전체는 아니다. |
| shadow boundary policy | 정책 확정 | ProseMirror와 같은 방향으로 outer root가 shadow/nested owner event를 처리하지 않아야 한다고 정했다. | 현재 shadow DOM fixture는 없다. |
| nested editor/input ownership | 정책 확정 | inner owner가 key/composition/selection을 소유해야 한다. | 실제 nested editor가 없어 실행 테스트는 보류한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| generic `stopEvent` registry 추가 | 보류 | 현재 custom node/widget producer가 없다. 지금 추가하면 죽은 hook이다. |
| toolbar를 editor root 내부 widget으로 취급 | 제거 | toolbar는 root 밖 command UI다. Pointer selection source가 아니다. |
| mention/figure atom event를 widget에 위임 | 제거 | current atom은 document node다. root pointer selection이 맞다. |
| future nested owner event escape | 유지 | inner editor/input/composition을 outer root가 동시에 처리하면 IME와 selection이 깨진다. |
| event ownership decision table | 유지 | future node/widget을 추가할 때 root handler에 무작정 붙이는 것을 막는다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| inline atom 내부 button | 현재 mention atom은 button을 포함하지 않는다. | 내부 action UI가 생기면 `stopEvent`/selection side/ARIA를 같이 설계한다. |
| resize handle | 현재 figure resize handle이 없다. | resize UI가 생기면 pointer capture owner와 document selection preservation을 테스트한다. |
| floating menu/portal | 현재 floating menu가 없다. | portal이 생기면 root 밖 UI와 editor selection restore policy를 정한다. |
| shadow DOM | 현재 shadow host가 없다. | web component embedding이 필요하면 composed path 기반 escape fixture를 만든다. |
| nested editor/input | 현재 nested editable island가 없다. | caption/embed/math/input이 들어오면 inner owner key/composition tests를 추가한다. |

## 현재 결론

지금 `stopEvent` abstraction을 구현하지 않는다. 현재 root event ownership은 keyboard
gate, pointer atom/geometry hit, transfer reader, toolbar focus guard로 충분하다.

다만 future custom node/widget/nested editor가 생기면 editor root handler보다 먼저
event ownership을 판정해야 한다. 그때는 `stopEvent` equivalent, shadow boundary,
default-prevented UI event, inner composition ownership을 함께 테스트해야 한다.
