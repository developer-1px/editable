# Editor widget decoration lifecycle audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. ProseMirror widget decoration 사례를 근거로,
우리 editor에서 model에 없는 DOM을 어떻게 분류하고 key/lifecycle을 다룰지 정한다.

## 목적

Widget decoration은 document model에는 없지만 DOM에는 존재한다. Identity, key,
event ownership, cleanup이 불안정하면 selection overlay, cursor, mutation filter가
document node와 섞인다.

현재 editor에는 ProseMirror식 decoration registry가 없다. 대신 React overlay,
debug inspector, toolbar, atom DOM이 있으므로 각각 document-owned DOM인지
widget-like DOM인지 분리한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| ProseMirror `WidgetType.eq` | widget identity는 기본 DOM constructor/spec 비교이고, `key`가 있으면 key로 동일성을 판단한다. |
| ProseMirror `Decoration.widget` options | `side`, `relaxedSide`, `stopEvent`, `ignoreSelection`, `key`, `destroy`가 selection side와 lifecycle을 제어한다. |
| ProseMirror `WidgetViewDesc` | raw widget이 아니면 wrapper span, `contentEditable=false`, `ProseMirror-widget` class를 붙인다. |
| ProseMirror widget parse/mutation path | widget은 parse에서 ignore되고 mutation/selection ignore 및 destroy hook이 별도 처리된다. |
| `src/editor/internal/react/SelectionOverlay.tsx` | selection range/atom overlay는 document model에 없는 visual affordance다. |
| `src/editor/internal/react/CursorOverlay.tsx` | caret overlay는 focused canonical point의 visual projection이다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | mention/figure는 model node를 렌더한 atom DOM이며 widget이 아니다. Empty text run도 caret target인 document render surface다. |
| `src/editor/internal/react/DebugRecordingInspector.tsx` | debug inspector는 editor diagnostic UI이고 document model에 속하지 않는다. |
| `src/editor/internal/react/EditorToolbar.tsx` | toolbar는 command surface이며 document DOM 또는 widget decoration이 아니다. |

## Widget-like DOM 분류

| DOM/surface | 분류 | model ownership | key/lifecycle 정책 |
| --- | --- | --- | --- |
| `.selection-range` | widget-like visual overlay | 없음 | rect list order + geometry로 key를 만든다. DOM selection source가 아니다. |
| `.selection-atom` | widget-like visual overlay | 없음 | selected atom path가 semantic identity다. Source atom은 document node다. |
| `.selection-caret` | widget-like visual overlay | 없음 | 단일 caret DOM이므로 list key가 없다. |
| `.debug-recorder` | diagnostic UI | 없음 | React state lifecycle. document parse/selection 대상이 아니다. |
| toolbar buttons | command UI | 없음 | React button lifecycle. focus steal만 막고 document selection owner가 아니다. |
| `.mention-chip` | document atom DOM | mention inline node | widget 아님. `data-path`로 pointer selection을 만든다. |
| `.figure-block` | document atom DOM | figure block node | widget 아님. `contentEditable=false`이지만 model node다. |
| empty `.text-run` | document render target | empty text leaf | widget 아님. caret/native selection target으로 필요하다. |
| placeholder text | 없음 | 없음 | 현재 구현 없음. 추가 시 document text와 분리된 widget-like DOM이어야 한다. |
| inline menu anchor/comment marker | 없음 | 없음 | 현재 구현 없음. 추가 시 key/event/destroy contract가 필요하다. |

## Key policy

| 대상 | 정책 |
| --- | --- |
| document block DOM | block id가 unique하면 id를 쓰고, duplicate id는 occurrence suffix로 React key collision을 막는다. |
| inline document DOM | child index가 cursor coordinate라서 block id + child index를 쓴다. |
| range overlay DOM | 같은 geometry rect가 여러 개 나와도 충돌하지 않도록 rect signature별 occurrence를 key에 포함한다. |
| atom overlay DOM | selected pointer path가 semantic identity다. 동일 path 중복은 source selection 정상화 영역이다. |
| future widget DOM | semantic role + anchor position + stable widget id를 key로 쓴다. DOM node 자체나 handler closure identity를 key로 쓰지 않는다. |

## Event ownership policy

