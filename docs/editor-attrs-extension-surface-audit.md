# Editor attrs extension surface audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `NoteDocumentSchema`의 optional `attrs` fields가
어디까지 persisted compatibility shape인지, 그리고 어디부터 public/product
extension contract인지 분리한다.

## 목적

`attrs`는 schema 여러 곳에 존재한다. 하지만 존재한다고 해서 renderer, Markdown,
commands, public API가 arbitrary extension data를 end-to-end 보장한다는 뜻은 아니다.

이 문서는 `attrs`를 제거하면 안 되는 schema compatibility surface와, 아직 확정하면
안 되는 extension/plugin contract를 나눈다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/noteDocument.ts` | `AttrsSchema`는 JSON object이고 document/root/block/atom/mark schema 일부에 optional로 존재한다. |
| `src/editor/internal/model/normalizer.ts` | document/root/block/atom attrs는 object spread로 보존하지만 text mark attrs는 canonical mark normalization에서 제거한다. Link mark는 `href`와 optional `title`만 남긴다. |
| `src/editor/internal/model/normalizer.test.ts` | document/root/block/mention attrs 보존과 mark attrs 제거/link target field 보존을 검증한다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | renderer는 attrs를 DOM attribute, style, dataset, plugin hook으로 투영하지 않는다. Heading/list/code/figure는 typed fields를 사용한다. |
| `src/editor/internal/model/markdown.ts` | Markdown import/export는 typed block/inline/mark fields만 표현하고 attrs를 frontmatter or extension syntax로 round-trip하지 않는다. |
| `docs/editor-document-normal-form-audit.md` | attrs 보존/삭제 경계는 이 문서로 좁히고, semantic ownership은 normal form evolution policy로 남긴다. |
| `docs/editor-public-export-audit.md` | public surface는 `NoteDocument` type과 `parseNoteDocument` seam을 유지하지만 Zod schema object와 subtype constructors는 숨긴다. |

## 확정 attrs behavior

| 항목 | 확정 내용 |
| --- | --- |
| JSON shape | `attrs` value는 JSON object shape다. Primitive top-level attrs value는 schema 밖이다. |
| document attrs | `NoteDocument.attrs`는 schema-valid optional field이고 normalizer가 보존한다. |
| root attrs | `DocumentRoot.attrs`는 schema-valid optional field이고 normalizer가 보존한다. |
| block attrs | Element and figure block attrs는 schema-valid optional field이고 normalizer가 보존한다. |
| inline atom attrs | Mention inline atom attrs는 schema-valid optional field이고 normalizer가 보존한다. |
| mark attrs accepted | Bold, italic, code, link mark schemas accept optional attrs at parse time. |
| mark attrs canonicalization | Normalizer removes mark attrs from all marks. Link mark keeps only `type`, `href`, optional `title`. |
| typed field precedence | Heading level, list ordered/depth, code language/text, figure src/alt, mention label/id are typed fields, not attrs-only semantics. |
| renderer behavior | Renderer ignores attrs and renders from typed fields plus stable classes/data paths. |
| Markdown behavior | Markdown adapter does not encode input attrs or parse attrs extension syntax. Markdown round-trip is not an arbitrary attrs preservation contract. |
| public schema object hidden | `NoteDocumentSchema` is internal. Public callers get `NoteDocument` type and `parseNoteDocument`, not the Zod attrs implementation. |

## 증거 강도

| 판정 대상 | 강도 | 근거 |
| --- | --- | --- |
| attrs schema shape | source/schema 확정 | `AttrsSchema`는 JSON object이고 document/root/block/atom/mark schema 일부에 optional로만 붙어 있다. Primitive top-level attrs는 schema 밖이다. |
| document/root/block/inline atom attrs preservation | 실행 테스트로 확정 | `normalizer.test.ts`가 document/root/block/mention attrs 보존과 empty child normalization을 함께 검증한다. |
| mark attrs canonicalization | 실행 테스트로 확정 | `normalizer.test.ts`가 bold/link mark attrs 제거와 link `href`/`title` 보존을 검증한다. |
| renderer attrs non-contract | 실행 테스트로 확정 | `DocumentRenderer split tests`가 document/root/block/mention/figure/mark attrs sentinel이 DOM 문자열이나 attribute로 투영되지 않는다고 검증한다. |
| Markdown attrs non-round-trip | 실행 테스트로 확정 | markdown split tests가 export가 attrs sentinel을 쓰지 않고 import 결과에도 sentinel extension attrs가 복원되지 않는다고 검증한다. Factory-generated typed-field echo attrs는 external attrs syntax가 아니다. |
| typed field precedence | source/test로 확정 | renderer와 Markdown은 heading/list/code/figure/mention의 typed fields를 읽고, attrs를 대체 semantic field로 보지 않는다. 일부 factory가 typed field를 attrs에 echo해도 consumers는 typed fields를 사용한다. |
| public schema object hidden | verifier/public facade로 확정 | public runtime facade는 `NoteDocument`/`parseNoteDocument`만 제공하고 `NoteDocumentSchema`/subtype constructors는 숨긴다. |
| attrs semantic ownership/reserved namespace/plugin hooks/schema-aware exporter | 미정 | 보존되는 metadata slot은 있지만 해석 주체, key policy, renderer hook, rich import/export fidelity contract가 없다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `AttrsSchema` in persisted document schema | 유지 확정 | Existing schema/design allows opaque JSON metadata on document/root/block/atom. Removing it would reject currently schema-valid payloads. |
| document/root/block/atom attrs preservation | 유지 확정 | Normalizer preserves these fields, so dropping them would be a behavioral contraction. |
| mark attrs preservation | 제거 확정 | Current normal form intentionally canonicalizes marks to supported semantic fields. Mark attrs are accepted by schema but not part of canonical mark semantics. |
| attrs-driven rendering | 제거 확정 | Renderer uses typed fields and fixed class/data-path surfaces. attrs are not a DOM rendering contract. |
| attrs Markdown round-trip | 제거 확정 | Supported Markdown syntax has no attrs representation in current adapter. |
| public attrs plugin API | 보류 | There is no second consumer/plugin system. Promoting attrs to extension API would add a broad contract without current caller evidence. |
| generated attrs docs | 보류 | Because schema object is internal and semantics are partially non-preserving, generated public docs would overstate the contract. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| attrs semantic ownership | document/root/block/atom attrs are preserved but no module interprets them. | attrs를 internal metadata로만 둘지, product extension surface로 둘지 결정해야 한다. |
| allowed attrs keys | Schema accepts arbitrary JSON object keys. Reserved key namespace, collision policy, and migration policy are absent. | plugin/custom node 요구가 생기면 namespace policy를 먼저 정한다. |
| mark attrs future | Mark attrs are accepted then normalized away. Future color/comment/data marks would need typed mark fields or a different preservation policy. | additional mark 요구가 생기면 mark schema, normalizer, renderer, Markdown policy를 함께 설계한다. |
| persistence migration | attrs shape is open but no migration/versioning policy says which attrs are stable across versions. | persisted external documents가 생기면 attrs migration and compatibility policy를 세운다. |
| import/export fidelity | Markdown and clipboard text envelopes do not preserve attrs. | rich import/export 요구가 생기면 text/markdown envelope보다 강한 node payload or schema-aware exporter를 별도 설계한다. |
| renderer/plugin hooks | Renderer ignores attrs. Custom rendering or DOM data projection is not available. | custom block/inline rendering 요구가 생기면 renderer extension interface를 설계한다. |

## 현재 결론

뺄 수 없는 확정은 `attrs`가 current persisted schema의 JSON metadata field로
존재하고, document/root/block/inline atom attrs는 normalizer가 보존한다는 점이다.

아직 확정하면 안 되는 것은 attrs를 public plugin API, renderer behavior,
Markdown/frontmatter round-trip, mark metadata preservation, reserved namespace로
승격하는 것이다. 특히 mark attrs는 schema가 받아도 current normal form에서는
canonical mark fields만 남긴다. 현재 올바른 판정은 attrs를 schema compatibility
surface로 유지하되, 제품 extension contract로 과장하지 않는 것이다.
