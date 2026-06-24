# Editor Public Surface Audit

작성일: 2026-06-21
갱신일: 2026-06-22

범위: 현재 dirty workspace 기준. `createEditor()` headless surface와
`BlockEditor` React surface가 같은 제품 경로인지, 별도 interface인지 구분했다.

## 판정

현재 확정으로 말할 수 있는 것은 세 가지다.

1. `src/editor/public`은 headless editor embedding interface다.
2. `src/editor/react`는 현재 앱이 사용하는 React editor interface다.
3. 두 facade는 서로를 다시 export하거나 import하지 않는 별도 interface다.

이 라운드에서 dogfooding 질문에 대해 확정으로 말할 수 없는 것은 하나다.

- future state owner를 `createEditor()` 하나로 통합할지 여부.

따라서 `createEditor()`는 "없는 코드"가 아니다. 그러나 현재 React 앱의 runtime
state owner라고 부르면 과장이다. 반대로 `BlockEditor`가 지금 `createEditor()`를
호출하지 않는 것을 결함이라고 부르는 것도 과장이다.

## 확정 근거

| 주제 | 판정 | 근거 |
| --- | --- | --- |
| 외부 import seam | 확정 | README가 public import를 `src/editor/public`, `src/editor/react`로 제한한다. `scripts/verify-editor-boundaries.mjs`가 외부 코드의 `src/editor/internal/*` 및 legacy `components/model/fixtures/testing` import를 막는다. |
| headless editor interface | 확정 | `src/editor/public/index.ts`가 `createEditor`, `parseNoteDocument`, `Editor`, command/query/result types, document types를 re-export한다. 개별 export 범위는 `docs/editor-public-export-audit.md`에서 분리해 판정한다. |
| `createEditor()` surface depth | 확정 | `editorCore split tests`가 public surface를 `can`, `dispatch`, `dispose`, `query`, `snapshot`, `subscribe` 여섯 메서드로 고정한다. 내부는 JSONDocument history, command descriptors, view adapter, batch atomicity를 숨긴다. |
| React app interface | 확정 | `src/routes/index.tsx`는 `../editor/react`에서 `BlockEditor`를 import한다. `src/editor/react/index.ts`는 `BlockEditor`와 props만 re-export한다. |
| React runtime ownership | 확정 | `BlockEditor`는 `useJSONDocument`, input adapter, text commands, contenteditable engine, geometry, renderer, toolbar를 직접 조합한다. 현재 코드에서 `createEditor()`를 호출하지 않는다. |
| React read-only prop | 확정 | `BlockEditorProps.readOnly`는 React surface prop이다. title/body/input adapter/DOM recovery/paste/cut/toolbar mutation guard는 `docs/editor-read-only-policy-audit.md`와 BlockEditor split tests가 고정한다. |
| facade 분리 | 확정 | `scripts/verify-editor-boundaries.mjs`가 `src/editor/public`에서 `BlockEditor`/`BlockEditorProps` 노출, React facade import, allowlist 밖 internal helper 재노출, 확정 public binding alias export, internal implementation `export *`/`export * as` 누수를 막고, `src/editor/react`에서 `createEditor`/`parseNoteDocument` 등 headless API 노출, public facade import, non-react internal alias 재노출, `BlockEditor`/`BlockEditorProps` 밖 React helper 재노출, React public binding alias export, internal React implementation `export *`/`export * as` 누수를 막는다. 대표 위반 reporting은 boundary verifier split tests가 고정한다. |

## 현재 React facade source-level inventory

현재 `src/editor/react/index.ts`의 public surface는 runtime export 1개와 type export
1개다.

| Export | Kind | Source | 판정 |
| --- | --- | --- | --- |
| `BlockEditor` | runtime | `../internal/react/BlockEditor` | 현재 앱 route가 쓰는 React editor entrypoint로 유지 확정 |
| `BlockEditorProps` | type | `../internal/react/BlockEditor` | `readOnly` React prop surface를 type-safe하게 쓰기 위한 type으로 유지 확정 |

`src/editor/react/index.test.ts`는 runtime export key가 `BlockEditor` 하나뿐이고,
`createEditor`/`parseNoteDocument`를 runtime export하지 않는 것을 고정한다. Type
export는 runtime key에 나타나지 않으므로, `scripts/verify-editor-boundaries.mjs`의
allowlist가 `BlockEditor`/`BlockEditorProps` 외 React helper, headless API,
non-react internal, alias name, star/star-as 재노출을 막는다.

## 현재 import matrix

현재 앱 route는 `src/editor/react`만 쓴다.

