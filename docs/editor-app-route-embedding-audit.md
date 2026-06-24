# Editor App Route Embedding Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `src/routes`, `src/router.tsx`, generated route tree가
editor를 어떻게 app에 얹고 있는지 보고, 확정된 app seam과 아직 제품/라우팅 결정으로
남은 영역을 구분한다.

## 판정

현재 앱 route는 **단일 `/` route에서 React editor facade를 렌더링하는 최소 host**다.
확정으로 말할 수 있는 것은 route가 hidden editor implementation을 직접 가져오지 않고
`src/editor/react`의 `BlockEditor`만 쓰는 점이다. 이 구조는 app code와 editor
implementation 사이의 seam으로 의미가 있다.

반대로 현재 route를 "제품 문서 앱 완성"으로 부르면 안 된다. persistence, document id
route, loader/server function, multi-document navigation, app-level state owner,
read-only route mode는 아직 구현이나 제품 요구로 닫혀 있지 않다.

## 현재 route source inventory

현재 route 관련 source는 4개뿐이다.

- `src/routes/__root.tsx`
- `src/routes/index.tsx`
- `src/router.tsx`
- `src/routeTree.gen.ts`

`src/routes`, `src/router.tsx`, `src/routeTree.gen.ts`에서 hidden editor path
(`editor/internal`, legacy `editor/components`, `editor/model`, `editor/fixtures`,
`editor/testing`)는 검색되지 않는다. 같은 범위에서 `loader`, `beforeLoad`,
`createServerFn`, `server$`, browser storage, route params/search, `documentId`,
route-level `readOnly` mapping도 검색되지 않는다. 따라서 현재 앱은 editor-only
minimum host라고 말할 수는 있지만, data-loading/product document app이라고 말할
근거는 없다.

## 확정 근거

