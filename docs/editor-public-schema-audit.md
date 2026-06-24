# Editor Public Schema Audit

작성일: 2026-06-21

범위: 현재 dirty workspace 기준. `src/editor/public`의 persisted document
validation seam이 Zod schema export여야 하는지, 더 좁은 public interface로 감출
수 있는지 판정한다.

## 판정

`NoteDocumentSchema` public export는 제거 확정이다.

persisted JSON을 `NoteDocument`로 좁히는 runtime validation seam은 필요하다. 다만
caller가 Zod schema 객체, `.safeParse()`, Zod issue shape까지 알아야 할 근거는
현재 레포에 없다. 그래서 public runtime export는 `createEditor`와
`parseNoteDocument`로 줄였다.

- 확정: `src/editor/public`은 headless embedding interface다.
- 확정: `parseNoteDocument(value)`는 persisted/untrusted JSON을 `NoteDocument`로
  좁히는 public validation seam이다.
- 확정: unknown persisted JSON으로 headless editor를 시작할 때는
  `parseNoteDocument(value)`의 success document를 `createEditor({ initial })`에 넘긴다.
- 확정: parse failure는 안정적인 generic `{ ok: false, reason: "Document is invalid." }`
  shape로 반환한다. Zod issue message/detail은 public contract가 아니다.
- 확정: headless `replaceDocument` command의 validation failure도 같은 generic
  reason을 반환한다.
- 확정: persisted link mark는 href shape와 safety까지 검증한다. non-empty safe
  `href`는 valid link mark이고, empty 또는 unsafe `href`는 generic failure로
  거절된다.
- 확정: `NoteDocumentSchema`는 internal canonical validation rule로 남긴다.
- 제거 확정: Zod schema 객체 자체는 public contract가 아니다.
- 애매: future schema version migration/import policy는
  `docs/editor-schema-migration-policy-audit.md` 기준으로 아직 별도 제품/API
  결정이다.

## 왜 schema 객체를 빼도 되는가

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `NoteDocumentSchema` internal 사용 | 유지 확정 | `createEditor`, `replaceDocument`, `useJSONDocument`, tests가 같은 canonical validation rule을 쓴다. 내부 구현에서는 빼면 안 된다. |
| `NoteDocumentSchema` public export | 제거 확정 | public caller에게 Zod를 interface 일부로 학습시키고, schema object shape까지 장기 contract처럼 보이게 한다. |
| `parseNoteDocument` public export | 유지 확정 | validation seam을 유지하면서 Zod 구현과 error object를 숨긴다. caller는 `{ ok, document | reason }`만 알면 된다. |
| generic parse failure reason | 유지 확정 | field-level Zod issue message를 public contract로 만들지 않는다. |

## 확정 근거

| 근거 | 의미 |
| --- | --- |
| `createEditor(options).initial?: NoteDocument` | headless caller가 document를 주입할 수 있다. |
| `createEditor` 내부 `createJSONDocument(..., { trustedInitial: true })` | 초기 문서는 이미 schema output이라고 믿는 경로다. unknown persisted JSON은 public parse seam을 거쳐야 한다. |
| `replaceDocument` command가 internal `NoteDocumentSchema.safeParse`를 사용한다. | command path에서는 invalid document를 막되 Zod issue text는 public `EditorResult.reason`으로 노출하지 않는다. |
| `src/editor/public/index.test.ts`, `editorCore split tests` | public runtime export가 `createEditor`, `parseNoteDocument` 두 개이고, `NoteDocumentSchema`, demo constructors가 노출되지 않음을 확인한다. persisted JSON은 parse success document로 headless editor를 boot할 수 있고, schemaVersion 2, invalid shape, empty/unsafe link href, `replaceDocument` invalid document는 generic failure로 고정한다. |
| `scripts/verify-editor-boundaries.mjs` | `NoteDocumentSchema`가 public facade로 다시 export되지 않게 막는다. |
| `docs/editor-schema-migration-policy-audit.md` | schemaVersion 1 validation, no automatic migration, parse/replace generic failure, migration 보류 범위를 분리한다. |

## 증거 강도

