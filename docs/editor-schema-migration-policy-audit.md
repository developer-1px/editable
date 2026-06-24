# Editor schema migration policy audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `schemaVersion: 1`, public
`parseNoteDocument`, headless `replaceDocument` validation, and future migration
policy를 분리한다.

## 목적

현재 document schema에는 `schemaVersion`이 있지만, version field가 있다고 해서
legacy/future document migration system이 이미 있다는 뜻은 아니다.

이 문서는 현재 확정된 schema version contract와 아직 보류해야 하는 migration/import
policy를 나눈다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/noteDocument.ts` | `NoteDocumentSchema`는 `schemaVersion: z.literal(1)`만 받는다. |
| `note document split tests` | unsupported `schemaVersion: 2` document가 schema parse에서 실패하는 것을 검증한다. |
| `src/editor/public/noteDocument.ts` | `parseNoteDocument(value)`는 `NoteDocumentSchema.safeParse(value)`만 호출하고, 실패 시 generic `"Document is invalid."` reason을 반환한다. Migration step은 없다. |
| `src/editor/public/index.test.ts` | public parse seam이 valid version 1 persisted document를 받고, schemaVersion 2를 generic failure로 거절하는 것을 검증한다. |
| `src/editor/internal/model/editorCore.ts` | headless `replaceDocument` command도 `NoteDocumentSchema.safeParse(command.document)`로 검증하고 실패 시 generic reason을 반환한다. |
| `editorCore split tests` | unsupported schema version을 `replaceDocument`로 넣어도 migration하지 않고 current document를 유지하는 것을 검증한다. |
| `docs/editor-public-schema-audit.md` | public schema object export는 제거하고, validation seam은 `parseNoteDocument`로 좁힌다고 정리한다. |
| `docs/editor-document-normal-form-audit.md` | current normal form은 schemaVersion 1 structured document라고 정리한다. |

## 확정 schema version behavior

| 항목 | 확정 내용 |
| --- | --- |
| current version | Current persisted document schema accepts only `schemaVersion: 1`. |
| schema authority | Exact schema authority is internal `NoteDocumentSchema`, not generated public schema docs. |
| public parse seam | Public persisted/untrusted JSON validation seam is `parseNoteDocument(value)`. |
| parse failure shape | Public parse failure is generic `{ ok: false, reason: "Document is invalid." }`. |
| no Zod issue exposure | Zod issue detail/message/path is not public contract. |
| no migration in parse | `parseNoteDocument` does not transform legacy/future documents. It validates current schema only. |
| replace validation | `replaceDocument` validates with the same internal schema and generic failure reason. |
| replace failure safety | Invalid replace, including unsupported schema version, does not mutate the current document. |
| parse-before-create bootstrap | Public caller can parse a current schema document and pass the success document to `createEditor({ initial })`. |

## 증거 강도

| 범위 | 판정 | 근거 |
| --- | --- | --- |
| current schema version | source/test로 확정 | `NoteDocumentSchema`가 `schemaVersion: z.literal(1)`만 받고, `note document split tests`가 `schemaVersion: 2`를 schema failure로 고정한다. |
| public parse behavior | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 version 1 persisted document parse success와 version 2 generic failure를 확인한다. |
| no migration in parse | source/test로 확정 | `parseNoteDocument(value)`는 `NoteDocumentSchema.safeParse(value)`만 호출한다. Version 2 input은 transformed result가 아니라 generic failure로 반환된다. |
| generic parse failure | 실행 테스트로 확정 | Public parse failure result는 `{ ok: false, reason: "Document is invalid." }`이고, Zod issue detail/path/message는 노출하지 않는다. |
| replace validation and failure safety | 실행 테스트로 확정 | `editorCore split tests`가 `replaceDocument` invalid/unsupported document를 generic failure로 거절하고 current document를 mutate하지 않는 것을 확인한다. |
| batch atomicity with invalid replace | 실행 테스트로 확정 | batch dispatch에서 앞 command가 성공해도 뒤 `replaceDocument`가 실패하면 document가 원래 상태로 남는다. |
| schema object public non-contract | facade/verifier로 확정 | `docs/editor-public-schema-audit.md`, public facade test, boundary verifier가 `NoteDocumentSchema` public export/re-export를 막고 `parseNoteDocument`를 좁은 seam으로 둔다. |
| migration API absence | source behavior 확정, 제품/API 미정 | 현재 `migrateNoteDocument`, `untrustedInitial`, generated schema docs, field-level diagnostics DTO는 없다. 이 부재는 current behavior이지 future product policy가 아니다. |
| destructive/sanitizing migration | 미정 | unsafe link/media/attrs/codeBlock mismatch 같은 legacy payload를 drop/sanitize/fail 중 무엇으로 처리할지 아직 product/import policy가 없다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `schemaVersion: 1` literal | 유지 확정 | Current schema is intentionally exact; accepting wider versions would imply unsupported migration semantics. |
| `parseNoteDocument` | 유지 확정 | It is the narrow public validation seam that hides Zod implementation details. |
| generic parse/replace reason | 유지 확정 | Field-level details would widen public error contract before import UX is designed. |
| public `NoteDocumentSchema` export | 제거 확정 | Exposing Zod schema would make implementation shape and issue object part of the public interface. |
| automatic v2/legacy migration | 보류 | There is no v2 schema, legacy document set, migration target, or import UX requirement. |
| field-level diagnostics DTO | 보류 | Useful for import UX, but it needs a stable small DTO rather than raw Zod issues. |
| `createEditor({ untrustedInitial })` | 보류 | Current parse-before-create path is sufficient. New option would combine validation, migration, and error-shape decisions. |
| generated public schema docs | 보류 | Public import/migration policy is not broad enough yet to justify generated external docs. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| v2 migration location | Migration could live inside `parseNoteDocument`, in a separate `migrateNoteDocument`, or outside the editor package. There is no v2 target yet. | v2 schema가 생기면 migration owner and API shape를 먼저 결정한다. |
| legacy document support window | Current code rejects unsupported versions. Support/drop/warn policy for old persisted data is absent. | persisted external users가 생기면 support 기간과 migration/drop 정책을 정한다. |
| field-level import diagnostics | Generic reason is stable but not user-friendly for import flows. | import UI가 필요하면 raw Zod issues가 아닌 좁은 error DTO를 설계한다. |
| destructive migration behavior | It is unknown whether invalid/unsafe fields should be dropped, sanitized, or fail whole-document import. | link/media/attrs/codeBlock compatibility policy와 함께 migration semantics를 정한다. |
| generated compatibility docs | Tests/audits describe current schema behavior, but there is no generated public schema/version matrix. | external integration이 필요해지면 generated docs or compatibility matrix를 만든다. |

## 현재 결론

뺄 수 없는 확정은 current persisted document가 `schemaVersion: 1` structured
`NoteDocument`이고, public validation seam이 `parseNoteDocument(value)`라는 점이다.
Unsupported schema versions는 generic failure로 거절되고 migration되지 않는다.
`replaceDocument`도 같은 schema validation을 쓰며 invalid document로 current document를
mutate하지 않는다. Batch dispatch 중 invalid replace가 섞여도 앞 mutation까지 포함해
current document는 원래 상태로 유지된다.

아직 확정하면 안 되는 것은 automatic migration, field-level diagnostics, generated
public schema docs, `untrustedInitial` convenience option이다. 현재 올바른 판정은
schemaVersion 1 validation을 유지하되, migration policy는 실제 v2/legacy/import 요구가
생길 때 별도 public interface로 설계하는 것이다.
