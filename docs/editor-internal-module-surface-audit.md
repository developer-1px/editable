# Editor Internal Module Surface Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `src/editor/internal` 아래의 segment들이 실제
module interface로 의미가 있는지, 그리고 어떤 import 방향을 빼면 안 되는 확정
구조로 볼 수 있는지 구분한다.

## 판정

현재 internal tree는 `model`, `view`, `react`, `debug`, `fixtures`, `testing`
6개 segment로 나뉜다. 파일 수는 `model` 33개, `view` 14개, `react` 11개,
`debug` 8개, `fixtures` 2개, `testing` 1개다.

확정 구조는 `model`이 canonical document/selection/command/serialization
implementation이고, `view`는 DOM/contenteditable/geometry adapter, `react`는
React runtime surface, `debug`는 내부 진단 surface, `fixtures`/`testing`은 test-only
surface라는 점이다.

이 구조는 이제 `scripts/verify-editor-boundaries.mjs`가 외부 static import뿐 아니라
type-only import, export-from, dynamic `import()`, block-commented dynamic `import()`, current Vite
`import.meta.glob()` lazy/eager form, `require()` call, TypeScript import-equals require, TypeScript import-type expression hidden implementation import와 internal segment import 방향까지 검증한다. `model`이 `view/react/debug`를 모르고, `view`와 `debug`는
`model`만 internal dependency로 삼는다. Runtime implementation files는
`testing`/`fixtures`를 import하지 못하지만, fixture data 자체는 replay type을 위해
`testing`만 type dependency로 참조할 수 있다.

## 현재 internal import matrix

현재 source scan 기준 허용된 segment edge는 아래뿐이다.

| Edge | 수 | 판정 |
| --- | ---: | --- |
| runtime `view -> model` | 22 | 확정 허용. DOM/view adapter가 canonical model type과 command helper를 사용한다. |
| runtime `react -> model` | 12 | 확정 허용. React runtime이 document state, commands, serialization을 조립한다. |
| runtime `react -> view` | 7 | 확정 허용. React runtime이 DOM/contenteditable/geometry adapter를 조립한다. |
| runtime `react -> debug` | 2 | 내부 진단 wiring으로 허용. 다만 production visibility/privacy는 제품 결정이다. |
| runtime `debug -> model` | 3 | 확정 허용. recorder snapshot/report가 model clipboard/document shape를 읽는다. |
| runtime `fixtures -> testing` | 2 | test fixture typing으로 허용. fixture가 `model/view/react/debug`를 알면 안 된다. |
| test `view -> model` | 6 | 확정 허용. view tests가 model fixture/state를 검증한다. |
| test `react -> model` | 7 | 확정 허용. React integration tests가 canonical model result를 검증한다. |
| test `react -> view` | 3 | 확정 허용. React integration tests가 view adapter edge cases를 고정한다. |
| test `react -> fixtures` | 2 | test-only 허용. Korean IME trace replay가 fixture를 소비한다. |
| test `react -> testing` | 1 | test-only 허용. Korean IME trace replay helper를 소비한다. |
| test `debug -> model` | 3 | 확정 허용. debug snapshot/report tests가 model serialization shape를 고정한다. |

현재 scan에서 `model -> view/react/debug/testing/fixtures`, `view -> react/debug`,
`debug -> view/react`, runtime implementation의 `testing`/`fixtures` import,
`testing -> model/view/react/debug`, `fixtures -> model/view/react/debug` edge는 없다.

## 확정 근거

