# Editor Public Type Export Audit

작성일: 2026-06-21

범위: 현재 dirty workspace 기준. `src/editor/public/index.ts`의 type-only exports
중 document subtype convenience name과 insert-node input helper가 headless editor
interface에 필요한 이름인지, 내부 document construction helper가 새고 있는지
구분한다. `CreateEditorOptions`, `EditorCommand`, `EditorSnapshot`,
`EditorCapability`, `EditorListener`, `EditorViewAdapter` 같은 editor core interface
type은 이 문서의 축소 대상이 아니라 public command/query surface의 확정 type이다.

## 판정

이번 패스에서 확정으로 줄인 document/subtype type-only export는 네 가지다.

- `FigureBlockInput`
- `MentionInlineInput`
- `InlineNode`
- `NoteBlock`

`FigureBlockInput`, `MentionInlineInput`은 `insertNode` command payload를 구성하는 내부 strategy 입력 타입이다.
public caller에게 필요한 이름은 이미 `InsertableEditorNode`로 노출된다. 따라서
두 타입을 별도 public export로 유지하면 같은 개념을 두 이름으로 배우게 만든다.

`InlineNode`, `NoteBlock`은 `NoteDocument` 내부 subtype convenience name이다.
public interface에 직접 등장하지 않고, 필요한 caller는
`NoteDocument["root"]["children"][number]`처럼 `NoteDocument`에서 도출할 수 있다.
따라서 document subtype 이름을 장기 public contract로 따로 보장하지 않는다.

## Type Export Before -> After

아래 표는 `editorCore`의 command/query/interface type을 제외한 document/subtype
convenience 이름만 비교한다. 전체 public type surface에는 다음 headless editor
interface type이 계속 포함된다.

`CreateEditorOptions`, `Editor`, `EditorCapability`, `EditorCommand`,
`EditorDeleteUnit`, `EditorListener`, `EditorMoveDirection`, `EditorMoveUnit`,
`EditorQuery`, `EditorQueryResult`, `EditorResult`, `EditorSnapshot`,
`EditorViewAdapter`, `InsertableEditorNode`, `ToggleMarkCommandType`,
`NoteDocumentParseResult`.

| 범위 | public type-only document exports |
| --- | --- |
| Before | `FigureBlockInput`, `InlineNode`, `Mark`, `MentionInlineInput`, `NoteBlock`, `NoteDocument`, `RichSelection` |
| After | `Mark`, `NoteDocument`, `RichSelection` |

## 현재 source-level type inventory

현재 `src/editor/public/index.ts`의 public type export는 19개다.

| Source | Type exports | 판정 |
| --- | --- | --- |
| `../internal/model/editorCore` | `CreateEditorOptions`, `Editor`, `EditorCapability`, `EditorCommand`, `EditorDeleteUnit`, `EditorListener`, `EditorMoveDirection`, `EditorMoveUnit`, `EditorQuery`, `EditorQueryResult`, `EditorResult`, `EditorSnapshot`, `EditorViewAdapter`, `InsertableEditorNode`, `ToggleMarkCommandType` | headless editor command/query/result/support interface로 유지 확정 |
| `../internal/model/noteDocument` | `Mark`, `NoteDocument` | active mark query와 persisted/canonical document shape로 유지 확정 |
| `../internal/model/richSelection` | `RichSelection` | selection option/snapshot/command payload로 유지 확정 |
| `./noteDocument` | `NoteDocumentParseResult` | public parse validation seam의 result type으로 유지 확정 |

이 inventory는 runtime export가 아니다. 현재 runtime public keys는
`createEditor`, `parseNoteDocument` 두 개로 별도 고정한다.

