# Editor document metadata surface audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `NoteDocument`의 `id`, `title`, `tags`와
React `BlockEditor` title input이 어디까지 확정 document metadata surface인지,
그리고 어디부터 제품 문서 관리/저장 정책인지 분리한다.

## 목적

Document metadata는 본문 command model과 다르다. `title`은 현재 화면에서 직접
편집되지만, document routing, list, storage, tags management까지 닫힌 것은 아니다.

이 문서는 제목과 metadata를 document normal form의 일부로 확정하되, 제품 문서
관리 API로 과하게 승격하지 않는다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/noteDocument.ts` | `NoteDocumentSchema`는 `schemaVersion: 1`, non-empty `id`, string `title`, string array `tags`, optional document `attrs`, `root`를 정의한다. |
| `src/editor/internal/model/noteDocument.test.ts` | initial document, helper-created documents, rich block variants, persisted unsafe link rejection을 검증한다. |
| `src/editor/internal/model/editorCore.ts` | `createEditor()` snapshot/query는 full `NoteDocument`를 반환하고, `replaceDocument`는 schema-valid document만 받는다. |
| `src/editor/public/index.test.ts` | persisted JSON의 `id`, `title`, `tags`를 `parseNoteDocument`로 좁힌 뒤 `createEditor({ initial })`에 넘기는 path를 검증한다. |
| `src/editor/internal/model/markdown.ts` | `importMarkdown(markdown, { id, title, tags })` options로 document metadata를 주입한다. Markdown heading은 content block이지 document title로 자동 승격되지 않는다. |
| `src/editor/internal/react/BlockEditor.tsx` | title input은 `document.value.title`에 controlled되고 change 시 `document.replace("/title", value)`를 호출한다. `readOnly`에서는 no-op이다. |
| `src/editor/internal/react/BlockEditor.test.tsx` | editable title change가 document history에 들어가 undo/redo로 복원되고, read-only title change가 document를 mutate하지 않는 것을 검증한다. |
| `docs/editor-public-export-audit.md` | `initialNoteDocument`와 `createNoteDocument`는 internal demo/helper로 유지하되 public export에서 제거했다고 정리한다. |
| `docs/editor-public-schema-audit.md` | public validation seam은 Zod schema export가 아니라 `parseNoteDocument(value)`라고 정리한다. |
| `docs/editor-identity-policy-audit.md` | local generated block ids, duplicate-id tolerance, and future persistence/collaboration identity policy를 분리한다. |

## 확정 metadata behavior

| 항목 | 확정 내용 |
| --- | --- |
| metadata fields | Current persisted document shape에는 `id`, `title`, `tags`, optional `attrs`가 있다. |
| `id` validation | document `id`는 non-empty string이어야 한다. Empty `id` persisted document는 generic parse failure다. |
| `title` shape | document `title`은 string이다. Empty title을 거절하는 validation은 현재 없다. |
| `tags` shape | document `tags`는 string array다. Tag uniqueness, slugging, color, ordering policy는 없다. |
| canonical field | Title은 DOM placeholder나 first heading에서 파생하지 않고 `NoteDocument.title` field에 저장된다. |
| React title input | `BlockEditor`는 `aria-label="Title"` input을 렌더링하고 `document.value.title`을 value로 둔다. |
| title mutation | editable title change는 `document.replace("/title", value)`로 canonical JSON document를 mutate한다. |
| title history | editable title change는 same JSON document history에 들어가 toolbar Undo/Redo로 되돌리고 다시 적용할 수 있다. |
| read-only guard | `BlockEditor readOnly`에서 title input은 `readOnly` 속성을 갖고 change handler가 document title을 바꾸지 않는다. |
| default demo metadata | `initialNoteDocument`는 internal demo/default seed로 `title: "Rich note"`와 demo tags를 가진다. Public runtime export는 아니다. |
| internal helper defaults | `createNoteDocument`는 internal helper로 default `id: "note-test"`, `title: "Untitled"`, `tags: []`를 채운다. Public constructor contract는 아니다. |
| persisted parse seam | unknown persisted JSON은 public `parseNoteDocument(value)`를 통과해야 `NoteDocument`로 좁혀진다. |
| markdown metadata injection | Markdown import는 options로 `id`, `title`, `tags`를 받는다. First heading을 document title로 자동 추출하지 않는다. |
| no route identity contract | current app route는 단일 `/` editor host다. `NoteDocument.id`가 URL route, storage key, or document list identity로 연결된 것은 아니다. Local id behavior는 identity audit에서 별도 확정했다. |

## 증거 강도

| 판정 대상 | 강도 | 근거 |
| --- | --- | --- |
| metadata schema fields | source/schema 확정 | `NoteDocumentSchema`는 non-empty `id`, string `title`, string-array `tags`, optional document `attrs`, `root`를 가진다. |
| document id validation | 실행 테스트로 확정 | `noteDocument.test.ts`가 empty document `id`를 schema-invalid로 검증한다. |
| empty title current behavior | 실행 테스트로 확정 | `noteDocument.test.ts`가 empty `title`을 schema-valid로 받는다고 검증한다. 이는 product empty-title UX가 닫혔다는 뜻은 아니다. |
| tags current behavior | 실행 테스트로 확정 | `noteDocument.test.ts`가 duplicate string tags를 그대로 보존한다고 검증한다. Tag uniqueness/slug/color/order policy는 없다. |
| public persisted parse seam | 실행 테스트로 확정 | `src/editor/public/index.test.ts`가 persisted JSON을 `parseNoteDocument(value)`로 좁혀 headless editor initial document로 넘기는 path를 검증한다. |
| React title input and mutation | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 editable title input, `/title` mutation, Undo/Redo 복원을 검증한다. |
| read-only title guard | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 `readOnly` title input과 non-mutating change behavior를 검증한다. |
| Markdown metadata options | 실행 테스트로 확정 | `markdown.test.ts`가 `importMarkdown(markdown, { id, title, tags })`가 document metadata를 주입한다고 검증한다. |
| first heading non-title behavior | 실행 테스트로 확정 | `markdown.test.ts`가 first heading을 document title로 승격하지 않고 heading block으로 유지한다고 검증한다. |
| demo/helper metadata non-public | boundary/docs 확정 | `initialNoteDocument`와 `createNoteDocument`는 internal demo/helper이고 public export surface가 아니라고 public export/schema audits와 boundary tests가 막는다. |
| route/storage identity absence | source/docs 확정 | current app route는 `/` host뿐이고 route/storage/document list가 `NoteDocument.id`를 소유하지 않는다. |
| tags UI/API, frontmatter, metadata commands | 미정 | schema/import fields는 있지만 React tags UI, Markdown frontmatter, `setTitle`/`setTags` public command, autosave/storage semantics는 없다. |
| title/body separate history policy | 미정 | current title change는 same JSON document history에 들어간다. 별도 metadata history로 분리할지는 제품 UX 결정이다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `NoteDocument.id/title/tags` fields | 유지 확정 | persisted document shape, public `NoteDocument` type, parser, demo editor가 모두 이 fields를 포함한다. |
| React title input | 유지 확정 | 현재 앱에서 document title을 편집하는 유일한 UI이고 read-only/title history tests가 있다. |
| title change as JSON document mutation | 유지 확정 | 별도 title store를 만들면 document snapshot/history와 drift가 생긴다. 현재 JSON document path replace가 더 작은 interface다. |
| `initialNoteDocument` public export | 제거 확정 | demo metadata를 public caller contract로 보장할 근거가 없다. |
| `createNoteDocument` public export | 제거 확정 | helper default metadata policy를 public constructor처럼 보이게 만든다. Public seam은 parse/initial document injection이다. |
| first heading as title source | 제거 확정 | Markdown heading is content. 현재 import/export path와 editor title input은 document title field를 별도로 둔다. |
| title-only public command | 보류 | `createEditor()`는 `replaceDocument`와 full document query를 제공하지만 `setTitle` 같은 command는 없다. 실제 embedding 요구 없이 command surface를 늘릴 근거가 부족하다. |
| tags UI/API 추가 | 보류 | Schema field는 있지만 current React surface는 tags를 표시/편집하지 않는다. 제품 문서 관리 요구가 필요하다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| title undo grouping | 현재 title change는 same JSON document history에 들어간다. 하지만 title edit을 body typing history와 같은 undo stack으로 둘지, separate metadata history로 둘지는 제품 UX로 닫지 않았다. | title/body undo semantics를 제품 기준으로 분리해야 하는 요구가 생기면 history grouping policy와 같이 결정한다. |
| autosave/persistence | document metadata fields는 있지만 storage adapter, autosave, dirty state, conflict handling은 없다. | document product app이 되면 route/data-loading/storage adapter와 같이 설계한다. |
| document identity route | `id`는 schema field지만 `/documents/:id` route나 list selection source가 없다. | multi-document app scope가 생기면 route identity, storage key, migration을 함께 정한다. |
| tag semantics | `tags: string[]` shape만 있다. tag normalization, uniqueness, search/filter, color, ordering은 없다. | tags가 UI/product feature가 될 때 semantics를 좁게 설계한다. |
| empty title policy | schema allows empty string and title input accepts it. Placeholder/default title UX는 닫지 않았다. | product UX가 필요하면 validation/defaulting/display fallback을 정한다. |
| metadata public commands | `createEditor()` has no `setTitle`, `setTags`, `updateMetadata` command. Full `replaceDocument` can change metadata if caller has a valid document. | embedding caller가 metadata-only mutation을 요구하면 command surface와 history semantics를 같이 설계한다. |
| metadata import/export mapping | Markdown import options can set metadata, but supported Markdown document does not encode title/tags frontmatter. | frontmatter/import/export 요구가 생기면 Markdown compatibility policy와 같이 결정한다. |
| collaboration id policy | non-empty ids, local block id generation, duplicate-id debug visibility는 확정했다. Multi-client/global id ownership is not defined. | collaboration/storage 요구가 생기면 document identity and node id policy를 schema evolution과 같이 정한다. |

## 현재 결론

뺄 수 없는 확정은 metadata가 `NoteDocument` normal form의 일부라는 점과 React
`BlockEditor` title input이 canonical `/title` mutation으로 동작한다는 점이다.
Editable title change는 JSON document history에 들어가 Undo/Redo로 복원되고,
read-only에서는 title mutation도 막힌다.

아직 확정하면 안 되는 것은 document app identity, storage/autosave, tags UI,
empty-title UX, title/body separate history, title-only public commands,
Markdown frontmatter, global/collaboration id policy다. 현재 올바른 형태는 metadata
fields를 schema와 React title surface로 유지하되, 제품 문서 관리 API로는
승격하지 않는 것이다.
