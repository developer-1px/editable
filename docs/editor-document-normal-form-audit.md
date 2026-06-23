# Editor document normal form audit

## 목적

현재 editor document의 exact schema와 normal form을 어디까지 확정으로 볼 수
있는지 분리한다. 이 문서는 design 방향이 아니라 현재 실행 코드와 테스트가 닫은
구조만 authoritative하게 취급한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/noteDocument.ts` | `NoteDocumentSchema`, block/inline/mark schema, helper factory, `schemaVersion: 1`, safe link href validation을 정의한다. |
| `src/editor/internal/model/normalizer.ts` | empty document fallback, inline child normalization, empty text pruning, adjacent text merge, mark ordering/deduplication을 수행한다. |
| `note document split tests` | initial document, rich block variants, structured marks, unsafe persisted link rejection을 검증한다. |
| `src/editor/internal/model/normalizer.test.ts` | empty document fallback, placeholder text child, empty run removal, adjacent text merge, mark canonicalization, link href-sensitive merge를 검증한다. |
| `docs/editor-public-schema-audit.md` | exact Zod schema object는 public export가 아니고, public validation seam은 `parseNoteDocument`로 좁힌다고 정리한다. |
| `docs/editor-schema-migration-policy-audit.md` | current `schemaVersion: 1` validation과 아직 보류해야 하는 migration/import policy를 분리한다. |
| `docs/editor-document-metadata-surface-audit.md` | `id`, `title`, `tags` metadata fields와 React title input의 확정/보류 범위를 분리한다. |
| `docs/editor-attrs-extension-surface-audit.md` | attrs의 persisted compatibility surface와 아직 보류해야 하는 plugin/render/Markdown extension contract를 분리한다. |
| `docs/editor-code-block-compatibility-audit.md` | code block canonical `text` field와 compatibility `children` field를 분리한다. |
| `docs/editor-figure-media-trust-audit.md` | figure block atom의 `src`/`alt` contract와 아직 보류해야 하는 media trust policy를 분리한다. |
| `docs/editor-identity-policy-audit.md` | local block id generation, duplicate-id tolerance, and future persistence/collaboration identity policy를 분리한다. |

## 확정 normal form

| 항목 | 확정 내용 |
| --- | --- |
| canonical state | DOM이나 Markdown이 아니라 structured `NoteDocument`가 canonical state다. 현재 persisted schema는 `schemaVersion: 1`만 받는다. |
| schema authority | exact schema authority는 `src/editor/internal/model/noteDocument.ts`의 `NoteDocumentSchema`다. public API는 schema 객체가 아니라 `parseNoteDocument` validation seam이다. |
| block set | 현재 block은 `paragraph`, `heading`, `quote`, `listItem`, `codeBlock`, `figure`다. Text block은 inline children을 가지고, `figure`는 atom block이다. |
| inline set | 현재 inline node는 `text`와 `mention`이다. `mention`은 atom inline이고 label을 가진다. |
| mark set | 현재 mark는 `bold`, `italic`, `code`, `link`다. `link.href`는 persisted schema와 import/export 경로에서 safe URL validation을 통과해야 한다. |
| compatibility defaults | schema는 일부 `kind`/`type`/`flow` default를 채우며, `codeBlock.children`은 compatibility field로 남아 있다. Canonical code content는 `text` field다. |
| non-empty document | normalizer는 block list가 비면 empty paragraph block을 만든다. |
| non-empty inline children | inline text block은 children이 비거나 모두 비어 있으면 single empty text child를 가진다. |
| empty text pruning | placeholder가 아닌 empty text run은 제거된다. |
| adjacent text merge | 같은 normalized marks를 가진 adjacent text run은 하나로 합쳐진다. `mention` 같은 inline atom은 merge boundary다. |
| mark canonicalization | marks는 `bold`, `italic`, `code`, `link` 순서로 정렬되고 중복은 제거된다. `link`는 `href`와 optional `title`만 normal form에 남는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `NoteDocumentSchema` 유지 | 유지 확정 | 현재 editor model, validation, 테스트의 exact schema authority다. |
| `normalizeDocument` 유지 | 유지 확정 | command/import/bootstrap 이후 모델을 stable shape으로 모으는 내부 normalizer다. |
| public `NoteDocumentSchema` export | 제거 확정 | public schema 객체 노출은 consumer가 internal Zod shape에 결합하게 만든다. 현재 public seam은 `parseNoteDocument`다. |
| Markdown을 canonical schema로 취급 | 제거 확정 | Markdown은 import/export adapter이며, cursor/selection/history는 structured document 위에서 동작한다. |
| inline atom 양옆 empty text sentinel 강제 | 제거 확정 | normalizer/test 기준으로 atom은 merge boundary일 뿐, sentinel text node를 양옆에 강제하지 않는다. |
| 지금 migration system 추가 | 보류 | `schemaVersion: 1`만 있는 현재 상태에서 version 2 migration API를 먼저 만들 근거는 부족하다. |
| 지금 generated public schema docs 추가 | 보류 | public persisted import/export 요구가 넓어질 때 `parseNoteDocument` error shape, migration, generated docs를 함께 설계해야 한다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| canonical structured document | 확정 | `NoteDocumentSchema`가 `schemaVersion: 1`, metadata, root, block/inline/mark shape를 닫고, `note document split tests`가 initial document와 persisted parse examples를 schema-valid로 검증한다. | Public Zod schema object export를 뜻하지 않는다. Public validation seam은 `parseNoteDocument`다. |
| block set and block defaults | 확정 | `noteDocument.ts`의 block schemas와 `note document split tests`가 paragraph/heading/quote/listItem/codeBlock/figure를 current block set으로 검증하고, heading/list/code defaults를 확인한다. | Table/task/embed/caption 같은 richer container block은 현재 schema 밖이다. |
| inline and mark set | 확정 | `InlineNodeSchema`, `MarkSchema`, `normalizer.test.ts`가 text/mention inline, bold/italic/code/link marks, mark ordering/deduplication, link href/title preservation을 고정한다. | Additional marks, mark exclusivity, plugin-defined inline nodes는 아직 없다. |
| persisted safe link validation | 확정 | `note document split tests`와 public facade tests가 unsafe persisted link href를 schema/parse failure로 거절한다고 검증한다. | Legacy unsafe URL을 sanitize/drop/migrate할지는 migration policy로 닫지 않았다. |
| document and inline fallback | 확정 | `normalizer.test.ts`가 empty document를 empty paragraph로 만들고, empty inline text block을 single empty text child로 유지한다고 검증한다. | Empty-title UX나 persisted import diagnostics는 이 normalizer contract가 아니다. |
| empty text pruning and adjacent merge | 확정 | `normalizer.test.ts`가 placeholder가 아닌 empty text run 제거, adjacent same-mark text merge, mention atom merge boundary, atom sentinel 미삽입을 직접 검증한다. | Cursor/DOM 측정용 transient empty leaf policy는 view/geometry 영역에서 별도로 다룬다. |
| attrs preservation/removal split | 확정 | `normalizer.test.ts`가 document/root/block/atom attrs 보존과 mark attrs 제거를 검증하고, attrs audit이 renderer/Markdown non-projection을 분리한다. | Preserved attrs를 누가 해석하는지, reserved namespace가 있는지는 미정이다. |
| codeBlock compatibility shape | 확정 | `note document split tests`와 code block audit이 `text` canonical field, missing `text`/`children` defaults, legacy `children` preservation, `readBlockText`의 `text` read path를 검증한다. | Compatibility support window, text/children mismatch diagnostics, future code child/token model은 미정이다. |
| schemaVersion 1 no-migration behavior | 확정 | `note document split tests`, `editorCore split tests`, schema migration audit이 unsupported version parse/replace failure, generic reason, no-mutation behavior를 고정한다. | Version 2 migration location, support period, destructive migration semantics는 아직 제품/API 결정이 없다. |
| id and duplicate-id current behavior | 확정 | `note document split tests`와 identity audit이 non-empty ids, local generated block id, duplicate block id schema acceptance, renderer/debug tolerance를 분리해 고정한다. | Global uniqueness, route/storage binding, collaboration identity ownership은 미정이다. |
| field-level diagnostics | 미정 | Current public parse/replace failure는 generic `"Document is invalid."`로 닫혀 있다. | Import UX가 필요하면 raw Zod issue 대신 좁은 error DTO를 별도 설계해야 한다. |
| normal form evolution policy | 미정 | Current schemaVersion 1과 normalizer behavior는 닫혔지만 v2 schema, legacy payload corpus, compatibility matrix가 없다. | Migration, diagnostics, attrs/media/id/codeBlock compatibility를 한 번에 설계해야 한다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| schema migration policy | `schemaVersion: 1` literal, generic parse/replace failure, no automatic migration은 확정했다. Version 2 이상 문서나 legacy document를 자동 변환하는 경로는 없다. | migration을 `parseNoteDocument` 내부에 숨길지, 별도 migration API로 둘지 결정해야 한다. |
| field-level diagnostics | public failure reason은 generic하다. Zod issue shape을 public contract로 노출하지 않는다. | 외부 import UX가 필요해지면 좁은 error DTO를 별도 설계해야 한다. |
| id persistence/collaboration policy | non-empty ids, local `block-N` generation, duplicate render tolerance, debug duplicate diagnostics는 확정했다. Global uniqueness, route/storage binding, collaboration ownership은 닫지 않았다. | persisted document identity, merge/conflict 요구가 생기면 id generation/ownership 정책을 정해야 한다. |
| attrs semantic ownership | document/root/block/atom attrs 보존과 mark attrs 제거는 확정했지만, preserved attrs를 누가 해석하는지는 닫지 않았다. | attrs를 internal metadata로만 둘지, product extension surface로 둘지 결정해야 한다. |
| figure/media source trust policy | `figure.src` non-empty, optional `alt`, block atom rendering, `/sample-figure.svg` fixture, Markdown image syntax는 확정했다. URL trust, upload, proxy, sanitization 정책은 없다. | external media import/export나 upload가 필요해지면 media source policy를 별도 설계해야 한다. |
| codeBlock compatibility policy | `codeBlock.children`은 compatibility field이고 canonical code text는 `text` field라는 경계는 확정했다. | legacy payload support 기간, text/children mismatch diagnostics, future code child model은 별도로 결정해야 한다. |
| nested/container blocks | table, task list, nested list, figure caption, embed variants 같은 richer tree shape은 현재 schema 밖이다. | 실제 feature 요구가 생기면 block set 확장과 migration을 함께 설계해야 한다. |

## 현재 결론

현재 뺄 수 없는 확정은 `NoteDocumentSchema`와 `normalizeDocument`가 닫은
structured document normal form이다. 문서 상태는 schemaVersion 1의 structured
`NoteDocument`이고, Markdown/DOM은 각각 adapter/view 역할로 제한된다.

아직 확정하면 안 되는 것은 이 normal form의 evolution policy다. Future migration
interface/support policy, field-level diagnostics, attrs semantic ownership, media
trust, codeBlock compatibility policy, global/collaboration id policy, nested
container support는 현재 테스트 통과만으로 닫힌 계약이 아니다.
