# Editor code block compatibility audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `codeBlock.children` compatibility field와
canonical `codeBlock.text` field의 역할을 분리한다.

## 목적

`CodeBlockSchema`에는 `text`와 `children`이 둘 다 있다. 하지만 현재 에디터가 code
block을 inline child model로 편집한다는 뜻은 아니다.

이 문서는 `children`을 제거하면 안 되는 persisted compatibility surface와, 아직
확정하면 안 되는 future code child model을 나눈다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/noteDocument.ts` | `CodeBlockSchema`는 `text: z.string().default("")`와 `children: z.array(TextNodeSchema).default([])`를 가진다. `isCodeBlock`과 `readBlockText`는 code block content를 `block.text`에서 읽는다. |
| `src/editor/internal/model/textCommandAddressing.ts` | code block text cursor path는 `/root/children/{index}/text`다. Inline child path인 `/children/{childIndex}/text`를 code block content path로 쓰지 않는다. |
| `src/editor/internal/model/normalizer.ts` | normalizer는 `isInlineTextBlock`인 paragraph/heading/quote/listItem children만 inline-normalize한다. code block은 그대로 보존한다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | code block renderer는 `<code data-path="/root/children/{index}/text">`에 `block.text`를 렌더한다. `children`은 렌더하지 않는다. |
| `src/editor/internal/model/markdown.ts` | fenced code import/export는 `text`와 optional `language`만 사용한다. `children`은 Markdown contract가 아니다. |
| `src/editor/internal/model/noteDocument.test.ts` | `children`이 있는 code block을 schema가 받지만 `readBlockText`는 canonical `text`를 읽는 것을 검증한다. |
| `src/editor/internal/model/markdown.test.ts` | Markdown export가 compatibility `children`이 아니라 `text` field를 쓰는 것을 검증한다. |
| `src/editor/internal/react/DocumentRenderer.test.tsx` | renderer가 compatibility `children`을 DOM에 렌더하지 않고 `text` field만 렌더하는 것을 검증한다. |
| `docs/rich-model-design.md` | design shape는 code block을 `{ type: "codeBlock"; language?: string; text: string }`로 설명한다. |

## 확정 code block behavior

| 항목 | 확정 내용 |
| --- | --- |
| persisted shape | `codeBlock.children`은 schema-valid optional/default compatibility field다. |
| canonical content | code block의 canonical content는 `text` field다. |
| defaulting | `text`가 없으면 schema default로 empty string이 된다. `children`이 없으면 empty array가 된다. |
| text reading | `readBlockText(codeBlock)`는 `block.text`를 반환한다. |
| cursor path | code block text path는 `/root/children/{index}/text`다. |
| renderer | renderer는 `block.text`만 렌더하고 code block `children`은 렌더하지 않는다. |
| Markdown import/export | fenced code는 `text`와 optional `language`만 round-trip한다. |
| inline normalization | paragraph/heading/quote/listItem inline children만 normalizer 대상이다. code block `children`은 inline editing children으로 canonicalize하지 않는다. |

## 증거 강도

| 판정 대상 | 강도 | 근거 |
| --- | --- | --- |
| code block schema shape | source/schema 확정 | `CodeBlockSchema`는 `text`와 `children`을 모두 가진다. `text`는 string default, `children`은 `TextNode[]` default compatibility field다. |
| code block defaulting | 실행 테스트로 확정 | `noteDocument.test.ts`가 `text`와 `children`이 없는 code block을 parse하면 `text: ""`, `children: []`로 default 된다고 검증한다. |
| children compatibility preservation | 실행 테스트로 확정 | `noteDocument.test.ts`가 legacy `children` payload를 schema-valid data로 보존하면서 `readBlockText`는 `text`를 읽는다고 검증한다. |
| canonical text read path | 실행 테스트로 확정 | `readBlockText`, renderer, Markdown export, input adapter line-break tests가 code block content를 `/root/children/{index}/text`와 `block.text`에서 읽는다. |
| renderer children non-contract | 실행 테스트로 확정 | `DocumentRenderer.test.tsx`가 `legacy child`를 렌더하지 않고 `text` field만 code DOM에 렌더한다고 검증한다. |
| Markdown children non-round-trip | 실행 테스트로 확정 | `markdown.test.ts`가 compatibility `children` 대신 fenced code `text`와 optional `language`만 export한다고 검증한다. |
| code block child/token editing model | 미정 | current cursor/render/Markdown/text command path는 inline child model이나 syntax token children을 쓰지 않는다. |
| compatibility support window and mismatch diagnostics | 미정 | `text`와 `children`이 충돌할 때 diagnostic/migration/drop 중 무엇을 할지는 public import/persistence policy가 아니다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `codeBlock.text` | 유지 확정 | renderer, Markdown, text command addressing, readBlockText가 모두 이 field를 canonical source로 쓴다. |
| `codeBlock.children` schema field | 유지 확정 | 현재 schema-valid payload와 initial document compatibility를 깨지 않기 위해 보존한다. |
| code block children rendering | 제거 확정 | renderer가 `children`을 소비하지 않고, DOM path도 `/text` 하나로 닫혀 있다. |
| code block children Markdown round-trip | 제거 확정 | Markdown fenced code syntax는 current adapter에서 `text`/`language`만 표현한다. |
| code block inline child editing model | 보류 | 현재 command/cursor/render path가 inline child model을 쓰지 않는다. 도입하려면 schema, cursor path, renderer, Markdown, text commands를 함께 바꿔야 한다. |
| syntax-highlight token children | 보류 | 렌더링 highlight token은 canonical document children과 별개로 설계해야 한다. 현재 code block child field를 token model로 쓰는 근거가 없다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| compatibility field 수명 | `children`은 schema-valid라 제거하면 기존 payload를 깨지만, 제품 persistence가 어떤 legacy window를 보장하는지는 없다. | persisted external document 정책이 생기면 migration/drop/support 기간을 정한다. |
| text vs children conflict policy | 둘 다 있을 때 현재 소비자는 `text`를 읽는다. `children`을 diagnostic mismatch로 볼지 silently ignore할지는 public import 정책으로 닫지 않았다. | external import UX가 필요하면 mismatch diagnostics or migration rule을 별도로 설계한다. |
| future code child model | inline rich text와 다르게 code block은 raw string path를 쓴다. Multi-span token, line, decoration model은 아직 schema 밖이다. | syntax highlight, per-line selection, code annotations 요구가 생기면 document schema가 아니라 renderer decoration model부터 검토한다. |
| code language policy | `language`는 non-empty string이면 받지만 supported language registry, sanitizer, highlighter binding은 없다. | syntax highlighting 요구가 생기면 language allowlist와 renderer adapter를 함께 설계한다. |

## 현재 결론

뺄 수 없는 확정은 code block canonical content가 `text` field이고, `children`은 현재
persisted schema compatibility field로 남아야 한다는 점이다.

아직 확정하면 안 되는 것은 `children`을 future inline child editing model, syntax
highlight token model, Markdown round-trip contract, public import diagnostic
contract로 해석하는 것이다. 현재 올바른 판정은 `children`을 호환성 field로 유지하되,
제품 기능의 source of truth로 과장하지 않는 것이다.
