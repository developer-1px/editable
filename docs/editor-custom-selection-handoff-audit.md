# Editor custom selection handoff audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `NodeView.setSelection` 같은 custom node view
selection owner hook을 현재 editor에 둘지, future nested editable island에만 둘지
분리한다.

## 목적

ProseMirror 계열 editor는 custom node view가 자기 내부 DOM selection을 직접 소유할
수 있다. 하지만 그 hook은 모든 atom/renderer surface에 필요한 것이 아니다.

이 문서는 현재 코드가 custom selection owner를 실제로 필요로 하는지, 필요하다면
어떤 node type에서만 허용해야 하는지, 그리고 delegation이 실패했을 때 document
selection으로 어떻게 복귀해야 하는지 정리한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| ProseMirror `NodeView.setSelection` | custom node view는 내부 selection을 직접 설정하는 hook을 가질 수 있다. |
| ProseMirror `ViewDesc.setSelection` | selection이 한 child 안에 완전히 들어가면 child에게 위임하고, cross-node selection은 best-effort DOM position fallback을 쓴다. |
| `docs/rich-model-design.md` | editable caption이 필요한 figure는 현재 block atom이 아니라 future container block이 되어야 한다고 적는다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | 현재 renderer는 `figure`와 `mention`을 `contentEditable={false}`로 렌더링할 뿐, nested editable island나 custom node view owner를 두지 않는다. |
| `docs/editor-native-selection-bridge-audit.md` | DOM selection bridge는 internal view adapter이고 document truth가 아니다. |
| `docs/editor-selection-model-audit.md` | canonical selection model은 `RichSelection`이며, browser/native selection과 분리된다. |
| `docs/editor-pointer-selection-audit.md` | atom selection은 React view adapter behavior이고 public pointer API가 아니다. |
| related issue #18 | caption/editable embed/nested editor가 실제로 생기면 selection handoff를 다시 설계해야 한다. |

## 확정 결론

| 항목 | 결론 |
| --- | --- |
| 현재 custom selection owner 후보 | 현재 schema에는 없다. `mention`과 `figure`는 selection owner가 아니라 non-editable atom surface다. |
| `setSelection` hook 허용 범위 | future nested editable island에만 허용한다. 예: editable caption, nested editor, iframe 내부 editor, true decorator/editor hybrid. |
| atom/node 밖으로 확장된 range | node view가 소유하지 않는다. cross-node range는 document-level canonical selection이 소유한다. |
| node 내부 selection-only | custom owner가 실제로 존재할 때만 의미가 있다. 현재 트리에는 해당 fixture를 만들 대상이 없다. |
| delegation 실패 시 fallback | contained selection이면 `domFromPos` 계열 best-effort로 native selection을 복원하고, containment가 안 되면 document-level selection으로 되돌린다. |
| current editor policy | atom navigation, copy/cut/paste, selection restore는 existing document selection + cursor geometry + pointer/native bridge로 충분하다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| 현재 schema의 custom owner 부재 | 확정 | `DocumentRenderer.tsx`는 `figure`와 `mention`만 non-editable atom으로 렌더링하고, custom node view ownership surface를 만들지 않는다. | future caption/embed/nested editor가 생기면 재평가해야 한다. |
| caption은 future container block 후보 | 확정 | `docs/rich-model-design.md`가 editable caption이 필요한 figure는 current atom이 아니라 future container block이어야 한다고 적는다. | container block의 실제 selection contract는 아직 없다. |
| DOM bridge와 canonical selection 분리 | 확정 | native selection bridge audit와 selection model audit가 DOM/native와 canonical model을 분리한다. | browser matrix 전체는 닫지 않았다. |
| cross-node fallback policy | 확정 | ProseMirror `ViewDesc.setSelection`은 containment에 따라 위임하고, cross-node selection은 best-effort fallback으로 다룬다. | current editor에 그대로 복제한 구현은 아니다. |
| custom selection fixture 부재 | 부분확정 | 현재 코드에 custom owner가 없으므로 node-internal selection-only fixture를 만들 수 없다. | future owner가 생기면 fixture를 추가해야 한다. |
| atom edge coverage | 부분확정 | current replay coverage는 atom before/after edge navigation과 range extension을 닫는다. | custom node view internal selection handoff를 대체하지는 않는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| current schema에 generic `setSelection` owner interface 추가 | 제거 확정 | 실제 editable island가 없는 상태에서 추상화만 넣으면 selection policy가 얕아진다. |
| mention/figure를 custom selection owner로 승격 | 제거 확정 | 현재는 atom surface다. 내부 editable selection contract가 없다. |
| cross-node range를 node-local ownership으로 처리 | 제거 확정 | range ownership은 document-level canonical selection이 가져야 한다. |
| future caption/editable embed/nested editor를 위한 hook | 보류 | 실제 nested editable island가 생기면 필요한 최소 seam이다. |

## 아직 애매하거나 제품 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| caption을 inline children으로 둘지 nested editor로 둘지 | `docs/rich-model-design.md`는 future container block을 가리키지만, 실제 editing UX는 아직 없다. | caption/editor island가 제품 범위가 되면 block vs nested editor를 정한다. |
| iframe/embed selection policy | iframe 내부 focus는 outer document selection과 다른 lifecycle을 가진다. | 실제 embed type이 필요해질 때 outer/inner focus handoff를 설계한다. |
| selection serialization for inner owner | current public selection model은 single caret/range/node다. | nested owner가 생기면 inner owner selection DTO를 별도 정의한다. |
| browser matrix | ProseMirror fallback은 브라우저별 DOM selection 차이를 전제로 하지만, current repo는 그 matrix를 닫지 않았다. | real browser QA가 필요할 때 따로 수집한다. |

## 현재 결론

현재 editor에는 custom node view selection owner가 없다. 따라서 `NodeView.setSelection`
을 공통 정책으로 추가할 이유가 없다.

허용해야 하는 후보는 future nested editable island뿐이다. caption, embed 내부 editor,
iframe, true decorator-editor hybrid 같은 실제 owner가 생기면 그 node type에 한해
containment-bound `setSelection`과 best-effort native restore를 붙인다. 지금은 atom
navigation과 canonical document selection bridge로 충분하다.
