# Editor Visual Selection Audit

작성일: 2026-06-21

범위: 현재 dirty workspace 기준. selection/caret overlay가 기능적으로 필요한지,
또는 색상/선/장식 선택인지 분리한다. 디자인 원칙은 기존 디자인을 최대한 쓰고
선과 장식을 최소화하는 것이다.

## 판정

현재 확정으로 말할 수 있는 것은 네 가지다.

1. custom caret overlay는 필요하다.
2. text range overlay는 필요하다.
3. selected atom overlay는 필요하다.
4. focus-only editor affordance는 필요하다.

현재 확정으로 말할 수 없는 것은 최종 제품 시각 스타일이다.

- caret은 보이면 되며 `tomato`일 필요가 없어서 기존 text color로 맞췄다.
- text range는 보이면 되며 기존 link color 계열 fill로 맞췄다.
- atom selection은 보이면 되며 기존 link color 계열 border로 맞췄다.
- figure atom은 DOM class로 구분하면 충분하므로 dashed outline은 제거했다.
- focus-only 상태는 기존 link color 계열의 낮은 대비 inset shadow로 맞췄다.

따라서 overlay mechanism은 빼면 안 되지만, mention/figure마다 다른 선 모양을
강제하는 것은 현재 근거로 확정할 수 없고 선/장식 최소화 원칙에 맞지 않는다.

## 확정 근거

| 항목 | 확정 범위 | 근거 |
| --- | --- | --- |
| caret overlay | geometry `rectForPoint`에서 caret DOM을 만든다. zero-width caret도 2px로 보이게 한다. | `CursorOverlay.test.tsx` |
| text range overlay | canonical selection range를 `geometry.rectsForRange`로 렌더링한다. | `SelectionOverlay.test.tsx` |
| atom overlay | `selectedPointers`의 before/after rect union으로 mention/figure selection DOM을 만든다. | `SelectionOverlay.test.tsx`, BlockEditor split tests |
| overlay non-interference | overlay root는 `aria-hidden`이고 `pointer-events: none`이다. | `SelectionOverlay.test.tsx`, `src/styles.css` |
| native selection coherence | native range가 보이는 동안 stale custom overlay를 남기지 않는 경로가 있다. | BlockEditor split tests |
| focus-only affordance | editor focus state가 `data-focused`로 DOM에 드러나고, 기존 link color 계열 inset shadow로 보인다. | BlockEditor split tests, `src/styles.css`, Chrome headless computed style |

이 기능들은 selection state를 사용자가 볼 수 있게 만드는 affordance다. 제거하면
caret/range/atom selection의 검증 기준선이 깨진다.

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| custom caret overlay mechanism | 확정 | `CursorOverlay`가 `geometry.rectForPoint()` 결과로 `data-overlay="caret"` DOM을 만들고, text point `data-offset`, atom edge `data-edge`, `data-path`, inline rect style을 낸다. `CursorOverlay.test.tsx`가 text caret, atom edge caret, zero-width caret 2px fallback을 고정한다. |
| text range overlay mechanism | 확정 | `SelectionOverlay`가 canonical selection range를 `geometry.rectsForRange()`로 투영하고 `data-overlay="selected-range"` DOM을 만든다. `SelectionOverlay.test.tsx`가 non-collapsed range rect와 collapsed edge에서 range/atom overlay를 그리지 않는 동작을 고정한다. |
| selected atom overlay mechanism | 확정 | `selectedPointers`의 before/after rect union으로 mention/figure atom overlay를 만들고 `selection-atom-mention`/`selection-atom-figure` class와 `data-path`를 남긴다. `SelectionOverlay.test.tsx`와 BlockEditor split tests가 atom pointer selection, shift extension, block selection, stale native range보다 atom selection 우선 경로를 고정한다. |
| overlay non-interference surface | 확정 | overlay roots는 `aria-hidden="true"`이고 CSS에서 `pointer-events: none`이다. `SelectionOverlay.test.tsx`는 `aria-hidden`, `src/styles.css`는 pointer event pass-through intent를 고정한다. 실제 pointer event pass-through browser behavior는 browser QA snapshot으로만 본다. |
| native range and IME overlay coherence | 확정 | BlockEditor split tests가 native DOM range가 보일 때 custom caret/selection overlay를 숨기고, IME composition 중에도 stale custom caret을 숨긴 뒤 composition 종료/toolbar command 후 caret을 복구하는 경로를 고정한다. |
| focus-only editor affordance | 확정 | BlockEditor split tests가 focus 시 `data-focused="true"`와 caret overlay, blur 시 focus attr/overlay removal을 고정한다. CSS는 native outline suppression과 focused inset shadow를 제공한다. |
| visual styling cleanup | 확정 | current CSS에는 `tomato` caret이나 figure 전용 dashed outline이 없다. 기능은 caret/range/atom visibility이고, 색/선은 기존 body/link color 계열을 재사용한다. 다시 별도 경고색/figure-only 선을 추가할 근거는 없다. |
| Chrome visual QA | 확정 snapshot | 2026-06-21 Chrome headless에서 range fill, mention/figure atom border, native drag stale-overlay absence, focus box-shadow, pointer caret rect/background를 확인했다. 이 증거는 단일 Chrome snapshot이지 cross-browser/accessibility matrix가 아니다. |
| final visual style | 미정 | current colors, border radius, focus shadow, caret thickness는 기능을 보이게 하는 현재 표현이다. 제품 palette, exact pixel parity, accessibility contrast/announcement policy까지 닫은 것은 아니다. |
| assistive-tech selection announcement | 미정 | overlay roots are `aria-hidden`, but screen reader/focus/selection announcement adequacy has not been verified per assistive technology. |
| real browser pointer/drag matrix | 미정 | single Chrome headless smoke는 있다. 하지만 touch/pen, high zoom, mobile browser, OS/browser-specific native selection ordering, multi-range, RTL/BiDi/vertical writing까지 검증하지 않았다. |

