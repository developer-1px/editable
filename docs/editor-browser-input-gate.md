# Editor Browser Input Gate

작성일: 2026-06-22

범위: P0 입력 계약 중 jsdom/headless matrix와 trace replay만으로 닫으면 안 되는 실제
browser DOM selection, keyboard navigation, paste/drop transfer smoke와 compact event
evidence를 별도 gate로 분리한다.

## 판정

`pnpm run verify:browser`는 `verify:internal`의 fast local gate가 아니다. 실제
Chromium, Firefox, WebKit에서 Vite dev server를 띄우고 최소 P0 입력 계약 smoke와
`p0InputConformanceMatrix` browser scenario evidence를 실행하는 browser gate다.

IME 자동화는 이 gate에 넣지 않는다. OS IME 조합은 Playwright가 deterministic하게
만들 수 없으므로 `src/editor/internal/fixtures/ime/*` recorded trace와 수동 캡처
절차로 분리한다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| package script | `verify:browser`는 `playwright test`만 실행한다. `verify:internal` command chain에는 들어가지 않는다. | `package.json`, `scripts/verify-internal.mjs` |
| browser matrix | 같은 smoke가 Chromium, Firefox, WebKit 프로젝트로 실행된다. | `playwright.config.ts` |
| server lifecycle | Playwright web server가 `pnpm exec vite dev --host 127.0.0.1 --port 4173`을 실행하고 `baseURL`은 `http://127.0.0.1:4173`이다. | `playwright.config.ts` |
| trace artifacts | 실패 시 Playwright trace와 screenshot을 `test-results/browser` 아래에 남긴다. | `playwright.config.ts` |
| DOM selection smoke | test가 browser `Selection`/`Range` API로 `data-path` text node range를 만들고 `selectionchange`를 dispatch한 뒤 canonical `data-selection-*`와 native selection snapshot을 함께 검증한다. | `tests/browser/editor-input-contract.spec.ts` |
| keyboard navigation smoke | collapsed Arrow, range Arrow collapse, Shift+Arrow extension을 실제 browser keyboard event로 실행한다. | `tests/browser/editor-input-contract.spec.ts` |
| paste/drop smoke | `DataTransfer`를 browser 안에서 만들고 paste/drop event를 dispatch해 text paste와 markdown mention drop을 검증한다. | `tests/browser/editor-input-contract.spec.ts` |
| compact browser trace | printable input에서 `keydown`/`beforeinput`/`input` evidence, `getTargetRanges()` 지원 여부/개수, DOM focus path/offset, scenario id를 수집한다. | `tests/browser/editor-input-contract.spec.ts`, `docs/editor-p0-input-conformance-matrix.md` |
| IME 분리 | Korean composition, stale composition, active mark, blur, history, Enter confirmation은 recorded trace replay가 담당하고 browser/OS matrix는 수동 캡처 대상으로 남긴다. | `docs/editor-ime-trace-replay-audit.md`, `src/editor/internal/fixtures/ime/*` |

## 수동 IME 캡처 절차

1. `pnpm dev`로 앱을 열고 editor body에 focus한다.
2. Chrome/Safari/Firefox 중 대상 브라우저와 OS IME를 기록한다.
3. `Cmd+Shift+\`로 debug recording을 시작한다.
4. 재현할 IME 입력을 수행한다.
5. 다시 `Cmd+Shift+\`로 recording을 종료하고 console report를 저장한다.
6. event order, `beforeinput` cancelability, final document, selection을 확인한 뒤
   deterministic fixture가 필요하면 `editable-trace-replay@1` fixture로 축약한다.

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| `verify:browser` role | 확정 | package script와 Playwright config가 browser gate를 별도 command로 노출하고, `verify:internal`에는 추가하지 않는다. |
| browser project matrix | 확정 | config가 Chromium, Firefox, WebKit projects를 명시한다. |
| keyboard/selection smoke | 실행 테스트로 닫힘 | browser test가 native `Selection`/`Range`, keyboard event, canonical `data-selection-*`, overlay count를 같이 확인한다. |
| paste/drop smoke | 실행 테스트로 닫힘 | browser test가 browser `DataTransfer` 기반 paste/drop event를 실행하고 document render result를 확인한다. |
| compact event evidence | 실행 테스트로 닫힘 | browser test가 printable input event order, `getTargetRanges()` support/count, DOM focus point, scenario id를 남긴다. |
| browser trace artifact | 부분근거 | failure trace/screenshot은 browser별 차이 조사 evidence를 남긴다. Passing run이 OS/browser IME matrix를 증명하지는 않는다. |
| IME automation | 미정/분리 | Playwright smoke에 IME 자동화를 넣지 않는다. IME는 recorded trace와 수동 캡처 절차로만 닫는다. |
| release 필수 여부 | 미정 | `verify:browser`는 추가 gate지만 모든 로컬 변경에서 필수인지는 아직 CI/release policy로 닫지 않았다. |
