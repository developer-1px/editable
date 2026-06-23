# Editor Cursor Geometry Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `CursorGeometry`와 DOM geometry helpers가 빼면
안 되는 view adapter인지, 아니면 최종 브라우저/레이아웃 QA나 제품 시각 결정으로
남겨야 하는지 구분한다.

## 판정

`CursorGeometry`는 public editor API가 아니라 React editor 내부에서 model cursor
point와 DOM viewport rect를 연결하는 view adapter interface다. 현재 확정할 수 있는
interface는 `rectForPoint`, `rectsForRange`, `pointFromCoordinates`,
`pointForVerticalMovement`, `lineStartPoint`, `lineEndPoint`, `pageStep`이다.

이 adapter는 overlay drawing, pointer hit testing, drag selection, drop target,
vertical/page movement, Home/End line movement가 공유하는 작은 interface다. 삭제하면
geometry 지식이 `BlockEditor`, overlay components, input adapter tests에 흩어진다.
반대로 이 audit은 최종 visual style이나 cross-browser layout pixel parity를 확정하지
않는다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| legal cursor stop rects | invariant fixtures의 모든 legal cursor stop이 finite caret/edge rect를 갖는다. | cursorGeometry split tests |
| text caret and range rects | text offset caret, selected text range, hard newline selection, zero-width caret visibility가 rect로 표현된다. | cursorGeometry split tests, `CursorOverlay.test.tsx`, `SelectionOverlay.test.tsx` |
| inline and block atom edges | mention atom과 figure block의 before/after edge rect를 만들고, range rect는 atom edge 자체를 text range처럼 invent하지 않는다. | cursorGeometry split tests, `SelectionOverlay.test.tsx` |
| model-order range rects | inline atom을 사이에 둔 range도 DOM order가 아니라 model order로 text rect를 만든다. block atom edge도 document order에 맞춘다. | cursorGeometry split tests |
| marked text DOM mapping | `strong`, `em`, `code`, link 같은 nested mark element 안에서도 visible offset을 text node path로 mapping한다. | cursorGeometry split tests, `DocumentRenderer split tests` |
| empty and code block carets | empty paragraph, rendered empty text-run, empty visual line after hard newline, code block padding, code block hard newline 위치가 caret rect를 가진다. | cursorGeometry split tests |
| coordinate hit testing | viewport coordinate를 nearest valid cursor point로 변환하고, rendered empty paragraph와 hard newline이 만든 선행/중간/연속/후행 빈 visual row의 whitespace도 같은 row의 cursor point로 유지한다. scroll 후 현재 viewport rect를 다시 읽고 invalid DOM에는 null을 반환한다. | cursorGeometry split tests |
| wrapped and hard-break rows | soft wrap, hard newline, hard-break whitespace hit testing, hard newline이 만든 선행/중간/연속/후행 빈 visual row, wrapped boundary affinity를 visual row 기준으로 처리한다. | cursorGeometry split tests |
| vertical movement | ordered row movement가 current-line nearest hit testing으로 되돌아가지 않고, figure/empty paragraph/consecutive empty paragraph를 지나간다. | cursorGeometry split tests, cursor command split tests, inputAdapter split tests |
| page and line boundaries | `pageStep`은 root viewport height를 쓰고, line start/end geometry는 Home/End, Cmd/Ctrl+Arrow line movement에 쓰인다. | cursorGeometry split tests, inputAdapter split tests, cursor command split tests |
| overlay consumers | `CursorOverlay`와 `SelectionOverlay`는 geometry interface만 받아 caret/range/atom overlay를 렌더링한다. | `CursorOverlay.test.tsx`, `SelectionOverlay.test.tsx` |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| `CursorGeometry` interface | 확정 | `createDOMCursorGeometry` source와 `editorCore split tests`의 view adapter path가 `rectForPoint`, `rectsForRange`, `pointFromCoordinates`, `pointForVerticalMovement`, `lineStartPoint`, `lineEndPoint`, `pageStep`을 현재 geometry seam으로 고정한다. | Public editor API로 승격한다는 뜻은 아니다. |
| legal cursor stop rects | 확정 | cursorGeometry split tests가 rich text, empty paragraph, consecutive empty paragraph, figure, code, wrap fixture의 모든 legal stop에 finite rect를 요구한다. | jsdom fixture 기반 rect contract이며 실제 browser pixel parity는 아니다. |
| text caret/range geometry | 확정 | text offset caret, text range, hard newline selection, zero-width caret overlay, nested mark text node mapping이 실행 테스트로 닫혀 있다. | Complex script shaping, BiDi, vertical writing은 별도 contract가 없다. |
| inline/block atom geometry | 확정 | mention/figure before-after edge rect, atom range non-invention, document-order block atom range behavior, selected atom overlay가 테스트로 고정되어 있다. | Atom의 최종 시각 affordance는 style surface 영역이다. |
| coordinate hit testing | 확정 | viewport coordinate to nearest cursor point, figure/text hit testing, rendered empty paragraph hit testing, hard newline이 만든 선행/중간/연속/후행 blank row whitespace hit testing, scroll 후 current rect 재평가, invalid DOM null 반환이 테스트로 고정되어 있다. | Real browser 좌표 matrix, touch/pen event ordering은 아직 닫지 않았다. |
| vertical/page/line movement support | 확정 | ordered row vertical movement, preferredX preservation, geometry page step, line boundary 조회, figure/empty paragraph traversal, consecutive hard-break blank row vertical movement가 view/model adapter tests에 있다. | Cross-browser visual movement parity와 platform shortcut policy는 별도 검증이 필요하다. |
| overlay projection from geometry | 확정 | `CursorOverlay`/`SelectionOverlay` tests가 geometry interface만 받아 caret, range, atom overlay를 렌더링함을 고정한다. | 색, border, radius 같은 최종 visual token은 geometry contract가 아니다. |
| hard-newline blank visual row hit testing | 확정 결함 수정 | `A\n\nB`의 가운데 빈 visual row 오른쪽 whitespace hit test가 기존에는 offset `3`으로 다음 줄에 붙었다. newline fragment를 selection rect에는 남기되 line-break marker로 표시해서 hit test와 line end에서는 보이지 않는 구분자로 처리하고, offset `2`에 남는 회귀 테스트를 추가했다. 같은 렌즈로 `\n\nA`, `A\n\n\nB`, `A\n\n`의 선행/연속/후행 blank row도 hit-test, line start/end, vertical movement 회귀 테스트로 잠갔다. | 실제 브라우저 pixel parity와 touch/pen event ordering은 별도 browser/layout QA 없이는 단정하지 않는다. |
| coordinate branch locality | 확정 현재 상태 | `$doubt if`에서 coordinate-to-line point 변환 중복 분기를 기존 `pointFromLineCoordinate` helper로 합쳤고, 이후 SRP split으로 DOM factory인 `cursorGeometry.ts`는 7 LOC/if 0이 됐다. GeometryMap query factory는 `cursorGeometryQueries.ts` 32 LOC/if 0이고, point/line/order lookup은 `cursorGeometryPointLookup.ts` 164 LOC/if 19, rect/range projection은 `cursorGeometryRectQueries.ts` 147 LOC/if 11, vertical line/page movement는 `cursorGeometryVerticalMovement.ts` 86 LOC/if 8, coordinate hit-test helper는 `cursorGeometryPointMapping.ts` if 11로 격리되어 있다. Blank-row regression을 포함한 focused geometry suite 359개가 통과했다. | 전체 cursor/selection runtime의 모든 `if`가 불필요하다는 뜻은 아니다. Null guard, DOM shape guard, layout edge guard는 입력 방어와 visual row 판정 역할을 가진다. |
| cross-browser pixel parity | 미정 | 현재 근거는 jsdom fixture와 제한된 Chrome smoke 중심이다. | Safari/Firefox/Windows font/rendering 차이를 닫으려면 별도 browser layout QA gate가 필요하다. |
| BiDi/RTL/vertical writing | 미정 | 현재 tests는 LTR horizontal rich text/code/atom layout 중심이다. | 해당 쓰기 모드가 제품 범위에 들어오면 cursor stream과 geometry policy를 함께 확장해야 한다. |
| virtualization/offscreen measurement | 미정 | 현재 geometry는 mounted DOM을 즉시 읽는다. | Long-document virtualization이 필요해질 때 geometry source seam을 다시 설계한다. |
| exact font/layout measurement policy | 미정 | DOM/canvas fallback과 fixture rect는 현재 behavior를 설명하지만 제품별 font metric parity 정책은 아니다. | Font loading, fallback metric, platform rendering 기준은 별도 QA/policy 영역이다. |

