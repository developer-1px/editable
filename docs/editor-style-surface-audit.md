# Editor Style Surface Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `src/styles.css`와 React renderer가 제공하는 class/data
surface 중 무엇이 editor 동작을 드러내는 빼면 안 되는 affordance인지, 무엇이 최종
제품 스타일 결정으로 아직 애매한지 구분한다. 디자인 원칙은 기존 디자인을 최대한
활용하고 선과 장식을 최소화하는 것이다.

## 판정

현재 스타일은 대부분 editor interaction을 드러내는 얇은 visual interface다. 특히
contenteditable native caret을 숨기고 custom geometry overlay를 쓰는 구조에서는
caret/range/atom/focus 표현이 기능 affordance라서 제거하면 사용자가 selection state를
볼 수 없다.

반대로 전체 페이지의 배경색, pane 폭/여백, 최종 typography scale, toolbar disabled
affordance 같은 제품 스타일은 테스트가 확정한 contract가 아니다. 이 항목은
"현재 구현"일 뿐 최종 디자인으로 닫지 않는다.

## 확정 근거

| Surface | 확정 범위 | 근거 |
| --- | --- | --- |
| `.editor-surface` | editor-owned caret/selection을 쓰기 위해 native caret은 기본적으로 숨기고, IME 중에는 native caret을 되살린다. focus state는 `data-focused`, composition state는 `data-ime-composing`으로 드러난다. | `BlockEditor.tsx`, BlockEditor split tests, `src/styles.css` |
| `.document-view` data selection attributes | tests와 IME replay가 selection path/offset/edge를 읽는 canonical render/debug surface다. | `DocumentRenderer.tsx`, `BlockEditor.imeTrace.test.tsx`, BlockEditor split tests |
| `.selection-overlay`, `.cursor-overlay` | overlay roots는 `aria-hidden`이고 `pointer-events: none`이라 editor interaction을 가로채지 않는다. | `SelectionOverlay.tsx`, `CursorOverlay.tsx`, `src/styles.css`, `SelectionOverlay.test.tsx` |
| `.selection-caret`, `.selection-range`, `.selection-atom` | geometry rect를 사용해 caret, text range, atom selection을 보이게 한다. | `CursorOverlay.test.tsx`, `SelectionOverlay.test.tsx`, `docs/editor-visual-selection-audit.md` |
| `.text-block`, `.text-run[data-empty-text]` | block flow와 empty text leaf의 measurable caret target을 만든다. | `DocumentRenderer.tsx`, cursorGeometry split tests, contentEditable view split tests |
| block classes | heading/quote/list/code/figure는 schema block type을 DOM과 geometry에 반영한다. | `DocumentRenderer.tsx`, `DocumentRenderer split tests`, cursorGeometry split tests |
| inline classes | mention atom, code mark, link mark는 atomic selection, markdown paste restore, safe link rendering을 DOM에서 구분하게 한다. | `DocumentRenderer.tsx`, BlockEditor split tests, cursorGeometry split tests |
| `.editor-toolbar`, `.icon-button` | toolbar는 icon-only commands with accessible labels이고 mouse down focus steal을 막는다. | `EditorToolbar.tsx`, BlockEditor split tests |
| `.debug-recorder-*` | recorder phase가 active recording/done/copy-failed 상태에서만 compact status output으로 드러난다. Idle 상태는 첫 화면, SSR HTML, Chrome headless DOM에서 숨긴다. | `DebugRecordingInspector.tsx`, BlockEditor split tests, `docs/editor-debug-recorder-audit.md` |
| desktop/mobile layout smoke | production preview를 Chrome headless `Chrome/149.0.7827.156`에서 1280x900 desktop과 390x844 mobile viewport로 열었다. 두 viewport 모두 horizontal overflow가 없고, title/editor/toolbar가 pane 안에 있으며, toolbar는 1줄이었다. Screenshot은 각각 1280x900, 1170x2532 PNG로 캡처됐고 runtime/log error는 0건이었다. | `pnpm preview --host localhost --port 4173 --strictPort`, Chrome DevTools Protocol layout smoke |
| CSS format/lint gate | `src/styles.css`는 Biome CSS check 대상이다. Duplicate `min-height` fallback과 `outline: 0 !important`를 제거했고, `pnpm check`가 CSS format/lint baseline을 본다. | `biome.json`, `pnpm exec biome check src/styles.css`, `pnpm check` |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| editor surface caret/focus/composition affordance | 확정 | `BlockEditor.tsx`가 `editor-surface`, `data-focused`, `data-ime-composing`을 내보내고 `src/styles.css`가 native caret/custom focus/IME caret behavior를 묶는다. BlockEditor split tests는 focus 시 caret overlay와 blur 시 overlay removal, IME 중 composing state와 custom caret 숨김을 고정한다. |
| document selection data attributes | 확정 | `DocumentRenderer.tsx`가 selection path/offset/edge/range/count/selected-pointers attributes를 내보내고, `DocumentRenderer split tests`, BlockEditor split tests, `BlockEditor.imeTrace.test.tsx`가 이 surface를 직접 읽는다. |
| overlay roots and geometry rect projection | 확정 | `SelectionOverlay.tsx`와 `CursorOverlay.tsx`는 `aria-hidden` overlay roots, `data-overlay`, `data-path`, inline rect style을 만든다. Overlay tests가 caret/range/atom projection과 zero-width caret fallback을 고정한다. |
| empty text measurable target | 확정 | `DocumentRenderer.tsx`가 empty text run에 `data-empty-text="true"`와 stable `data-path`를 내보내고, renderer/cursor/contenteditable tests가 empty line caret target으로 사용한다. |
| block/inline semantic class surface | 확정 | renderer tests가 heading/quote/list/code/figure/text/mention/rich mark classes and data attributes를 고정하고, geometry/clipboard/selection tests가 같은 DOM surface를 사용한다. |
| toolbar icon command surface | 확정 | `EditorToolbar.test.tsx`가 fixed four-button toolbar, accessible labels, hidden icons, callback dispatch, mouse-down focus steal prevention을 고정한다. Styling 자체의 색/테두리는 제품 결정이지만 icon command surface는 확정이다. |
| debug recorder phase indicator | 확정 | `DebugRecordingInspector`는 idle이면 렌더링하지 않고 recording/done/copy-failed phase만 `debug-recorder-*` class와 compact output으로 노출한다. BlockEditor split tests가 idle hidden, REC/DONE/FAIL output을 고정한다. |
| CSS check scope and hygiene | 확정 | `biome.json`이 `src/styles.css`를 check scope에 포함하고 `pnpm check`가 CSS baseline을 본다. Duplicate property와 `!important` escape hatch removal은 current gate에 맞춘 확정 cleanup이다. |
| desktop/mobile layout smoke | 확정 snapshot | 단일 Chrome headless desktop/mobile preview에서 overflow, toolbar wrapping, pane containment, screenshot, runtime/log error 0건을 확인했다. 이 증거는 current layout snapshot이지 final product layout matrix는 아니다. |
| `.document-stage` positioning role | 애매 | wrapper class는 current source에 있지만 overlay roots는 `position: fixed`라 relative positioning에 의존한다는 실행 테스트 근거가 약하다. 필요한 container contract인지 단순 grouping인지 더 좁은 visual/DOM test 없이 확정하지 않는다. |
| final palette/layout/title scale | 미정 | 현재 색, 폭, 여백, title scale은 기능 affordance보다 제품 디자인 선택에 가깝다. Existing style을 유지하되 final brand/layout contract로 닫지는 않는다. |
| toolbar disabled styling | 미정 | read-only mutation safety는 테스트로 닫혔지만 disabled visual affordance는 아직 없다. 새 state styling을 추가하면 UI 개념이 늘어나므로 제품 UX 결정 전에는 확정하지 않는다. |
| debug recorder production availability | 미정 | idle output은 숨겼지만 hotkey recorder 자체의 production availability, privacy, retention policy는 운영 결정이다. |
| browser/accessibility visual matrix | 미정 | role/aria-hidden/source tests는 있지만 cross-browser pixel parity, assistive-tech focus/selection announcement는 확인하지 않았다. |

