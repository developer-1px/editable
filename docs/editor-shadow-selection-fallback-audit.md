# Editor shadow selection fallback audit

작성일: 2026-06-22

범위: editor root가 ShadowRoot 안에 들어갈 때 DOM selection read/write를 어떻게
다룰지, Safari 계열에서 `getComposedRanges`, `beforeinput.getTargetRanges`,
`document.execCommand()` probe fallback을 둘지 결정한다.

## 목적

Shadow DOM 안의 selection은 document-level selection만으로 안정적으로 읽히지 않을 수
있다. ProseMirror-view는 ShadowRoot traversal과 Safari fallback probe를 별도로 둔다.
우리 editor는 현재 demo/app embedding에서 ShadowRoot, iframe, portal을 쓰지 않지만,
view adapter가 root-local selection을 우선 읽을 수는 있어야 한다.

## 외부 근거

| 근거 | 원문 | 해석 |
| --- | --- | --- |
| Selection API는 selection anchor/focus가 같은 document의 shadow tree 안에 있을 수 있다고 둔다. | https://www.w3.org/TR/selection-api/ | document selection과 shadow tree boundary는 분리해 생각해야 한다. |
| `Selection.getComposedRanges()`는 shadow boundary를 지나는 range를 `StaticRange`로 돌려주며, MDN 기준 2025 Baseline이다. | https://developer.mozilla.org/en-US/docs/Web/API/Selection/getComposedRanges | 최신 브라우저에서는 명시적 shadowRoots 기반 API가 생겼지만 older browser를 닫지는 않는다. |
| `InputEvent.getTargetRanges()`는 MDN 기준 2021년부터 widely available이다. | https://developer.mozilla.org/en-US/docs/Web/API/InputEvent/getTargetRanges | beforeinput target range는 편집 의도 보조 신호로 쓸 수 있지만 selection authority는 아니다. |
| `document.execCommand()` clipboard/editing command는 deprecated이고 더 이상 어느 브라우저에서도 보장되지 않는다. | https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard | selection probe나 clipboard fallback의 새 기반으로 쓰지 않는다. |
| WebKit bug 163921은 Safari Shadow DOM selection API 미구현 이슈였고 fixed 상태다. | https://bugs.webkit.org/show_bug.cgi?id=163921 | Safari old range는 real-browser support matrix 없이는 broad support로 선언하면 안 된다. |
| WebKit bug 265632은 Safari 17.1 `getComposedRanges` 사용 시 shadow root를 인자로 넘겨야 한다는 결론이다. | https://bugs.webkit.org/show_bug.cgi?id=265632 | `getComposedRanges`를 쓸 때도 shadow root list 정책이 필요하다. |

## ProseMirror-view 근거

| 근거 | 원문 | 의미 |
| --- | --- | --- |
| `parentNode`는 slot과 ShadowRoot host를 따라 올라가도록 별도 처리한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/dom.ts#L15-L18 | DOM containment은 plain `parentNode`만으로 부족하다. |
| `selectionCollapsed`는 Chrome shadow DOM `isCollapsed` 버그를 우회한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/dom.ts#L124-L129 | selection object field를 그대로 신뢰하지 않는 browser-specific guard가 있다. |
| Safari shadow selection fallback은 `getComposedRanges`를 먼저 쓰고, 없으면 `beforeinput` listener와 `document.execCommand("indent")`로 target range를 읽는다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domobserver.ts#L332-L357 | broad Shadow DOM 지원을 위해 deprecated command probe까지 쓰는 compatibility path다. |

## 현재 코드 판정

| 항목 | 판정 |
| --- | --- |
| current app embedding | `src`와 README 기준 demo/app은 ShadowRoot, iframe, portal을 쓰지 않는다. |
| selection read/write | `contentEditableSelection`은 editor root의 `getRootNode()`가 ShadowRoot이고 그 root가 `getSelection()`을 제공하면 그것을 우선 사용한다. 없으면 `ownerDocument.getSelection()`으로 fallback한다. |
| `getComposedRanges` | 현재 쓰지 않는다. StaticRange -> canonical cursor mapping, shadow root allowlist, cross-root range policy가 아직 없다. |
| `getTargetRanges` | 현재 쓰지 않는다. beforeinput은 inputType/data/dataTransfer intent signal로만 읽는다. |
| `document.execCommand` | current editor path에서 selection probe나 clipboard fallback으로 쓰지 않는다. |
| Safari fallback | 명시적 미지원이다. ShadowRoot embedding을 product support로 올리면 real Safari/WebKit matrix와 adapter contract를 먼저 추가한다. |

