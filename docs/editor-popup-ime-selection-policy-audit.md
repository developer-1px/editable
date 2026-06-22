# Editor Popup IME Selection Policy Audit

작성일: 2026-06-22

범위: mention typeahead, floating toolbar, link editor, format menu 같은 selection
근처 UI가 IME composition과 editor selection을 방해하지 않기 위한 경계를 정한다.
현재 구현에는 고정 `EditorToolbar`만 있고, typeahead/floating menu/link editor는 아직
없다.

## 판정

composition 중에는 editor root와 native IME가 입력권을 가진다. Popup이나 toolbar는
composition을 관찰할 수는 있지만, focus를 훔치거나 selection collapse/range 여부를
근거로 닫히거나 후보 선택 keyboard를 선점하면 안 된다.

현재 toolbar command는 `mousedown.preventDefault()`로 focus steal을 막고, click
command 전에 active contenteditable buffer를 flush한다. 이 경로는 확정이다. 아직
없는 typeahead/floating menu는 아래 정책을 만족할 때만 추가한다.

- composition 중 popup은 표시 상태를 유지할 수 있지만 keyboard interaction은 IME에
  양보한다.
- popup `mousedown`은 기본적으로 editor focus를 유지해야 한다.
- popup click으로 document를 mutate하려면 먼저 composition/native buffer를 release한
  뒤 canonical selection에 command를 적용한다.
- composition 중 transient native range selection은 popup close 조건으로 쓰지 않는다.
- floating toolbar는 IME 중 숨기거나 passive로 둔다. composition 중 selectionchange를
  근거로 reposition/close/mutate하지 않는다.

## 현재 구현 사실

| 항목 | 현재 상태 | 근거 |
| --- | --- | --- |
| 고정 toolbar | Undo, Redo, Insert mention, Insert figure 네 버튼만 있다. | `src/editor/internal/react/EditorToolbar.tsx` |
| toolbar focus steal 방지 | button `onMouseDown`이 `preventDefault()`를 호출한다. | `EditorToolbar.tsx`, `EditorToolbar.test.tsx` |
| toolbar command 전 flush | mention/figure/undo/redo handler가 `flushContentEditableViewBeforeCommand()` 후 command를 실행한다. | `useBlockEditorController.tsx` |
| composition UI state 정리 | toolbar click은 composing state를 끝내고 caret overlay를 복구한 뒤 command를 적용한다. | `BlockEditor.test.tsx`의 `ends composition UI state before toolbar commands` |
| mention insertion | 현재 mention은 typeahead가 아니라 toolbar fixture command다. label은 `Ada`, id는 local count다. | `useBlockEditorController.tsx`, `BlockEditor.test.tsx` |
| floating toolbar/link editor/typeahead | 아직 구현되어 있지 않다. | `rg typeahead/floating/menu` 결과와 React surface |

## 현재 Toolbar Trace

| Event | 현재 경로 | selection/focus 영향 | 근거 |
| --- | --- | --- | --- |
| toolbar `mousedown` | button handler가 `preventDefault()`를 호출한다. | editor focus를 잃지 않고 browser가 button으로 focus를 옮기지 않는다. | `EditorToolbar.test.tsx` |
| toolbar `click` Insert mention | active native edit/composition을 flush한 뒤 `insertNode(mention)` command를 실행한다. | command 결과 selection을 canonical state에 저장하고 editor focus를 복구한다. | `useBlockEditorController.tsx`, `BlockEditor.test.tsx` |
| toolbar `click` Undo/Redo | active native edit/composition을 flush한 뒤 history command를 실행한다. | history가 가진 selection으로 복구하고 editor focus를 복구한다. | `useBlockEditorController.tsx`, toolbar/history tests |
| toolbar keyboard focus | 현재 toolbar 자체 keyboard roving/focus model은 없다. | button이 focus를 받는 UX를 별도 selection owner로 설계하지 않았다. | source audit |
| editor blur from toolbar | 정상 toolbar pointer path에서는 만들지 않는다. | blur가 발생하면 `handleBlur`가 active buffer를 flush하고 overlay를 숨긴다. | `EditorToolbar.tsx`, `useBlockEditorController.tsx` |

## Interaction 정책

| Interaction | composition 아님 | composition 중 | 이유 |
| --- | --- | --- | --- |
| popup 표시 | selection/caret geometry 기준으로 표시 가능 | 표시 유지 또는 숨김 가능, 닫힘 조건으로 range/collapsed만 보지 않음 | IME가 transient range를 만들 수 있다. |
| popup `mousedown` | editor focus를 유지하려면 `preventDefault()` | 반드시 editor focus 유지가 기본값 | blur가 active text leaf flush를 발생시켜 조합을 끊을 수 있다. |
| popup `click` command | command 전 native edit flush 후 canonical selection에 적용 | composition commit/release 후 command 적용, 실패하면 no-op | atom insertion이 preedit text 안으로 섞이면 안 된다. |
| popup keyboard navigation | editor keymap과 우선순위를 명시해야 함 | IME 후보창이 우선, popup arrow/enter는 선점하지 않음 | Enter/Arrow가 후보 확정/이동일 수 있다. |
| toolbar command | 현재 확정 경로 사용 | 현재처럼 composition UI state를 끝내고 flush 후 command 적용 | command boundary가 native buffer release 지점이다. |
| editor blur | active buffer flush, overlay 숨김 | 가능하면 popup interaction으로 blur를 만들지 않음. 발생하면 flush하고 composing state 정리 | blur는 입력권 상실이므로 release boundary다. |
| `selectionchange` | canonical/native selection bridge 갱신 | transient native range를 popup close나 command target 변경 근거로 쓰지 않음 | Lexical typeahead 회귀와 같은 닫힘 버그를 막는다. |
| geometry reposition | layout 측정 후 passive reposition | IME 중에는 candidate window와 충돌할 수 있으므로 reposition만 하고 selection mutate 금지 | 위치 계산이 입력 state를 바꾸면 안 된다. |

