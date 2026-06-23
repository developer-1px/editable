# Editor clipboard slice context audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. ProseMirror `data-pm-slice` HTML clipboard context가
해결하는 문제를 우리 editor의 current text/markdown clipboard contract와 비교한다.

## 목적

HTML clipboard로 model slice를 왕복하려면 openStart/openEnd, wrapper context,
schema fit, table wrapper 같은 정보를 잃지 않아야 한다. ProseMirror는
`data-pm-slice`에 이 정보를 넣고 paste parsing에서 복원한다.

현재 editor는 HTML slice clipboard를 지원하지 않는다. Same-editor custom MIME도
node graph가 아니라 versioned text/markdown envelope다. 이 문서는 보존해야 하는
context와 현재 보류해야 하는 범위를 분리한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| ProseMirror copy serialization | slice open depth, wrapper count, context JSON을 `data-pm-slice`에 기록한다. |
| ProseMirror paste parsing | `data-pm-slice`를 찾아 wrapper를 벗기고 slice를 close/addContext로 복원한다. |
| ProseMirror external HTML normalization | 외부 HTML은 schema에 맞도록 sibling wrapping을 normalize한다. |
| ProseMirror table/CSP handling | table 계열 태그는 detached document에서 wrapper를 강제로 씌우고 Trusted Types CSP도 고려한다. |
| `src/editor/internal/model/clipboard.ts` | current custom MIME은 `{ schema, plainText, markdown }`만 읽는다. `text/html`은 읽지 않는다. |
| `clipboard split tests` | extra node/topology metadata와 `data-pm-slice` HTML이 current paste contract로 승격되지 않는 것을 검증한다. |
| inputAdapter split tests | markdown paste/drop은 supported marks/link/mention/figure/multi-block fragment만 복원한다. |
| `docs/editor-clipboard-transfer-audit.md` | clipboard seam은 문자열 중심이고 node graph/topology restore는 보류라고 정리한다. |
| `docs/editor-markdown-adapter-audit.md` | current rich-ish restore는 Markdown adapter가 표현할 수 있는 shape에 묶인다. |

## Current clipboard context contract

| context | current behavior |
| --- | --- |
| plain text | `text/plain`과 custom `plainText`로 보존한다. |
| deterministic markdown | `text/markdown`과 custom `markdown`으로 supported rich-ish fragment를 보존한다. |
| same-editor marker | `application/x-editable-selection+json` + `schema: editable-clipboard@1`가 marker다. |
| selected pointer topology | 저장하지 않는다. Extra `selectedPointers`가 와도 reader는 무시한다. |
| node graph payload | 저장하지 않는다. Extra `nodes`가 와도 reader는 무시한다. |
| openStart/openEnd | 저장하지 않는다. Current importer는 Markdown block/text fragment로 재구성한다. |
| wrapper/context JSON | 저장하지 않는다. Schema fit은 Markdown importer와 text insertion command가 결정한다. |
| `text/html` | 읽지 않는다. `data-pm-slice`가 있어도 current paste input이 아니다. |
| table wrapper context | current schema에 table이 없고 HTML table importer도 없다. |
| Trusted Types/CSP HTML parsing | current paste path가 HTML parsing을 하지 않으므로 해당 정책은 보류다. |

## 보존해야 하는 context 목록

현재 직렬화에서 보존해야 하는 것은 HTML slice context가 아니라 아래 문자열
context다.

| model feature | current preserved form |
| --- | --- |
| paragraph boundaries | plain newline, markdown blank line |
| marks | markdown `**bold**`, `_italic_`, `` `code` `` |
| safe links | markdown link syntax with href/title support |
| mention atom | deterministic `@[label](mention:id)` |
| figure atom | markdown image syntax `![alt](src)` |
| code block | fenced code block for markdown paste/export paths |
| heading/quote/listItem | Markdown adapter supported block syntax |
| attrs/custom metadata | not preserved through markdown/clipboard text |
| list nesting/table/nested container blocks | only supported if Markdown adapter and schema support them; table/nested containers are currently outside schema |

## Fixture policy

