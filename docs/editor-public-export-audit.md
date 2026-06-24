# Editor Public Export Audit

작성일: 2026-06-21
갱신일: 2026-06-22

범위: 현재 dirty workspace 기준. `src/editor/public/index.ts`의 개별 export가
headless editor embedding interface에 꼭 필요한지, demo/bootstrap 편의인지
구분한다.

## 판정

이번 패스에서 확정으로 줄인 것은 세 가지다.

- `initialNoteDocument`는 public facade에서 제거했다.
- `createNoteDocument`도 public facade에서 제거했다.
- `NoteDocumentSchema`도 public facade에서 제거하고 `parseNoteDocument`로 대체했다.

`initialNoteDocument`는 내부 demo seed와 `createEditor()`의 default initial
document로는 여전히 필요하다. 하지만 public export로 노출될 필요는 현재 근거로
확인되지 않는다. `createEditor()`는 options 없이 호출해도 내부에서 이 seed를 쓸
수 있고, 현재 레포 consumer도 `src/editor/public`에서 이 값을 import하지 않는다.

`createNoteDocument`는 내부 markdown importer와 tests에는 유용하지만 public
constructor로 확정하기에는 근거가 약하다. 특히 public facade는 이 함수의 입력
type인 `NoteBlockInput`을 같이 노출하지 않는다. 이 상태로 함수만 public에 두면
test/demo helper가 장기 contract처럼 보인다.

`NoteDocumentSchema`는 내부 canonical validation rule로는 필요하지만, public
caller에게 Zod schema 객체를 contract로 보장할 근거는 없다. persisted JSON을
`NoteDocument`로 좁히는 seam은 `parseNoteDocument(value)`로 유지하고, Zod 구현은
다시 internal에 숨겼다.

## Runtime Export Before -> After

| 범위 | Runtime exports |
| --- | --- |
| Before | `createEditor`, `createNoteDocument`, `initialNoteDocument`, `NoteDocumentSchema` |
| After | `createEditor`, `parseNoteDocument` |

현재 `src/editor/public/index.ts` 기준 runtime export는 2개뿐이다.

| Runtime export | Source | 판정 |
| --- | --- | --- |
| `createEditor` | `../internal/model/editorCore` | headless editor module entrypoint로 유지 확정 |
| `parseNoteDocument` | `./noteDocument` | persisted/untrusted JSON validation seam으로 유지 확정 |

`src/editor/public/index.test.ts`가 runtime facade를 `createEditor`와
`parseNoteDocument`로 고정하고, parser가 persisted document validation seam으로
동작하는지 확인한다. type-only export 판정은
`docs/editor-public-type-export-audit.md`로 분리했다.

## Public API 전수 구현 체크

이 패키지는 현재 `package.json`에 `"private": true`이고 package `exports` map이
없다. 따라서 repo 안에서 의도적으로 노출하는 public interface는 두 facade,
`src/editor/public/index.ts`와 `src/editor/react/index.ts`다.

### Facade Inventory

| Facade | Runtime export | Type export | 구현 상태 | 고정 근거 |
| --- | --- | --- | --- | --- |
| `src/editor/public` | `createEditor`, `parseNoteDocument` | `CreateEditorOptions`, `Editor`, `EditorCapability`, `EditorCommand`, `EditorDeleteUnit`, `EditorListener`, `EditorMoveDirection`, `EditorMoveUnit`, `EditorQuery`, `EditorQueryResult`, `EditorResult`, `EditorSnapshot`, `EditorViewAdapter`, `InsertableEditorNode`, `Mark`, `NoteDocument`, `NoteDocumentParseResult`, `RichSelection`, `ToggleMarkCommandType` | 구현됨 | `src/editor/public/index.test.ts`가 runtime/type export exact list를 고정한다. |
| `src/editor/react` | `BlockEditor` | `BlockEditorProps` | 구현됨 | `src/editor/react/index.test.ts`가 runtime/type export exact list를 고정한다. |

### Headless Runtime API

| API | Interface | 구현 상태 | 고정 근거 |
| --- | --- | --- | --- |
| `createEditor(options?)` | `initial`, `history`, `selection`, `view` option을 받아 headless editor를 만든다. | 구현됨 | `editorCore split tests`, `public/index.test.ts` |
| `editor.snapshot()` | `{ document, selection, revision }` 반환 | 구현됨 | `editorCore split tests` |
| `editor.subscribe(listener)` | snapshot listener 등록, unsubscribe 반환 | 구현됨 | `editorCore split tests` |
| `editor.dispatch(command)` | single command 실행 | 구현됨 | `editorCore split tests`, command/model tests |
| `editor.dispatch([...commands])` | batch command를 undo unit 하나로 실행한다. history command batch는 거절한다. | 구현됨 | `editorCore split tests`, history audit |
| `editor.can(command)` | commit 없이 command 가능 여부를 반환한다. | 구현됨 | `editorCore split tests` |
| `editor.query(query)` | typed query result를 반환한다. | 구현됨 | `editorCore split tests` |
| `editor.dispose()` | listener를 비우고 이후 method 호출을 invariant error로 막는다. | 구현됨 | source invariant |
| `parseNoteDocument(value)` | unknown persisted JSON을 current `NoteDocument`로 좁히거나 generic failure를 반환한다. | 구현됨 | `public/index.test.ts`, schema migration audit |