## 아직 애매하거나 최종 스타일로 확정하지 않을 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| `.document-stage` positioning role | current source wrapper로는 존재하지만 fixed overlay가 relative container에 의존한다는 강한 검증은 없다. | overlay coordinate system을 바꾸거나 framed/embedded editor를 만들 때 container contract를 다시 판단한다. |
| app shell palette | body/editor/button/debug recorder 색은 현재 beige/off-white 계열과 link blue/green/red status color를 쓴다. 기능 contract는 아니고 브랜드/제품 스타일 결정도 없다. | 제품 visual direction이 생기면 existing tokens를 재사용하되, 한 hue 계열로 과하게 닫히지 않는지 브라우저 QA로 확인한다. |
| pane width와 vertical spacing | 1280x900 desktop과 390x844 mobile smoke에서는 overflow, toolbar wrapping, title/editor containment 문제가 없었다. 하지만 `.editor-pane`의 `860px`, `8vh`, mobile `42px 22px`를 모든 embedding/viewport의 product layout contract로 닫은 것은 아니다. | 더 넓은 viewport/browser matrix와 embedded editor context가 필요하면 별도 QA로 둔다. |
| title scale | `.title-input`의 큰 responsive scale은 현재 문서 제목 affordance다. compact editor나 embedded editor에서도 맞는지는 모른다. | embedding surface가 생기면 title typography density를 별도 결정한다. |
| toolbar state styling | read-only에서 toolbar command는 no-op이지만 disabled visual affordance는 없다. | `docs/editor-read-only-policy-audit.md`의 read-only UX 결정과 같이 닫는다. |
| debug recorder production availability | idle badge 상시 노출은 제거했지만 hotkey recorder 자체는 production route에서도 동작한다. | dev-only gate/query flag/keyboard-only hidden diagnostic surface 중 하나를 운영 정책으로 정한다. |
| accessibility visual QA | role/aria와 overlay `aria-hidden`은 있지만, focus/selection announcement를 보조 기술별로 확인하지 않았다. | assistive-tech QA matrix를 별도 gate로 둔다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| selection/caret/focus affordance CSS | 유지 확정 | native caret을 숨긴 editor에서 대체 affordance를 제거하면 selection state가 보이지 않는다. |
| block/inline semantic class surface | 유지 확정 | geometry, tests, atom selection, markdown/link rendering이 class/data-path surface를 사용한다. |
| extra decorative outlines | 제거 확정 | figure 전용 dashed outline처럼 기능을 늘리지 않는 선은 이미 제거했고, 다시 추가할 근거가 없다. |
| CSS duplicate property / `!important` escape hatch | 제거 확정 | Biome CSS gate가 잡은 duplicate `min-height`와 `!important`는 현재 기능 contract 없이 cascade/format surface를 흐린다. |
| final product palette/layout 확정 선언 | 보류 | 현재 색/폭/여백은 기능 검증 범위가 아니라 제품 디자인 결정이다. |
| toolbar disabled styling 추가 | 보류 | read-only mutation safety는 확정이지만 UX affordance는 아직 제품 결정이다. 새 style을 추가하면 개념 수가 늘어난다. |

## 현재 결론

editor style surface에서 빼면 안 되는 것은 selection/caret/focus affordance, block/inline
semantic class, empty text measurable target, toolbar accessible icon command, debug
recorder active phase indicator, CSS format/lint gate다. Desktop/mobile production
preview smoke에서는 현재 pane 폭/여백이 overflow 없이 동작한다. 빼거나 확정했다고
말하면 안 되는 것은 최종 palette/layout, title scale, read-only toolbar disabled
styling, debug recorder production availability policy, 전체 viewport/browser matrix,
assistive-tech visual QA다.
