# Editor Block Boundary Key Policy Audit

작성일: 2026-06-22

범위: 빈 paragraph, 빈 heading, listItem, codeBlock, figure/atom 경계에서
`Enter`, `Backspace`, `Delete`, `insertParagraph`, `insertLineBreak`,
`deleteContentBackward`, `deleteContentForward`를 native DOM에 맡길지, headless
command로 막을지 정리한다.

## 판정

Block boundary editing은 native DOM mutation을 허용하지 않고 headless command가
소유한다.

- `Enter`, `beforeinput insertParagraph`, `beforeinput insertLineBreak`는
  `splitParagraph`로 수렴한다.
- `Backspace`, `Delete`, `beforeinput deleteContentBackward`,
  `beforeinput deleteContentForward`는 `deleteBackward`/`deleteForward`로 수렴한다.
- ordinary text leaf typing과 IME preedit만 contenteditable native buffer에 맡긴다.
- block split/merge, atom 삭제, code newline 삽입은 canonical document command가
  먼저 결정한다.

이 결론은 ProseMirror/Lexical의 반복 수정 이력과 같은 방향이다. 성숙한 editor도
empty heading Enter, Android nested list Enter, code block newline/Backspace,
block DecoratorNode Enter, whitespace-only list item Enter를 별도 bug surface로
다룬다.

## Block Type Matrix

| Block type / 위치 | Enter / insertParagraph | Backspace at start | Delete at end | Native policy |
| --- | --- | --- | --- | --- |
| paragraph text 중간 | 현재 paragraph를 앞쪽 paragraph로 교체하고 뒤쪽 paragraph를 추가한다. | text 내부면 grapheme 삭제, offset 0이면 이전 inline text block과 merge한다. | text 내부면 grapheme 삭제, block 끝이면 다음 inline text block과 merge한다. | command-owned |
| empty paragraph | empty paragraph 하나를 유지하고 뒤에 empty paragraph를 추가한다. caret은 새 paragraph에 둔다. | 이전 inline text block과 merge 또는 첫 block이면 no-op. | 다음 inline text block과 merge 또는 마지막이면 no-op. | command-owned |
| heading / quote / listItem text 중간 | 앞쪽 block은 기존 type을 유지하고 뒤쪽은 paragraph가 된다. | 이전 inline text block과 merge한다. merge 후 type은 이전 block type이 남는다. | 다음 inline text block과 merge한다. merge 후 type은 현재 block type이 남는다. | command-owned |
| empty heading / quote / listItem | 현재 block을 empty paragraph로 교체해 block type을 해제한다. caret은 같은 block index의 empty paragraph에 둔다. | 이전 inline text block과 merge 또는 no-op. | 다음 inline text block과 merge 또는 no-op. | command-owned |
| whitespace-only listItem | 보이는 빈 list item으로 보고 현재 block을 empty paragraph로 교체한다. | text 삭제 또는 boundary merge. | text 삭제 또는 boundary merge. | command-owned |
| codeBlock text 중간 | block split이 아니라 `\n`을 code text에 삽입한다. | text/newline grapheme 삭제. | text/newline grapheme 삭제. | command-owned |
| empty codeBlock / codeBlock start/end | Enter는 `\n` 삽입이다. start Backspace와 end Delete는 인접 codeBlock끼리만 merge하고, 다른 block type과는 no-op이다. | 이전 codeBlock과 merge, 아니면 no-op. | 다음 codeBlock과 merge, 아니면 no-op. | command-owned |
| figure block edge | before/after edge에 empty paragraph를 추가하고 caret을 그 paragraph에 둔다. | figure after edge에서 figure를 삭제한다. | figure before edge에서 figure를 삭제한다. | command-owned |
| selected text/range | selection을 삭제한 뒤 range start에서 split한다. code-only selection은 `\n` replacement로 수렴한다. | selection range 삭제 후 range start로 collapse한다. | selection range 삭제 후 range start로 collapse한다. | command-owned |
| selected figure/atom | text/mention/figure insertion은 atom을 대체한다. Enter는 figure edge paragraph insertion policy로 수렴해야 한다. | atom 전체 삭제. | atom 전체 삭제. | command-owned |

