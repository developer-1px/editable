# Editor CSS layout geometry policy audit

작성일: 2026-06-22

범위: CSS layout, transform, zoom, scroll container가 caret/range overlay와
coordinate hit testing에 주는 영향을 정리한다. 대상은 현재 editor의 mounted DOM
geometry adapter와 custom overlay다.

## 판정

현재 editor의 geometry contract는 viewport-space `DOMRect`다.

- `CursorGeometry`는 renderer `data-path`와 mounted DOM rect를 읽어 viewport 기준
  rect를 만든다.
- `CursorOverlay`와 `SelectionOverlay`는 rect를 다시 계산하지 않고 그대로 그린다.
- overlay root는 transformed editor subtree 안에 있으면 `position: fixed` containing
  block이 바뀔 수 있으므로 `document.body`로 portal한다.
- browser smoke는 transform+scroll, CSS zoom 환경에서 overlay inline rect가 실제
  viewport rect로 투영되는지 확인한다.

따라서 현재 정석은 "model은 좌표를 모르고, view geometry가 viewport rect를 만들고,
overlay는 body-level fixed layer에 그린다"이다. CSS를 아무거나 허용하는 것이 아니라
viewport 좌표계가 깨지는 CSS를 금지하거나 browser fixture로 승격한다.

## CSS layout risk matrix

| CSS/레이아웃 | 현재 판정 | 이유 | 필요한 guard |
| --- | --- | --- | --- |
| outer flex/grid wrapper | 조건부 허용 | editor 밖 wrapper가 rect를 바꾸는 것은 `getBoundingClientRect()`에 반영된다. | editor 내부 data-path element가 measurable box를 유지해야 한다. |
| inline flex/grid styled widget | 금지/보류 | ProseMirror도 flex/grid styled widget 앞 Backspace와 line break 문제를 반복적으로 고쳤다. | widget을 text flow cursor stop으로 넣지 말고 schema atom으로 승격한다. |
| `display: contents` on data-path element | 금지 | box가 없어져 rect와 hit testing source가 사라진다. ProseMirror changelog에도 `posAtCoords` break 사례가 있다. | `data-path`, `.text-run`, block wrapper에는 box-generating display만 허용한다. |
| absolutely positioned inline widget | 금지/보류 | text flow order와 visual rect order가 갈라지고 composition target 앞 widget 문제가 보고되어 있다. | contenteditable=false atom이거나 editor 밖 overlay여야 한다. |
| `transform: scale(...)` on editor ancestor | 조건부 허용 | transformed DOM rect는 viewport rect로 읽고, overlay는 body portal fixed layer에 그리면 추가 변형을 받지 않는다. | body/html transform은 미지원. browser projection smoke 필요. |
| CSS `zoom` on editor ancestor | 조건부 허용 | CSS zoom rect도 viewport projection smoke로 확인한다. | browser가 `zoom`을 지원할 때만 자동 검증한다. body/html zoom은 미지원. |
| window/page scroll | 허용 | viewport rect를 매번 새로 읽고 fixed overlay에 투영한다. | stale cached rect 금지. |
| nested scroll container | 부분 허용 | focus scroll preserve와 `scrollIntoView(nearest)`는 있으나 full scroll parent stack 계산은 없다. | fixed/sticky/absolute parent stack은 별도 browser fixture가 필요하다. |
| collapsed block margin | 보류 | visual blank area와 block rect가 분리되어 hit testing row가 애매해질 수 있다. | editor block rhythm은 gap/padding/min-height처럼 measurable layout으로 둔다. |
| body/html transform or zoom | 금지 | overlay portal도 같은 transformed root 안에 들어가 viewport 좌표계 자체가 바뀐다. | product embedding에서 root transform/zoom을 금지하거나 별도 top-level overlay host를 설계한다. |

## Current implementation