### Headless Command Inventory

| Command type | Public payload | 구현 상태 | 고정 근거 |
| --- | --- | --- | --- |
| `setSelection` | `{ selection: RichSelection }` | 구현됨 | `editorCore split tests`, selection audit |
| `selectAll` | no payload | 구현됨 | `editorCore split tests`, input adapter tests |
| `moveSelection` | `{ unit, direction, extend? }` | 구현됨 | `editorCore split tests`, cursor command/input adapter tests |
| `insertText` | `{ text: string }` | 구현됨 | `editorCore split tests`, text command/input adapter tests |
| `insertNode` | `{ node: InsertableEditorNode }` for mention/figure | 구현됨 | `editorCore split tests`, text command tests |
| `delete` | `{ direction, unit? }` | 구현됨 | `editorCore split tests`, deletion tests |
| `split` | no payload | 구현됨 | `editorCore split tests`, line-break tests |
| `toggleMark` | `{ mark: "bold" | "italic" | "code" | "link" }` | 구현됨 | `editorCore split tests`, mark command tests |
| `undo` | no payload | 구현됨, batch 불가 | `editorCore split tests`, history tests |
| `redo` | no payload | 구현됨, batch 불가 | `editorCore split tests`, history tests |
| `replaceDocument` | `{ document: NoteDocument }` | 구현됨, schema-invalid document는 generic failure | `editorCore split tests`, schema migration audit |

`editorCore split tests`는 `commandDescriptors` registry key를 위 11개로 고정한다.
따라서 새 public command는 테스트와 문서 갱신 없이 조용히 추가될 수 없다.

### Headless Query Inventory

| Query type | Result | 구현 상태 | 고정 근거 |
| --- | --- | --- | --- |
| `document` | `NoteDocument` | 구현됨 | `editorCore split tests` |
| `selection` | `RichSelection | null` | 구현됨 | `editorCore split tests`, selection audit |
| `activeMarks` | `Mark[]` | 구현됨 | `editorCore split tests`, mark command audit |
| `canUndo` | `boolean` | 구현됨 | `editorCore split tests`, history audit |
| `canRedo` | `boolean` | 구현됨 | `editorCore split tests`, history audit |
| `can` | `EditorCapability` for a command | 구현됨 | `editorCore split tests` |

`editorCore split tests`는 `queryDescriptors` registry key를 위 6개로 고정한다.

### React Runtime API

| API | Interface | 구현 상태 | 고정 근거 |
| --- | --- | --- | --- |
| `BlockEditor` | React editor entrypoint | 구현됨 | BlockEditor split tests, route import audit |
| `BlockEditorProps.readOnly` | optional mutation-blocking React prop | 구현됨 | BlockEditor split tests, read-only policy audit |

React facade는 `BlockEditor`와 `BlockEditorProps`만 노출한다. `EditorToolbar`,
`DocumentRenderer`, overlay, debug recorder 같은 React implementation helper는 public
interface가 아니다.

### 구현하지 않는 것으로 확정한 public API

| API 후보 | 상태 | 이유 |
| --- | --- | --- |
| `NoteDocumentSchema` export | 비공개 확정 | Zod object를 public contract로 보장하지 않는다. validation seam은 `parseNoteDocument`다. |
| `initialNoteDocument`, `createNoteDocument` | 비공개 확정 | demo seed/helper를 caller contract로 보장하지 않는다. |
| Markdown runtime API | 비공개 확정 | Markdown adapter는 internal clipboard/import/export implementation이다. |
| `InlineNode`, `NoteBlock`, `FigureBlockInput`, `MentionInlineInput` | 비공개 확정 | public document shape는 `NoteDocument`, insert payload는 `InsertableEditorNode`로 충분하다. |
| `DispatchOptions`/`mergeKey` | 제거 확정 | history contract는 batch vs single dispatch로 닫았다. |
| `createEditor({ readOnly })` | 보류 | React `readOnly`는 구현됐지만 headless embedding 요구는 아직 없다. |
| migration/field diagnostics API | 보류 | v2 migration target과 import UX가 아직 제품/API 결정으로 닫히지 않았다. |
| public Markdown import/export API | 보류 | error shape, sanitization, migration, compatibility matrix를 같이 설계해야 한다. |

