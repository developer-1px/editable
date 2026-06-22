# Editor Markdown Adapter Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `src/editor/internal/model/markdown.ts`가
canonical editor model인지, clipboard/import/export adapter인지, 그리고 어디까지
Markdown 호환을 확정할 수 있는지 구분한다.

## 판정

Markdown은 canonical editor state가 아니다. canonical state는 structured
`NoteDocument`이고, Markdown은 internal model adapter다. 현재 유지 확정 interface는
`importMarkdown(markdown, options)`, `exportMarkdown(document)`,
`exportInlineMarkdown(children)`다.

확정 가능한 범위는 “지원하는 rich model fragment를 deterministic Markdown-ish text로
import/export한다”까지다. 지원 범위는 paragraph, heading, quote, list item, fenced
code block, figure image syntax, bold/italic/code/link marks, mention fallback
syntax, safe link href filtering, paragraph hard line break round-trip, block-syntax
escape, code fence/backtick edge cases다.

확정하면 안 되는 것은 CommonMark/GFM 전체 호환, WYSIWYG Markdown source mode,
public Markdown export API, media/figure `src` trust policy, HTML/raw Markdown
extension, table/task-list/frontmatter 같은 product import scope다.

## 확정 근거

| 주제 | 확정 동작 | 근거 |
| --- | --- | --- |
| canonical model separation | Markdown source text가 rich editor model이 아니고 structured JSON이 canonical model이다. | `rich-model-design.md`, `editor-issues.md` Rich Model Replan |
| import block coverage | heading, paragraph, quote, list item, fenced code block, figure image syntax를 model block으로 만든다. | `markdown.test.ts` |
| import inline coverage | bold, italic, inline code, safe link, mention fallback syntax를 inline model node/mark로 만든다. | `markdown.test.ts`, `inputAdapter.test.ts` |
| safe link import | unsafe markdown link href는 link mark로 쓰지 않고 label text만 보존한다. safe relative/http/https/mail/tel link는 mark로 보존한다. | `markdown.test.ts`, `inputAdapter.test.ts`, `editor-link-mark-audit.md` |
| export supported shapes | supported rich model shapes는 stable markdown string으로 export되고 다시 import/export round-trip 된다. | `markdown.test.ts` |
| deterministic atom fallback | mention은 `@[label](mention:id)`, figure는 image syntax로 fallback serialization 된다. | `markdown.test.ts`, `clipboard.test.ts` |
| source delimiter independence | import 후 editor command cursor offsets는 visible model text 기준이고 markdown delimiter offsets에 의존하지 않는다. | `markdown.test.ts`, `rich-model-design.md` |
| clipboard fallback | selection copy uses `text/markdown` and custom MIME `markdown` as deterministic rich-ish fallback, while paste/drop treats markdown only when transfer format says markdown. | `clipboard.ts`, `clipboard.test.ts`, `inputAdapter.test.ts`, `BlockEditor.test.tsx` |
| plain paste guard | markdown-looking plain text paste stays plain text unless the transfer format is markdown. | `inputAdapter.test.ts` |
| escaping and round-trip guards | inline code punctuation, paragraph newlines, leading/trailing spaces, paragraph text that looks like block syntax, internal code fences, malformed percent escapes, escaped link titles are covered. | `markdown.test.ts` |
| public facade non-exposure | `importMarkdown`, `exportMarkdown`, `exportInlineMarkdown`는 public runtime facade에 없고, verifier가 direct export, aliased export-from, import-then-export alias, namespace 재노출, internal implementation `export *`/`export * as` 누수를 막는다. | `src/editor/public/index.test.ts`, `scripts/verify-editor-boundaries.mjs`, `scripts/verify-editor-boundaries.test.mjs` |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| canonical model separation | 설계 문서와 실행 테스트로 확정 | `rich-model-design.md`가 structured `NoteDocument`를 canonical model로 두고, `markdown.test.ts`는 import 뒤 editor command cursor offsets가 Markdown delimiter가 아니라 visible model text 기준임을 검증한다. |
| import block coverage | 실행 테스트로 확정 | heading, paragraph, quote, list item, fenced code block, figure image syntax가 model block으로 들어오는 것을 `markdown.test.ts`가 고정한다. |
| import inline coverage | 실행 테스트로 확정 | bold, italic, inline code, safe link, mention fallback syntax가 inline text mark 또는 atom으로 들어오는 것을 `markdown.test.ts`와 markdown paste tests가 검증한다. |
| safe link import | 실행 테스트로 확정 | unsafe markdown link href는 label text만 보존하고 safe relative/http/https/mail/tel link는 mark로 보존하는 정책이 `markdown.test.ts`와 `inputAdapter.test.ts`에 있다. |
| supported export and round-trip | 실행 테스트로 확정 | supported rich model shapes, inline code punctuation, paragraph newlines/spaces, block-syntax-looking paragraph text, code fence edge cases, escaped link/image syntax가 stable export/import round-trip으로 고정돼 있다. |
| deterministic atom fallback | 실행 테스트로 확정 | mention은 `@[label](mention:id)`, figure는 image syntax로 export되고 다시 import되는 경로가 `markdown.test.ts`와 clipboard tests에 있다. |
| clipboard markdown fallback | 실행 테스트로 확정 | copy는 `text/markdown`과 custom MIME markdown fallback을 만들고, paste/drop은 transfer format이 markdown일 때만 rich paste path로 들어가는 것을 clipboard/input/React tests가 검증한다. |
| markdown-looking plain paste guard | 실행 테스트로 확정 | plain text paste가 markdown처럼 보여도 transfer format이 plain이면 text insertion으로 처리되는 것을 `inputAdapter.test.ts`가 고정한다. |
| public facade non-exposure | public facade/boundary 테스트로 확정 | `src/editor/public/index.test.ts`는 runtime 비노출을 확인하고, boundary verifier tests는 direct/aliased/import-then-export/namespace/star leak을 막는다. |
| CommonMark/GFM full compatibility | 미정 | 현재 parser는 local deterministic adapter이며 tables, task lists, footnotes, HTML blocks, nested emphasis edge cases는 compatibility matrix로 닫지 않았다. |
| public Markdown import/export API | 미정 | 현재는 internal paste/clipboard/test adapter다. 외부 API로 승격하려면 error shape, migration, sanitization, compatibility table을 같이 설계해야 한다. |
| Markdown source mode | 미정 | current editor는 Markdown delimiter source text를 직접 편집하지 않는다. source mode가 필요하면 rich model editor와 별도 interface가 필요하다. |
| figure/media source trust and node graph restore | 미정 | figure image syntax round-trip은 확정했지만 media URL trust policy, future schema-specific payload, selection topology, node identity restore는 없다. |
| generated compatibility docs | 미정 | behavior는 tests/audits에 고정됐지만 external embedder용 generated Markdown compatibility table은 없다. |