`scripts/verify-editor-boundaries.mjs`가 `src/editor/public/index.ts`에서
`FigureBlockInput`, `InlineNode`, `MentionInlineInput`, `NoteBlock`,
`initialNoteDocument`, `createNoteDocument`, `DispatchOptions`,
`NoteDocumentSchema`, Markdown adapter functions, React `BlockEditor` exports가
다시 export되지 않게 막는다.

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| runtime public facade 2개 export | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 runtime keys를 `createEditor`, `parseNoteDocument`로 고정한다. |
| source-level public type inventory 19개 | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 `src/editor/public/index.ts`를 TypeScript AST로 읽어 public type export names를 exact list로 검증한다. |
| editor core command/query/result/support type 유지 | source/verifier 확정 | `src/editor/public/index.ts`와 `scripts/verify-editor-boundaries.mjs` allowlist가 editor core interface type exports를 public headless interface로 허용한다. |
| `NoteDocument`, `Mark`, `RichSelection` 유지 | source/verifier 확정 | public facade와 verifier allowlist가 document, mark, selection concept만 named public type으로 허용한다. |
| `NoteDocumentParseResult` 유지 | source/test 확정 | public facade가 `parseNoteDocument`와 result type을 같은 validation seam으로 노출하고 public facade tests가 parse success/failure runtime behavior를 검증한다. |
| `InsertableEditorNode` 유지 | source/type 확정 | `EditorCommand`의 `insertNode` payload public 이름으로 유지하며 mention/figure input strategy 이름을 숨긴다. |
| removed document subtype/input helper types | boundary test로 확정 | `scripts/verify-editor-boundaries.mjs`와 tests가 `FigureBlockInput`, `MentionInlineInput`, `InlineNode`, `NoteBlock` 재노출을 non-public helper leak으로 막는다. |
| schema/demo/Markdown/React helper 재노출 금지 | boundary/runtime test로 확정 | public facade runtime test와 boundary verifier가 `NoteDocumentSchema`, demo constructors, Markdown adapter functions, React `BlockEditor` export를 막는다. |
| generated public schema/type docs | 미정 | 현재 public type surface는 facade source와 tests로 닫혀 있지만, 외부 배포용 generated schema/type reference는 없다. |
| document subtype convenience names 재도입 | 미정/보류 | 필요성이 생기기 전까지 `NoteDocument` indexed access나 command/query result type으로 도출하는 현재 좁은 surface를 유지한다. |

## 확정으로 유지할 type

| Type | 판정 | 근거 |
| --- | --- | --- |
| `NoteDocument` | 유지 확정 | `CreateEditorOptions.initial`, `EditorSnapshot.document`, `replaceDocument` command가 모두 이 type을 interface에 노출한다. |
| `RichSelection` | 유지 확정 | `CreateEditorOptions.selection`, `EditorSnapshot.selection`, `setSelection` command가 이 type을 interface에 노출한다. |
| `Mark` | 유지 확정 | `activeMarks` query result와 document text mark inspection에 쓰이는 public concept이다. |
| `InsertableEditorNode` | 유지 확정 | `insertNode` command payload의 public 이름이다. mention/figure insert를 한 타입으로 감춘다. |
| editor core command/query/result/support type | 유지 확정 | `src/editor/public/index.ts`와 verifier allowlist가 `CreateEditorOptions`, `Editor`, `EditorCapability`, `EditorCommand`, `EditorDeleteUnit`, `EditorListener`, `EditorMoveDirection`, `EditorMoveUnit`, `EditorQuery`, `EditorQueryResult`, `EditorResult`, `EditorSnapshot`, `EditorViewAdapter`, `ToggleMarkCommandType`를 public headless interface type으로 고정한다. |
| `NoteDocumentParseResult` | 유지 확정 | `parseNoteDocument`의 success/failure return shape를 type-safe하게 쓰기 위한 validation seam type이다. |

## 제거한 type

| Type | 판정 | 이유 | 검증 |
| --- | --- | --- | --- |
| `FigureBlockInput` | 제거 확정 | figure insertion은 `InsertableEditorNode`로 충분히 표현된다. 직접 export하면 command payload concept이 중복된다. | `pnpm run verify:boundaries`가 public facade 재노출을 막는다. |
| `MentionInlineInput` | 제거 확정 | mention insertion도 `InsertableEditorNode`로 충분하다. 직접 export하면 internal insert strategy input이 public으로 샌다. | `pnpm run verify:boundaries`가 public facade 재노출을 막는다. |
| `InlineNode` | 제거 확정 | `NoteDocument` 내부 subtype convenience name이다. public interface는 `NoteDocument`와 command/query types로 충분하다. | `pnpm run verify:boundaries`가 public facade 재노출을 막는다. |
| `NoteBlock` | 제거 확정 | root child subtype은 `NoteDocument["root"]["children"][number]`로 도출할 수 있다. named subtype을 별도 contract로 보장할 근거가 없다. | `pnpm run verify:boundaries`가 public facade 재노출을 막는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| insert node input 타입을 개별 export | 제거 확정 | `InsertableEditorNode`가 더 작은 public interface다. |
| document subtype 이름 전체 제거 | 제거 확정 | `NoteDocument` 자체는 유지하므로 document shape는 숨기지 않는다. named subtype convenience만 줄인다. |
| `NoteDocument`만 남기고 subtype convenience 제거 | 제거 확정 | caller가 필요하면 indexed access type으로 도출할 수 있다. |

## 현재 결론

public document/subtype type surface는 한 단계 더 좁아졌다. command payload는
`EditorCommand`와 `InsertableEditorNode`로 배우면 되고, mention/figure input
strategy type을 따로 알 필요가 없다. document shape는 `NoteDocument`로 남기되,
`InlineNode`/`NoteBlock` 같은 subtype convenience name은 public contract에서
제거했다.