## Current Command Mapping

| 입력 | 현재 adapter | command result |
| --- | --- | --- |
| `keydown Enter` | editor-owned keydown | `splitParagraph` |
| `beforeinput insertParagraph` | preventDefault 후 command | `splitParagraph` |
| `beforeinput insertLineBreak` | preventDefault 후 command | `splitParagraph` |
| `keydown Backspace` | editor-owned keydown | `deleteBackward` |
| `beforeinput deleteContentBackward` | command-owned delete 또는 active leaf defer | `deleteBackward` |
| `keydown Delete` | editor-owned keydown | `deleteForward` |
| `beforeinput deleteContentForward` | command-owned delete 또는 active leaf defer | `deleteForward` |
| codeBlock 내부 ordinary text | active leaf/native buffer 가능 | flush 후 canonical text patch |
| IME composition preedit | native composition buffer | composition state와 flush/reset으로 reconcile |

## Fixture Matrix

| Fixture / test | 현재 상태 | 닫는 질문 |
| --- | --- | --- |
| text command split tests: empty paragraph split | 실행 테스트 있음 | 빈 paragraph Enter는 두 empty paragraphs와 deterministic caret으로 고정된다. |
| text command split tests: paragraph start Backspace | 실행 테스트 있음 | block start Backspace는 이전 inline text block merge다. |
| text command split tests: paragraph end Delete | 실행 테스트 있음 | block end Delete는 다음 inline text block merge다. |
| text command split tests: code block newline | 실행 테스트 있음 | codeBlock Enter는 block split이 아니라 `\n` 삽입이다. |
| text command split tests: selected code text newline | 실행 테스트 있음 | selected code range Enter는 `\n` replacement다. |
| inputAdapter split tests: `insertParagraph`/`insertLineBreak` | 실행 테스트 있음 | browser beforeinput Enter 계열이 같은 split command로 수렴한다. |
| `p0-empty-block-backspace` | replay fixture 있음 | empty paragraph 뒤 Backspace가 빈 block을 제거/merge하고 caret을 결정한다. |
| whitespace-only listItem Enter | 실행 테스트 있음 | 보이는 빈 list item을 empty로 보고 paragraph로 list exit한다. |
| empty heading/quote/listItem Enter | 실행 테스트 있음 | empty typed block Enter는 현재 block을 paragraph로 교체하고 selectionAfter를 고정한다. |
| codeBlock empty line Backspace in real browser | 없음 | native code block newline/Backspace event ordering은 browser별 trace가 필요하다. |
| Android/iOS block boundary Enter/Backspace | 없음 | ProseMirror/Lexical 근거는 있지만 우리 실기기 trace는 없다. |

## External Evidence

| Source | 관련 증거 | 우리 정책에 주는 결론 |
| --- | --- | --- |
| ProseMirror-view changelog | Android Backspace가 Enter로 해석됨, Android virtual keyboard Backspace join이 Enter handler를 실행함, Android code block Enter spell correction, iOS empty heading Enter, Chrome Android empty nested list Enter, Firefox code block cursor/Backspace fixes가 반복된다. | boundary Enter/Delete는 browser native DOM 결과를 primary truth로 두면 안 된다. |
| Lexical changelog | block DecoratorNode NodeSelection Enter, Backspace at block start, code block escape Enter listener, linebreak insertion, whitespace-only list item Enter가 반복된다. | block boundary key는 node type별 semantic command로 닫아야 한다. |
| Lexical PR #8526 | block DecoratorNode NodeSelection에서 Enter가 no-op이면 keyboard-only editing이 막혀 paragraph 삽입으로 수정했다. | figure/atom selection Enter도 keyboard recovery paragraph를 가져야 한다. |
| Lexical PR #8068 | whitespace-only list item이 empty로 처리되지 않으면 Enter가 list를 끝내지 못하고 새 list item을 무한히 만든다. | listItem empty 판정은 raw text length가 아니라 visible/semantic emptiness를 기준으로 다시 정해야 한다. |