| 항목 | 현재 상태 |
| --- | --- |
| geometry source | `createDOMCursorGeometry`가 mounted DOM rect와 `data-path`를 읽는다. |
| overlay projection | `FixedViewportOverlay`가 overlay root를 mount 이후 `document.body`로 portal한다. |
| caret overlay | `CursorOverlay`가 `geometry.rectForPoint(point)`의 `left/top/width/height`를 style로 쓴다. |
| range overlay | `SelectionOverlay`가 `geometry.rectsForRange(anchor, focus)` 결과를 style로 쓴다. |
| atom overlay | selected atom before/after edge rect union을 body fixed layer에 그린다. |
| scroll | geometry는 fresh rect를 읽고, focus/reveal 정책은 scroll focus audit로 분리한다. |

`FixedViewportOverlay`는 server/static render에서는 inline overlay를 반환하고, client
mount 이후에만 portal한다. 서버 렌더러는 portal을 지원하지 않기 때문에 이 분리가
필요하다.

## Browser verification

| fixture | 상태 | 기대 |
| --- | --- | --- |
| transform + page scroll | 실행 테스트 있음 | `.editor-pane`에 `transform: scale(0.82)`와 page scroll을 적용해도 selected range overlay root가 `BODY` 아래 있고 inline rect가 실제 viewport rect와 일치한다. |
| CSS zoom | 실행 테스트 있음 | browser가 CSS `zoom`을 지원하면 `.editor-pane { zoom: 1.2 }`에서 같은 projection contract를 확인한다. |
| nested scroll parent stack | future | 현재는 native `scrollIntoView(nearest)`에 맡긴다. 직접 scroll parent stack 계산은 없다. |
| body/html transform or zoom | unsupported | 현재 overlay host도 root transform/zoom의 영향을 받으므로 지원 선언하지 않는다. |
| cross-browser pixel parity | future | Chromium/Firefox/WebKit projection smoke는 통과했지만 이번 smoke는 projection contract를 닫는 용도다. exact font/text pixel parity는 별도 matrix다. |

실행 근거:

- `tests/browser/editor-layout-geometry.spec.ts`
- `src/editor/internal/react/FixedViewportOverlay.tsx`
- `src/editor/internal/react/CursorOverlay.tsx`
- `src/editor/internal/react/SelectionOverlay.tsx`

## 최소 repro 정의

| repro | 만들 CSS/DOM | 기대 판정 |
| --- | --- | --- |
| flex/grid widget before Backspace | inline atom DOM에 `display: inline-flex` 또는 grid를 주고 앞에서 Backspace | schema atom 외 text-flow widget이면 금지. 지원하려면 model atom edge fixture가 먼저 필요하다. |
| `display: contents` data-path | `.text-run[data-path]` 또는 block wrapper에 `display: contents` | 금지. rect source가 사라지면 geometry adapter는 null 또는 잘못된 hit test가 된다. |
| absolute widget before composition | text leaf 앞에 absolute positioned widget 삽입 후 IME composition | 금지/보류. contenteditable=false atom 또는 editor 밖 overlay로 옮긴다. |
| transform scale | editor ancestor에 `transform: scale(...)`와 page scroll 적용 | body portal projection smoke가 통과해야 허용한다. |
| CSS zoom | editor ancestor에 `zoom` 적용 | browser가 지원하면 projection smoke가 통과해야 허용한다. |
| nested scroll container | editor를 overflow container 안에 넣고 caret reveal | focus preserve와 reveal은 분리한다. full stack 계산은 별도 fixture 전까지 지원 선언하지 않는다. |
| collapsed margins | consecutive blocks에 top/bottom collapsed margin 조합 적용 | hit testing blank row가 모호해지면 금지. gap/padding/min-height로 바꾼다. |

## 외부 근거

