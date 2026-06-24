# Editor identity policy audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `NoteDocument.id`, block `id`, generated local
block ids, duplicate-id handling이 어디까지 확정인지와 아직 보류해야 하는
persistence/collaboration identity policy를 분리한다.

## 목적

문서와 block에는 `id`가 있다. 하지만 non-empty id field가 있다고 해서 URL route,
storage key, global uniqueness, multi-client ownership, conflict resolution policy가
이미 닫힌 것은 아니다.

이 문서는 current local editor identity behavior와 future persistence/collaboration
identity policy를 나눈다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/noteDocument.ts` | `NoteDocument.id`, document root id, block/atom ids는 non-empty string이다. `createGeneratedBlockId()`는 module-local `block-N` counter를 증가시킨다. |
| `note document split tests` | generated block id가 initial demo block ids와 충돌하지 않고, sequential local `block-N` 형태로 증가하는 것을 검증한다. |
| `src/editor/internal/model/text-command/textCommands.ts` | 새 paragraph block을 만들 때 `createParagraphBlock()`을 쓰고, imported block fragment는 `withFreshBlockIds`/`ensureUniqueBlockIds`로 current command result 안에서 fresh ids를 부여한다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | block render key는 block id를 기본으로 쓰되 duplicate id가 있으면 occurrence suffix를 붙여 React duplicate-key warning을 피한다. |
| `DocumentRenderer split tests` | duplicate block id가 있어도 renderer가 duplicate-key warning을 내지 않는 것을 검증한다. |
| `src/editor/internal/debug/interaction-recorder/debugInteractionSnapshot.ts` | debug snapshot은 block ids와 duplicate block ids를 요약한다. |
| `debug interaction split tests` | duplicate block id가 있는 document를 reject하지 않고 snapshot inventory에 중복 id를 기록하는 것을 검증한다. |
| `src/editor/internal/debug/interaction-recorder/debugInteractionReport.ts` | duplicate block ids는 debug report diagnostic으로 올라간다. |
| `docs/editor-document-metadata-surface-audit.md` | `NoteDocument.id`는 schema metadata field지만 current route/storage identity로 연결되지 않는다고 정리한다. |
| `docs/editor-app-route-embedding-audit.md` | current app route는 `/` 하나이며 `/documents/:id` route identity contract가 없다. |

## 확정 identity behavior

| 항목 | 확정 내용 |
| --- | --- |
| document id shape | `NoteDocument.id` is a required non-empty string. |
| root id shape | `DocumentRoot.id` is a required non-empty string. Current factory uses `"root"`. |
| block id shape | Block/atom ids are required non-empty strings. |
| local generated block ids | `createGeneratedBlockId()` returns sequential `block-N` ids from a module-local counter seeded above the initial demo ids. |
| paragraph helper ids | `createParagraphBlock()` uses the local generated block id helper. |
| fragment insertion ids | Imported block fragments are assigned fresh block ids in current command results. |
| duplicate ids accepted by schema | The schema does not enforce document-wide block id uniqueness. |
| duplicate render tolerance | Renderer avoids duplicate React keys by adding occurrence suffixes internally. |
| duplicate debug visibility | Debug snapshot/report surfaces duplicate block ids as diagnostics/inventory. |
| route identity absence | Current app route is a single editor host and does not bind `NoteDocument.id` to URL/storage identity. |

## 증거 강도

| 판정 대상 | 강도 | 근거 |
| --- | --- | --- |
| document/root/block id shape | source/schema 확정 | `NoteDocumentSchema`, `DocumentRootSchema`, block schemas가 `id`를 non-empty string으로 받는다. |
| local generated block ids | 실행 테스트로 확정 | `note document split tests`가 `createGeneratedBlockId()`의 `block-N` 형태, monotonic 증가, initial demo id non-collision을 검증한다. |
| paragraph helper ids | 실행 테스트로 확정 | `note document split tests`가 `createParagraphBlock()` id가 initial demo block ids와 충돌하지 않는다고 검증한다. |
| imported fragment fresh ids | 실행 테스트로 확정 | inputAdapter split tests가 Markdown block paste 결과의 block ids가 unique이고 imported markdown ids를 그대로 쓰지 않는다고 검증한다. |
| duplicate ids schema acceptance | 실행 테스트로 확정 | `note document split tests`가 duplicate block id document를 schema-valid data로 받는다고 검증한다. |
| duplicate render tolerance | 실행 테스트로 확정 | `DocumentRenderer split tests`가 duplicate block ids를 렌더해도 React duplicate-key warning을 내지 않는다고 검증한다. |
| duplicate debug inventory | 실행 테스트로 확정 | `debug interaction split tests`가 duplicate block ids를 reject하지 않고 snapshot inventory에 기록한다고 검증한다. |
| duplicate debug report diagnostic | 실행 테스트로 확정 | `debug interaction split tests`가 duplicate block ids를 debug report `error` diagnostic과 formatted final document duplicate line으로 올린다고 검증한다. |
| route/storage binding absence | source/docs 확정 | current route source는 `/` host뿐이고 route/storage/document list가 `NoteDocument.id`를 소유하지 않는다. |
| schema-fatal unique id validation | 미정 | duplicate ids are schema-valid today. Reject/rewrite/warn policy needs import/persistence migration design. |
| global/collaboration id ownership | 미정 | current generator is module-local and has no client/session/document ownership source. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| non-empty id fields | 유지 확정 | Selection paths, render/debug identity, and persisted document metadata need stable string ids. |
| local `block-N` generator | 유지 확정 | Current editor commands need fresh ids for local inserted blocks and fragments. |
| duplicate render key suffixing | 유지 확정 | It makes the view tolerant of schema-valid duplicate ids without turning rendering into the validation layer. |
| duplicate-id debug diagnostics | 유지 확정 | Duplicate ids are suspicious enough to report but not currently schema-fatal. |
| schema-level unique block id validation | 보류 | Adding hard uniqueness would reject currently schema-valid payloads and needs migration/import diagnostics. |
| global UUID/id provider | 보류 | There is no persistence/collaboration backend or second writer requiring distributed id ownership. |
| route/storage binding for `NoteDocument.id` | 보류 | Current app has only `/`; storage/autosave and document list scope are not implemented. |
| collaboration identity policy | 보류 | Remote client ids, node ownership, conflict resolution, and document version binding require a separate data layer. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| block id uniqueness contract | Schema accepts duplicates, renderer tolerates them, debug reports them. Whether duplicates should become parse errors is not decided. | persisted import UX가 필요하면 duplicate handling을 reject, rewrite, or warn 중 하나로 정한다. |
| id generator scope | Current generator is module-local and runtime-local. It does not encode document id, session id, or client id. | multi-document or collaboration scope가 생기면 per-document/session/client id source를 설계한다. |
| document id ownership | `NoteDocument.id` is persisted metadata but not route/storage key today. | document list, autosave, route loader가 생기면 URL/storage identity와 schema id 관계를 정한다. |
| imported node identity | Supported block fragment insertion gives fresh block ids, but rich node graph paste identity/topology restore is absent. | same-app rich paste가 필요하면 node identity preservation vs reminting policy를 정한다. |
| debug diagnostic severity | Duplicate ids are report diagnostics, not schema errors. | release/import gate에서 duplicate ids를 얼마나 강하게 다룰지 결정한다. |

## 현재 결론

뺄 수 없는 확정은 local editor가 non-empty ids를 쓰고, generated block ids를 local
`block-N` counter로 만들며, duplicate block ids를 renderer/debug layer에서 견딘다는
점이다.

아직 확정하면 안 되는 것은 id를 global uniqueness, route/storage identity,
collaboration ownership, schema-fatal duplicate validation으로 승격하는 것이다. 현재
올바른 판정은 local editing identity는 유지하되, persistence/collaboration identity
policy는 별도 제품/data-layer 결정으로 남기는 것이다.