## Current Drift

| Drift | 영향 | 후속 처리 |
| --- | --- | --- |
| whitespace-only listItem Enter policy 없음 | 사용자는 빈 list item으로 보지만 model은 whitespace text로 보아 list 탈출/empty semantic을 줄 수 있었다. | #71에서 해소. whitespace-only listItem Enter는 paragraph로 exit한다. |
| empty heading/quote/listItem Enter의 block type exit fixture 없음 | typed empty block을 남기고 뒤 paragraph를 만드는 동작은 일반 editor 기대와 달랐다. | #71에서 해소. empty typed block은 현재 block을 paragraph로 교체한다. |
| Android/iOS Enter/Backspace 실기기 trace 없음 | mature editor가 고친 bug class를 우리 verify gate가 재현하지 못한다. | #72에서 모바일 keyboard boundary trace로 분리한다. |
| codeBlock escape/outside movement policy 없음 | Enter는 항상 newline이고 Backspace/Delete는 adjacent codeBlock만 merge한다. code block 탈출 UX는 아직 제품 정책이 아니다. | 새 제품 요구가 있을 때 code block escape 정책으로 분리한다. |

## 증거 강도

| 항목 | 강도 | 근거 |
| --- | --- | --- |
| Enter 계열 headless ownership | 실행 테스트로 확정 | inputAdapter split tests, text command split tests, `docs/editor-line-break-policy-audit.md` |
| Backspace/Delete headless ownership | 실행 테스트로 확정 | inputAdapter split tests, text command split tests, `docs/editor-keyboard-fallback-audit.md` |
| empty paragraph split/Backspace | 실행 테스트로 확정 | text command split tests, `p0-empty-block-backspace` |
| codeBlock newline policy | 실행 테스트로 확정 | text command split tests, inputAdapter split tests, `docs/editor-code-block-compatibility-audit.md` |
| figure/atom boundary delete/paragraph insertion | 실행 테스트로 부분 확정 | atom delete/replacement와 figure edge split tests는 있으나 selected figure Enter dedicated fixture는 부족하다. |
| whitespace-only list item empty semantic | 실행 테스트로 확정 | text command split tests와 inputAdapter split tests가 whitespace-only listItem Enter를 paragraph exit로 검증한다. |
| empty heading/quote/listItem typed block exit | 실행 테스트로 확정 | text command split tests와 inputAdapter split tests가 empty typed block Enter의 paragraph replacement와 selectionAfter를 검증한다. |
| Android/iOS boundary event ordering | 외부 근거만 있음 | ProseMirror/Lexical changelog는 강한 위험 신호지만 우리 real-device trace가 없다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| native DOM block boundary edit 허용 | 제거 | browser별 Enter/Backspace 경계 버그가 많고 canonical model selection을 깨뜨린다. |
| `beforeinput`을 primary truth로 승격 | 제거 | `inputType`은 intent hint다. document truth는 command result와 flush/reconcile이 결정한다. |
| block boundary key를 per-DOM fallback으로 분산 | 제거 | 같은 키가 block type별 semantic command로 닫혀야 한다. |
| current split/delete command seam | 유지 | caller가 DOM detail을 몰라도 patch + `selectionAfter`로 결정된다. |
| whitespace-only listItem/empty typed block exit | 유지 확정 | #71에서 text command와 input adapter 경로를 같은 paragraph exit 정책으로 닫았다. |

## 현재 결론

정석은 block boundary key를 native DOM mutation이 아니라 canonical command로 처리하는
것이다. 현재 구현은 paragraph/code/atom의 기본 command ownership과 whitespace-only
listItem 및 empty typed block의 "보이는 빈 블록" Enter semantic을 닫았다.
Android/iOS virtual keyboard boundary trace는 #72로 분리한다.