| Caller | Import | 판정 |
| --- | --- | --- |
| `src/routes/index.tsx` | `../editor/react` | 확정 앱 seam. 첫 화면은 `BlockEditor`다. |
| 외부 app 코드 | `src/editor/internal/*` 없음 | `verify-editor-boundaries`가 static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type hidden implementation path를 막는다. |
| 외부 app 코드 | legacy `src/editor/components`, `model`, `fixtures`, `testing` 없음 | 삭제된 legacy import path를 다시 쓰면 verifier가 실패한다. |
| 현재 앱 runtime | `src/editor/public` import 없음 | `createEditor()`는 현재 화면 owner가 아니라 headless embedding seam이다. |
| `src/editor/public` facade | `src/editor/react` import 없음 | headless surface에 React runtime을 섞지 않는다. verifier가 막는다. |
| `src/editor/react` facade | `src/editor/public` import 없음 | React surface가 headless API를 재노출하지 않는다. verifier와 script test가 public facade import, non-react internal alias leak, arbitrary React helper export leak, `BlockEditor` alias-name leak, internal React star/star-as leak을 막는다. |

`src/editor/public/index.ts`와 `src/editor/react/index.ts`는 서로를 import하지 않는다.
둘 다 internal implementation 위에 놓인 facade다. 이 사실은 두 surface가 병렬로
존재한다는 근거이지만, React surface가 반드시 headless surface를 dogfood해야
한다는 근거는 아니다.

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| headless runtime facade | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 runtime export를 `createEditor`, `parseNoteDocument` 두 개로 고정하고 demo constructor, schema, markdown adapter, React component 노출을 막는다. |
| headless type surface | 소스 AST 테스트로 확정 | `src/editor/public/index.test.ts`가 source-level type export 19개를 exact list로 고정한다. |
| `createEditor()` six-method interface | 실행 테스트로 확정 | `editorCore split tests`가 editor object key를 `can`, `dispatch`, `dispose`, `query`, `snapshot`, `subscribe`로 고정한다. |
| React runtime facade | 실행 테스트로 확정 | `src/editor/react/index.test.ts`가 runtime export를 `BlockEditor` 하나로 고정하고 `createEditor`/`parseNoteDocument`가 없음을 확인한다. |
| React type surface | 소스 AST 테스트로 확정 | `src/editor/react/index.test.ts`가 source-level type export를 `BlockEditorProps` 하나로 고정한다. |
| route import seam | 정적 소스와 verifier로 확정 | `src/routes/index.tsx`가 `src/editor/react` facade만 import하고, boundary verifier가 app code의 hidden implementation import를 막는다. |
| facade 분리 | 정적 verifier 테스트로 확정 | boundary verifier split tests가 public facade의 React 누수와 React facade의 headless/non-react/internal helper 누수를 대표 위반으로 고정한다. |
| 현재 React runtime ownership | 소스와 integration test로 확정 | `BlockEditor`는 `useJSONDocument`, contenteditable/input adapter, geometry, toolbar를 직접 조합하고 현재 `createEditor()` 호출이 없다. React integration tests는 이 route path의 input/selection/read-only 동작을 검증한다. |
| React read-only prop | 실행 테스트로 확정 | BlockEditor split tests가 `BlockEditor readOnly`의 title/body/input adapter/DOM recovery/paste/cut/toolbar/history shortcut mutation guard를 고정한다. |
| future state owner 통합 | 미정 | verifier는 facade 분리만 막고 `BlockEditor`가 `createEditor()`를 써야 한다는 정책은 강제하지 않는다. native DOM selection, composition, layout lifecycle을 어느 interface가 소유할지는 제품/API 결정이다. |
| command adapter unification | 미정 | `createEditor()` command descriptors와 React input adapter의 low-level command 조합이 둘 다 존재하지만, 하나의 dispatch owner로 통합할 요구는 아직 테스트나 제품 범위로 닫히지 않았다. |
| headless read-only option | 미정 | React `readOnly`는 확정 prop이지만 `createEditor({ readOnly })` public option은 없다. headless embedding에도 필요한지는 별도 결정이다. |
| public Markdown/migration expansion | 미정 | 현재 public facade는 markdown adapter와 schema object를 노출하지 않고 `parseNoteDocument`로 persisted validation을 좁힌다. future migration, field-level diagnostics, ergonomic untrusted initial option은 아직 닫지 않았다. |

## 삭제 테스트

| 삭제 대상 | 깨지는 것 | 깨지지 않는 것 | 결론 |
| --- | --- | --- | --- |
| `createEditor()` / `src/editor/public` | headless embedding interface, `editorCore split tests`, public API 문서 의미 | 현재 route-level React app path | public headless seam으로는 빼면 안 되지만, React 앱 runtime path라고 단정하면 안 된다. |
| `BlockEditor` / `src/editor/react` | 현재 앱 화면, React integration tests, contenteditable/native selection wiring | headless `createEditor()` tests | 제품 앱 seam으로는 빼면 안 되지만, headless embedding interface를 대체하지 않는다. |
| `scripts/verify-editor-boundaries.mjs` | internal/legacy import 차단 근거 | 개별 unit tests 일부 | public/internal 구조를 증명하는 gate라서 빼면 안 된다. |