## Mention Typeahead 최소 scenario

아직 typeahead는 없지만, 추가 전 최소 fixture는 아래 흐름을 포함해야 한다.

1. editor text leaf에서 `@`를 입력해 typeahead가 열린 상태를 만든다.
2. 같은 leaf에서 Korean/Japanese/Chinese composition을 시작한다.
3. browser가 composition 중 non-collapsed native range를 만들거나 selectionchange를
   발생시킨다.
4. typeahead는 단순히 `selection.isCollapsed() === false`라는 이유로 닫히지 않는다.
5. composition keydown Enter/Arrow는 popup 후보 선택이 아니라 IME 후보 확정/이동으로
   통과한다.
6. 사용자가 pointer click으로 mention 후보를 선택하면 popup은 editor focus를 훔치지
   않고 composition/native buffer를 release한 뒤 mention atom insertion command를
   적용한다.

이 scenario의 oracle은 “popup이 조합 중 닫히지 않는다”와 “후보 선택 command는
composition release 뒤 canonical selection에만 적용된다”이다. 실제 OS IME event
order는 `docs/editor-test-environment-policy-audit.md`의 실기기 trace 절차를 따른다.

## Floating Toolbar 정책

Floating toolbar는 range selection 근처에 뜨는 UI이므로 composition과 직접 충돌한다.

| 상태 | 표시 정책 | interaction 정책 |
| --- | --- | --- |
| collapsed caret | 기본적으로 숨김 | keyboard/focus 없음 |
| text range selection | 표시 가능 | `mousedown.preventDefault()`로 editor focus 유지 |
| native DOM range visible | browser native selection이 시각 소유권을 가진다 | toolbar는 command 전 canonical selection을 읽고 flush한다 |
| IME composing | 숨김 또는 passive 표시. 제품 선택 전 기본은 숨김 | keyboard shortcut, Enter, Arrow를 선점하지 않는다 |
| editor blur | 숨김 | blur가 command target을 만들지 않는다 |

Floating toolbar가 `selectionchange`를 유발하는 경우, 그 selectionchange는 command
target 변경이 아니라 UI interaction side effect로 취급한다. Command target은
composition 시작 전 selection 또는 command 직전 canonical selection 중 명시된 source
하나만 사용해야 한다.

## Popup Trace 체크리스트

새 popup을 만들면 debug trace와 테스트는 아래 항목을 기록한다.

| 항목 | 기록할 것 |
| --- | --- |
| focus | editor activeElement, popup activeElement, blur 발생 여부 |
| pointer | `mousedown.defaultPrevented`, click target, editor selection 전후 |
| keyboard | key, modifier, `isComposing`, popup handler가 consume했는지 |
| composition | composition start/update/end, final commit, buffer flush 시점 |
| selection | native DOM selection, canonical selection, popup close/reposition 원인 |
| command | command 전 release 여부, command selection source, final document |

## 외부 근거

| 출처 | 이 문서에서 쓰는 의미 |
| --- | --- |
| https://github.com/facebook/lexical/pull/7987 | Lexical는 IME composition 중 browser가 range selection을 만들어 typeahead menu가 닫히는 문제를 `editor.isComposing()` gate와 E2E test로 막았다. |
| https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | Lexical changelog에는 composition, WebKit, Firefox, typeahead/toolbar 계열 UI 회귀가 반복된다. |
| https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | ProseMirror view changelog에는 Safari composition spacebar menu mutation 오판, stored mark 직후 composition, active mark/decoration boundary 문제가 반복된다. |
| https://github.com/developer-1px/editable/blob/main/docs/rich-model-design.md | 현재 설계 문서는 composition/native text input 중 per-input sync를 하지 않고, toolbar command/blur/undo/redo 등 release boundary에서 flush한다고 정한다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| 현재 toolbar focus-steal 방지 | 실행 테스트로 확정 | `EditorToolbar.test.tsx`가 toolbar mousedown `defaultPrevented`를 확인한다. |
| 현재 toolbar command 전 flush | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 active native text edit과 composition UI state 위에 toolbar command를 적용하는 경로를 고정한다. |
| 현재 mention typeahead 부재 | source audit로 확정 | React surface에는 typeahead/floating menu/link editor가 없고, mention insertion은 toolbar fixture command뿐이다. |
| popup/floating menu 정책 | 설계 절차 확정 | 아직 UI가 없으므로 구현 완료가 아니라 future UI가 지켜야 할 ownership rule이다. |
| IME 중 transient range 위험 | 외부 사례 근거 | Lexical PR #7987이 같은 failure mode를 명시하고, ProseMirror/Lexical changelog가 composition/UI 경계 회귀를 반복적으로 보여준다. |
| 실기기 IME 후보창 위치 충돌 | 미정 | candidate window geometry는 현재 자동화/실기기 trace가 없다. 새 popup 구현 시 수동 trace로 닫아야 한다. |

## 현재 결론

현재 코드에서 확정할 것은 toolbar의 focus 유지, command 전 native/composition release,
read-only guard, fixture mention/figure insertion이다. 아직 확정하면 안 되는 것은
typeahead, floating toolbar, link editor, format menu의 제품 UI다.

새 popup을 추가할 때 가장 작은 정석은 editor root를 입력권 owner로 두고 popup을
passive view/explicit command surface로 제한하는 것이다. Composition 중에는 native
IME가 keyboard를 소유하며, popup은 transient range selection을 close signal로 쓰면
안 된다. Mutating command는 반드시 composition/native buffer release 뒤 canonical
selection을 대상으로 실행한다.
