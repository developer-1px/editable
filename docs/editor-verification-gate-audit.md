# Editor Verification Gate Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `verify:internal`과 `verify:boundaries`가
빼면 안 되는 확정 gate인지, 그리고 무엇을 보장하지 않는지 구분한다.

## 판정

`pnpm run verify:internal -- --repeat=1`은 현재 editor 변경의 기본 확정 gate다.
이 gate는 제품 전체 완료를 증명하지 않는다. 대신 현재 코드가 지키기로 한 내부
architecture, docs inventory, generated route tree, type, unit/integration
behavior, deterministic order, formatting, build, whitespace 기준선을 한 번에
확인하는 interface다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| package scripts | `verify:docs`, `verify:boundaries`, `verify:internal`, `verify:internal:stress`, `verify:internal:soak`, `verify:browser`가 package script로 고정되어 있다. | `package.json` |
| default repeat | `verify-internal.mjs`를 직접 실행하면 기본 `--repeat=3`이다. README와 리포트의 빠른 기준선은 명시적으로 `--repeat=1`을 쓴다. Default, explicit positive value, invalid value rejection은 script test로 고정한다. | `scripts/verify-internal.mjs`, `scripts/verify-internal-repeat.test.mjs`, README |
| internal command order | focused/skipped/todo test marker scan, Vitest discovery parity check, docs inventory/evidence verifier, boundary verifier, `tsc --noEmit`, normal Vitest, seeded shuffled Vitest, Biome check, Vite build with route tree stability check, `git diff --check` 순서로 실행한다. | `scripts/verify-internal.mjs` |
| test marker scan | repo 안 test/spec 파일의 실제 Vitest call AST에서 `describe`/`suite`/`it`/`test`의 `only`, `skip`, `todo`, `skipIf`, `runIf`, `fails` marker를 찾으면 실패한다. Nearest lexical binding 기준으로 global/direct name, Vitest named-import alias, Vitest namespace import, 사용 지점 전에 초기화된 simple local Vitest alias, marker function alias를 잡고, non-Vitest lexical shadow와 아직 초기화되지 않은 later lexical declaration은 Vitest alias로 단정하지 않는다. Generated/dependency directory와 문자열 안 marker 문구도 제외한다. Repo-level test discovery와 representative marker reporting은 script test로 고정한다. | `scripts/verify-internal-test-markers.mjs`, `scripts/verify-internal-test-discovery.mjs`, `scripts/verify-internal-test-marker-ast.mjs`, `scripts/verify-internal-test-markers.test.mjs` |
| README docs inventory and editor evidence coverage | `docs/*.md` top-level 파일이 README `## Docs` 섹션에서 빠지거나 README가 존재하지 않는 docs file을 참조하면 실패한다. `docs/editor-*.md`에 `## 증거 강도` 섹션이 없어도 실패한다. Missing `## Docs` section, missing docs entry, stale README entry, duplicate README entry, missing editor evidence section reporting은 script test로 고정한다. | `scripts/verify-docs-inventory.mjs`, `scripts/verify-docs-inventory.test.mjs` |
| generated route tree | `pnpm build` 전후에 `src/routeTree.gen.ts`가 달라지면 실패한다. Stale하면 script가 원래 file content를 복원하고 실패하므로 check 자체는 비파괴적이다. Unchanged build pass와 changed build restore/fail은 script test로 고정한다. | `scripts/verify-internal-route-tree.mjs`, `scripts/verify-internal-route-tree.test.mjs` |
| Biome scope | `pnpm check`는 `biome.json`의 include에 걸린 source/config/scripts/CSS surface를 검사한다. `docs/*.md`, `README.md`, generated `src/routeTree.gen.ts`는 현재 Biome 대상이 아니다. | `biome.json`, `pnpm check` |
| docs markdown non-coverage | `pnpm exec biome check README.md docs/repo-analysis-report.md docs/editor-verification-gate-audit.md`를 직접 실행해도 현재 `biome.json` includes 때문에 0 files로 끝나고 exit 1을 반환한다. `--no-errors-on-unmatched`를 붙이면 exit 0이지만 여전히 Checked 0 files라 coverage가 아니다. | Biome CLI output |
| deterministic shuffle | shuffled Vitest는 seed `20260621`을 쓴다. | `scripts/verify-internal.mjs` |
| repeat variants | stress는 repeat 10, soak는 repeat 30으로 같은 command list를 반복한다. | `package.json` |
| boundary gate | non-editor source가 `src/editor/internal/*` 또는 legacy `src/editor/components`, `model`, `fixtures`, `testing`을 static import, type-only import, export-from, dynamic `import()`, block-commented dynamic `import()`, current Vite `import.meta.glob()` lazy/eager string/array specifier, `require()` call, TypeScript import-equals require, TypeScript import-type expression으로 가져오면 실패한다. Internal `model/view/debug/react/testing/fixtures` segment import 방향, runtime test-only import, testing helper implementation import, fixture non-testing import도 검증하고, 대표 위반 reporting과 test-file allowance는 script test로 고정한다. | `scripts/verify-editor-boundaries.mjs`, `scripts/verify-editor-external-import-boundary.test.mjs`, `scripts/verify-editor-internal-segment-boundary.test.mjs` |
| public facade guard | `src/editor/public`이 React facade를 섞거나 확정 public allowlist 밖 internal helper/export를 direct/aliased/namespace re-export하거나 확정 public binding을 다른 이름으로 alias export하거나 internal implementation을 `export *`/`export * as`로 올리면 실패한다. | `scripts/verify-editor-boundaries.mjs`, `scripts/verify-editor-public-facade-boundary.test.mjs` |
| React facade guard | `src/editor/react`가 headless public facade를 섞거나 headless API, non-react internal helper, `BlockEditor`/`BlockEditorProps` 밖 React helper를 재노출하거나 확정 React binding을 다른 이름으로 alias export하거나 internal React implementation을 `export *`/`export * as`로 올리면 실패한다. Public facade import, non-react internal alias re-export, arbitrary React helper export, React binding alias, React star/star-as reporting은 script test로 고정한다. | `scripts/verify-editor-boundaries.mjs`, `scripts/verify-editor-react-facade-boundary.test.mjs` |
| browser input gate | `verify:browser`는 Playwright로 Chromium/Firefox/WebKit 최소 P0 input smoke를 실행한다. `verify:internal` command chain에는 들어가지 않는 별도 browser gate다. | `package.json`, `playwright.config.ts`, `tests/browser/editor-input-contract.spec.ts`, `docs/editor-browser-input-gate.md` |