Markdown adapter 함수인 `importMarkdown`, `exportMarkdown`,
`exportInlineMarkdown`도 public runtime facade에 없다. 이 함수들은
`docs/editor-markdown-adapter-audit.md` 기준으로 internal adapter이며,
`scripts/verify-editor-boundaries.mjs`가 direct export, aliased export-from,
import-then-export alias, namespace 재노출, internal implementation `export *`와
`export * as` 누수를 막는다.

Verifier는 `editorCore`, `noteDocument`, `richSelection`에서 이미 확정한 public
이름만 public facade로 올릴 수 있게 둔다. 그 밖의 internal model helper는 named
export와 import-then-export alias 모두 public surface 확장으로 보고 막는다. 허용된
public binding도 `createEditor as makeEditor`처럼 다른 public 이름으로 내보내지
못한다.

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| runtime public facade 2개 export | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 runtime keys를 `createEditor`, `parseNoteDocument`로 고정한다. |
| `createEditor` 유지 | 실행 테스트로 확정 | `editorCore split tests`가 headless editor surface를 `can`, `dispatch`, `dispose`, `query`, `snapshot`, `subscribe` 6개 method로 고정한다. |
| `parseNoteDocument` 유지 | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 persisted JSON parse, parse-before-create bootstrap, generic parse failure, persisted link href validation을 검증한다. |
| `initialNoteDocument`/`createNoteDocument`/`NoteDocumentSchema` 제거 | runtime/boundary test로 확정 | public facade runtime test가 key absence를 검증하고 boundary verifier가 schema/demo helper 재노출을 막는다. |
| Markdown adapter runtime 비노출 | runtime/boundary test로 확정 | public facade runtime test와 boundary verifier tests가 direct/aliased/imported/namespace/star/star-as Markdown adapter 재노출을 막는다. |
| arbitrary internal helper 비노출 | boundary test로 확정 | boundary verifier split tests가 `activeMarksFromSelection` 같은 internal helper의 direct export와 import-then-export alias를 violation으로 고정한다. |
| canonical public export names | boundary test로 확정 | boundary verifier tests가 `createEditor as makeEditor` 같은 direct alias와 imported public binding alias 재노출을 막는다. |
| namespace/star export leak 방지 | boundary test로 확정 | boundary verifier tests가 `export *`와 `export * as`를 통한 internal implementation leak을 막는다. |
| type-only public surface | 별도 감사에서 확정 | `docs/editor-public-type-export-audit.md`와 `src/editor/public/index.test.ts`가 source-level public type inventory 19개를 따로 고정한다. |
| future migration/field diagnostics/untrusted initial | 미정 | `parseNoteDocument` seam은 current validation을 닫지만 v2 migration, field-level diagnostics, `createEditor({ untrustedInitial })` ergonomics는 아직 제품/API 결정이다. |
| public Markdown API | 미정 | current Markdown adapter는 internal로 닫혀 있고, external Markdown API는 error shape, migration, sanitization, compatibility table과 함께 설계해야 한다. |

## 확정으로 유지할 export

| Export | 판정 | 근거 |
| --- | --- | --- |
| `createEditor` | 유지 확정 | headless editor module entrypoint다. `editorCore split tests`가 `can`, `dispatch`, `dispose`, `query`, `snapshot`, `subscribe` 여섯 메서드 표면과 command dispatch 동작을 고정한다. |
| `CreateEditorOptions`, `Editor`, `EditorCapability`, `EditorCommand`, `EditorListener`, `EditorQuery`, `EditorQueryResult`, `EditorResult`, `EditorSnapshot`, `EditorViewAdapter` 계열 type | 유지 확정 | `createEditor()`를 type-safe하게 쓰고 결과/capability/query/listener/view adapter를 해석하는 데 필요한 interface다. 빼면 caller가 internal model을 import하거나 `any`를 써야 한다. |
| `RichSelection` | 유지 확정 | `CreateEditorOptions.selection`, `EditorSnapshot.selection`, `setSelection` command가 모두 이 type을 interface에 노출한다. |
| `NoteDocument` | 유지 확정 | `CreateEditorOptions.initial`, `EditorSnapshot.document`, `replaceDocument` command가 모두 이 type을 interface에 노출한다. |
| `InsertableEditorNode`, `EditorDeleteUnit`, `EditorMoveDirection`, `EditorMoveUnit`, `ToggleMarkCommandType` | 유지 확정 | `EditorCommand` payload를 구성하는 공개 type이다. 빼면 headless command caller가 internal command strategy type을 알아야 한다. |
| `Mark` | 유지 확정 | `activeMarks` query result와 text node mark inspection에 쓰인다. |
| `parseNoteDocument` / `NoteDocumentParseResult` | 유지 확정 | persisted/untrusted JSON을 `NoteDocument`로 좁히고 success/failure return shape를 type-safe하게 다루는 public validation seam이다. Zod schema 객체는 internal로 숨긴다. |

