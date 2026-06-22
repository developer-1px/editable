# Editor mark command audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. Bold, italic, inline code, link mark command와
collapsed active marks가 어디까지 확정인지, 어디부터 제품/UX/API 결정인지 분리한다.

## 목적

Marks는 document schema, command layer, selection context, input adapter, renderer,
markdown adapter를 모두 지나간다. 이 문서는 link 전용 정책을 넘어서 전체 mark
command seam이 뺄 수 없는 확정인지, 또는 public surface를 더 늘려야 하는지
판정한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/markCommands.ts` | `toggleMark`, `toggleLink`, range splitting, collapsed active mark update, selectionAfter restore를 구현한다. |
| `src/editor/internal/model/markSelectionContext.ts` | selection context의 `activeMarks`와 `pendingLinkHref`를 normalize하고 unsafe active link mark를 버린다. |
| `src/editor/internal/model/markOrder.ts` | mark ordering과 mark key를 정의한다. |
| `src/editor/internal/model/linkHref.ts` | command-created/rendered link href trim/allowlist를 정의한다. |
| `src/editor/internal/model/markCommands.test.ts` | range toggle, remove-if-fully-marked, inline code, link href normalization/rejection, collapsed active marks, unsafe active link drop을 검증한다. |
| `src/editor/internal/model/inputAdapter.test.ts` | `Cmd/Ctrl+B/I/E/K`, pending href, Escape context clear를 검증한다. |
| `src/editor/internal/react/DocumentRenderer.test.tsx` | structured mark rendering과 unsafe link render guard를 검증한다. |
| `src/editor/public/index.test.ts` | persisted link mark href validation과 generic parse failure를 검증한다. |
| `docs/editor-link-mark-audit.md` | link href command seam, no-prompt fallback 제거, legacy URL migration 미정을 정리한다. |

## 확정 mark behavior

| 항목 | 확정 내용 |
| --- | --- |
| mark set | 현재 marks는 `bold`, `italic`, `code`, `link`다. |
| public mark concept | public type surface에는 `Mark`가 남고, individual mark helper type이나 schema object는 public export가 아니다. |
| command surface | public command는 `toggleMark` command type으로 `bold`/`italic`/`code`/`link`를 받는다. Per-mark public method를 늘리지 않는다. |
| range toggle | non-collapsed inline text range에서 mark command는 selected text run만 split/mark하고 selection range를 유지한다. |
| remove policy | selected text가 모두 해당 mark를 가지고 있으면 mark를 제거한다. 그렇지 않으면 mark를 추가한다. |
| inline atom handling | range unit 계산은 inline atom을 길이 1로 보지만 mark는 text child에만 적용된다. Atom 자체에 text mark를 저장하지 않는다. |
| collapsed active marks | collapsed selection에서 mark toggle은 document patch 없이 `selection.context.activeMarks`를 갱신한다. 이후 text insertion이 active marks를 적용한다. |
| active mark normalization | active marks는 mark order로 정렬되고 type/key 기준으로 normalize된다. Unsafe active link mark는 삽입 전에 버려진다. |
| link creation seam | 새 link mark는 `pendingLinkHref`가 있어야 생성된다. Pending href는 trim 후 allowlist를 통과해야 한다. |
| link removal seam | 이미 link가 걸린 range나 active link mark는 pending href 없이도 제거할 수 있다. |
| shortcut mapping | `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, `Cmd/Ctrl+E`, `Cmd/Ctrl+K`는 mark commands로 간다. `Escape`는 active/pending/preferred selection context를 지운다. |
| renderer contract | structured marks는 delimiter text가 아니라 `<strong>`, `<em>`, `<code>`, `<a>` affordance로 렌더링된다. Unsafe link href는 clickable `href`로 렌더링하지 않는다. |
| markdown/schema alignment | markdown import/export와 persisted parse는 safe link href policy와 structured marks를 공유한다. |

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| mark schema set | source/schema 확정 | `NoteDocumentSchema`의 `MarkSchema` discriminated union이 `bold`/`italic`/`code`/`link`만 받는다. |
| public mark concept/facade | source/boundary 확정 | public facade에는 `Mark` concept만 남고 individual mark helper/schema object export는 boundary verifier가 막는다. |
| range split과 selection restore | 실행 테스트로 확정 | `markCommands.test.ts`가 selected range split, marked run patch, `selectionAfter` restore를 검증한다. |
| remove-if-fully-marked | 실행 테스트로 확정 | `markCommands.test.ts`가 전체 selected text가 이미 해당 mark를 가진 경우 mark 제거와 text merge를 검증한다. |
| inline atom non-marking | 실행 테스트로 확정 | `markCommands.test.ts`가 mention atom을 포함한 range에서 text child만 mark되고 atom에는 mark가 저장되지 않음을 검증한다. |
| collapsed active marks | 실행 테스트로 확정 | `markCommands.test.ts`와 `inputAdapter.test.ts`가 collapsed selection active mark 저장과 이후 text insertion 적용을 검증한다. |
| active mark normalization | 실행 테스트로 확정 | `markCommands.test.ts`가 duplicate/unordered active marks, unsafe/safe link href, mark order 정규화를 검증한다. |
| link creation/removal seam | 실행 테스트로 확정 | `markCommands.test.ts`가 pending href 기반 link 생성과 pending href 없는 existing link 제거를 검증한다. |
| pending href trim/allowlist/rejection | 실행 테스트로 확정 | `markCommands.test.ts`와 `inputAdapter.test.ts`가 trim, allowed href, unsafe href rejection, missing href error를 검증한다. |
| shortcut mapping과 Escape context clear | 실행 테스트로 확정 | `inputAdapter.test.ts`가 `Cmd/Ctrl+B/I/E/K` mapping과 `Escape` transient context clear를 검증한다. |
| renderer/schema/Markdown alignment | 실행 테스트로 확정 | `DocumentRenderer.test.tsx`, `markdown.test.ts`, `public/index.test.ts`가 structured mark rendering, unsafe link guard, Markdown/persisted parse policy를 검증한다. |
| link input UX와 legacy migration | 미정 | command seam은 닫혔지만 사용자 입력 UI와 기존 unsafe URL 문서 처리 정책은 제품 결정이 없다. |
| additional mark/exclusivity/plugin/matrix | 미정 | underline/strike/color, mark conflict rule, external plugin seam, generated compatibility matrix는 현재 schema/command contract 밖이다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `toggleMark`/`toggleLink` seam | 유지 확정 | range split, active context, selection restore, link safety를 small command interface 뒤에 숨긴다. |
| `activeMarks` selection context | 유지 확정 | collapsed future insertion state를 document mutation 없이 표현한다. |
| `pendingLinkHref` selection context | 유지 확정 | link href를 명시적으로 command layer에 전달하는 현재 좁은 seam이다. |
| `activeMarks` query | 유지 확정 | toolbar/embedding이 collapsed mark state를 읽는 public query다. |
| public `Mark` type | 유지 확정 | document inspection과 activeMarks query result에 필요한 public concept이다. |
| per-mark public methods | 보류 | current `dispatch({ type: "toggleMark", mark })`로 충분하다. `toggleBold()` 같은 method를 늘릴 근거가 없다. |
| underline/strike/color marks 추가 | 보류 | schema, renderer, markdown, keyboard/toolbar UX가 같이 필요한 새 feature다. 현재 correctness 결함이 아니다. |
| link prompt fallback URL | 제거 확정 | `https://example.com` 같은 임의 URL은 사용자 의도가 아니며 link audit에서 제거했다. |
| public selection context bag 문서화 | 보류 | context는 active marks, pending link, preferredX 같은 transient state다. 외부 저장/편집 contract로 확정하지 않는다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| link 입력 UX | command seam은 `pendingLinkHref`로 닫혔지만 toolbar/prompt UI가 없다. | link 입력 UI를 만들지, host app이 command context를 넣게 둘지 결정해야 한다. |
| legacy unsafe URL migration | persisted parse는 unsafe href를 거절하고 renderer는 unsafe href를 clickable하게 만들지 않는다. 기존 legacy document를 migrate/drop하는 제품 정책은 없다. | import/migration 요구가 생기면 drop, sanitize, report 중 하나를 정해야 한다. |
| additional mark set | underline, strikethrough, color, highlight, comment 같은 marks는 현재 schema 밖이다. | 새 mark를 추가할 때 schema, order, renderer, markdown, shortcut/toolbar policy를 함께 설계해야 한다. |
| mark exclusivity policy | 현재 code/link/bold/italic은 structured mark set으로 공존 가능하다. 특정 mark 조합을 금지하는 UX/product rule은 없다. | 제품 편집 정책이 생기면 mark conflict resolver를 별도 설계해야 한다. |
| active context persistence | active marks와 pending href는 transient selection context다. Session restore나 persistence contract가 아니다. | cursor/session restore가 필요하면 document schema와 분리된 transient state DTO를 설계해야 한다. |
| public mark extension/plugin | command registry와 mark set은 closed다. 외부 plugin mark 등록 seam은 없다. | custom mark 요구가 생기면 schema, renderer, command registry extension을 한 번에 설계해야 한다. |
| markdown compatibility matrix | supported mark markdown은 테스트로 닫혔지만 generated external compatibility matrix는 없다. | external import/export 요구가 커지면 generated docs 또는 compatibility table을 별도 만들지 결정해야 한다. |

## 현재 결론

뺄 수 없는 확정은 structured mark set과 `toggleMark`/`toggleLink` command seam,
collapsed active marks, pending link href safety, renderer/schema/markdown alignment다.
이 복잡성은 caller-facing method를 늘리는 대신 command implementation과 selection
context 뒤에 숨기는 것이 맞다.

아직 확정하면 안 되는 것은 link 입력 UI, legacy URL migration, 추가 mark set,
mark exclusivity, active context persistence, public mark plugin, generated
compatibility matrix다. 현재 근거로는 mark feature를 넓히는 것보다 existing seam을
정확히 유지하는 쪽이 더 올바르다.