## 삭제 테스트

| 삭제 대상 | 깨지는 것 | 결론 |
| --- | --- | --- |
| `importMarkdown` | markdown-format paste/drop, custom MIME markdown restore, ED-016 import adapter, markdown tests | 유지 확정 |
| `exportInlineMarkdown` | marked text copy, mention atom copy, clipboard `text/markdown` fallback | 유지 확정 |
| `exportMarkdown` | ED-016 full-document import/export adapter and round-trip tests | 내부 adapter로 유지 확정. Public export API라는 뜻은 아니다. |
| Markdown as canonical model | visible-text cursor offsets, structured marks, atom cursor semantics | 제거 확정. 이미 structured `NoteDocument`가 canonical model이다. |

## 아직 애매하거나 제품/API 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| CommonMark/GFM compatibility | parser는 local adapter이고 full spec parser가 아니다. Tables, task lists, footnotes, HTML blocks, nested emphasis edge cases를 닫지 않았다. | 제품 import 범위가 필요하면 supported Markdown matrix를 별도 정의한다. |
| public Markdown import/export API | `src/editor/public`은 `importMarkdown`/`exportMarkdown`/`exportInlineMarkdown`를 노출하지 않고 verifier가 direct/aliased/namespace/star/star-as 재노출을 막는다. 현재는 internal paste/clipboard/test adapter다. | external importer/exporter 요구가 생기면 public error shape, migration, sanitization policy를 설계한다. |
| Markdown source mode | ED-012 source-first path는 Rich Model Replan에서 대체됐다. 현재 editor는 source delimiters를 직접 편집하는 mode가 아니다. | source mode가 필요하면 rich model editor와 별도 mode/interface로 설계한다. |
| figure/media source trust policy | `docs/editor-figure-media-trust-audit.md` 기준으로 supported image syntax round-trip은 확정했지만, link href allowlist와 같은 media `src` trust policy는 없다. | product media policy가 필요하면 figure schema, renderer, import, paste, asset policy를 같이 설계한다. |
| schema-specific node graph restore | markdown fallback은 supported text/atom/block shape만 복원한다. Selection topology, node identity, future schema-specific payload는 복원하지 않는다. | richer same-app paste가 필요하면 custom MIME node graph importer를 별도 설계한다. |
| generated schema/docs export | Markdown adapter behavior는 tests와 audits에 고정됐지만 external docs나 generated compatibility table은 없다. | public import/export가 생기면 generated docs나 compatibility matrix를 추가한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| Markdown as canonical state | 제거 확정 | cursor/selection/marks/atoms가 delimiter text에 묶이면 rich model invariant가 무너진다. |
| `importMarkdown` | 유지 확정 | markdown-format paste/drop과 ED-016 import adapter가 의존한다. |
| `exportInlineMarkdown` | 유지 확정 | clipboard `text/markdown` fallback을 만드는 좁은 adapter다. |
| `exportMarkdown` | 유지 확정 | full-document supported-shape round-trip을 검증하는 internal adapter다. Public API로 승격하지는 않는다. |
| full CommonMark parser 도입 | 보류 | 현재 지원 범위는 local deterministic fallback이다. 제품 요구 없이 큰 dependency/scope를 추가하지 않는다. |
| public Markdown API 노출 | 보류 | 현재 비노출은 test/verifier로 확정했다. error shape, migration, sanitization, compatibility table 없이 facade에 노출하면 contract가 과해진다. |

## 현재 결론

markdown adapter에서 빼면 안 되는 것은 Markdown을 canonical state가 아닌 internal
import/export adapter로 두는 구조, supported rich fragment import/export,
clipboard `text/markdown` fallback, mention/figure deterministic syntax, safe link
href filtering, delimiter-independent cursor model이다. 확정하면 안 되는 것은
CommonMark/GFM 전체 호환, public Markdown API, source mode, figure/media source
trust policy, node graph paste restore, generated compatibility docs다.