## 아직 애매하거나 제품/플랫폼 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| cross-browser pixel parity | jsdom/unit tests와 단일 Chrome smoke는 있지만 Safari/Firefox/Windows font/rendering 차이를 닫은 것은 아니다. | browser layout QA matrix가 필요하면 별도 gate로 둔다. |
| final selection visual style | geometry는 rect를 제공하지만 색, border, radius, focus affordance의 최종 제품 스타일은 style/visual audit 영역이다. | visual direction이 정해지면 기존 geometry interface를 유지한 채 CSS만 조정한다. |
| BiDi/RTL/vertical writing | 현재 tests는 LTR horizontal rich text/code/atom layout 중심이다. BiDi, RTL, vertical writing mode contract는 없다. | 해당 편집 범위가 제품 요구가 될 때 text layout policy를 추가한다. |
| virtualized/remote layout | geometry는 현재 mounted DOM을 읽는다. offscreen virtualization이나 remote measurement contract는 없다. | virtualization이 필요할 때 geometry source를 별도로 설계한다. |
| exact font measurement policy | `@chenglou/pretext`와 DOM/canvas fallback을 쓰지만 제품별 font metric parity 정책은 없다. | typography/layout QA가 필요하면 font loading과 measurement policy를 별도 gate로 둔다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `CursorGeometry` interface | 유지 확정 | overlay, pointer hit testing, vertical movement가 공유하는 작은 view adapter interface다. |
| `cursorGeometryLayout`/DOM helpers | 유지 확정 | text/atom/code/hard-break/wrap DOM을 canonical cursor coordinates로 바꾸는 implementation이다. 삭제하면 geometry logic이 React wiring으로 퍼진다. |
| duplicated coordinate-to-line `if` chain | 제거 확정 | viewport coordinate와 vertical row movement가 같은 line-to-point 규칙을 써야 하므로 기존 `pointFromLineCoordinate` helper로 합쳤다. 분기 수가 줄고 line hit testing 지식이 한 곳에 남는다. |
| newline fragment를 일반 visible text처럼 hit-test | 제거 확정 | hard newline fragment는 selected newline rect에는 필요하지만 빈 visual row whitespace를 다음 줄 offset으로 보내면 안 된다. line-break marker로 selection 계산과 좌표 hit-test 의미를 분리했다. |
| overlay가 geometry를 직접 계산 | 제거 확정 | overlay components는 rect를 소비해야 하며 layout parsing까지 알면 shallow module이 된다. |
| generic remote/virtual geometry backend | 보류 | 현재 실제 consumer는 mounted DOM geometry뿐이다. 두 번째 geometry source가 생기기 전에는 과잉 abstraction이다. |
| final visual token 결정 | 보류 | geometry는 위치 interface이고 색/선/장식 결정은 style surface다. |

## 현재 결론

cursor geometry에서 빼면 안 되는 것은 `CursorGeometry` view adapter, DOM layout
mapping, text/atom/block/code caret rects, range rects, coordinate hit testing,
vertical/page/line movement support다. 확정하면 안 되는 것은 cross-browser pixel
parity, final selection visual style, BiDi/RTL/vertical writing, virtualization,
exact font measurement policy다.