| 주제 | 확정 범위 | 근거 |
| --- | --- | --- |
| route source inventory | route source는 root route, index route, router factory, generated route tree 4개로 좁다. | `rg --files src/routes src/router.tsx src/routeTree.gen.ts` |
| index route host | `/` route는 `createFileRoute("/")`로 정의되고, component는 `<BlockEditor />`만 렌더링한다. | `src/routes/index.tsx` |
| React facade import | app route는 `../editor/react`에서 `BlockEditor`를 가져온다. `src/editor/react` runtime export는 `BlockEditor` 하나로 테스트된다. | `src/routes/index.tsx`, `src/editor/react/index.ts`, `src/editor/react/index.test.ts` |
| route hidden import absence | route/router/generated files에는 hidden editor path import가 없다. | `rg -n "editor/(internal\|components\|model\|fixtures\|testing)" src/routes src/router.tsx src/routeTree.gen.ts` returns no matches |
| no route data policy | route/router/generated files에는 loader/server function, browser storage, route params/search, document id, route-level read-only mapping이 없다. | `rg -n "loader\|beforeLoad\|createServerFn\|server\\$\|localStorage\|sessionStorage\|indexedDB\|useParams\|useSearch\|documentId\|readOnly" src/routes src/router.tsx src/routeTree.gen.ts` returns no matches |
| hidden implementation 차단 | non-editor source가 `src/editor/internal/*` 또는 legacy `components/model/fixtures/testing`을 static import, type-only import, export-from, dynamic `import()`, block-commented dynamic `import()`, current Vite `import.meta.glob()` lazy/eager string/array specifier, `require()` call, TypeScript import-equals require, TypeScript import-type expression으로 가져오면 boundary verifier가 실패한다. | `scripts/verify-editor-boundaries.mjs` |
| root shell | root route는 meta, viewport, title, global stylesheet link를 head에 넣고, body에는 route children과 scripts만 둔다. | `src/routes/__root.tsx` |
| generated route tree | current route tree는 `__root__`와 `/` index route만 가진다. generated file은 수동 편집 대상이 아니며 TanStack Start build가 요구하는 generated output과 일치해야 한다. | `src/routeTree.gen.ts`, `scripts/verify-internal-route-tree.mjs` |
| router config | router는 route tree, scroll restoration, intent preload, stale time 0으로 생성된다. | `src/router.tsx` |
| route tree freshness | `verify:internal`은 `pnpm build` 전후의 `src/routeTree.gen.ts`를 비교한다. build가 generated route tree를 다시 쓰면 원래 content를 복원하고 실패한다. 이 restore/fail path는 script test로 고정한다. 제거 전 비교에서 `tsr generate` 단독 출력은 TanStack Start register tail을 뺐기 때문에 현재 Start app의 freshness verifier로 쓰지 않는다. | `scripts/verify-internal-route-tree.mjs`, `scripts/verify-internal-route-tree.test.mjs`, `pnpm build`, pre-removal standalone generator comparison |
| build coverage | `verify:internal`은 route tree stability wrapper와 Vite client/SSR build를 실행해서 current route tree가 Start build output과 일치하는지 확인한다. Route tree wrapper의 unchanged/changed behavior는 script test가 고정한다. | `scripts/verify-internal.mjs`, `scripts/verify-internal-route-tree.mjs`, `scripts/verify-internal-route-tree.test.mjs`, `docs/editor-verification-gate-audit.md` |
| preview server smoke | `pnpm build` 뒤 `pnpm preview --host localhost --port 4173 --strictPort`로 `/`가 HTTP 200을 반환하고 SSR HTML에 `<title>Editable</title>`, `Rich note`, `document-view`, `editor-surface`가 포함되는 것을 확인했다. | `curl http://localhost:4173/`, 6495 byte HTML |
| Chrome headless browser smoke | 같은 preview 서버를 Chrome headless `Chrome/149.0.7827.156`에서 열어 hydration 이후 `.title-input`, `.document-view`, `.editor-surface[contenteditable="plaintext-only"]`를 확인했다. 첫 text run을 pointer click한 뒤 `Input.insertText(" browser-smoke")`가 React editor state로 반영되고, focused surface, selection path/offset, caret 1개, 1280x900 PNG screenshot, runtime/log error 0건을 확인했다. | Chrome DevTools Protocol smoke on `http://localhost:4173/` |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| route source inventory | 확정 | 현재 route source는 `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/router.tsx`, `src/routeTree.gen.ts` 4개뿐이다. 이 범위는 file inventory와 generated route tree가 같이 보여준다. |
| `/` route React facade host | 확정 | `src/routes/index.tsx`는 `createFileRoute("/")` route에서 `../editor/react`의 `BlockEditor`만 렌더링한다. React facade runtime export도 `BlockEditor` 하나로 테스트된다. |
| root shell head/style/scripts | 확정 | `src/routes/__root.tsx`가 title/meta/viewport/global stylesheet link를 head에 넣고 body에 route children과 TanStack `Scripts`만 둔다. |
| router config and route tree shape | 확정 | `src/router.tsx`는 generated `routeTree`로 TanStack router를 만들고 scroll restoration, intent preload, stale time 0만 설정한다. `src/routeTree.gen.ts`는 `__root__`와 `/` index route만 가진다. |
| generated route tree stability | 확정 | `verify:internal`의 build wrapper가 `pnpm build` 전후 `src/routeTree.gen.ts`를 비교하고, 변경되면 원래 content를 복원한 뒤 실패한다. unchanged/changed behavior는 script test가 고정한다. |
| hidden editor implementation import guard | 확정 | 현재 route/router/generated files는 hidden editor path를 import하지 않고, non-editor source가 `src/editor/internal/*` 또는 legacy editor paths를 static/type/export/dynamic/commented dynamic/Vite glob/require/import-equals/import-type으로 가져오면 verifier가 실패한다. |
| route data policy absence | 확정 현재 상태 | route/router/generated files에는 loader/server function, browser storage, route params/search, document id, route-level read-only mapping이 없다. 이것은 현재 source absence 증거이지 future product policy가 아니다. |
| preview/Chrome smoke | 확정 snapshot | preview server HTTP smoke와 단일 Chrome headless hydration/interaction/screenshot smoke는 현재 built app이 `/`에서 editor shell을 렌더링하고 상호작용 가능한 것을 보여준다. 다만 자동 release gate나 cross-browser/mobile/AT matrix는 아니다. |
| persistence and document identity | 미정 | 저장 위치, autosave, import/export failure UI, `/documents/:id` 같은 route shape는 source와 product requirement가 없다. |
| app-level state owner | 미정 | route는 parsed persisted document나 headless editor instance를 주입하지 않는다. `BlockEditor`가 current React runtime state owner로 동작한다. |
| read-only route policy | 미정 | `BlockEditor`에는 `readOnly` prop이 있지만 route가 search param, permission, loader result로 read-only를 결정하지 않는다. |
| product app shell and browser gate | 미정 | navigation, document list, account shell, status bar, automated browser smoke package/script, broader browser/mobile/assistive-tech matrix는 없다. |

