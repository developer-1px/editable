# Editor selection visibility lifecycle audit

작성일: 2026-06-22

범위: hidden DOM selection, native DOM selection, custom caret/range/atom overlay가
동시에 보이거나 cleanup 없이 남는 위험을 조사한다. 기준은 현재 React editor와
contenteditable adapter다.

## 목적

model selection은 document truth지만 항상 native DOM selection으로 그대로 보여야
하는 것은 아니다. 텍스트 range는 browser native selection을 그대로 보여주는 순간이
있고, caret/range/atom selection은 editor-owned overlay가 더 정확한 순간이 있다.

이 문서는 ProseMirror식 hidden selection class나 cursor wrapper를 그대로 들여오지
않고, 현재 editor에서 선택 표시를 어떤 lifecycle로 소유할지 고정한다.

## ProseMirror 근거

| 근거 | 원문 | 의미 |
| --- | --- | --- |
| `selectionToDOM`은 `NodeSelection` display를 먼저 sync한 뒤 editor가 selection을 소유할 때만 DOM selection을 갱신한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/selection.ts#L55-L76 | model selection과 DOM selection 표시가 항상 같은 channel은 아니다. |
| invisible selection에서는 `ProseMirror-hideselection` class를 붙이고 selectionchange 후 지연 제거한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/selection.ts#L92-L147 | native selection을 숨기는 class는 cleanup lifecycle을 반드시 가진다. |
| cursor wrapper selection은 DOM selection을 wrapper 주변으로 강제한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/selection.ts#L149-L164 | widget/inline wrapper cursor는 native DOM position만으로는 충분하지 않을 수 있다. |
| node selection은 `selectNode`/`deselectNode` hook으로 DOM state를 정리한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/selection.ts#L166-L185 | node selection 표시는 text selection과 다른 cleanup 경계를 가진다. |

## 현재 판정

현재 editor는 hidden selection class를 만들지 않는다. 따라서
`ProseMirror-hideselection` 같은 class를 붙였다가 timeout으로 제거하는 cleanup
lifecycle도 없다.

대신 selection visibility는 세 channel 중 하나가 소유한다.

| Channel | 소유 상태 | 표시 방식 |
| --- | --- | --- |
| native DOM range | browser가 실제 텍스트 range를 보여야 할 때 | browser native selection |
| custom overlay | canonical caret/range/atom selection을 editor가 보여야 할 때 | `CursorOverlay`, `SelectionOverlay` |
| none | blur 또는 IME/native selection이 시각 소유권을 가진 때 | custom overlay 숨김 |

## Visibility state machine

| 상태 | 조건 | 표시 | cleanup |
| --- | --- | --- | --- |
| blurred | editor focus 없음 | custom caret/range/atom overlay 없음 | canonical selection은 유지하지만 DOM 표시를 강제하지 않는다. |
| focused collapsed model selection | focus 있음, native range 없음, IME 아님 | custom caret overlay | native cursor preview가 canonical point와 어긋나면 복원 전까지 overlay를 갱신하지 않는다. |
| focused model range selection | focus 있음, native range 없음 | custom range/atom overlay | range가 collapsed가 되면 caret overlay로 전환한다. |
| visible native DOM range | `selectionchange`에서 editor 내부 non-collapsed DOM range 감지 | browser native selection | custom caret/range/atom overlay를 숨긴다. hidden class는 만들지 않는다. |
| explicit atom selection | mention/figure pointer selection 또는 command selection | atom overlay | stale native DOM ranges를 `removeAllRanges()`로 지운다. |
| IME composing | composition active | browser native caret | custom caret overlay를 숨기고, composition 종료/toolbar command 후 canonical caret을 복구한다. |
| read-only native range | read-only 전환 전/중 browser range 존재 | browser native range 또는 preserved command selection | mutation은 막고 copy source로만 사용한다. |

## Node/text 전환 cleanup 기준

