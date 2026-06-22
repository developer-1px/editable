# Editor drag DOM mutation audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. ProseMirror native drag 준비 중 임시
`draggable`/`contentEditable=false` DOM mutation 사례를 근거로, 우리 editor에서 drag
준비용 DOM mutation을 허용할지와 cleanup 기준을 정한다.

## 목적

Native drag를 가능하게 하려고 drag 시작 직전에 DOM에 `draggable`이나
`contentEditable=false`를 임시로 쓰면 MutationObserver, selection bridge, debug
recorder, renderer-owned DOM 상태가 섞일 수 있다.

현재 editor는 native drag 준비 세션을 구현하지 않는다. Drop은 DataTransfer text를
읽어 paste command path로 보내는 것만 지원한다. 이 문서는 current no-temp-mutation
정책과 future drag preparation lifecycle을 분리한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| ProseMirror `MouseDown` drag 준비 | draggable node 또는 node selection에서 `mightDrag` 상태를 만들고, 필요하면 target에 `draggable`과 Gecko용 `contentEditable=false`를 임시 설정한다. |
| ProseMirror DOMObserver pause | 임시 속성 변경 전후로 DOMObserver를 stop/start해서 framework-owned mutation을 관측하지 않게 한다. |
| ProseMirror cleanup | `done()`에서 임시 `draggable`/`contentEditable` 속성을 제거하고 observer를 다시 시작한다. |
| ProseMirror dragstart/drop | drag serialization, `dataTransfer`, drag move/delete transaction과 연결된다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | mention/figure는 current document atom DOM으로 렌더되지만 native drag preparation attribute를 렌더하지 않는다. |
| `src/editor/internal/react/useBlockEditorController.tsx` | 현재 `dragover`는 default만 막고, `drop`은 transfer text를 읽어 paste input으로 처리한다. `dragstart`/native move/delete transaction은 없다. |
| `docs/editor-pointer-selection-audit.md` | current pointer drag는 range selection lifecycle이지 node move drag가 아니다. |
| `docs/editor-clipboard-transfer-audit.md` | drop transfer text는 clipboard/paste transfer reader와 같은 문자열 contract로 들어온다. |
| `docs/editor-widget-decoration-lifecycle-audit.md` | model 밖 DOM mutation/lifecycle은 widget-like policy로 격리해야 한다. |

## Current drag/drop behavior

| 항목 | 현재 정책 |
| --- | --- |
| native drag preparation | 없음. Renderer 또는 event handler가 `draggable`을 임시로 붙이지 않는다. |
| atom DOM | mention/figure는 `contentEditable=false` document atom이지만 draggable attribute는 없다. |
| pointer drag | selection range creation만 한다. Node move drag가 아니다. |
| dragover | default browser navigation/drop handling을 막기 위해 `preventDefault`만 한다. |
| drop | DataTransfer에서 plain/markdown/custom text를 읽어 paste command path로 삽입한다. |
| drag move/delete transaction | 없음. Same-document node move semantics는 구현하지 않는다. |
| MutationObserver pause | 없음. 현재 observer가 없고 temporary drag DOM mutation도 없다. |
| debug recorder DOM noise | drag prep attribute mutation이 없으므로 recorder에 잡힐 임시 attr 변경도 없다. |

## Native vs custom drag 분류

| 대상 | 현재 분류 | 이유 |
| --- | --- | --- |
| external text/markdown drop | 지원 | DataTransfer string을 paste path로 처리한다. |
| selected text native drag move | 보류 | selection serialization, deletion, drop insertion, history grouping이 필요하다. |
| mention inline atom drag | 보류 | atom move/delete transaction과 drop target policy가 필요하다. |
| figure block drag | 보류 | block move, image asset transfer, selected atom state, hit testing이 필요하다. |
| resize handle drag | 없음 | resize feature가 없다. 생기면 custom pointer owner가 더 적합하다. |
| internal block reorder drag | 보류 | native drag보다 custom pointer drag가 deterministic할 수 있다. 제품 UX 결정 전에는 구현하지 않는다. |

## Future drag preparation lifecycle

현재 실행하지 않는 future spec이다. Native drag를 도입할 때만 코드와 테스트로 승격한다.

