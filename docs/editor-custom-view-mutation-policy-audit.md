# Editor custom view mutation policy audit

작성일: 2026-06-22

범위: ProseMirror `NodeView`/`MarkView`의 `ignoreMutation` 사례를 근거로,
future custom view가 DOM mutation과 selection resync를 어떻게 분리해야 하는지
정한다.

## 목적

custom view가 자체 DOM을 관리하면 어떤 DOM 변화는 editor가 무시해야 한다. 하지만
selection 변화까지 같은 boolean hook으로 무시하면 canonical selection이 stale해진다.

현재 editor에는 custom NodeView/MarkView registry가 없다. mention/figure는 schema atom
DOM이고, overlay/toolbar/debug UI는 document surface 밖에 있다. 따라서 지금은 runtime
hook을 추가하지 않고, future custom view host가 생길 때의 계약만 고정한다.

## ProseMirror-view 근거

| 근거 | 원문 | 의미 |
| --- | --- | --- |
| `ViewMutationRecord`는 native `MutationRecord`와 synthetic `{ type: "selection" }`을 같이 다룬다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L16-L21 | selection 변화도 mutation pipeline의 record로 들어올 수 있다. |
| `NodeView.ignoreMutation`/`MarkView.ignoreMutation`은 false일 때 selection reread 또는 DOM reparse가 필요하다는 계약이다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L83-L86 | true는 "안전하게 무시"라는 강한 주장이다. |
| `DOMObserver.ignoreSelectionChange`는 selection record를 desc의 `ignoreMutation`에 넘긴다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domobserver.ts#L151-L166 | custom view가 selection record를 true로 반환하면 outer selection reread가 생략된다. |
| 실제 DOM mutation도 `desc.ignoreMutation(mut)`이 true이면 dirty range 등록에서 빠진다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domobserver.ts#L252-L261 | mutation ignore와 selection ignore가 같은 hook이면 실수 표면이 크다. |

## 판단표

| record | ignore 가능 | 반드시 처리 | 기본 정책 |
| --- | --- | --- | --- |
| `childList` inside document content | 아니오 | text/block/atom content child 추가, 제거, wrapper 삽입, `contentDOM` detach/reparent | dirty range reparse 또는 node redraw |
| `childList` inside custom chrome | 조건부 | resize handle, button, decoration DOM처럼 document model이 아닌 owned DOM | custom view가 owner identity와 cleanup을 증명하면 ignore |
| `attributes` on document surface | 아니오 | `data-path`, `contenteditable`, role/class shape, atom/text run identity attrs | surface integrity 실패 또는 redraw |
| `attributes` on custom chrome | 조건부 | hover/open/measure state처럼 document parse와 무관한 attrs | custom view-owned attrs만 ignore |
| `characterData` in document text leaf | 아니오 | browser/native input, IME buffer, paste/delete로 생긴 text change | native buffer flush 또는 dirty text leaf reparse |
| `characterData` in custom chrome | 조건부 | tooltip/debug label처럼 document text가 아닌 owned text | document selection target이 아니면 ignore |
| synthetic `selection` in document surface | 아니오 | caret/range가 text, atom edge, block boundary, figure edge로 이동 | selection bridge가 canonical selection으로 resync |
| synthetic `selection` inside nested editor/input owner | 조건부 | inner editor가 자체 selection/model을 소유하고 outer selection을 handoff해야 하는 경우 | 별도 `ownsViewSelection` hook이 true일 때만 outer reread 생략 |
| synthetic `selection` leaving custom view | 아니오 | focus/selection이 custom view 밖 document로 이동 | outer selection bridge가 반드시 resync |

## Future hook names

하나의 `ignoreMutation(record)` hook을 그대로 만들지 않는다. selection record까지 같은
boolean이 삼키는 구조가 stale selection을 만든다.

Future custom view host가 필요해지면 내부 hook은 아래처럼 분리한다.

| hook | 대상 | 반환 의미 |
| --- | --- | --- |
| `ignoreViewMutation(record, context)` | native `childList`/`attributes`/`characterData` only | 해당 DOM mutation이 document parse, dirty range, surface integrity와 무관하다. |
| `ownsViewSelection(record, context)` | synthetic `selection` only | selection이 nested editor/input 같은 inner owner 안에 있고 outer canonical selection으로 읽으면 안 된다. |

기본값은 둘 다 false다. custom view가 hook을 제공하지 않으면 DOM mutation은 reparse/redraw
후보이고, selection은 outer selection bridge가 reread한다.

## 재현 케이스

`src/editor/internal/testing/customViewMutationPolicy.test.ts`는 두 가지를 고정한다.

- ProseMirror식 단일 `ignoreMutation`이 `{ type: "selection" }`까지 true로 반환하면
  selection resync가 누락되고 stale canonical selection이 남는다.
- 분리된 정책에서는 DOM mutation ignore hook이 selection record를 볼 수 없고,
  `ownsViewSelection`이 true인 inner owner selection만 outer reread를 생략한다.

## 현재 적용 정책

| 대상 | 정책 |
| --- | --- |
| mention/figure atom DOM | document atom이다. custom view mutation hook 대상이 아니다. |
| selection/cursor overlay | document surface 밖 widget-like visual이다. selection source가 아니다. |
| toolbar/debug inspector | editor command/diagnostic UI다. mutation observer 대상 document surface가 아니다. |
| future nested editor/caption/input | outer editor보다 먼저 selection ownership을 선언해야 한다. DOM mutation ignore와 selection ownership hook을 분리한다. |
| future custom atom renderer | schema atom identity와 custom chrome을 분리하고, content child mutation은 ignore하지 않는다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current custom view registry 부재 | source 확정 | `DocumentRenderer`는 direct schema render surface이고 NodeView/MarkView registry가 없다. | future extension host가 생기면 runtime hook 구현이 필요하다. |
| selection record를 mutation ignore와 분리 | 정책 확정 + 실행 테스트 | ProseMirror source는 selection record도 `ignoreMutation`에 들어갈 수 있음을 보이고, local test가 stale resync 재현을 고정한다. | 실제 browser MutationObserver/selectionchange ordering은 #23, #29와 연결된다. |
| 판단표 | 정책 확정 | contentDOM stability, widget lifecycle, native selection bridge audit와 일치한다. | custom chrome이 생기기 전까지는 예외 hook 실행 테스트가 아니라 계약 테스트다. |
| future hook names | 정책 확정 | `ignoreViewMutation`과 `ownsViewSelection`을 분리해 boolean overreach를 막는다. | public API가 아니며 custom view host 도입 전까지 internal reserved name이다. |

## 현재 결론

지금은 custom view hook을 구현하지 않는다. 현재 editor의 document surface는
`DocumentRenderer`와 canonical `data-path` topology가 소유한다.

단, future custom view를 만들 때는 DOM mutation ignore와 selection ownership을 반드시
분리한다. Selection record는 기본적으로 outer selection bridge가 reread해야 하며,
nested owner가 명시적으로 `ownsViewSelection`을 선언한 경우에만 무시할 수 있다.
