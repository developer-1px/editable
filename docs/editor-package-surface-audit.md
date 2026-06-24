# Editor Package Surface Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `package.json`, lockfile, Vite/TS/Biome config,
package scripts가 현재 editor repo에 필요한 확정 tooling surface인지, starter 잔여물이나
아직 정책으로 닫히지 않은 항목인지 구분한다.

## 판정

package surface의 확정 역할은 네 가지다.

1. TanStack Start/Router/Vite로 현재 route app을 build/dev/preview한다.
2. React editor runtime과 editor model dependencies를 제공한다.
3. Vitest/jsdom/Testing Library/TypeScript/Biome로 internal gate를 실행한다.
4. `verify:docs`, `verify:boundaries`, `verify:internal`로 README docs inventory,
   generated route tree stability, public/internal seam, 전체 baseline을 묶고,
   `verify:browser`로 real-browser P0 input smoke를 별도로 실행한다.

반대로 source/config에서 쓰이지 않거나 현재 Start app output과 충돌하는 starter
direct dependency entries는 제거 확정이다. 이번 audit에서 아래 7개 direct
dependencies를 제거했다.

- `@tanstack/react-devtools`
- `@tanstack/react-router-devtools`
- `@tanstack/react-router-ssr-query`
- `@tanstack/devtools-vite`
- `@tailwindcss/typography`
- direct `@tanstack/router-plugin`
- direct `@tanstack/router-cli`

아래는 dependency 제거가 아니라 manifest/config surface 축소다.

- unused `#/*` and `@/*` path aliases
- direct `latest` ranges for `@tanstack/react-router` and
  `@tanstack/react-start`

`@tanstack/router-plugin`은 direct dependency에서는 제거했지만, `@tanstack/react-start`
경유 transitive dependency로 lockfile에 남는다. `@tanstack/router-cli`는 standalone
`tsr generate` output이 TanStack Start build output과 달라 현재 app의 safe manual
interface가 아니므로 direct devDependency와 `generate-routes` script에서 제거했다.

## 확정 유지 근거