| 전환 | 기준 |
| --- | --- |
| text native range -> model command | native range를 command selection으로 관찰하되 custom overlay는 숨긴다. |
| text native range -> atom selection | atom selection이 이기며 native ranges를 제거한다. stale native range가 copy/replacement source로 남으면 안 된다. |
| atom selection -> text caret | canonical selection을 text point로 복구하고 caret overlay를 다시 그린다. |
| focus -> blur | custom overlay를 제거한다. hidden selection class를 붙이지 않는다. |
| blur -> focus | canonical selection point를 native collapsed range와 custom caret으로 복구한다. |
| toolbar command | toolbar mousedown은 focus steal을 막고, command 전 active native edit/IME state를 정리한다. |

## 실행 증거

| 항목 | 증거 |
| --- | --- |
| native DOM range가 보이면 custom overlay를 숨김 | BlockEditor split tests의 `hides custom overlays while a native DOM range selection is visible` |
| hidden selection class를 만들지 않음 | BlockEditor split tests의 `does not create hidden selection classes across native range and focus transitions` |
| blur 시 overlay 제거, canonical selection 보존 | BlockEditor split tests의 `preserves canonical range selection when focus is lost` |
| atom selection이 stale native range보다 우선 | BlockEditor split tests의 atom selection/copy regression tests |
| IME 중 custom caret 숨김 | BlockEditor split tests의 `does not draw a stale custom cursor while IME composition owns the native caret` |
| toolbar command 전 IME UI state 정리 | BlockEditor split tests의 `ends composition UI state before toolbar commands` |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| hidden selection class 미사용 | 확정 | native range/focus transition test가 ProseMirror식 class와 local hidden class를 만들지 않는 것을 고정한다. | 실제 browser selection paint timing은 jsdom test가 아니다. |
| native range와 custom overlay 배타성 | 확정 | native DOM range가 보이는 동안 caret/range overlay가 사라지는 React test가 있다. | drag 중간 frame의 browser별 paint 순서는 별도 QA가 필요하다. |
| atom selection cleanup | 확정 | atom pointer selection이 native ranges를 제거하고 stale range보다 우선하는 regression tests가 있다. | nested editable island가 생기면 inner owner handoff를 다시 설계해야 한다. |
| IME 중 custom caret 숨김 | 확정 | composition active 동안 caret overlay가 사라지고 종료 후 복구되는 test가 있다. | OS/browser별 IME event ordering은 recorded trace와 browser QA 범위다. |
| hidden class timeout cleanup | 제거 확정 | class를 만들지 않으므로 delayed cleanup 상태가 없다. | 나중에 browser native selection을 숨기는 class를 도입하면 별도 leak test가 필요하다. |
| assistive-tech selection announcement | 미정 | overlay root는 `aria-hidden`이고 native range는 browser가 표시하지만 AT별 announcement는 검증하지 않았다. | 접근성 matrix를 정하면 browser/AT QA가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| hidden selection class 도입 | 제거 확정 | 현재 overlay/native range split으로 해결한다. class를 만들면 timeout cleanup, focus/blur leak, drag leak 상태가 새로 생긴다. |
| ProseMirror cursor wrapper 복제 | 보류 | 현재 inline atom edge와 empty text run은 geometry/native selection adapter로 처리한다. wrapper가 필요한 실패 trace가 없다. |
| node selection hook API | 보류 | 현재 mention/figure atom selection은 `selectedPointers`와 overlay로 충분하다. NodeView lifecycle이 없으므로 `selectNode`/`deselectNode` hook을 만들 근거가 없다. |
| native DOM selection을 표시 truth로 승격 | 제거 확정 | stale native range보다 canonical atom/model selection이 우선해야 한다. |
| custom overlay 제거 | 제거 불가 | collapsed caret, model range, atom selection을 editor-owned geometry로 보여야 한다. |

## 결론

현재 가장 작은 정석은 hidden selection class를 쓰지 않는 것이다. Browser native
range가 실제로 보이는 동안에는 custom overlay를 숨기고, editor가 선택 표시를
소유해야 할 때만 caret/range/atom overlay를 그린다. Atom selection으로 전환할 때는
native ranges를 제거하고, blur나 IME 중에는 overlay를 숨긴다.

따라서 cleanup 기준은 class timeout이 아니라 소유 channel 전환이다. native range,
custom overlay, no overlay 중 하나만 시각 channel을 가져야 한다.
