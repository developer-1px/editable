# Editor Line Break Policy Audit

작성일: 2026-06-21

범위: 현재 dirty workspace 기준. `Enter`, `insertParagraph`, `insertLineBreak`가
현재 애매한지, 아니면 이미 block split 정책으로 확정됐는지 분리한다.

## 판정

현재 line break 정책은 **block-specific split policy로 확정**이다.

- 확정: `Enter`, `beforeinput insertParagraph`, `beforeinput insertLineBreak`는
  같은 headless `splitParagraph` command로 수렴한다.
- 확정: non-empty paragraph, heading, quote, listItem 같은 inline text block에서는
  block을 둘로 나눈다.
- 확정: empty heading/quote/listItem과 whitespace-only listItem에서는 현재 block을
  empty paragraph로 교체해 block type을 해제한다.
- 확정: codeBlock에서는 같은 command가 code text에 `\n`을 삽입한다.
- 확정: inline atom edge나 figure edge에서는 유효한 인접 paragraph를 만든다.
- 보류: paragraph 안에 별도 soft-break inline node를 추가하는 것은 현재 결함이
  아니라 future product/model change다.

## 왜 soft-break를 현재 애매함에서 뺐나

`docs/editor-required-feature-list.md`는 `insertLineBreak`가 "configured soft-break
or block-split policy"를 사용한다고 열어 둔다. 현재 레포는 이미 후자를 선택했다.
`inputAdapter`가 `insertParagraph`와 `insertLineBreak`를 모두 `splitParagraph`로
보내고, `textCommands`는 non-empty inline text block, empty typed block exit,
codeBlock을 분리해 처리한다.

따라서 "paragraph soft-break가 없어서 현재 정책이 미정"이라고 쓰면 실제 코드와
테스트보다 약한 판정이 된다. soft-break는 새 inline/model 개념을 추가하는 future
feature 후보로 남긴다.

## 확정 근거

| 근거 | 의미 |
| --- | --- |
| `inputAdapter.ts` | `insertParagraph`와 `insertLineBreak`가 같은 `splitParagraph` command로 간다. |
| `textCommands.ts` | non-empty inline text block은 block split, empty typed block은 paragraph exit, codeBlock은 text newline, atom edge는 인접 paragraph 생성으로 분기한다. |
| `inputAdapter.test.ts` | `insertLineBreak`가 paragraph에서는 block add/replace, codeBlock에서는 `A\nB` replace patch를 만든다. |
| `textCommands.test.ts` | paragraph split, empty paragraph split, selected code text newline, atom/figure edge split을 고정한다. |
| `BlockEditor.test.tsx` | browser `beforeinput insertParagraph` 경로가 React integration에서 canonical state로 수렴함을 확인한다. |

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| `Enter` keydown split | 실행 테스트로 확정 | `inputAdapter.test.ts`가 structural keydown `Enter`를 handled headless split command 결과로 검증한다. |
| `insertParagraph` adapter mapping | 실행 테스트로 확정 | `inputAdapter.test.ts`가 collapsed paragraph에서는 block split, codeBlock에서는 `\n` 삽입으로 수렴한다고 검증한다. |
| `insertLineBreak` adapter mapping | 실행 테스트로 확정 | `inputAdapter.test.ts`가 collapsed paragraph/codeBlock 양쪽에서 같은 block-specific split policy를 검증한다. |
| paragraph/inline text block split | 실행 테스트로 확정 | `textCommands.test.ts`가 paragraph split, empty paragraph split, selected range split 후 selection 위치를 검증한다. |
| empty typed block exit | 실행 테스트로 확정 | `textCommands.test.ts`와 `inputAdapter.test.ts`가 empty heading/quote/listItem과 whitespace-only listItem Enter를 paragraph replacement로 검증한다. |
| codeBlock newline policy | 실행 테스트로 확정 | `textCommands.test.ts`가 code block caret split과 selected code range replacement를 `\n` 삽입으로 검증한다. |
| inline atom/figure edge handling | 실행 테스트로 확정 | `textCommands.test.ts`와 `inputAdapter.test.ts`가 atom edge와 figure edge에서 유효한 adjacent paragraph가 생기는 behavior를 검증한다. |
| React beforeinput convergence | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 browser `beforeinput insertParagraph` 경로가 canonical document state로 수렴함을 검증한다. |
| `Alt+Enter`/command Enter no-op | 실행 테스트로 확정 | `inputAdapter.test.ts`가 unsupported structural editing shortcuts를 handled selection-only no-op으로 검증한다. |
| paragraph soft-break inline node | 미정/future feature | 현재 schema/renderer/markdown/cursor contract에는 별도 soft-break inline node가 없다. 추가하려면 새 model concept와 serializer policy가 필요하다. |
| platform-specific Enter/IME/browser matrix | 미정 | IME Enter confirmation 회귀는 별도 trace로 닫았지만, 모든 browser/OS beforeinput ordering matrix는 이 문서 범위로 닫지 않았다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| current block-specific split policy | 유지 확정 | 이미 command, adapter, React integration tests가 current behavior를 검증한다. |
| separate paragraph soft-break model | 보류 | 새 document node/serializer/cursor/rendering policy가 필요하다. 현재 결함을 고치는 축소가 아니라 기능 추가다. |
| current report ambiguity row | 제거 확정 | 현재 정책이 미정이라는 인상을 주므로 확정/애매 분리를 흐린다. |

## 현재 결론

line break current contract는 block-specific split policy다. 새 paragraph soft-break
model은 별도 제품 요구가 생기기 전까지 현재 구현의 애매함이 아니라 future feature
후보로 기록한다.