## 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 결정 옵션 |
| --- | --- | --- |
| future state owner 통합 | `createEditor()`는 좋은 headless interface지만 React editor는 native DOM selection, composition, layout lifecycle을 직접 가진다. 단순 dogfooding은 오히려 shallow wrapper가 될 수 있다. | A. `createEditor()`를 external embedding 전용으로 둔다. B. `BlockEditor` 내부 state owner도 `createEditor()`로 통합한다. |
| command 중복 표면 | `createEditor()` command descriptors와 `BlockEditor`의 input adapter/text command 호출이 둘 다 command layer를 안다. | input adapter가 `EditorCommand`만 만들고 dispatch는 한 곳에서 하게 할지, React adapter가 지금처럼 low-level command를 직접 조합할지 정해야 한다. |
| read-only scope | `BlockEditor readOnly`는 React input boundary에서 확정했고, 내부 `translateEditorInput(..., { readOnly: true })`가 mutation-blocking input translation을 담당한다. 하지만 headless `createEditor()` public option은 없다. Toolbar disabled affordance도 아직 제품 UX로 닫히지 않았다. | headless embedding에도 read-only가 필요한지, React toolbar를 disabled 상태로 보여야 하는지 결정해야 한다. |
| document parse/import policy | `public/index.ts`는 이제 `initialNoteDocument`, `createNoteDocument`, `FigureBlockInput`, `MentionInlineInput`, `InlineNode`, `NoteBlock`, `NoteDocumentSchema`를 노출하지 않는다. Runtime export는 `createEditor`, `parseNoteDocument`다. Public test는 `parseNoteDocument` success document로 `createEditor({ initial })`를 boot하는 현재 path를 고정한다. | `docs/editor-public-schema-audit.md` 기준으로 parse failure는 generic reason으로 확정했다. 남은 애매함은 future migration, field-level diagnostics, ergonomic untrusted initial option이다. |
| dogfooding policy | verifier는 facade 분리는 막지만, `BlockEditor`가 `createEditor()`를 써야 한다는 정책은 검증하지 않는다. | state owner 통합을 결정하면 verifier나 integration test를 추가한다. 결정 전에는 현재 verifier 범위를 과장하지 않는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `src/editor/public` 유지 | 유지 확정 | headless embedding interface와 `editorCore split tests`가 있다. 삭제하면 React app은 떠도 public API와 boundary 문서가 깨진다. |
| `src/editor/react` 유지 | 유지 확정 | 현재 route와 React integration tests가 직접 의존한다. 삭제하면 제품 화면이 깨진다. |
| `BlockEditorProps.readOnly` 유지 | 유지 확정 | React surface의 cursor-only/mutation-blocking mode로 테스트가 있다. 삭제하면 read-only integration 기준선이 깨진다. |
| 지금 바로 `BlockEditor`를 `createEditor()`로 dogfood | 보류 | 기존 메커니즘으로 해결되지 않은 결함이 보이지 않는다. native DOM selection, composition, layout lifecycle을 `createEditor()` interface가 아직 표현하지 않는다. |
| facade 간 재노출 허용 | 제거 확정 | headless public surface와 React surface를 섞으면 두 interface의 삭제 테스트가 흐려진다. verifier와 facade tests로 다시 섞이지 않게 막는다. |
| `initialNoteDocument` public export | 제거 확정 | 내부 demo seed/default document 역할은 유지하되 public facade에서는 제거했다. `src/editor/public/index.test.ts`가 다시 노출되지 않는지 확인한다. |
| `createNoteDocument` public export | 제거 확정 | 내부 helper 역할은 유지하되 public constructor로 보장하기에는 입력 type/default id 정책이 닫히지 않았다. |
| `FigureBlockInput` / `MentionInlineInput` public export | 제거 확정 | `insertNode` payload public 이름은 `InsertableEditorNode` 하나면 충분하다. boundary verifier가 재노출을 막는다. |
| `InlineNode` / `NoteBlock` public export | 제거 확정 | document shape는 `NoteDocument`로 충분히 노출된다. subtype convenience name을 별도 contract로 보장할 근거가 없다. |
| `NoteDocumentSchema` public export | 제거 확정 | Zod schema object를 public contract로 보장하지 않는다. persisted validation seam은 `parseNoteDocument`로 충분하다. |

## 현재 결론

`createEditor()`는 작고 깊은 headless module interface로 볼 근거가 있다. 여섯
메서드 뒤에 command dispatch, selection, history, view geometry adapter가 숨는다.

`BlockEditor`는 별도 React module interface다. 현재 앱의 실제 seam은
`src/editor/react`이며, 여기에는 contenteditable/native selection/IME/toolbar/render
lifecycle이 들어 있다.

둘 중 하나를 가짜라고 지우는 것은 현재 근거와 맞지 않는다. 다만 둘의 관계는 아직
제품/API 결정이 아니다. 지금 확정 가능한 표현은 "headless public seam과 React app
seam이 병렬로 존재하고, 서로 재노출하지 않는다"까지다. 개별 export로는 `initialNoteDocument`와
`createNoteDocument`, `NoteDocumentSchema`를 public에서 뺐고, persisted document
validation seam은 `parseNoteDocument`로 좁혔다. parse failure는 generic reason으로
고정했고, parse success document로 `createEditor({ initial })`를 boot하는 path도
고정했다. 남은 제품/API 결정은 migration, field-level diagnostics, ergonomic
untrusted initial option, future state owner 통합 여부다.