| fixture | current state | expectation |
| --- | --- | --- |
| `custom-mime-extra-node-metadata` | 실행 테스트 있음 | extra `selectedPointers`/`nodes`를 무시하고 markdown/plain string만 반환한다. |
| `html-data-pm-slice-ignored` | 실행 테스트 있음 | `text/html` only with `data-pm-slice` returns null; plain fallback이 있으면 plain을 읽는다. |
| `markdown-multi-block-paste` | 실행 테스트 있음 | `Alpha\n\nBeta` markdown paste는 paragraph blocks로 복원된다. |
| `markdown-list-paste` | current Markdown adapter coverage | list item syntax는 Markdown adapter 범위에서만 다룬다. HTML list wrapper context가 아니다. |
| `html-table-paste` | future/unsupported | table schema와 HTML importer가 없으므로 `data-pm-slice` table fixture를 실행하지 않는다. |
| `nested-container-paste` | future/unsupported | nested block/container schema가 없으므로 실행 fixture를 만들지 않는다. |

## Trusted Types/CSP policy

현재는 HTML parsing path가 없어서 Trusted Types/CSP 우회나 sanitizer policy를 정하지
않는다. Future HTML importer를 도입하면 다음을 함께 설계해야 한다.

| topic | future requirement |
| --- | --- |
| HTML sanitizer | allowed tags/attrs, URL sanitizer, style stripping |
| Trusted Types | CSP 환경에서 safe parser input 생성 방식 |
| table wrapper parsing | detached document wrapper와 schema-aware table fit |
| same-editor marker | `data-pm-slice`에 준하는 app-owned context marker 또는 custom MIME node payload |
| trust boundary | same-editor payload와 external HTML을 다른 신뢰 수준으로 처리 |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current `text/html` non-support | 실행 테스트로 확정 | `data-pm-slice` HTML only transfer는 null이고 plain fallback이 있으면 plain을 읽는다. | Browser paste event의 모든 MIME 조합은 아니다. |
| custom MIME node metadata 무시 | 실행 테스트로 확정 | extra `selectedPointers`/`nodes`를 넣어도 reader는 markdown/plain string만 반환한다. | Future node graph payload를 금지한다는 뜻은 아니다. |
| markdown multi-block restore | 실행 테스트로 확정 | input adapter tests가 markdown multi-block paste/drop을 blocks로 복원한다. | HTML open slice context restore와 다르다. |
| list/table/nested block slice context | 부분/미정 | listItem은 Markdown adapter 범위에 있지만 table/nested container는 schema 밖이다. | HTML table/nested fixture는 future schema/importer가 필요하다. |
| Trusted Types/CSP | 미정 | current path가 HTML parsing을 하지 않는다. | HTML importer 도입 시 sanitizer/CSP gate가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| current `data-pm-slice` HTML importer | 보류 | HTML importer, sanitizer, schema fit, table/nested model이 없다. |
| custom MIME node graph payload | 보류 | markdown fallback으로 표현 못 하는 topology 요구가 아직 제품 범위가 아니다. |
| current text/markdown envelope | 유지 | 현재 copy/paste/drop tests와 external interop의 작은 contract다. |
| extra topology metadata | 제거 확정 | 읽지 않는 metadata를 넣으면 rich restore가 이미 존재하는 것처럼 보인다. |
| Trusted Types policy 선구현 | 보류 | HTML parsing path 없이 CSP 우회 정책만 만들면 죽은 정책이다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| rich same-editor node paste | markdown이 보존하지 못하는 attrs, node identity, open slice topology가 있다. | 제품이 rich fidelity를 요구하면 custom MIME node payload를 별도 설계한다. |
| HTML external paste | sanitizer, schema fit, unsafe URL, CSS/style stripping이 필요하다. | #10/#19 범위와 함께 HTML importer를 설계한다. |
| table support | current schema에 table이 없다. | table schema가 생길 때 wrapper/context fixture를 만든다. |
| nested block/container support | current schema는 flat blocks 중심이다. | nested containers가 생기면 openStart/openEnd equivalent를 설계한다. |
| external markdown precedence | plain과 markdown이 같이 있을 때 현재 plain을 우선한다. | rich external paste UX가 필요하면 precedence를 다시 정한다. |

## 현재 결론

현재 editor에는 `data-pm-slice` equivalent를 구현하지 않는다. Clipboard contract는
same-editor marker가 있는 text/markdown envelope이고, paste/drop은 문자열을 command
layer로 넘긴다.

HTML slice context, open depth, wrapper context, table wrapper, Trusted Types/CSP는
HTML importer와 richer schema가 생길 때 함께 설계해야 한다. 지금은 HTML
`data-pm-slice`를 읽지 않고 plain/markdown fallback만 신뢰한다.