## 완료 기준 매핑

| 완료 기준 | 처리 |
| --- | --- |
| ShadowRoot 안 editor selection read/write 테스트 | `contentEditableViewEngine.test.ts`가 ShadowRoot-local selection API를 fake로 제공하고 read/write를 검증한다. |
| Safari fallback 최소 브라우저 범위 확인 | 2026-06-22 기준 최신 `getComposedRanges`는 Baseline 2025지만 older Safari/WebKit 이슈가 존재한다. current editor는 Safari ShadowRoot fallback을 product support로 선언하지 않는다. |
| `execCommand` fallback 결정 | 도입하지 않는다. deprecated command probe는 focus/selection authority를 흔들고 current hidden clipboard fallback 정책과 충돌한다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| non-shadow app embedding | 확정 | `rg`로 `attachShadow`, `createPortal`, `iframe` 사용이 production code에 없음을 확인했다. | future embedder가 ShadowRoot 안에 mount할 수는 있다. |
| ShadowRoot-local selection 우선 | 실행 테스트로 확정 | `contentEditableViewEngine.test.ts`가 ShadowRoot `getSelection()`이 있을 때 read/write가 같은 root selection을 쓰는 것을 고정한다. | jsdom은 native ShadowRoot selection API가 없어 fake selection으로 검증한다. |
| `getComposedRanges` 미사용 | source 확정 | current code search상 호출이 없다. | 최신 browser support를 제품 범위로 삼으면 StaticRange mapping이 필요하다. |
| `getTargetRanges` 미사용 | source 확정 | current code search상 호출이 없다. | beforeinput target range 기반 selection probe가 필요한 실패 trace가 생기면 재검토한다. |
| `execCommand` fallback 미사용 | source/test 확정 | hidden clipboard fallback audit와 BlockEditor tests가 `execCommand` 미호출을 고정한다. | browser extension/offscreen document 같은 특수 clipboard context는 제품 범위 밖이다. |
| Safari ShadowRoot support | 미지원 확정 | WebKit 이슈와 ProseMirror fallback 근거상 real Safari matrix 없이 지원 선언하지 않는다. | 별도 browser QA gate 없이는 Safari 구버전/현행 상세 동작을 닫지 않는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| ShadowRoot `getSelection()` 우선 사용 | 유지 확정 | root-local selection이 있는 환경에서는 document-level selection보다 좁고 정확한 adapter seam이다. |
| `getComposedRanges` adapter | 보류 | StaticRange, shadowRoots allowlist, cross-root selection 정책이 필요하다. 지금은 producer가 없다. |
| `beforeinput.getTargetRanges` fallback | 보류 | target range는 beforeinput event에 묶인 intent signal이다. canonical selection read/write authority로 승격하지 않는다. |
| `document.execCommand("indent")` probe | 제거 확정 | deprecated command side effect를 이용한 probe이고, current no-hidden-fallback/no-browser-authority 정책과 충돌한다. |
| Safari ShadowRoot product support 선언 | 보류 | current demo embedding에 필요 없고 real Safari matrix가 없다. |

## 현재 결론

현재 정석은 root-local selection API가 있으면 사용하고, 없으면 document selection으로
fallback하는 작은 adapter다. `getComposedRanges`, `getTargetRanges`,
`execCommand("indent")` probe를 섞어 Safari ShadowRoot를 broad support로 보이게 만들지
않는다.

ShadowRoot embedding을 정식 지원하려면 먼저 real Safari/WebKit browser fixture,
StaticRange -> canonical cursor mapping, shadowRoots allowlist, cross-root range
정책을 추가해야 한다.