## 현재 CSS 표현

| Selector | 현재 표현 | 판정 |
| --- | --- | --- |
| `.selection-caret` | `background: #1d1b18` | caret visibility는 확정 기능이고, 색은 기존 body text color를 재사용한다. |
| `.selection-range` | `rgb(36 89 197 / 18%)`, `border-radius: 3px` | keyboard range overlay가 Chrome에서 실제 rect와 fill로 보이는 것을 확인했다. 색은 기존 link color를 재사용한다. |
| `.selection-atom` | `1px solid #2459c5`, `border-radius: 6px` | mention/figure selected atom overlay가 Chrome에서 실제 border rect로 보이는 것을 확인했다. 색은 기존 link color를 재사용한다. |
| `.selection-atom-figure` | 추가 style 없음 | figure 전용 dashed border는 제거 확정이다. class는 DOM 구분용으로 남긴다. |
| `.editor-surface[data-focused="true"]` | `inset 0 0 0 2px rgb(36 89 197 / 28%)` | native outline은 계속 억제하되 focused editor 영역은 기존 link color 계열로 보인다. Chrome에서 computed style을 확인했다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| overlay module 제거 | 유지 확정 | selection affordance가 사라지고 overlay tests가 깨진다. |
| atom selected state 제거 | 유지 확정 | explicit node selection과 covered atom selection을 볼 수 없게 된다. |
| dashed figure border 유지 | 제거 확정 | figure class 구분은 DOM에 남아 있고, 다른 선 모양은 기능 테스트가 요구하지 않는다. 선/장식 최소화 원칙상 제거가 맞다. |
| tomato caret 유지 | 제거 확정 | 기능은 caret visibility다. 별도 경고색처럼 보이는 `tomato` 대신 기존 text color를 재사용한다. |
| selection blue family 유지 | 유지 확정 | range/atom affordance는 유지하되 기존 link color 계열로 줄였고, Chrome에서 실제 rect와 fill/border 렌더링을 확인했다. |
| native focus outline suppression 유지 | 유지 확정 | editor-owned caret/selection과 native outline 중복을 줄이되, `data-focused` inset shadow가 editor focus affordance를 대체한다. |

## Browser QA

2026-06-21에 `http://127.0.0.1:3000/`을 Chrome headless로 열어 실제 DOM rect와
computed style을 확인했다.

| 상태 | 결과 |
| --- | --- |
| keyboard range selection | `.selection-range`가 `rgba(36, 89, 197, 0.18)` fill, `3px` radius, non-zero rect로 렌더링된다. |
| mention atom selection | `.selection-atom.selection-atom-mention`이 `1px solid rgb(36, 89, 197)` border, `6px` radius, `pointer-events: none`으로 렌더링된다. |
| figure atom selection | `.selection-atom.selection-atom-figure`이 figure rect 위에 같은 border/radius로 렌더링된다. figure 전용 dashed outline은 없다. |
| native drag range | mouse drag 경로에서는 stale custom overlay가 남지 않았다. native range와 custom overlay 동시 잔존 문제는 관측되지 않았다. |
| editor focus style | focused editor가 `data-focused="true"`를 가지고, computed `box-shadow`가 `rgba(36, 89, 197, 0.28) 0px 0px 0px 2px inset`으로 렌더링된다. outline은 `none`, native caret color는 transparent다. |
| collapsed text caret via browser pointer | first text run을 실제 pointer click한 뒤 focused editor가 `data-focused="true"`이고 `.selection-caret`이 1개 렌더링된다. caret rect는 `2px x 29.71875px`, background는 `rgb(29, 27, 24)`다. |

## 다음 확인

시각 변경을 실제로 적용하려면 브라우저에서 확인해야 한다.

- 보조 기술별 focus/selection announcement가 충분한지

현재 코드에서는 기능 테스트가 요구하지 않는 dashed figure outline과 tomato caret을
제거했다. range/atom overlay 색, focus-only affordance, collapsed pointer caret은
브라우저에서 확인했다. 보조 기술별 announcement는 제품 디자인으로 완전히
확정됐다고 부르면 안 된다.