| Segment | 확정 역할 | 근거 |
| --- | --- | --- |
| `model` | document schema, cursor/selection, commands, input translation, markdown/clipboard serialization, editor core를 담는 canonical model implementation이다. | `src/editor/internal/model/*`, model tests |
| `view` | contenteditable selection/session, DOM cursor geometry, keyboard policy, clipboard write adapter를 담는 DOM/view adapter다. | `src/editor/internal/view/*`, view tests |
| `react` | `BlockEditor`, renderer, overlays, toolbar, debug inspector를 조립하는 React runtime implementation이다. | `src/editor/internal/react/*`, React tests |
| `debug` | interaction recording, snapshot, timeline/report formatting을 담는 internal diagnostic implementation이다. | `src/editor/internal/debug/*`, debug tests |
| `fixtures` | IME replay fixture data다. runtime implementation이 아니라 tests가 소비한다. | `src/editor/internal/fixtures/ime/*`, `BlockEditor.imeTrace.test.tsx` |
| `testing` | deterministic React event replay helper다. public/react facade export가 아니며 fixture/test에서만 쓴다. | `src/editor/internal/testing/editorTraceReplay.ts`, `scripts/verify-editor-boundaries.test.mjs`, `verify:boundaries` |
| import direction gate | external source는 internal/legacy editor paths를 static import, type-only import, export-from, dynamic `import()`, block-commented dynamic `import()`, current Vite `import.meta.glob()` lazy/eager string/array specifier, `require()` call, TypeScript import-equals require, TypeScript import-type expression으로 가져올 수 없고, public/react facades는 서로 섞이지 않으며, public facade arbitrary helper/canonical-name/namespace/star/star-as leaks, React facade headless/non-react/arbitrary-helper/canonical-name/star/star-as leaks, runtime implementation의 test-only imports, internal segment direction도 검증된다. Script test는 `model -> view` 위반, static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type hidden import 위반, public facade arbitrary helper/canonical-name/namespace/star/star-as leak, React facade public/non-react/arbitrary-helper/canonical-name/star/star-as leak, runtime implementation `testing`/`fixtures` import 위반과 test-file 허용, `testing -> implementation` 위반, `fixtures -> non-testing` 위반이 실제 violation/allowance로 보고되는 경로를 고정한다. | `scripts/verify-editor-boundaries.mjs`, `scripts/verify-editor-boundaries.test.mjs`, `pnpm run verify:boundaries` |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| internal segment taxonomy | 확정 | 현재 source tree가 `model/view/react/debug/testing/fixtures` 6개 segment이고, 각 segment 역할은 source/tests/audit에서 반복 확인된다. 다만 이 이름은 current implementation taxonomy이지 public package taxonomy는 아니다. |
| `model` isolation | 확정 | `scripts/verify-editor-boundaries.mjs`가 `model -> view/react/debug/testing/fixtures` import를 violation으로 보고하고, script test가 `model -> view` 대표 위반을 고정한다. |
| `view`/`debug` dependency direction | 확정 | verifier가 `view`와 `debug`의 non-model internal import를 막는다. 현재 source scan도 `view -> model`, `debug -> model`만 보인다. |
| React runtime wiring role | 확정 | React implementation은 current runtime 조립점으로 `model/view/debug`를 소비한다. 동시에 `src/editor/react` facade는 `BlockEditor`/`BlockEditorProps`만 export하도록 runtime/type tests와 boundary verifier가 막는다. |
| test-only `testing`/`fixtures` surface | 확정 | runtime implementation의 `testing`/`fixtures` import는 차단되고, test file의 import는 허용된다. `testing -> implementation`과 `fixtures -> non-testing`도 script test가 violation으로 고정한다. |
| external hidden implementation blocking | 확정 | app/source 외부에서 hidden editor implementation을 static/type-only/export-from/dynamic/commented dynamic/Vite glob/require/import-equals/import-type으로 가져오는 경로를 AST scanner와 representative tests가 막는다. |
| public facade guard | 확정 | headless public facade는 `createEditor`, `parseNoteDocument`, source-level public type allowlist만 노출한다. arbitrary helper, Markdown/schema/demo/React helper, canonical-name alias, namespace/star leak은 tests/verifier가 막는다. |
| React facade guard | 확정 | React facade는 runtime `BlockEditor`와 type `BlockEditorProps`만 노출한다. headless public facade, non-react internal, arbitrary React helper, alias/star leak은 tests/verifier가 막는다. |
| current clean boundary run | 확정 | `pnpm run verify:boundaries`와 `verify:internal`이 현재 dirty workspace의 import/facade 상태를 통과 기준선으로 확인한다. |
| package taxonomy | 미정 | 현재 one-package source layout은 확인됐지만 package split, subpath exports, distribution naming 요구가 없다. |
| `debug` production policy | 미정 | `debug` segment는 internal implementation으로 확정했지만 production 노출/retention/privacy는 제품/운영 결정이다. |
| replay helper externalization | 미정 | `testing` replay helper는 regression fixture용 internal test surface다. browser trace capture/import 또는 public replay API는 아직 설계되지 않았다. |
| segment 내부 파일별 분할 정책 | 미정 | verifier는 segment 간 방향을 막을 뿐 segment 내부 파일의 SRP/OCP까지 강제하지 않는다. |