| Surface | 확정 범위 | 근거 |
| --- | --- | --- |
| editor state/model | `@interactive-os/json-document`는 canonical document/selection/history state이고, `zod`는 internal document schema validation이다. | `src/editor/internal/model/*`, `src/editor/internal/react/block-editor/BlockEditor.tsx`, `docs/repo-analysis-report.md` |
| text geometry | `@chenglou/pretext`는 rich inline layout/geometry adapter에서 쓰인다. | `src/editor/internal/view/cursor-geometry/cursorGeometryLayout.ts` |
| React runtime | `react`, `react-dom`은 `BlockEditor`, rendering, `flushSync`, SSR/static rendering tests에 필요하다. | `src/editor/internal/react/*`, `src/routes/*` |
| route app | `@tanstack/react-router`, `@tanstack/react-start`, `vite`, `@vitejs/plugin-react`는 route/root/router와 Vite build/dev path에 필요하다. | `src/routes/*`, `src/router.tsx`, `src/routeTree.gen.ts`, `vite.config.ts` |
| styling build | `tailwindcss`와 `@tailwindcss/vite`는 global CSS import와 Vite plugin으로 쓰인다. | `src/styles.css`, `vite.config.ts` |
| toolbar icons | `lucide-react`는 toolbar icon buttons에 쓰인다. | `src/editor/internal/react/EditorToolbar.tsx` |
| route generation | 현재 Start app의 routeTree freshness는 `verify:internal`의 build wrapper가 확인한다. Build가 route tree를 바꾸면 원래 content를 복원하고 실패하는 동작은 script test로 고정한다. `generate-routes`/`tsr generate` standalone interface는 Start register tail을 빼므로 제거했다. | `package.json`, `src/routeTree.gen.ts`, `scripts/verify-internal-route-tree.mjs`, `scripts/verify-internal-route-tree.test.mjs` |
| test runtime | `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`은 jsdom React/editor tests에 필요하다. `@testing-library/dom`은 React Testing Library peer로 직접 유지한다. `@playwright/test`는 Chromium/Firefox/WebKit browser input smoke에 필요하다. | `src/editor/**/*.test.*`, `tests/browser/editor-input-contract.spec.ts`, `playwright.config.ts`, `pnpm why @testing-library/dom`, `pnpm why @playwright/test` |
| type/build tooling | `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@biomejs/biome`은 `tsc`, Vite/Vitest peer typing, React types, `pnpm check`에 필요하다. `pnpm check`는 source/config/scripts/CSS surface를 검사한다. | `tsconfig.json`, `package.json`, `vite.config.ts`, `scripts/verify-internal.mjs`, `biome.json` |
| verification scripts | `verify:docs`, `verify:boundaries`, `verify:internal`, stress/soak scripts는 current repo analysis의 internal quality gate다. `verify:browser`는 Playwright browser gate로 분리한다. Docs inventory, boundary 대표 violation reporting, internal repeat parsing, route tree restore/fail은 script tests로 고정한다. Boundary test는 static/type-only/export-from/dynamic/commented-dynamic/current-Vite-glob/require/import-equals/import-type hidden import leak, public facade arbitrary helper/canonical-name/namespace/star/star-as leak, React facade headless/non-react/arbitrary-helper/canonical-name/star/star-as leak, runtime test-only import blocking, test-file allowance, testing helper implementation import blocking, fixture non-testing import blocking을 포함한다. Internal verifier는 command chain, route tree wrapper, test discovery/parity, forbidden marker AST scanner로 분리했지만 `verify-internal.mjs` facade export surface를 유지한다. | `package.json`, `scripts/verify-docs-inventory.mjs`, `scripts/verify-docs-inventory.test.mjs`, `scripts/verify-editor-boundaries.mjs`, `scripts/verify-editor-public-facade-boundary.test.mjs`, `scripts/verify-editor-react-facade-boundary.test.mjs`, `scripts/verify-editor-external-import-boundary.test.mjs`, `scripts/verify-editor-internal-segment-boundary.test.mjs`, `scripts/verify-internal.mjs`, `scripts/verify-internal-repeat.test.mjs`, `scripts/verify-internal-route-tree.mjs`, `scripts/verify-internal-route-tree.test.mjs`, `scripts/verify-internal-test-discovery.mjs`, `scripts/verify-internal-test-marker-ast.mjs`, `scripts/verify-internal-test-markers.test.mjs`, `playwright.config.ts`, `tests/browser/editor-input-contract.spec.ts`, `docs/editor-verification-gate-audit.md`, `docs/editor-browser-input-gate.md` |
| manual workflow scripts | `preview`는 built `dist`를 serve하는 manual runtime check이고, `format`은 Biome write fixer다. 별도 `lint` script는 `check`의 부분집합이라 제거했다. `verify:internal`의 required gate는 `check`와 `build`로 묶는다. | `package.json`, `pnpm format`, `pnpm exec vite preview --help` |
| install build-script allowlist | `pnpm.onlyBuiltDependencies`는 install lifecycle script 실행 허용 범위를 `esbuild`, `lightningcss`로 좁힌다. 현재 installed graph에서 `lightningcss@1.32.0`은 Tailwind/Vite/TanStack Start 경유로 존재하고, `esbuild`는 Vite optional peer metadata에는 보이지만 installed dependency path는 없다. | `package.json`, `pnpm list lightningcss --depth=20`, `pnpm list esbuild --depth=20`, `pnpm-lock.yaml` |

## 제거 확정 근거

| 제거 항목 | 왜 제거했는가 | 검증 근거 |
| --- | --- | --- |
| `@tanstack/react-devtools` | source/config import가 없고 UI에 devtools component를 렌더링하지 않는다. | `rg`, `pnpm why`, `pnpm remove` |
| `@tanstack/react-router-devtools` | router devtools import/render path가 없다. | `rg`, `pnpm why`, `pnpm remove` |
| `@tanstack/react-router-ssr-query` | Query integration route/loader/provider 사용이 없다. | `rg`, `pnpm why`, `pnpm remove` |
| `@tanstack/devtools-vite` | `vite.config.ts` plugin list에 없다. | `vite.config.ts`, `pnpm remove` |
| `@tailwindcss/typography` | Tailwind typography plugin import/config가 없다. | `rg`, `pnpm remove` |
| direct `@tanstack/router-plugin` | 직접 import/config가 없고 `@tanstack/react-start` 경유 transitive로 남는다. | `vite.config.ts`, `pnpm why @tanstack/router-plugin`, `pnpm remove` |
| direct `@tanstack/router-cli` and `generate-routes` | `pnpm why` 기준 direct devDependency일 뿐이고 사용 경로는 `generate-routes` script 하나였다. 제거 전 비교에서 `tsr generate` 단독 output은 TanStack Start build output과 달라 `src/routeTree.gen.ts`를 잘못된 상태로 남길 수 있음을 확인했다. | `pnpm why @tanstack/router-cli`, pre-removal standalone generator comparison, `pnpm build`, `pnpm remove -D @tanstack/router-cli` |
| `#/*`, `@/*` aliases | source import에서 쓰이지 않고, 현재 repo는 relative import와 package imports만으로 build된다. | `rg`, `tsc`, `vite build` |
| `latest` direct ranges | package manifest에서 reinstall 시점마다 moving target이 되는 direct app dependency range다. 현재 lockfile 기준 `@tanstack/react-router@1.170.16`, `@tanstack/react-start@1.168.26` caret range로 좁혔다. | `package.json`, `pnpm-lock.yaml`, `pnpm list --depth=0` |

