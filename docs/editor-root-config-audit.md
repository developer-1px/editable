# Editor Root Config Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. root config 파일이 build/test/editor workflow에
필요한 확정 interface인지, scaffold 잔여물인지, 아니면 운영/팀 정책으로 아직
닫히지 않은 영역인지 구분한다.

## 판정

현재 root config에서 빼면 안 되는 확정은 TypeScript strict/no-emit config,
Vite/TanStack Start/Tailwind/React plugin chain, TanStack Router target config,
Biome source/scripts config check scope, generated/build/cache output을 막는
`.gitignore` baseline, 그리고 generated route tree와 Biome formatter를 보조하는
repo-local VS Code settings다.

반대로 `.cta.json`은 create-tanstack-app scaffold metadata일 뿐 현재 source,
package script, verifier가 읽지 않아 제거 확정이다. `vite.config.ts`의
`resolve.tsconfigPaths: true`도 현재 `tsconfig.json`에 `baseUrl`/`paths`가 없고
source import에서도 `@/*`/`#/*` alias를 쓰지 않으므로 제거 확정이다.

## 확정 유지 근거

| Surface | 확정 범위 | 근거 |
| --- | --- | --- |
| `tsconfig.json` | `strict`, no emit, bundler module resolution, React JSX, DOM/Vite client types, unused/fallthrough/side-effect import checks를 묶는 type gate config다. | `pnpm exec tsc --noEmit`, `scripts/verify-internal.mjs` |
| `vite.config.ts` plugin chain | `tailwindcss()`, `tanstackStart()`, `viteReact()`가 CSS import, route app build, React transform을 담당한다. | `src/styles.css`, `src/routes/*`, `pnpm build` |
| `tsr.config.json` | TanStack Router generated tree target을 React로 고정한다. Standalone route generation script는 제거했지만 Start build/generator context의 target config로 남는다. | `src/routeTree.gen.ts`, `pnpm build` |
| `biome.json` | `src`, `scripts/**/*.mjs`, `.vscode`, `vite.config.ts`를 check/format/import organization 대상으로 둔다. Generated route tree와 docs markdown은 의도적으로 제외하고, `src/styles.css`는 CSS check 대상으로 포함한다. README/docs를 직접 Biome에 넘겨도 현재 includes 아래서는 0 files로 처리된다. | `pnpm check`, direct `pnpm exec biome check README.md docs/repo-analysis-report.md docs/editor-verification-gate-audit.md`, `docs/editor-verification-gate-audit.md` |
| `.vscode/settings.json` | generated `routeTree.gen.ts`를 watcher/search/readonly 대상으로 숨기고, JS/TS/JSON/CSS default formatter와 organize imports action을 Biome으로 맞춘다. Correctness gate는 아니지만 tracked team editor workflow surface다. | `.vscode/settings.json`, `biome.json`, `pnpm exec biome check .vscode/settings.json` |
| `.gitignore` generated output baseline | `node_modules`, `dist`, `.tanstack`, `.vinxi`, `.nitro`, `.output`, `.wrangler`, local/env files, `__unconfig*`, `todos.json`을 git surface 밖에 둔다. 현재 workspace에도 `dist/client`, `dist/server`, `.tanstack/tmp`가 실제 generated output으로 생기고, `git check-ignore -v`가 `dist`, `.tanstack`, `.vinxi`, `.nitro`, `.output`, `.wrangler`, `.env.local`, `node_modules`를 ignore baseline으로 잡는다. | `find .tanstack`, `find dist`, `git check-ignore -v` |

## 제거 확정 근거

| 제거 항목 | 왜 제거했는가 | 검증 근거 |
| --- | --- | --- |
| `.cta.json` | create-tanstack-app 생성 선택지를 기록한 scaffold metadata이고 현재 command/source/verifier 사용처가 없다. 유지하면 repo config surface만 넓힌다. | `rg cta`, removed file |
| `resolve.tsconfigPaths: true` | 현재 `tsconfig.json`에는 `baseUrl`/`paths`가 없고, source도 alias import를 쓰지 않는다. package audit에서 unused aliases를 이미 제거했으므로 Vite alias hook도 불필요하다. | `rg "@/|#/"`, `tsconfig.json`, `pnpm build` |