| 상황 | 정책 |
| --- | --- |
| overlay DOM | `aria-hidden`이고 pointer/key handler를 갖지 않는다. Selection source가 되지 않는다. |
| diagnostic/toolbar UI | document command source일 수 있지만 document selection DOM은 아니다. Focus/selection을 훔치지 않게 관리한다. |
| future widget `stopEvent` | widget이 자체 interaction을 소유할 때만 event를 stop한다. Text input/composition을 outer editor와 동시에 처리하지 않는다. |
| future widget `ignoreSelection` | widget 내부 selection이 document selection이 아니면 outer selection bridge가 읽지 않는다. |

## Destroy cleanup policy

| 대상 | 정책 |
| --- | --- |
| current React overlays | 별도 destroy hook 없음. props 변화로 재생성되고 event/timer/listener를 소유하지 않는다. |
| current debug inspector | React render state만 소유한다. recorder listener cleanup은 recorder hook이 담당한다. |
| current toolbar | 외부 listener/timer 없음. button handler는 React lifecycle을 따른다. |
| future imperative widget | widget 생성 시 등록한 DOM listener, ResizeObserver, MutationObserver, timer, external subscription은 widget destroy에서 해제한다. |
| future async widget | unmount 후 setState/dispatch를 막는 cancellation token 또는 disposed flag가 필요하다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current widget registry 부재 | source 확정 | decoration/plugin widget registry가 없고, overlay/inspector/toolbar는 React component로만 존재한다. | future extension host가 생기면 다시 설계해야 한다. |
| overlay는 model node 아님 | source/test 확정 | `SelectionOverlay`/`CursorOverlay`는 geometry와 selection projection만 렌더한다. | 실제 browser pointer hit testing은 overlay CSS/pointer-events 정책과 같이 봐야 한다. |
| mention/figure는 widget 아님 | source/test 확정 | renderer와 command/clipboard/cursor tests가 document atom으로 다룬다. | custom atom renderer가 생기면 widget과 atom의 경계를 다시 문서화해야 한다. |
| range overlay key collision 방지 | 실행 테스트로 확정 | 동일 geometry rect 두 개를 렌더해도 selected range 두 개가 유지되고 duplicate key warning을 내지 않는다. | React key warning 외 DOM diff 성능 프로파일은 별도 영역이다. |
| stale event handler 재사용 위험 | 현재 낮음 | current overlay에는 handler가 없고 toolbar/debug는 React lifecycle이다. | future widget event handler가 생기면 key와 destroy 테스트를 추가해야 한다. |
| destroy cleanup 기준 | 정책 확정 | current React widgets는 별도 cleanup owner가 없고, future imperative widget cleanup 항목을 정했다. | 실제 destroy hook은 future widget implementation 때 검증해야 한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| ProseMirror식 widget registry 추가 | 보류 | 현재 widget producer가 없다. registry부터 만들면 dead abstraction이다. |
| overlay를 document node로 승격 | 제거 | overlay는 visual affordance다. document parse/selection source가 되면 model truth가 흐려진다. |
| mention/figure를 widget으로 재분류 | 제거 | 둘 다 schema node다. `contentEditable=false`라는 이유만으로 widget이 아니다. |
| range overlay key에 occurrence 포함 | 유지 | geometry가 같아도 list identity는 달라야 한다. Rect signature별 occurrence는 duplicate geometry를 구분한다. |
| future destroy hook policy | 유지 | DOM listener/observer/timer를 가진 widget이 생기면 cleanup 없이는 stale handler가 남는다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| placeholder 구현 | 현재 placeholder DOM이 없다. | 추가 시 document text가 아니라 overlay/widget-like DOM으로 둘지 결정한다. |
| comment marker/inline menu | 현재 구현이 없다. | event ownership, keyboard focus, ARIA, selection side를 같이 설계한다. |
| custom atom renderer | mention/figure는 current built-in atom이다. | plugin renderer가 생기면 atom DOM과 widget DOM의 key namespace를 분리한다. |
| widget side/relaxedSide equivalent | 현재 zero-size inline widget이 없다. | insertion cursor side가 필요한 widget이 생기면 cursor stream과 geometry adapter에 반영한다. |

## 현재 결론

지금 editor에 ProseMirror식 widget system을 추가하지 않는다. 현재 존재하는
widget-like DOM은 selection/cursor overlay와 debug inspector 정도이고, document
node는 mention/figure/empty text-run처럼 별도로 유지한다.

Range overlay는 같은 geometry가 반복되어도 key가 충돌하지 않게 고정했다. Future
widget은 role, anchor, stable id로 key를 만들고, event handler나 observer를 소유하면
destroy cleanup을 반드시 테스트해야 한다.