## 현재 dependency/security 근거

2026-06-22 현재 실행 결과:

| Command | 결과 | 판정 |
| --- | --- | --- |
| `pnpm list --depth=0` | direct production dependencies 10개, direct devDependencies 12개. 제거 대상 devtools/query/typography/router-cli/Vitest browser provider package는 top-level direct dependency로 나타나지 않는다. | 현재 package manifest의 직접 surface는 editor/runtime/build/test/gate에 필요한 항목으로 좁혀져 있다. |
| `pnpm audit --json` | total dependencies 261, low/moderate/high/critical 0건 | 현재 installed graph의 known vulnerability evidence는 clean이다. |
| `pnpm audit --prod --json` | prod dependencies 163, low/moderate/high/critical 0건 | 현재 production dependency graph도 known vulnerability evidence는 clean이다. |
| `pnpm licenses list --json` | 207 license entries. MIT 174, ISC 10, Apache-2.0 6, BSD-3-Clause 4, BSD-2-Clause 2, MIT OR Apache-2.0 2, MIT-0 2, MPL-2.0 2, BlueOak-1.0.0/CC-BY-4.0/CC0-1.0/Python-2.0/Unlicense 각 1 | inventory는 뽑히지만 allowlist/denylist 정책은 없다. |
| `pnpm why @tanstack/router-cli` | dependency path 없음 | standalone route generation CLI는 현재 package graph에 남아 있지 않다. |
| `pnpm why @vitest/browser-playwright` | dependency path 없음 | browser provider는 lockfile의 Vitest optional peer metadata에는 보이지만 installed direct/transitive dependency path는 아니다. |
| `package.json` `pnpm.onlyBuiltDependencies` | allowlist는 `esbuild`, `lightningcss` 2개다. `lightningcss@1.32.0`은 installed graph에 있고, `esbuild`는 현재 installed path가 없다. | install build-script surface는 좁혔지만 supply-chain provenance, SBOM, license allowlist, vulnerability release gate를 대체하지는 않는다. |
| Chrome headless CDP smoke | preview 서버를 로컬 Chrome headless로 열어 hydration, pointer click, `Input.insertText(" browser-smoke")`, focus/caret affordance, 1280x900 screenshot, runtime/log error 0건을 확인했다. | 새 package dependency 없이 일회성 browser evidence는 만들 수 있다. 자동 gate로 만들지는 별도 결정이다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| direct dependency inventory | 확정 | `package.json`과 `pnpm list --depth=0`가 production dependencies 10개, devDependencies 12개를 같은 top-level package surface로 보여준다. |
| editor/runtime/build dependency roles | 확정 | current source/config가 `@interactive-os/json-document`, `@chenglou/pretext`, React/React DOM, TanStack Start/Router, Vite, Tailwind, `lucide-react`, `zod`를 실제 import/build path에서 사용한다. `pnpm build`와 `tsc --noEmit`도 이 surface를 통과시킨다. |
| test/type/check tooling roles | 확정 | `vitest`, `jsdom`, Testing Library, TypeScript, React/Node type packages, Biome는 `verify:internal` command chain과 script/source tests에서 직접 쓰인다. `@testing-library/dom`은 React Testing Library peer로 direct 유지가 맞다. |
| verification script surface | 확정 | `verify:docs`, `verify:boundaries`, `verify:internal`, stress/soak scripts는 manifest에 있고, docs inventory/boundary/repeat parsing/route tree restore-fail behavior는 script tests가 고정한다. |
| route generation through Start build | 확정 | standalone `generate-routes`/`verify:routes` script와 direct router CLI는 없다. `verify:internal`의 build wrapper가 route tree 변경 시 restore/fail하도록 테스트된다. |
| removed starter dependency absence | 확정 | 제거 대상 devtools/query/typography/router-cli/browser provider는 `package.json` top-level surface와 `pnpm list --depth=0`에 없다. `@tanstack/router-plugin`은 direct dependency가 아니라 `@tanstack/react-start` 경유 transitive dependency로만 남는다. |
| unused alias removal | 확정 | `tsconfig.json`과 `vite.config.ts`에 `#/*`/`@/*` alias와 `resolve.tsconfigPaths` hook이 없고, source/script scan에서도 alias imports가 없다. |
| direct `latest` range removal | 확정 | direct dependency manifest에는 `latest` range가 없다. 현재 `@tanstack/react-router`와 `@tanstack/react-start`는 lockfile 설치 버전 기반 caret range다. |
| manual workflow script roles | 확정 | `preview`는 built `dist` serve workflow이고, `format`은 `biome format --write` fixer다. 중복 `lint` script와 unsafe standalone route generation script는 manifest surface에서 빠져 있다. |
| install build-script allowlist | 확정 | `pnpm.onlyBuiltDependencies`는 `esbuild`/`lightningcss` 두 항목이다. 현재 installed graph에서 `lightningcss@1.32.0`은 존재하고 `esbuild` dependency path는 없다. |
| current audit/license snapshot | 확정 snapshot | 현재 실행 기준 `pnpm audit --json`은 total dependencies 261, vulnerability 0건이고 `pnpm audit --prod --json`은 production dependencies 163, vulnerability 0건이다. `pnpm licenses list --json`은 210 entries inventory를 제공하며 license counts는 MIT 174, ISC 10, Apache-2.0 9, BSD-3-Clause 4, BSD-2-Clause/MIT OR Apache-2.0/MIT-0/MPL-2.0 각 2, BlueOak-1.0.0/CC-BY-4.0/CC0-1.0/Python-2.0/Unlicense 각 1이다. |
| release/CI script policy | 미정 | `verify:internal -- --repeat=1`은 repo-local required gate로 닫혔지만, preview smoke와 write formatter를 release/CI에서 어떻게 다룰지는 아직 정책이 아니다. |
| semver range vs exact pin policy | 미정 | direct `latest`는 제거했지만 대부분 dependency는 caret range이고 Biome만 exact pin이다. 현재 증거는 lockfile 설치 상태이지 future reinstall/update policy가 아니다. |
| dependency/security release gate | 미정 | one-off audit/license inventory는 current snapshot이다. `verify:internal`에 vulnerability/license/SBOM/provenance gate를 넣을지와 allowlist/denylist 기준은 아직 정하지 않았다. |
| browser smoke dependency/gate | 부분확정 | `@playwright/test`와 `verify:browser`가 Chromium/Firefox/WebKit 최소 P0 input smoke를 실행한다. | OS IME matrix, AT QA, release 필수 여부는 아직 정책이 아니다. |