## 아직 애매하거나 정책으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| docs markdown formatting | `biome.json`은 docs markdown/README를 check하지 않는다. 직접 Biome check에 README/docs를 넘겨도 현재 includes 때문에 coverage가 0 files다. 현재 docs 검증은 inventory/evidence-section presence와 whitespace 수준이다. | docs formatter/linter를 gate로 둘지 결정한다. |
| deployment-specific ignore entries | `.nitro`, `.output`, `.vinxi`, `.wrangler`는 Start/Vinxi/deploy tooling에서 생길 수 있는 output/cache 계열이지만 현재 release target policy는 닫혀 있지 않다. | deployment target이 정해지면 ignore baseline을 좁힐 수 있다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `.cta.json` | 제거 확정 | 현재 repo가 실행하거나 검증하는 interface가 아니고 scaffold provenance만 남긴다. |
| `resolve.tsconfigPaths: true` | 제거 확정 | alias가 없는 현재 config에서는 future hook일 뿐이다. |
| TypeScript strict config | 유지 확정 | `verify:internal` type gate의 실제 기준이다. |
| Vite plugin chain | 유지 확정 | app build/runtime 경로가 직접 의존한다. |
| `.vscode/settings.json` | 유지 확정 | correctness gate는 아니지만 generated route tree 수동 편집과 formatter drift를 줄이는 tracked team workflow surface다. 개인 경로나 secret을 담지 않고 Biome check 대상이다. |
| `src/styles.css` Biome gate | 유지 확정 | Biome CSS check가 Tailwind import와 current stylesheet를 처리한다. Duplicate `min-height`와 `!important`를 제거해 style surface도 source/config gate에 들어왔다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| TypeScript config | 확정 | `tsconfig.json`이 `strict`, `noEmit`, bundler module resolution, React JSX, DOM/Vite types, unused/fallthrough/side-effect import checks를 담고 `verify:internal`이 `pnpm exec tsc --noEmit`을 실행한다. | Public package declaration emit이나 multi-package project references policy는 없다. |
| Vite plugin chain | 확정 | `vite.config.ts`는 `tailwindcss()`, `tanstackStart()`, `viteReact()`만 사용하고 `pnpm build`가 client/SSR build를 통과한다. | Deployment adapter/runtime hosting target policy는 여기서 닫지 않는다. |
| TanStack Router target config | 확정 | `tsr.config.json`은 `{ "target": "react" }`이고 generated `src/routeTree.gen.ts`는 Start build의 route tree stability check로 관리된다. | Standalone `tsr generate` command를 별도 gate로 복구한다는 뜻은 아니다. |
| Biome check scope | 확정 | `biome.json` include가 `src`, `scripts/**/*.mjs`, `.vscode`, `index.html`, `vite.config.ts`를 포함하고 route tree/vendor를 제외하며 `pnpm check`가 88 files를 통과한다. README/docs를 직접 넘긴 Biome check도 현재 설정에서는 0 files로 처리된다. | Docs markdown/README formatting은 Biome 대상이 아니고 `git diff --check` 수준까지만 검증된다. |
| repo-local VS Code settings | 확정 | `.vscode/settings.json`은 route tree watcher/search/readonly exclusion과 JS/TS/JSON/CSS Biome formatter, organize-imports action을 설정하고 Biome check scope에 들어 있다. | 개인별 editor workflow나 비-VS Code 환경의 correctness gate는 아니다. |
| generated output ignore baseline | 확정 | `.gitignore`가 `dist`, `.tanstack`, `.vinxi`, `.nitro`, `.output`, `.wrangler`, `.env.local`, `node_modules` 등을 ignore하고, `git check-ignore -v`가 해당 baseline을 확인한다. | 실제 release target별로 어떤 output만 남길지는 아직 배포 정책이 아니다. |
| current generated output shape | 확정 | Current workspace에는 `dist/client`, `dist/server`, `.tanstack/tmp`가 generated output으로 존재하고 build 후 route tree diff가 없다. | Build artifact contents의 product QA나 hosting deploy contract를 의미하지 않는다. |
| `.cta.json` scaffold metadata removal | 확정 | `.cta.json`은 현재 파일로 존재하지 않고 command/source/verifier가 읽는 interface가 아니다. 남아 있는 언급은 audit/report 설명뿐이다. | Scaffold provenance를 별도 문서로 보존해야 한다는 운영 요구는 없다. |
| unused tsconfig paths hook removal | 확정 | `vite.config.ts`에 `resolve.tsconfigPaths`가 없고 `tsconfig.json`에 `baseUrl`/`paths`가 없으며 source/scripts는 package imports와 relative imports로 build된다. | Future alias policy가 필요하면 tsconfig/vite/boundary verifier를 함께 설계해야 한다. |
| docs markdown formatting gate | 미정 | Current root config는 docs markdown을 Biome 대상에 넣지 않고 direct Biome invocation도 current includes 때문에 README/docs를 검사하지 않는다. | Markdown lint/format을 gate로 둘지 결정하면 Biome include나 별도 docs command가 필요하다. |
| deployment-specific ignore policy | 미정 | `.nitro`, `.output`, `.vinxi`, `.wrangler`는 output/cache baseline으로 ignore하지만 current deployment target을 고정하지 않는다. | Hosting target이 확정되면 ignore baseline을 좁히거나 추가할 수 있다. |

## 현재 결론

root config에서 빼면 안 되는 확정은 TypeScript/Vite/TanStack/Biome/gitignore의
현재 build/test/generated-output baseline과 repo-local VS Code workflow settings다.
`.cta.json`과 unused Vite tsconfig-paths hook은 제거했다. 아직 확정하면 안 되는
것은 docs markdown formatting gate와 deployment target별 ignore baseline이다.
