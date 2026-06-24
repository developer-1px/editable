# Editor P0 Input Conformance Matrix

작성일: 2026-06-22

범위: 에디터 입력 기본기를 기억이나 개별 regression 이름이 아니라 stable scenario
matrix로 고정한다.

## 판정

P0 입력 검증의 source of truth는
`src/editor/internal/testing/p0InputConformanceMatrix.ts`다. 각 행은 사용자 동작,
시작 document/selection, 기대 document/selection, event authority, headless/browser/replay
coverage를 가진다.

`pnpm run verify:p0-input`은 matrix headless runner, recorded trace contract mapping,
Playwright browser input gate를 이어서 실행한다.

## Matrix 최소 범위

| 영역 | 대표 scenario id | authority | 자동 검증 |
| --- | --- | --- | --- |
| collapsed movement | `SEL-COLLAPSED-ARROW-RIGHT` | model | headless, browser |
| range arrow collapse | `SEL-RANGE-ARROWRIGHT-COLLAPSE`, `SEL-RANGE-ARROWLEFT-COLLAPSE` | model | headless, browser |
| Shift+Arrow extension | `SEL-SHIFT-ARROWRIGHT-EXTEND` | model | headless, browser |
| inline atom boundary | `ATOM-SHIFT-ARROWRIGHT-SELECT` | model | headless, browser, replay |
| figure boundary | `FIGURE-ARROWRIGHT-AFTER` | model | headless, browser |
| selection replacement typing | `MUT-RANGE-REPLACEMENT-TYPING` | model | headless, browser, replay |
| browser event order evidence | `BROWSER-PRINTABLE-EVENT-ORDER` | browser | browser |
| Enter split | `ENTER-COLLAPSED-SPLIT` | model | headless, browser |
| range Backspace/Delete | `DEL-RANGE-BACKSPACE`, `DEL-RANGE-FORWARD` | model | headless, browser, replay |
| empty/whitespace block Backspace | `DEL-EMPTY-BLOCK-BACKSPACE`, `DEL-WHITESPACE-BLOCK-BACKSPACE` | model | headless, replay |
| plain clipboard | `CLIP-PLAIN-PASTE` | model | headless, browser, replay |
| platform primary modifier | `MOD-MAC-PRIMARY-A-SELECT-ALL`, `MOD-OTHER-PRIMARY-A-SELECT-ALL` | model | headless |
| macOS Ctrl navigation | `MOD-MAC-CTRL-F-NAVIGATION` | model | headless |
| AltGraph printable keydown | `MOD-ALTGRAPH-PRINTABLE-KEYDOWN-PASSTHROUGH` | browser/model split | headless, browser |
| IME composition Enter | `IME-COMPOSITION-COMMIT-ENTER` | recorded-trace | replay |

## Runner 역할

| runner | 책임 | 제외 |
| --- | --- | --- |
| headless matrix runner | DOM 없이 `translateEditorInput` transition, patch, canonical selection을 검증한다. | native browser event ordering, real IME |
| trace replay | recorded event fixture를 React/jsdom surface에 replay하고 final document/selection과 invariant를 검증한다. | OS IME 자동화 |
| browser runner | Chromium/Firefox/WebKit에서 native Selection/Range, keyboard, paste/drop, compact event trace를 검증한다. | real OS IME matrix |

Browser runner의 compact trace는 event type, key, inputType, data, isComposing,
`getTargetRanges()` 지원/개수, DOM focus path/offset, scenario id만 남긴다. 녹화 로그처럼
긴 raw dump를 기본 출력으로 만들지 않는다.

## 검증 명령

```bash
pnpm run verify:p0-input
```

빠른 headless 확인만 필요하면 아래를 실행한다.

```bash
pnpm exec vitest run src/editor/internal/model/p0InputConformanceMatrix.test.ts
```

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| matrix source | 확정 | `p0InputConformanceMatrix.test.ts`가 scenario id 순서와 required area coverage를 고정한다. | 새로운 P0 정책을 추가하려면 matrix와 docs를 같이 갱신해야 한다. |
| headless transition | 실행 테스트로 확정 | matrix의 모든 headless scenario가 DOM 없이 `translateEditorInput` 결과를 적용하고 document/selection을 비교한다. | 실제 browser event order는 보장하지 않는다. |
| replay fixture mapping | 실행 테스트로 확정 | matrix가 참조한 replay trace 이름이 실제 fixture에 존재하는지 검증한다. | fixture가 real OS/browser 전체 matrix를 대표한다고 보지는 않는다. |
| browser event evidence | 부분 확정 | Playwright gate가 printable input event order와 composition trace harness, native Selection/Range smoke를 검증한다. | IME composition 자체는 Playwright로 deterministic하게 자동화하지 않는다. |
| local/CI command | 확정 | `package.json`의 `verify:p0-input`이 headless matrix, oracle mapping, browser gate를 연결한다. | 실행 비용 때문에 `verify:internal`에는 포함하지 않는다. |

## 현재 결론

P0 입력 변경은 개별 테스트 이름을 기억해서 맞추는 것이 아니라 matrix 행을 추가하거나
수정하는 방식으로 진행한다. DOM 없이 정답이 있는 transition은 headless runner에서
닫고, browser authority가 필요한 event order와 native Selection/Range는 Playwright gate에서
증거를 남긴다. IME는 recorded trace replay와 수동 캡처를 P0 matrix에 연결하되,
Playwright 자동화가 real OS IME를 대신한다고 선언하지 않는다.