이 범위는 삭제하면 현재 리포트의 검증 기준선과 public/internal architecture 판정이
약해진다.

## 현재 실행 기준선

현재 dirty workspace에서 관측한 `--repeat=1` 기준선은 아래와 같다.

| 항목 | 현재 결과 | 판정 |
| --- | --- | --- |
| focused/skipped/todo marker scan | 112 test files, violation 없음 | focused/skip/todo/conditional/expected-failure marker가 현재 테스트 기준선을 약하게 만들지 않는다. |
| Vitest discovery parity | `vitest list --filesOnly --json` 112 files, marker scan 112 files, 차이 없음 | 현재 Vitest가 발견하는 test file 집합과 marker scan 대상이 일치한다. |
| `verify:docs` | README Docs covers 90 docs files; evidence strength covers 88 editor docs | docs file/link inventory와 editor evidence-section coverage는 현재 통과한다. |
| `verify:boundaries` | violation output 없음 | public/internal seam과 import direction은 현재 통과한다. |
| normal Vitest | 112 files, 894 tests passed | jsdom unit/integration baseline은 현재 통과한다. |
| seeded shuffled Vitest | seed `20260621`, 112 files, 894 tests passed | deterministic order baseline은 현재 통과한다. |
| Biome check | Checked 301 files | source/config/scripts/CSS formatting/lint/import organization baseline은 현재 통과한다. |
| Vite build | client and SSR build success | production build baseline은 현재 통과한다. |
| route tree stability | `src/routeTree.gen.ts` unchanged after build | generated route tree freshness는 현재 통과한다. |
| `git diff --check` | whitespace error 없음 | diff whitespace baseline은 현재 통과한다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| package verification script surface | 확정 | `package.json`이 `verify:docs`, `verify:boundaries`, `verify:internal`, `verify:internal:stress`, `verify:internal:soak`를 script로 노출하고 README가 internal gate 사용 경로를 설명한다. | 어떤 상황에서 stress/soak가 필수인지는 아직 운영 정책이 아니다. |
| `verify:internal` command chain | 확정 | `scripts/verify-internal.mjs`가 test marker scan과 Vitest discovery parity check를 먼저 실행하고, `commands` 배열이 docs inventory, boundary, typecheck, normal Vitest, seeded shuffle, Biome, build, diff-check 순서를 고정한다. | Browser/server smoke, dependency/security audit, license audit은 이 chain에 없다. |
| repeat parsing | 확정 | `scripts/verify-internal-repeat.test.mjs`가 default repeat 3, explicit positive repeat, invalid repeat rejection을 검증한다. | 리포트 빠른 기준선은 명시적 `--repeat=1`이고, 위험도별 repeat 의무화는 미정이다. |
| route tree stability wrapper | 확정 | `runBuildWithRouteTreeCheck`와 script tests가 build 전후 `src/routeTree.gen.ts` 비교, 변경 시 restore/fail behavior를 고정한다. | TanStack route generator 단독 output이나 staged PR rename presentation은 보장하지 않는다. |
| focused/skipped/todo test marker guard | 확정 | `verify-internal-test-discovery.mjs`가 repo-level test/spec 파일을 찾고, `verify-internal-test-marker-ast.mjs`가 `describe`/`suite`/`it`/`test` property/element access chain의 `only`, `skip`, `todo`, `skipIf`, `runIf`, `fails`를 forbidden marker로 보고한다. Nearest lexical binding 기준으로 global/direct name, Vitest named-import alias, Vitest namespace import, 사용 지점 전에 초기화된 simple local Vitest alias를 해석하고, `const focused = test.only` 같은 marker function alias는 선언 위치에서 보고한다. Non-Vitest `test` 같은 lexical shadow와 아직 초기화되지 않은 later lexical declaration은 Vitest alias로 단정하지 않는다. Script test가 root-level test discovery, generated/dependency directory 제외, ordinary tests, marker string literal 무시, focused/skipped/todo/conditional/fails/`test.each`/`test["only"]`, `suite`, named alias, namespace import, local alias chain, marker function alias reporting, type-only alias, non-Vitest wrapper/top-level and nested lexical shadow 무시, nested Vitest alias reporting, out-of-scope alias non-leak, later lexical declaration non-aliasing을 고정한다. | Custom wrapper test DSL, destructured marker alias, runtime-computed non-literal property access까지 Vitest semantics로 해석하는 scanner는 아니다. |
| Vitest discovery parity gate | 확정 | `verify:internal`이 `pnpm exec vitest list --filesOnly --json`의 file set과 `verifyNoFocusedOrSkippedTests()`의 file set을 비교한다. 현재 둘 다 112개 file이고 missing/extra가 없다. Mismatch, invalid Vitest JSON, Vitest list failure는 `scripts/verify-internal-test-discovery.mjs`에서 실패하며, parse/compare/mismatch behavior는 script test로 고정한다. | 이 gate는 현재 `package.json`의 `vitest run`/default discovery policy에 맞춘다. Future custom CLI filters나 unusual Vitest JSON contract 변경은 scanner와 discovery policy를 같이 갱신해야 한다. |
| README docs inventory and editor evidence coverage | 확정 | `verify-docs-inventory.mjs`와 tests가 top-level `docs/*.md`, README `## Docs` bullet links, missing/stale/duplicate/missing-section reporting, `docs/editor-*.md`의 missing `## 증거 강도` reporting을 고정한다. | Nested docs, README 설명 문구의 의미 최신성, topic audit 본문 내용의 semantic freshness, markdown formatting은 보장하지 않는다. |
| boundary import scanner forms | 확정 | `verify-editor-boundaries.mjs`의 TypeScript AST scanner와 `verify-editor-external-import-boundary.test.mjs`가 static/type-only/export-from/type import expression/dynamic import/commented dynamic import/require/import-equals/Vite glob hidden implementation imports를 잡는다. | Runtime-computed specifier나 bundler plugin side effect까지 분석하는 security scanner는 아니다. |
| public facade guard | 확정 | Boundary script tests가 markdown/internal helper direct export, import-then-export, canonical public binding alias, namespace/star export leak, forbidden public helper exposure를 고정한다. | Public facade의 제품 ergonomics나 future Markdown/migration API 설계는 결정하지 않는다. |
| React facade guard | 확정 | Boundary script tests가 headless public mixing, non-react internal leak, arbitrary React helper export, canonical React binding alias, star/star-as leak을 고정한다. | React component visual/API roadmap이나 toolbar customization contract는 보장하지 않는다. |
| internal segment and test-only rules | 확정 | Boundary script tests가 model/view/debug direction, runtime testing/fixture import violation, test-file allowance, testing helper implementation import, fixture non-testing import reporting을 고정한다. | Layering의 모든 semantic coupling이나 bundle-size impact를 측정하지 않는다. |
| type/test/build/check baseline | 확정 | Current `verify:internal -- --repeat=1` output이 test marker scan 112 files/no violations, Vitest discovery parity 112 files/no diff, typecheck, normal/shuffled Vitest 112 files/894 tests, Biome 301 files, client/SSR build, diff-check 통과를 확인한다. | Passing tests는 browser/AT matrix, release QA, dependency/security status를 대체하지 않는다. |
| docs markdown non-coverage | 확정 현재 상태 | `verify:docs`는 file/link inventory와 editor evidence-section presence만 보고, `pnpm check`는 `biome.json` include에 걸린 source/config/scripts/CSS surface만 본다. README/docs를 직접 Biome에 넘겨도 current config에서는 0 files로 처리된다. | 문서 formatting/lint를 gate로 추가할지 여부는 별도 정책이다. |
| docs markdown formatting policy | 미정 | 현재 확정 검사는 `git diff --check`의 whitespace error 확인뿐이다. | Docs formatting/lint가 필요하면 별도 command나 Biome include 정책을 설계해야 한다. |
| runtime/browser/release gate | 부분확정 | `verify:browser`가 Chromium/Firefox/WebKit 최소 P0 input smoke를 별도 command로 실행한다. | `verify:internal`에는 포함하지 않는다. IME/AT/release 필수 여부는 아직 별도 정책이다. |