## 아직 애매하거나 정책으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| release/CI script policy | repo-local 필수 기준은 `verify:internal -- --repeat=1`로 닫았다. `preview`와 `format`은 manual workflow이고, 별도 `lint` script는 제거했다. 다만 release/CI에서 `preview` runtime smoke를 필수로 할지, `format --write`를 CI에서 금지/허용할지는 닫지 않았다. | release/CI에서 runtime smoke와 formatting write policy를 정한다. |
| semver range vs exact pin policy | direct `latest` range는 제거했다. 하지만 대부분 deps는 caret range이고 Biome만 exact pin이다. 현재 gate는 installed lockfile 기준만 확인한다. | release 안정성이 필요하면 caret range를 유지할지 exact pin으로 통일할지 별도로 정한다. |
| dependency/security gate policy | 현재 `pnpm audit` 결과는 vulnerability 0건이고 install build-script allowlist도 `esbuild`/`lightningcss`로 좁다. 하지만 `verify:internal`은 dependency vulnerability/license audit을 포함하지 않고, license inventory에 대한 allowlist/denylist, SBOM/provenance policy도 없다. | release gate가 필요하면 `pnpm audit` 실행 조건, license allowlist, install/provenance 검증 정책을 별도로 정한다. |
| browser smoke package | `@playwright/test`는 direct devDependency이고 `verify:browser` script가 있다. Vite dev server와 Chromium/Firefox/WebKit projects로 최소 P0 input smoke를 실행한다. | browser gate를 CI/release에서 언제 필수로 할지, IME/AT matrix를 어떻게 확대할지는 별도 결정이다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| direct unused devtools/query/typography deps | 제거 확정 | source/config에서 사용 근거가 없고 direct dependency surface만 넓힌다. 제거 후 transitive lock 정리가 가능하다. |
| direct `@tanstack/router-plugin` | 제거 확정 | Vite config는 `tanstackStart()`만 직접 쓰며 router plugin은 React Start 내부 dependency로 충분하다. |
| unused path aliases | 제거 확정 | alias import가 없고 현재 repo는 relative imports로 충분하다. 유지하면 사용하지 않는 import convention만 늘어난다. |
| direct `latest` ranges | 제거 확정 | lockfile이 이미 exact installed version을 고정하고 있고, manifest의 `latest`는 다음 install에서 direct dependency surface를 예측 불가능하게 넓힌다. 기존 caret range 패턴에 맞춰 현재 installed version 기반 caret range로 좁힌다. |
| `@testing-library/dom` | 유지 확정 | source import는 없지만 `@testing-library/react` peer를 만족하는 direct dev dependency다. |
| `verify:docs` | 유지 확정 | README Docs inventory가 실제 `docs/*.md`와 diverge하는 것을 막는 좁은 gate다. Script test가 대표 missing/stale/duplicate reporting을 고정한다. Markdown formatter/linter를 새로 강제하지 않아 package surface를 과하게 키우지 않는다. |
| standalone `generate-routes` / `verify:routes` using `tsr generate` | 제거 확정 | Router CLI 단독 output과 TanStack Start build output이 달라서 현재 app의 routeTree freshness를 정확히 증명하지 못한다. |
| `verify:internal` script family | 유지 확정 | 현재 repo 분석의 검증 근거를 한 interface로 묶는다. README docs inventory와 build-time route tree stability도 포함하고, repeat parsing과 route tree restore/fail은 script test로 고정한다. |
| one-off `pnpm audit` evidence | 유지 확정 | current installed dependency graph에 known vulnerability가 없는지 확인하는 저비용 evidence다. 다만 registry 시점 의존이라 release gate 포함 여부와는 별개다. |
| `pnpm.onlyBuiltDependencies` | 유지 확정 | install lifecycle script allowlist를 좁게 유지한다. 현재 필요한 native CSS/build dependency는 `lightningcss`이고, `esbuild`는 optional peer metadata 대비 허용 목록에 남아 있지만 installed path는 없다. |
| `format` as `biome format --write` | 수정 확정 | `biome format`은 check 대상 파일을 검사만 해서 `check`와 역할이 겹친다. `format`이라는 script 이름은 manual fixer interface로 두는 편이 좁고 명확하다. |
| `lint` script | 제거 확정 | `check`가 같은 Biome 대상에서 lint/format/import organization baseline을 함께 본다. 별도 `lint` script는 required gate도 아니고 README workflow도 아니라 package interface만 넓힌다. |
| `preview` script | 유지 확정 | Vite production build output을 local serve하는 standard manual workflow다. `pnpm preview --host localhost --port 4173 --strictPort` 뒤 `curl /` server smoke와 Chrome headless CDP smoke가 통과한다. browser smoke를 자동 gate로 만들지는 별도 결정이다. |