| 출처 | 반복되는 실패 모드 | 우리 쪽 해석 |
| --- | --- | --- |
| ProseMirror view changelog | flex/grid widget 앞 Backspace line break, absolutely positioned widget 앞 composition, `display: contents`와 `posAtCoords`, scale transform scrollIntoView, scrollable cursor visibility, `coordsAtPos` line wrap/empty line/zero-height rect 등이 반복된다. | CSS layout은 editor view의 핵심 위험면이다. DOM rect와 native coordinate API를 단일 진실로 보면 안 된다. |
| Lexical changelog | draggable handle/dropdown CSS zoom, block cursor position, menu positioning, scrollable editor, collapsed margins 관련 수정이 반복된다. | overlay/handle/menu는 content rect와 다른 coordinate plane을 가지기 쉬우므로 projection host를 명확히 해야 한다. |
| Lexical PR #8052 | draggable handle과 toolbar dropdown의 CSS zoom positioning 문제를 수정했다. | zoom은 "보이면 맞겠지"가 아니라 별도 projection 검증 대상이다. |

근거 링크:

- https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md
- https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md
- https://github.com/facebook/lexical/pull/8052

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| viewport-space geometry contract | 확정 | `CursorOverlay`, `SelectionOverlay`, `createDOMCursorGeometry`, cursor geometry audit가 `DOMRect.left/top` 기반 contract를 고정한다. | Browser text metric exact parity는 아니다. |
| body fixed overlay host | 실행 테스트로 확정 | `FixedViewportOverlay`와 overlay unit tests, Playwright `editor-layout-geometry.spec.ts`가 Chromium/Firefox/WebKit에서 transform+scroll/CSS zoom projection을 확인한다. | body/html transform/zoom은 지원하지 않는다. |
| `display: contents` 금지 | 정책 확정 | data-path element가 box를 잃으면 rect source가 없어지고 ProseMirror changelog에도 coordinate break 사례가 있다. | 금지 lint/AST guard는 아직 없다. |
| absolute/text-flow widget 금지 | 정책 확정 | composition target 앞 absolute widget과 widget cursor 문제는 외부 changelog에서 반복된다. | current schema에는 arbitrary widget extension surface가 없다. |
| nested scroll/fixed/sticky stack | 미정 | scroll focus audit가 focus preserve와 `scrollIntoView(nearest)`만 확정한다. | 직접 scrollRect stack 계산은 browser matrix 전까지 보류한다. |
| collapsed margin support | 미정 | Lexical changelog에 collapsed margin 관련 draggable block 수정이 있고, current geometry는 mounted rect 중심이다. | current browser fixture는 collapsed margin matrix를 닫지 않는다. |
| cross-browser pixel parity | 미정 | 단위 테스트와 Chromium/Firefox/WebKit projection smoke가 있다. | Windows font/rendering 차이와 exact text metric parity는 별도 QA가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| overlay를 editor subtree 안에 계속 둠 | 제거 확정 | transformed ancestor가 fixed containing block을 바꿔 viewport rect projection을 깨뜨린다. |
| body portal overlay | 유지 확정 | viewport-space rect를 추가 변환 없이 그리는 가장 작은 host다. |
| overlay가 local rect로 재계산 | 제거 확정 | geometry source가 둘로 갈라지고 transform/scroll 보정이 overlay로 새어 나온다. |
| body/html zoom 지원 선언 | 보류/금지 | top-level coordinate plane이 바뀌므로 별도 overlay host나 browser matrix 없이 지원하면 안 된다. |
| full ProseMirror scroll stack clone | 보류 | fixed/sticky/absolute/nested scroll evidence 없이 구현하면 추측성 코드가 된다. |

## 현재 결론

CSS layout geometry에서 변하지 않아야 할 핵심은 viewport-space geometry adapter와
body-level fixed overlay host다. Flex/grid wrapper, transform scale, editor-level CSS
zoom, page scroll은 이 contract 안에서 조건부 허용한다. `display: contents`,
arbitrary absolute/text-flow widget, body/html transform/zoom, collapsed-margin 기반
row math, full nested scroll stack은 현재 지원 선언하지 않는다.