## 아직 애매하거나 제품 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| document persistence | route는 loader, server function, local storage, remote save를 갖지 않는다. `BlockEditor`는 내부 default document로 시작한다. | 저장 위치, autosave, import/export, failure UI를 별도 제품 요구로 정한다. |
| document identity routing | 현재 route tree는 `/` 하나다. `/documents/:id` 같은 route param contract가 없다. | multi-document 앱이 필요할 때 route shape와 data loading seam을 설계한다. |
| app-level state owner | app route는 `createEditor()`나 parsed persisted document를 넘기지 않는다. React surface가 자체 state owner로 동작한다. | future headless/React state-owner 통합 결정과 연결해서 본다. |
| read-only route mode | `BlockEditor`는 `readOnly` prop을 지원하지만 route가 search param/permission/loader 결과로 read-only를 결정하지 않는다. 현재 `BlockEditorProps`도 `readOnly`만 노출한다. | permission/read-only URL contract가 필요할 때 route-level prop mapping을 추가한다. |
| browser smoke gate | 일회성 Chrome headless hydration/interaction/screenshot smoke는 통과했다. 하지만 `verify:internal`이 실제 브라우저를 띄우지는 않고, Playwright/Vitest browser provider나 cross-browser/mobile/AT matrix도 없다. | release gate에서 browser smoke/screenshot을 자동화할지, 단일 Chrome smoke로 충분한지, matrix를 넓힐지 결정한다. |
| app shell product UX | root shell은 최소 document shell이다. navigation, account chrome, status bar, doc list 같은 제품 shell은 없다. | editor-only app인지 document product인지 결정되면 shell 책임을 분리한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `src/routes/index.tsx`의 React facade import | 유지 확정 | app route가 hidden implementation을 모르고 React editor interface만 쓰는 현재 seam이다. |
| route에서 `src/editor/internal/*` import | 제거 확정 | verifier가 막는 hidden implementation 의존이다. app route가 internal을 알면 editor seam이 무너진다. |
| route에서 `createEditor()`를 즉시 dogfood | 보류 | 현재 route 결함을 고치는 변경이 아니다. `BlockEditor`가 contenteditable/IME/layout lifecycle을 직접 소유하고, 현재 React prop surface도 `readOnly`만 노출하므로 state-owner 통합 없이 route에서 headless editor를 주입할 수 없다. |
| persistence/loader/server function 추가 | 보류 | 저장 제품 요구 없이 추가하면 app 개념 수만 늘어난다. |
| generated `routeTree.gen.ts` 수동 수정 | 제거 확정 | TanStack Router/Start generated artifact라 수동 편집하면 다음 generation에서 덮인다. `verify:internal`의 build wrapper가 Start build output과 checked-in file의 divergence를 막고, stale output이면 원래 content를 복원한 뒤 실패한다. |
| standalone `generate-routes` / `verify:routes` using `tsr generate` | 제거 확정 | `tsr generate` 단독 출력과 TanStack Start build output이 다르다. 단독 Router CLI output을 manual script나 gate로 쓰면 올바른 Start generated tail을 stale로 오판한다. |

## 현재 결론

app route embedding에서 빼면 안 되는 확정은 `/` route가 `src/editor/react` facade의
`BlockEditor`를 렌더링하고, root route가 global style/head/scripts shell을 제공하며,
route tree가 Start build output과 일치하고, boundary verifier가 app code의 hidden
editor implementation static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type import를 막는 구조다.

현재 route source inventory도 이 결론을 지지한다. route 관련 source는 root route,
index route, router factory, generated route tree뿐이고, route data-loading/storage/
identity/read-only mapping은 없다.

아직 확정하면 안 되는 것은 persistence, document-id routing, app-level state owner,
read-only route policy, browser smoke 자동 gate와 matrix, product app shell이다. 서버
HTTP smoke와 단일 Chrome headless hydration/interaction/screenshot smoke는 현재 evidence로
닫았지만, release gate나 cross-browser/mobile/AT QA까지 증명하지는 않는다.