## 아직 애매하거나 보장하지 않는 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| browser/AT matrix | `verify:browser`는 최소 P0 input smoke를 Chromium/Firefox/WebKit에서 실행한다. 다만 OS IME matrix와 보조 기술 announcement는 실행하지 않는다. | IME/AT QA가 필요한 항목은 recorded trace, 수동 캡처, 별도 접근성 gate로 설계해야 한다. |
| git rename presentation | `git diff --check`는 whitespace만 본다. rename similarity나 PR diff 표현은 보장하지 않는다. 현재 새 editor tree가 untracked인 동안 plain `git diff --summary --find-renames -- src/editor`는 삭제만 보므로 rename 근거가 아니다. | old delete와 new add를 같이 stage한 뒤 `git diff --cached --summary --find-renames`를 별도로 봐야 한다. |
| markdown docs formatting | README Docs inventory와 editor evidence-section presence는 `verify:docs`가 보장하지만, `pnpm check`는 현재 docs markdown을 검사하지 않는다. README/docs를 직접 Biome에 넘겨도 현재 includes 아래서는 Checked 0 files라 coverage가 아니다. `verify:internal`에서 문서 formatting에 적용되는 확정 검사는 `git diff --check`의 whitespace error 확인이다. | docs formatting/lint를 gate로 만들지 결정해야 한다. |
| dependency/security audit | package install integrity나 dependency vulnerability audit을 포함하지 않는다. 현재 `pnpm audit`, license inventory, `pnpm.onlyBuiltDependencies` allowlist evidence는 package audit의 별도 증거다. | release gate가 필요하면 별도 dependency/security command를 추가한다. |
| runtime server/browser smoke | Vite build는 한다. One-off로 `pnpm preview --host localhost --port 4173 --strictPort`와 `curl /` HTTP 200 SSR shell smoke를 확인했고, Chrome headless에서 hydration, pointer click, text insertion, focus/caret affordance, screenshot, runtime/log error 0건도 확인했다. 하지만 `verify:internal`에는 preview server smoke나 browser screenshot이 포함되지 않는다. | UI release 전 server/browser smoke를 gate로 넣을지 결정해야 한다. |
| future Vitest discovery config drift | marker scanner와 Vitest discovery가 달라지면 이제 `verify:internal`이 실패한다. 다만 custom CLI filters, workspace projects, unusual suffix, Vitest JSON contract 변경은 어떤 discovery policy가 의도인지 별도 판단이 필요하다. | test discovery policy를 바꾸는 변경은 marker scanner와 verification audit을 함께 갱신해야 한다. |
| repeat count policy | 빠른 리포트 기준은 `--repeat=1`이고 script default는 3이다. stress/soak도 있지만 언제 필수인지 정책은 닫지 않았다. | PR size/risk별 repeat policy를 정할 수 있다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `verify:internal` | 유지 확정 | 현재 repo analysis의 실행 근거를 한 command로 묶는 interface다. 삭제하면 각 문서의 "전체 gate 통과" 근거가 흩어진다. |
| `verify:docs` | 유지 확정 | repo analysis가 늘어나는 동안 README Docs inventory가 stale해지거나 editor topic audit이 `## 증거 강도` 없이 추가되는 것을 낮은 비용으로 막는다. Script test가 대표 stale inventory와 missing evidence reporting을 고정한다. Markdown lint까지 강제하지 않는다. |
| `verify:boundaries` | 유지 확정 | public/internal seam, legacy import 차단, external static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type hidden import 차단, public facade direct/aliased/arbitrary-helper/canonical-name/namespace/star/star-as leak 차단, React facade headless/non-react/arbitrary-helper/canonical-name/star/star-as leak 차단, runtime test-only import 차단, testing helper implementation import 차단, fixture non-testing import 차단, internal segment import 방향을 검증한다. Script test가 대표 위반 reporting과 test-file allowance를 고정하므로 일반 tests만으로는 막기 어려운 facade 누수나 model/view/react 역방향 의존을 더 좁게 보호한다. |
| test marker scan | 유지 확정 | `.only`, `.skip`, `.todo`, conditional skip/run, expected-failure marker는 green test result의 의미를 직접 약하게 만든다. 기존 `verify:internal` interface 안에 넣었기 때문에 package script surface는 늘리지 않으면서 test baseline의 신뢰도를 높인다. |
| normal Vitest와 seeded shuffle 둘 다 실행 | 유지 확정 | normal run과 deterministic shuffled order가 서로 다른 failure mode를 잡는다. |
| `git diff --check` | 유지 확정 | dirty worktree에서 whitespace error를 빠르게 막는 낮은 비용의 gate다. |
| standalone `generate-routes` / `verify:routes` using `tsr generate` | 제거 확정 | Router CLI 단독 generation은 TanStack Start build가 붙이는 routeTree register tail과 다르다. 잘못된 generator output을 script나 gate로 만들면 false failure가 난다. |
| browser gate를 `verify:internal`에 합치기 | 보류 | `verify:browser`는 유지하되 internal fast gate와 실행 비용/환경 요구가 다르다. 제품 QA matrix는 별도 gate가 맞다. |

## 현재 결론

verification gate는 빼면 안 되는 내부 품질 surface다. 확정 범위는 focused/skipped/todo
test marker 차단, README docs inventory와 그 대표 stale reporting, editor evidence-section coverage, generated route tree freshness와 restore/fail,
boundary/import-direction, static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type hidden import blocking, public/react
facade leak blocking, runtime test-only import blocking, testing/fixture direction
blocking, typecheck, normal/shuffled tests, Biome check, build, whitespace check다.
하지만 Biome check는
source/config/scripts/CSS surface 기준이고, README/docs를 직접 넘겨도 현재 설정에서는
0 files로 처리되므로 docs markdown formatting은 포함하지 않는다.
`verify:browser`는 Chromium/Firefox/WebKit 최소 P0 input smoke를 별도 gate로
추가했지만 internal gate에 포함된 것은 아니다. OS IME matrix, AT QA, staged git
rename presentation, docs markdown formatting/lint, dependency/security audit,
release 필수 정책은 아직 별도 제품/운영 결정으로 남긴다.