## 제거 확정 근거

| 제거/차단 항목 | 왜 제거 또는 차단하는가 | 검증 근거 |
| --- | --- | --- |
| external imports of `src/editor/internal/*` | app/route code가 hidden implementation을 static import, type-only import, export-from, dynamic `import()`, block-commented dynamic `import()`, current Vite `import.meta.glob()` lazy/eager form, `require()` call, TypeScript import-equals require, TypeScript import-type expression으로 알면 public/react facade seam이 무너진다. | `verify:boundaries` |
| legacy `src/editor/components`, `model`, `fixtures`, `testing` imports | refactor 후 source of truth는 `internal/public/react` tree다. legacy paths를 다시 쓰면 deletion/move가 불명확해진다. | `verify:boundaries` |
| `model -> view/react/debug/testing/fixtures` imports | model은 document command and state implementation이어야 한다. DOM/React/debug/test knowledge가 들어오면 canonical logic이 host-specific해진다. | `scripts/verify-editor-boundaries.test.mjs`, `verify:boundaries` |
| runtime implementation imports of `testing`/`fixtures` | replay helpers와 IME traces는 test-only surface다. React/view/model/debug runtime implementation에 들어가면 fixture가 product behavior처럼 보인다. Fixture data가 replay type을 위해 `testing`을 type import하는 예외는 허용하지만, fixture가 product implementation을 가져오는 것은 차단된다. Runtime violation과 test-file allowance는 script test로 고정한다. | `scripts/verify-editor-boundaries.test.mjs`, `verify:boundaries` |
| `testing -> implementation` imports | test helper가 model/view/react/debug implementation을 알면 helper가 regression replay surface가 아니라 구현 coupling point가 된다. | `scripts/verify-editor-boundaries.test.mjs`, `verify:boundaries` |
| `fixtures -> non-testing` imports | fixture data는 replay helper에만 의존할 수 있다. Model/react/debug를 가져오면 data fixture가 product implementation처럼 동작한다. | `scripts/verify-editor-boundaries.test.mjs`, `verify:boundaries` |

## 아직 애매하거나 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| internal segment naming | `model/view/react/debug/testing/fixtures`는 현재 import direction을 설명하지만 public package taxonomy는 아니다. | package publishing이나 multi-package split이 필요하면 이름을 다시 평가한다. |
| `debug` production visibility | debug implementation은 internal로 확정했지만 inspector가 production route에 보이는 정책은 별도 제품/운영 결정이다. | `docs/editor-debug-recorder-audit.md`의 exposure/privacy policy와 같이 닫는다. |
| `testing` helper stabilization | replay helper는 current regression fixture를 위한 internal test surface다. external trace schema나 public replay API가 아니다. | browser trace capture/import를 제품 QA flow로 만들 때 별도 interface를 설계한다. |
| stricter per-file ownership | 현재 gate는 segment 방향을 막는다. segment 안의 파일별 책임 분해까지 강제하지 않는다. | 파일별 SRP/OCP 문제가 보이면 별도 audit로 좁힌다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| internal segment direction verifier | 유지 확정 | 현재 architecture를 tests보다 좁은 import rule로 보호한다. 깨지면 facade와 model locality가 약해진다. |
| public/runtime exposure of test fixtures | 제거 확정 | test-only data가 product surface로 보이는 것을 막아야 한다. |
| `debug`를 public facade로 승격 | 보류 | current need는 internal diagnostics다. public API로 승격하면 privacy, retention, replay compatibility를 먼저 설계해야 한다. |
| package/multi-module split | 보류 | 현재 repo는 one package다. split은 distribution 요구가 생길 때 결정한다. |

## 현재 결론

internal module surface에서 빼면 안 되는 확정은 `model -> view -> react`로 올라가는
host-specific dependency direction, internal debug/test-only surface의 은닉, public/react
facade separation이다. 아직 확정하면 안 되는 것은 public package taxonomy, debug
production policy, replay helper externalization, segment 내부 파일별 추가 분할이다.
