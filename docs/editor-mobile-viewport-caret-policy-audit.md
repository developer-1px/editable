# Editor mobile viewport caret policy audit

작성일: 2026-06-22

범위: 모바일 가상 키보드, visual viewport, focus auto-zoom, scroll reveal,
caret visibility가 editor selection/cursor policy에 주는 영향을 정리한다.

## 판정

모바일 caret visibility는 desktop `scrollIntoView({ block: "nearest" })`만으로
닫히지 않는다. 가상 키보드가 열리면 layout viewport와 실제 보이는 visual viewport가
달라질 수 있고, Enter/typing 후 caret이 keyboard 뒤에 가려질 수 있다.

현재 editor는 focus side effect 보존과 selection reveal을 분리한 것은 맞지만,
mobile keyboard occlusion까지 보장하지는 않는다. Future mobile reveal은
`visualViewport`가 있으면 그 좌표계를 우선하고, 없으면 기존 desktop path로 fallback해야
한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/view/contentEditableSelection.ts` | 현재 caret reveal은 focused selection target에 `scrollIntoView({ block: "nearest", inline: "nearest" })`만 호출한다. |
| `src/editor/internal/view/focusScroll.ts` | focus는 `focus({ preventScroll: true })`와 scroll snapshot restore로 page jump를 줄인다. |
| `docs/editor-scroll-focus-policy-audit.md` | focus preserve와 caret reveal을 분리하고, mobile viewport/keyboard compensation은 아직 미정으로 둔다. |
| `docs/editor-mobile-touch-selection-policy-audit.md` | mobile touch/keyboard 동작은 desktop pointer path로 닫을 수 없고 실기기 trace가 필요하다고 정리한다. |
| `src/routes/__root.tsx` | viewport meta는 `width=device-width, initial-scale=1`이다. |
| `src/styles.css` | document/editor text는 `1.08rem` 이상이고 code block도 `0.95rem`이다. iOS Safari auto-zoom의 16px 미만 focus target 위험은 current editor text surface에는 낮다. |
| Lexical PR #8486 | Enter 후 새 caret이 on-screen keyboard 뒤에 숨는 문제를 `visualViewport` 기준 scroll math로 고쳤다. |
| Lexical PR #8480 | iOS Safari는 focus target font-size가 16px 미만이면 auto-zoom이 발생할 수 있어 editor font-size를 16px로 올렸다. |
| ProseMirror view changelog | Mobile Safari cursor scroll, focus scroll restore, Android virtual keyboard Enter/Backspace, scale transform scrollIntoView 문제가 반복된다. |
| ProseMirror Android write-up | Android on-screen keyboard는 keyboard/OS/language별 event ordering과 selection/composition 동작이 불안정하다. broken state 감지가 필요하다. |

## Current support boundary

| 항목 | 현재 상태 | 판정 |
| --- | --- | --- |
| focus scroll preservation | 구현됨 | focus 자체가 page/ancestor scroll을 튀게 만들지 않게 한다. |
| desktop selection reveal | 구현됨 | mounted data-path target에 `scrollIntoView(nearest)`를 호출한다. |
| visual viewport compensation | 없음 | 가상 키보드가 줄인 visible area 기준 caret visibility를 보장하지 않는다. |
| iOS focus auto-zoom guard | 부분 충족 | current editor text surface는 16px 이상이다. future compact input/popup은 별도 guard가 필요하다. |
| mobile viewport trace | 없음 | `visualViewport`, selection rect, scroll ordering을 debug recorder가 구조화해 남기지 않는다. |
| 실기기 matrix | 없음 | iOS Safari, Android Chrome/Gboard, Android WebView trace는 #78로 분리한다. |

## Policy

| 상황 | policy |
| --- | --- |
| focus 요청 | 먼저 `focusElementPreservingScroll`로 focus side effect를 억제한다. 이 단계에서 caret reveal을 섞지 않는다. |
| selection restore | canonical point를 native DOM selection으로 복원한다. Restore 자체가 scroll policy를 갖지 않는다. |
| desktop reveal | 현재처럼 target element에 `scrollIntoView(nearest)`를 호출한다. |
| mobile reveal | `window.visualViewport`가 있으면 `offsetTop`과 `height`로 visible top/bottom을 계산해 caret rect가 keyboard 뒤에 있는지 판단한다. |
| missing visualViewport | 기존 `innerHeight`/browser native scroll path로 fallback한다. 지원 보장으로 선언하지 않는다. |
| Enter/typing/toolbar command 후 | selectionAfter가 바뀌었고 editor가 focused이면 reveal 후보가 된다. Composition active 중이면 native IME caret을 침범하지 않는다. |
| editor 내부 scroll container | page/body scroll과 editor overflow scroll을 분리한다. 내부 container는 existing `scrollIntoView(nearest)` 또는 container-specific rect policy가 필요하다. |
| iOS auto-zoom | focus 가능한 editor/input text는 16px 이상을 유지한다. 16px 미만 compact focus target을 추가하지 않는다. |

## Visual viewport reveal rule

| 단계 | 내용 |
| --- | --- |
| 1. caret rect read | focused canonical point의 DOM/caret rect를 viewport-space로 읽는다. |
| 2. visual viewport read | `window.visualViewport`가 있으면 `{ top: offsetTop, bottom: offsetTop + height }`를 사용한다. |
| 3. bottom occlusion check | caret bottom이 visual viewport bottom보다 크면 body/page scroll 보정 후보가 된다. |
| 4. top check | caret top이 visual viewport top보다 작으면 위쪽으로 보정한다. |
| 5. margin | keyboard 가장자리와 붙지 않도록 small threshold/scroll margin은 view adapter 상수로 둔다. |
| 6. fallback | visualViewport가 없거나 rect가 없으면 기존 reveal로 돌아간다. |

이 규칙은 Lexical #8486과 같은 방향이다. `getBoundingClientRect()`는 layout viewport
좌표이고, `visualViewport.offsetTop + height`도 같은 좌표계의 visible bottom으로
해석할 수 있다.

## Debug trace policy

녹화 로그를 길게 늘리지 않는다. Mobile viewport 조사는 아래 요약 필드만 state entry에
붙이는 방식이 맞다.

| field | 내용 |
| --- | --- |
| `layoutViewport` | `innerWidth`, `innerHeight` |
| `visualViewport` | `width`, `height`, `offsetTop`, `offsetLeft`, `scale` |
| `caretRect` | focused caret/selection rect의 `top`, `bottom`, `left`, `right` |
| `scroll` | `scrollX`, `scrollY`, nearest scroll container id/path가 있으면 summary |
| `visibility` | caret이 visual viewport 안/아래/위 중 어디에 있는지 |

Full DOM snapshot이나 긴 raw HTML은 기본 clipboard trace에 넣지 않는다.

## Trace scenarios

| id | scenario | 기대 evidence |
| --- | --- | --- |
| MV-01 | iOS Safari text focus | auto-zoom 여부, focused font-size, viewport scale |
| MV-02 | iOS Safari long document Enter | Enter 후 selection/caret rect가 visual viewport 안에 남는지 |
| MV-03 | Android Chrome + Gboard long list Enter | 새 block/list item caret이 keyboard 위로 즉시 scroll되는지 |
| MV-04 | Android Chrome composition update | composition active 중 reveal이 IME caret을 덮지 않는지 |
| MV-05 | toolbar command after keyboard open | focus preserve, active leaf flush, reveal 순서 |
| MV-06 | URL bar collapse/non-zero visualViewport offsetTop | visible bottom 계산이 offsetTop을 반영하는지 |
| MV-07 | Android WebView | Chrome과 event/viewport ordering 차이 |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| focus preserve/reveal 분리 | 실행 테스트로 확정 | `focusScroll.test.ts`, `BlockEditor.test.tsx`, scroll focus audit가 focus와 reveal을 분리한다. | mobile keyboard occlusion은 닫지 않는다. |
| current editor font auto-zoom 위험 낮음 | source 기반 부분확정 | editor document/code text CSS는 16px 이상으로 계산된다. | iOS 실기기 scale trace는 없다. Future compact focus target은 다시 확인해야 한다. |
| visualViewport 필요성 | 외부 사례 확정 | Lexical #8486은 layout viewport 기준 scroll이 mobile keyboard 뒤 caret을 놓친다고 설명하고 `visualViewport`로 수정했다. | current repo 구현은 아직 없다. #77에서 구현한다. |
| iOS 16px focus target | 외부 사례 확정 | Lexical #8480은 iOS Safari auto-zoom 방지를 위해 focused editor font-size를 16px로 맞췄다. | current app의 모든 future focus UI에 자동 적용되는 guard는 없다. |
| Android keyboard 불안정성 | 외부 사례 확정 | ProseMirror Android write-up과 changelog는 keyboard/IME/selection 문제가 반복됨을 보여준다. | 실제 device trace는 #78에서 수집해야 한다. |
| debug viewport trace 필요 | 정책 확정 | 현재 recorder는 viewport/caret rect 요약을 mobile 조사에 충분히 남기지 않는다. | 구현은 #77 범위다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| focus preserve와 caret reveal을 한 함수로 합치기 | 제거 | focus side effect 보존과 keyboard occlusion 보정은 다른 phase다. |
| mobile에서도 `scrollIntoView(nearest)`만 믿기 | 제거 필요 | layout viewport와 visual viewport가 다르면 caret이 keyboard 뒤에 있어도 in-view로 오판한다. |
| `visualViewport` 없는 환경 지원 선언 | 보류 | fallback은 가능하지만 keyboard occlusion 보장을 선언하지 않는다. |
| debug recorder에 full DOM/JSON 추가 | 제거 | 모바일 조사는 viewport/caret rect summary만 있으면 된다. 로그가 커지면 분석 비용이 커진다. |
| 16px 미만 compact editor text | 금지 | iOS Safari auto-zoom을 유발할 수 있다. |
| 실기기 trace 없이 mobile policy 완료 선언 | 제거 | iOS/Android/WebView keyboard ordering은 desktop/jsdom으로 대체할 수 없다. |

## 후속 이슈

| issue | 목적 |
| --- | --- |
| #77 | `visualViewport` 기반 mobile caret reveal과 viewport/caret debug trace를 구현한다. |
| #78 | iOS Safari, Android Chrome/Gboard, Android WebView 실기기 viewport/caret trace를 수집한다. |

## 현재 결론

현재 editor의 focus preserve와 desktop reveal은 유지한다. 그러나 모바일 가상 키보드
상태에서 caret visibility를 보장한다고 말하면 안 된다.

정석은 `visualViewport`를 view adapter의 입력으로 사용해 visible area를 계산하고,
debug recorder에는 full DOM이 아니라 viewport/caret rect 요약만 남기는 것이다. 실기기
matrix는 #78에서 따로 닫는다.
