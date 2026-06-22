# Editor contentDOM stability audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. ProseMirror `NodeView.contentDOM`과
`contentLost` redraw 경계를 근거로, 우리 editor의 block DOM과 editable child DOM
소유권을 어떻게 안정화할지 정리한다.

## 목적

ProseMirror의 custom `NodeView`는 outer `dom`과 child-render target인 `contentDOM`을
분리할 수 있다. 이때 framework render가 `contentDOM`을 detach, replace, reparent하면
자식 노드가 사라진 것으로 보고 node 전체 redraw로 격상해야 한다.

현재 editor에는 NodeView/contentDOM 계층이 없다. 대신 `DocumentRenderer`가 canonical
`NoteDocument`를 직접 DOM으로 투영하고, view adapter는 stable `data-path` surface를
읽는다. 따라서 지금 필요한 것은 contentDOM API가 아니라 renderer surface integrity
검사와 block view 작성 규칙이다.

## ProseMirror-view 근거

| 근거 | 원문 | 의미 |
| --- | --- | --- |
| `contentDOM`은 ProseMirror가 자식 노드를 렌더링할 DOM이다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L35-L41 | 외부 wrapper와 editable child target의 owner가 다를 수 있다. |
| `contentLost`는 `contentDOM`이 outer `dom`에서 사라진 상태를 감지한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L492-L494 | child target detach는 부분 patch가 아니라 redraw 경계다. |
| dirty marking은 `contentLost`나 contentDOM parent mismatch에서 node 전체 redraw로 격상한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L498-L517 | child target parentage는 correctness invariant다. |
| mutation target이 contentDOM 밖이면 node 전체 range 변경으로 취급한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domobserver.ts#L263-L270 | 장식 DOM과 document content DOM을 섞으면 dirty range가 과확장된다. |

## 현재 구조

```text
BlockEditor
  section.editor-pane
    toolbar/debug inspector
    div.document-stage
      div.editor-surface[contentEditable]
        DocumentRenderer
          div.document-view
            direct block elements [data-path="/root/children/N"]
              direct editable/render child elements [data-path="..."]
      SelectionOverlay
      CursorOverlay
```

현재 `contentDOM`에 해당하는 별도 child mount node는 없다. 각 text block 자체가
document-owned block DOM이고, inline text/atom child는 그 block의 direct child다.
code block의 backing text leaf는 `pre[data-path] > code.text-run[data-path]`다.

## Stability fixtures

`documentSurfaceIntegrity.test.ts`는 다음 손상을 검사한다.

| fixture | 감지 |
| --- | --- |
| detach | expected text leaf가 DOM에서 사라지면 `missing-content` |
| replaceChild | 같은 `data-path`를 유지해도 `.text-run`/`.mention-chip` shape를 잃으면 `invalid-content` |
| reparent | text leaf가 다른 block 아래로 이동하면 `reparented-content` |
| wrapper 추가 | block과 direct content child 사이에 wrapper가 끼면 `reparented-content` |

이 검사는 automatic redraw engine이 아니다. Debug recorder와 tests가 renderer surface
손상을 진단할 수 있게 하는 내부 guard다. 실제 복구는 canonical React render 또는
model/view lifecycle이 담당한다.

## Decoration DOM placement

| DOM | 위치 | 이유 |
| --- | --- | --- |
| toolbar | `editor-surface` 밖 | command UI이며 document content가 아니다. |
| debug inspector | `editor-surface` 밖 | diagnostic UI가 DOM selection/debug text source에 섞이면 안 된다. |
| selection overlay | `editor-surface` sibling | visual affordance이며 document dirty range source가 아니다. |
| cursor overlay | `editor-surface` sibling | native/content DOM과 독립된 visual caret이다. |
| mention/figure | document renderer 내부 | schema atom node라 widget decoration이 아니다. `contentEditable=false`라도 document-owned DOM이다. |
| future resize handle/floating menu | `editor-surface` 밖 또는 atom 내부 non-content slot | document child `data-path` direct topology를 깨면 안 된다. |

## Block view 작성 규칙

| 규칙 | 판정 |
| --- | --- |
| block element는 `.document-view`의 direct child여야 한다. | 유지 확정 |
| inline/code content element는 owning block의 direct child여야 한다. | 유지 확정 |
| text leaf는 `.text-run[data-path]` shape를 유지한다. | 유지 확정 |
| mention atom은 `.mention-chip[data-path]` shape를 유지한다. | 유지 확정 |
| figure block은 `.figure-block[data-path]` shape를 유지한다. | 유지 확정 |
| block content 사이에 wrapper를 추가하지 않는다. | 유지 확정 |
| resize handle/caption/toolbar 같은 비문서 DOM을 content child list에 끼워 넣지 않는다. | 유지 확정 |
| custom NodeView/contentDOM API는 두 번째 renderer owner가 생기기 전까지 만들지 않는다. | 보류 |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| NodeView/contentDOM 부재 | source 확정 | `DocumentRenderer`는 model-to-DOM projection이고 custom NodeView registry나 `contentDOM` mount point가 없다. | custom extension renderer가 생기면 재설계가 필요하다. |
| direct `data-path` topology | 실행 테스트로 확정 | renderer tests와 surface integrity tests가 block/content path shape를 검증한다. | React가 외부 DOM mutation을 항상 자동 복원한다는 뜻은 아니다. |
| detach/replace/reparent/wrapper fixture | 실행 테스트로 확정 | `inspectDocumentSurfaceIntegrity`가 네 손상 유형을 감지한다. | 현재는 diagnostic guard이며 automatic redraw scheduler가 아니다. |
| 장식 DOM 분리 | source/tests 확정 | `BlockEditor`는 overlay를 `editor-surface` sibling으로 렌더하고 toolbar/debug inspector를 surface 밖에 둔다. | future floating UI는 별도 focus/event policy가 필요하다. |
| debug diagnostic 연결 | 실행 테스트로 확정 | debug snapshot/report가 invalid surface를 diagnostic으로 올린다. | 사용자가 녹화하지 않으면 runtime recovery를 실행하지 않는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| custom NodeView/contentDOM abstraction 추가 | 보류 | 현재 두 번째 renderer owner가 없다. 도입하면 content ownership이 늘어난다. |
| surface integrity guard | 유지 | contentDOM 유실과 같은 구조 손상을 debug/report에서 놓치지 않는다. |
| automatic redraw scheduler | 보류 | MutationObserver/React reconciliation/selection restore 정책까지 필요하다. 지금 이슈 범위는 조사와 guard다. |
| block content wrapper 추가 | 제거 | geometry adapter의 direct child scan과 contenteditable selection mapping을 깨뜨린다. |
| decoration DOM을 document content list에 삽입 | 제거 | dirty range와 selection source를 과확장한다. |

## 현재 결론

현재 정석은 NodeView/contentDOM을 모방하지 않는 것이다. `DocumentRenderer`의 direct
`data-path` topology가 content surface contract이고, 장식 DOM은 contenteditable
surface 밖 overlay/toolbar/debug UI로 분리한다.

`contentDOM`을 가진 block view가 필요해지는 순간에는 wrapper 추가가 아니라 별도 block
view API, surface integrity guard, MutationObserver/redraw boundary, selection restore를
한 번에 설계해야 한다.