## 현재 결론

package surface에서 빼면 안 되는 것은 editor model/runtime, TanStack Start/Router app,
Vite/Tailwind/React build, Vitest/jsdom/Testing Library test runtime, TypeScript/Biome,
route generation via TanStack Start build, docs inventory/route tree/internal verification scripts다.

이번 audit에서 source/config 근거가 없거나 현재 Start app output과 충돌하는 starter
direct dependency entries 7개를 제거했고, unused path aliases도 제거했다.
direct `latest` ranges는 현재 lockfile 버전의 caret range로 좁혔다. `format`
script는 수동 write fixer로 맞추고, 중복 `lint` script는 제거했다.
아직 확정하면 안 되는 것은 release/CI runtime smoke/write policy, caret range vs exact
pin policy, dependency/security gate policy, browser smoke release 필수 여부다. 현재 installed
dependency graph의 `pnpm audit` vulnerability 결과는 0건이고, license inventory는
확인했지만 allowlist 정책은 아직 없다. `pnpm.onlyBuiltDependencies`는 install script
surface를 `esbuild`/`lightningcss`로 좁히지만 SBOM/provenance/release security gate는
아니다. Preview server smoke와 단일 Chrome headless
smoke의 후속으로 `@playwright/test` 기반 최소 browser input gate를 추가했다.