## 제거한 export

| Export | 판정 | 이유 | 검증 |
| --- | --- | --- | --- |
| `initialNoteDocument` | 제거 확정 | 내부 demo seed와 default document 역할은 유효하지만, public caller에게 seed 객체 자체를 보장할 근거는 없다. public에서 빼도 `createEditor()` default, `BlockEditor` demo 화면, model tests는 내부 import로 유지된다. | `src/editor/public/index.test.ts`가 runtime facade에 이 key가 없는지 확인한다. |
| `createNoteDocument` | 제거 확정 | 내부 block-input fixture builder와 markdown importer helper 역할은 유효하지만, public caller에게 보장할 constructor로는 입력 type과 default id 정책이 닫히지 않았다. | `src/editor/public/index.test.ts`가 runtime facade에 이 key가 없는지 확인한다. |
| `NoteDocumentSchema` | 제거 확정 | persisted validation seam은 필요하지만 Zod schema object를 public contract로 보장할 근거는 없다. | `src/editor/public/index.test.ts`와 `scripts/verify-editor-boundaries.mjs`가 재노출을 막는다. |
| `importMarkdown`, `exportMarkdown`, `exportInlineMarkdown` | 비노출 확정 | Markdown adapter는 clipboard/import/export 내부 구현으로 유지한다. Public Markdown API는 error shape, migration, sanitization, compatibility table이 같이 설계되기 전까지 보류다. | `src/editor/public/index.test.ts`, `scripts/verify-editor-boundaries.mjs`, boundary verifier split tests가 direct/aliased/namespace/`export *`/`export * as` 재노출을 막는다. |
| arbitrary internal model helpers | 비노출 확정 | `activeMarksFromSelection` 같은 helper는 public caller가 알아야 할 interface가 아니다. 올리면 `createEditor()`의 작은 command/query surface를 우회한다. | `scripts/verify-editor-boundaries.mjs`, boundary verifier split tests가 named export와 import-then-export alias 재노출을 막는다. |
| public binding alias names | 제거 확정 | `createEditor` 같은 확정 public 이름을 `makeEditor`로 다시 내보내면 같은 implementation에 public 이름이 둘 생긴다. 이름도 interface 일부라서 별도 제품/API 근거 없이 늘리지 않는다. | `scripts/verify-editor-boundaries.mjs`, boundary verifier split tests가 direct alias export와 imported local alias export를 막는다. |
| `DispatchOptions` | 제거 확정 | `label`, `origin`, `mergeKey`는 현재 editor public surface에서 관측 가능한 contract가 아니다. 확정된 history policy는 batch dispatch를 하나의 undo unit으로 묶고, batch가 아닌 연속 single dispatch는 별도 undo unit으로 둔다. | `src/editor/public/index.ts`가 더 이상 export하지 않는다. |
| `FigureBlockInput`, `MentionInlineInput`, `InlineNode`, `NoteBlock` | 제거 확정 | insert node payload는 `InsertableEditorNode`로 이미 public에 노출되고, document subtype은 `NoteDocument`에서 도출할 수 있다. | `scripts/verify-editor-boundaries.mjs`가 public facade 재노출을 막는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| public facade 전체 제거 | 유지 확정 | headless embedding seam과 boundary verifier가 있다. 제거하면 caller가 internal model로 들어가야 한다. |
| `initialNoteDocument` public export | 제거 확정 | public interface의 leverage를 높이지 않고 demo fixture를 contract처럼 보이게 한다. |
| `createNoteDocument` public export | 제거 확정 | helper 자체는 내부에서 유용하지만 public facade에는 입력 type과 constructor 정책이 같이 닫혀 있지 않다. |
| `NoteDocumentSchema` public export | 제거 확정 | storage/validation seam보다 넓은 구현 객체다. `parseNoteDocument`가 같은 seam을 더 좁게 제공한다. |
| Markdown adapter public export | 제거 확정 | 내부 import/export adapter를 facade로 올리면 Markdown compatibility, migration, diagnostics 정책을 한꺼번에 public contract로 만든다. |

## 현재 결론

`src/editor/public` 자체는 빼면 안 되는 headless seam이다. 하지만 그 안의 모든
export가 같은 확정도를 갖지는 않는다. `initialNoteDocument`와 `createNoteDocument`는
public contract에서 제거했다. `NoteDocumentSchema`도 public에서 제거했고, persisted
validation seam은 `parseNoteDocument`로 남겼다. parse failure는 generic reason으로
좁혔고, 남은 애매함은 future migration, field-level diagnostics, untrusted initial
option 설계다. Markdown adapter 함수도 public facade로 승격하지 않는다.