| 범위 | 판정 | 근거 |
| --- | --- | --- |
| public runtime facade | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 runtime export를 `createEditor`, `parseNoteDocument` 두 개로 고정하고, `NoteDocumentSchema`, demo constructors, Markdown adapter, `BlockEditor`가 없는 것을 확인한다. |
| public validation seam | source/test로 확정 | `parseNoteDocument(value)`는 `NoteDocumentSchema.safeParse(value)`를 감싸고, success에서는 schema output `NoteDocument`를 반환한다. Public test가 valid persisted JSON parse를 확인한다. |
| parse-before-create bootstrap | 실행 테스트로 확정 | Public test가 unknown persisted JSON을 `parseNoteDocument`로 좁힌 뒤 success `document`를 `createEditor({ initial })`에 넘겨 headless editor를 boot한다. |
| generic parse failure | 실행 테스트로 확정 | `schemaVersion: 2`와 invalid id parse가 `{ ok: false, reason: "Document is invalid." }`만 반환한다. Zod issue path/message는 public result에 없다. |
| persisted link href validation | 실행 테스트로 확정 | Public test가 safe link href는 valid document로 받고, empty/unsafe link href는 generic failure로 거절함을 확인한다. |
| `replaceDocument` validation | source/test로 확정 | Headless `replaceDocument`는 같은 internal `NoteDocumentSchema.safeParse`를 쓰고, invalid document와 unsupported version을 generic failure로 거절하며 current document를 mutate하지 않는다. Batch dispatch 실패도 atomic하게 current document를 유지한다. |
| internal schema authority | source/test로 확정 | `NoteDocumentSchema`는 internal canonical validation rule로 남고, note document/model tests가 initial document, mark/link validation, unsupported version rejection을 직접 확인한다. |
| public re-export guard | verifier test로 확정 | Boundary verifier test가 `NoteDocumentSchema` 같은 internal helper를 public facade에서 import-then-export하거나 `export *`로 올리는 경로를 violation으로 고정한다. |
| trusted initial only | source behavior 확정, ergonomics policy 미정 | `CreateEditorOptions.initial?: NoteDocument`는 trusted schema output을 받으며 `createJSONDocument(..., { trustedInitial: true })` 경로를 탄다. 별도 `untrustedInitial` option은 없다. |
| migration/import diagnostics | 미정 | 현재 parse/replace는 schemaVersion 1 validation만 하고 migration이나 field-level diagnostics DTO를 제공하지 않는다. 필요하면 raw Zod issue가 아니라 별도 좁은 error DTO와 migration interface를 설계해야 한다. |

## 아직 애매한 것

| 주제 | 왜 애매한가 | 결정 옵션 |
| --- | --- | --- |
| schema version migration | 현재 schema는 `schemaVersion: 1`만 받고 parse/replace는 unsupported versions를 generic failure로 거절한다. | future migration/import policy를 `parseNoteDocument` 내부로 숨길지, 별도 migration interface를 둘지 결정해야 한다. |
| legacy URL migration/sanitization | unsafe persisted link href는 parse 단계에서 거절한다. | legacy document의 unsafe href를 drop/migrate할 별도 migration interface가 필요한지는 결정해야 한다. |
| untrusted initial option | 지금 `createEditor`는 `initial?: NoteDocument`를 trusted로 받으며, public test가 parse-before-create bootstrap을 고정한다. | 별도 `createEditor({ untrustedInitial })` option을 추가할지는 future ergonomics 결정이다. |
| field-level import error detail | 지금 public parse/replace error는 generic reason만 준다. | 제품에서 field-level import errors가 필요하면 좁은 error DTO를 새로 설계해야 한다. Zod issue를 그대로 노출하지는 않는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| persisted JSON validation seam 제거 | 유지 확정 | 제거하면 caller가 `as NoteDocument`로 우회하거나 internal schema를 import해야 한다. |
| `NoteDocumentSchema` public export 유지 | 제거 확정 | validation seam보다 넓은 구현 객체를 public contract로 새긴다. |
| `parseNoteDocument` 추가 | 유지 확정 | 새 제품 개념이 아니라 기존 validation seam을 더 좁고 깊은 public interface로 바꾸는 축소다. |
| Zod validation message 노출 | 제거 확정 | reason string은 필요하지만 parse/replace 경로에서 Zod issue text를 그대로 노출하면 internal schema implementation이 public interface가 된다. |
| `createEditor`가 untrusted initial을 받게 변경 | 보류 | 현재 parse-before-create path가 있고, 새 option은 error shape와 migration policy를 함께 설계해야 한다. |

## 현재 결론

`NoteDocumentSchema`는 internal canonical schema로는 빼면 안 된다. 하지만
`src/editor/public`에서는 Zod schema 객체를 export하지 않는다. public caller에게
필요한 것은 persisted JSON을 `NoteDocument`로 좁히는 일이고, 그 interface는
`parseNoteDocument`로 충분하다. 현재 failure contract는 generic reason까지이며,
headless `replaceDocument` command도 같은 generic reason을 쓴다. unsafe persisted
link href는 validation failure로 거절한다. schema version migration, field-level
import diagnostics, legacy URL migration/sanitization은 별도 제품/API 결정으로
남긴다.