| phase | required behavior |
| --- | --- |
| prepare | drag target, original `draggable`, original `contentEditable`, selection, observer state를 snapshot한다. |
| prepare mutation | DOMObserver를 일시 pause하고 temporary attrs를 쓴 뒤 즉시 resume한다. Pause scope는 framework-owned attr write로만 제한한다. |
| dragstart success | DataTransfer serialization 성공 시 drag session id를 기록하고 temporary attrs는 dragend/drop cleanup으로 넘긴다. |
| dragstart failure/cancel | temporary attrs를 즉시 원복하고 observer를 resume한다. |
| mouseup/dragend/drop/window blur/visibilitychange | 어떤 종료 경로든 cleanup을 한 번만 실행한다. |
| iframe/shadow boundary escape | outer root가 cleanup signal을 못 받을 수 있으므로 timeout 또는 document-level fallback cleanup을 둔다. |
| user mutation during pause | pause 중 user input을 오래 놓치지 않도록 pause window를 동기 attr write 범위로 제한한다. 비동기 pause는 금지한다. |

## Fixture policy

| fixture | 현재 상태 | 기대 |
| --- | --- | --- |
| current atom render no draggable | 실행 테스트 있음 | mention/figure HTML에 `draggable` attr이 없다. |
| drag prepare cancel cleanup | future | temporary attrs가 원복되고 observer가 resume된다. |
| dragstart success cleanup | future | DataTransfer 작성 후 dragend/drop에서 temporary attrs가 원복된다. |
| drop move transaction | future | same-document move/delete history unit과 selection after drop을 검증한다. |
| window blur/iframe escape cleanup | future | dragend가 없어도 cleanup fallback이 실행된다. |
| observer pause user mutation | future | pause가 동기 attr write를 넘지 않아 user mutation을 놓치지 않는다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current temporary drag attr 부재 | 실행 테스트로 확정 | `DocumentRenderer.test.tsx`가 mention/figure atom render output에 `draggable` attr이 없다고 검증한다. | Runtime dragstart path가 없다는 negative coverage다. |
| current drop-as-paste behavior | source/tests 확정 | `useBlockEditorController.handleDrop`, transfer reader, input adapter/drop tests가 drop text insertion을 닫는다. | Native same-document drag move는 아니다. |
| MutationObserver pause 불필요 | source 확정 | 현재 MutationObserver와 drag prep mutation이 없다. | observer를 도입하면 별도 pause policy가 필요하다. |
| native vs custom drag 분류 | 정책 확정 | current feature set에서는 external drop만 지원하고 node move drag는 보류한다. | 제품 drag UX 요구가 생기면 재평가해야 한다. |
| future cleanup lifecycle | 정책 확정 | prepare/success/cancel/escape cleanup phase를 고정했다. | 실행 fixture는 native drag implementation 때 추가해야 한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| current native drag preparation 구현 | 제거/보류 | same-document drag move UX와 history semantics가 없다. 임시 DOM mutation만 추가하면 위험이 커진다. |
| renderer `draggable` attr 추가 | 제거 | atom이 draggable이라는 제품 정책이 없고, browser native drag side effect가 생긴다. |
| observer pause abstraction 추가 | 보류 | observer와 temp mutation producer가 없다. 지금 만들면 죽은 추상화다. |
| drop-as-paste path | 유지 | external transfer text insertion은 현재 product behavior와 tests가 있다. |
| future cleanup spec | 유지 | native drag를 도입할 때 누수 방지 기준이 필요하다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| same-document drag move UX | copy vs move, selection deletion, history grouping이 닫히지 않았다. | drag move product scope가 생기면 command layer부터 설계한다. |
| atom drag affordance | mention/figure를 drag 가능한 단위로 만들지 정하지 않았다. | atom toolbar/handle/selection UX와 같이 결정한다. |
| native drag vs custom pointer drag | native DataTransfer interop과 deterministic internal reorder는 장단점이 다르다. | block reorder 요구가 생기면 custom pointer drag prototype과 비교한다. |
| MutationObserver integration | 현재 observer가 없다. | observer 도입 시 temporary mutation ignore window와 stale record policy를 같이 설계한다. |
| iframe/shadow cleanup | 현재 embedding boundary가 없다. | iframe/shadow editor embedding이 필요하면 cleanup fallback fixture를 만든다. |

## 현재 결론

지금은 native drag preparation을 구현하지 않는다. Current editor는 pointer drag를
selection 용도로만 쓰고, drop은 transfer text를 paste path로 처리한다.

따라서 `draggable`/temporary `contentEditable` attribute mutation, observer pause,
drag cleanup session은 추가하지 않는다. Native drag move를 실제 제품 범위로 넣을 때만
동기 attr write로 제한된 preparation session과 모든 cancel/success/escape cleanup
fixture를 함께 구현한다.
