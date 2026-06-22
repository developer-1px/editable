# Editor text mutation command audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. Text insertion, deletion, atom replacement,
paragraph split/merge, fragment insertion이 어디까지 확정 command behavior인지와
어디부터 future product/model policy인지 분리한다.

## 목적

Text mutation은 editor의 가장 큰 구현 덩어리지만, caller가 배워야 하는 interface는
작아야 한다. 이 문서는 `textCommands.ts` 내부 구현 크기를 이유로 새 public command
surface를 늘릴지, 아니면 현재 command seam을 유지할지 판정한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/textCommands.ts` | `insertText`, `insertMention`, `insertInlineFragment`, `insertBlockFragment`, `insertFigure`, delete variants, `splitParagraph`가 document/selection을 patch와 `selectionAfter`로 변환한다. |
| `src/editor/internal/model/textCommandAddressing.ts` | JSON pointer string을 inline text, code text, inline atom, block atom 위치로 파싱한다. |
| `src/editor/internal/model/textCommandSelection.ts` | inline/block removal과 split/merge 뒤 deterministic selection placement를 계산한다. |
| `src/editor/internal/model/editorCommandStrategies.ts` | public `insertNode`와 `delete` command를 text command strategy로 수렴시킨다. |
| `src/editor/internal/model/textCommands.test.ts` | insertion, range replacement, grapheme/word deletion, atom deletion/replacement, code-aware range replacement, split/merge, fragment insertion, undo/redo selection restore를 검증한다. |
| `src/editor/internal/model/inputAdapter.test.ts` | browser beforeinput/key input이 current text command paths로 번역되는 것을 검증한다. |
| `docs/editor-line-break-policy-audit.md` | `insertParagraph`/`insertLineBreak`는 block-specific split policy로 닫혔다고 정리한다. |
| `docs/editor-history-grouping-audit.md` | text command result의 patch + `selectionAfter`가 history restore와 결합되는 기준을 정리한다. |

## 확정 text mutation behavior

| 항목 | 확정 내용 |
| --- | --- |
| command result contract | Text mutation command는 document를 직접 mutate하지 않고 JSON Patch 배열과 `selectionAfter`를 반환한다. |
| narrow command surface | 현재 mutation surface는 text insert, mention/figure insert, inline/block fragment insert, delete backward/forward/word, split으로 충분하다. Raw JSON Patch나 per-case public method가 필요하다는 근거는 없다. |
| text leaf editing | paragraph/heading/quote/listItem inline text와 codeBlock text는 같은 command path에서 처리된다. Code block text path는 `/root/children/{i}/text`다. |
| structured mark preservation | existing text mark는 ordinary insert/delete에서 보존되고, collapsed active marks가 있는 insert는 marked text run을 만든다. |
| selected range replacement | single text range, inline atom을 가로지르는 range, figure block을 가로지르는 range, code block을 포함한 range가 focus-only edit로 떨어지지 않고 range replacement로 처리된다. |
| grapheme/word deletion | character deletion은 grapheme boundary를 지키고, word deletion은 movement command가 만든 extended range를 삭제한다. |
| atom deletion | mention과 figure는 cursor edge나 explicit node selection에서 whole atom으로 삭제된다. |
| atom replacement | typed text, mention, figure insertion은 selected text/atom/range를 deterministic하게 대체하고 caret을 replacement 뒤에 둔다. |
| paragraph split | inline text block split은 before/after paragraph blocks를 만들고, marks를 보존한다. Empty paragraph split도 두 empty paragraphs로 닫혀 있다. |
| code split | codeBlock에서 split command는 block split이 아니라 `\n` insertion이다. Selected code text split은 selection을 newline으로 대체한다. |
| block merge | Backspace at paragraph start는 previous text block merge, Delete at paragraph end는 next text block merge로 닫혀 있다. |
| figure edge behavior | figure edge insertion/split은 인접 paragraph 또는 figure block을 만들거나 targeted paragraph를 사용한다. |
| fragment insertion | inline fragment는 paragraph/block position에 삽입되고, block fragment는 split position 기준으로 block sequence를 splice한다. Imported block ids는 fresh id로 정리된다. |
| normalization dependency | command output은 `normalizeInlineChildren`, `mergeAdjacentText`, `normalizeBlocks`와 함께 empty run removal, adjacent text merge, non-empty document/block shape를 유지한다. |
| list depth command | list indent/outdent는 text mutation surface와 별도 block command지만, selection-touched list items만 depth patch를 만든다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| command result contract | 실행 테스트로 확정 | `textCommands.test.ts`가 insert/delete/split이 input document를 직접 mutate하지 않고 patch와 `selectionAfter`를 반환하는 것을 고정한다. |
| text/code leaf editing | 실행 테스트로 확정 | paragraph/heading/listItem inline text와 codeBlock text path가 같은 text command path로 처리되는 것을 `textCommands.test.ts`가 검증한다. |
| structured mark preservation | 실행 테스트로 확정 | ordinary insert/delete가 existing marks를 보존하고, collapsed active marks insert가 marked text run을 만드는 경로는 `textCommands.test.ts`와 `markCommands.test.ts`가 닫는다. |
| selected range replacement | 실행 테스트로 확정 | single text range, inline atom-crossing range, figure-crossing range, codeBlock interior/cross-block range가 focus-only edit로 떨어지지 않고 range replacement patch를 만든다. |
| grapheme/word deletion | 실행 테스트로 확정 | grapheme cluster delete와 word delete가 text/code leaves와 atom unit을 대상으로 deterministic patch/selection을 반환한다. |
| atom deletion/replacement | 실행 테스트로 확정 | mention/figure edge deletion, selected atom deletion, text/mention/figure insertion over selected atom/range가 whole-atom replacement로 검증된다. |
| paragraph and code split policy | 실행 테스트로 확정 | inline text block split은 before/after blocks를 만들고, empty paragraph split도 두 empty paragraphs로 닫히며, codeBlock split은 newline insertion으로 고정된다. |
| block merge and figure edge behavior | 실행 테스트로 확정 | paragraph start/end merge, figure edge text insertion/split, isolated figure paragraph creation을 `textCommands.test.ts`와 regression tests가 덮는다. |
| fragment insertion and id cleanup | 실행 테스트로 확정 | inline/block fragment insertion과 imported block id refresh는 text command tests와 clipboard/markdown adapter tests가 current behavior로 고정한다. |
| input adapter convergence | 실행 테스트로 확정 | beforeinput/key input의 insert/delete/split/paste/drop path는 `inputAdapter.test.ts`와 `BlockEditor.test.tsx`가 같은 model command path로 수렴하는지 검증한다. |
| raw public patch/per-case public method absence | public facade/command surface 테스트로 확정 | public facade와 `createEditor()` command descriptor inventory는 raw JSON Patch command나 figure-edge/code-range 같은 per-case public method를 노출하지 않는다. |
| richer block schema expansion | 미정 | table, nested list, task item, caption, embed 같은 block이 생기면 split/merge/replacement semantics를 다시 설계해야 한다. |
| paragraph soft-break model | 미정 | 현재 paragraph `Enter`는 block split이고 codeBlock은 newline이다. paragraph 내부 soft-break node는 schema/render/cursor/markdown/history가 같이 필요한 future feature다. |
| multi-range and collaboration operation model | 미정 | current selection/patch contract는 single primary range와 local JSON Patch 중심이다. multi-cursor, remote op, conflict resolution은 public behavior가 아니다. |
| generated compatibility docs/file split policy | 미정 | test suite가 behavior를 넓게 덮지만 external embedder용 generated matrix와 file-level split 기준은 아직 제품/모듈 정책으로 닫지 않았다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `textCommands` command seam | 유지 확정 | 복잡한 range/atom/block behavior를 작은 internal model interface 뒤에 숨기는 deep module이다. |
| patch + `selectionAfter` pairing | 유지 확정 | document mutation과 canonical selection placement가 함께 history entry로 들어가야 한다. |
| `textCommandAddressing` helper | 유지 확정 | JSON pointer parsing을 command body 곳곳에 중복하지 않게 만든다. |
| `textCommandSelection` helper | 유지 확정 | deletion/split/merge 뒤 caret placement를 한 곳으로 모은다. |
| raw public patch mutation | 제거 확정 | schema-aware text commands보다 넓은 escape hatch이고 model command surface audit에서 이미 제거했다. |
| per-case public commands 추가 | 보류 | `insertText`, `insertNode`, `delete`, `split`으로 caller interface가 충분히 작다. Figure-edge insert, code-aware range replacement 같은 세부 분기를 public으로 노출하지 않는다. |
| file split by every helper function | 보류 | 파일은 크지만 현재 complexity는 한 responsibility인 text mutation에 모여 있다. 실제 독립 변경 이유가 확인되기 전에는 단순 file-size 분할을 하지 않는다. |
| paragraph soft-break node 추가 | 보류 | 현재 `splitParagraph` policy는 block-specific split으로 닫혀 있다. Soft-break는 새 schema/render/cursor policy가 필요한 future feature다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| richer block schema expansion | table, nested list, task item, caption, embed 같은 block이 생기면 split/merge/replacement semantics가 바뀐다. | 새 block schema를 추가할 때 text mutation strategy 확장 지점을 다시 설계해야 한다. |
| paragraph soft-break model | 현재 paragraph split policy는 확정이지만 paragraph 내부 hard/soft break node는 없다. | 제품 UX가 paragraph soft break를 요구하면 schema, cursor, renderer, markdown, history를 함께 설계해야 한다. |
| multi-range editing | current public selection은 single primary range다. Multi-cursor/multi-range replacement semantics는 없다. | multi-range selection을 추가할 때 command result patch ordering과 selectionAfter를 새로 정해야 한다. |
| collaborative/remote operation merge | current commands produce local JSON Patch and local selectionAfter. Remote op merge/conflict resolution은 없다. | collaboration data layer가 생기면 local command patch와 remote operation model을 분리해야 한다. |
| rich node graph paste restore | current clipboard restore는 text/markdown envelope와 supported fragment insertion이다. Node identity/topology restore는 없다. | node graph paste가 필요해지면 fragment insertion과 clipboard payload contract를 함께 설계해야 한다. |
| generated compatibility matrix | test suite가 broad behavior를 닫지만, external embedder용 generated command compatibility matrix는 없다. | public integration 요구가 생기면 supported input/command matrix를 generated docs로 만들지 결정해야 한다. |
| file-level refactor policy | `textCommands.ts`는 크지만 현재는 text mutation responsibility로 응집되어 있다. | 실제 독립 변경 이유가 반복되면 range replacement, atom replacement, fragment splice 등 internal modules로 분리할지 검토한다. |

## 현재 결론

뺄 수 없는 확정은 text mutation을 schema-aware command로 처리하고, patch와
`selectionAfter`를 함께 반환하는 구조다. Text/range/atom/code/figure/list split
분기는 caller가 배울 public method가 아니라 command implementation 안에 숨겨야 할
복잡성이다.

아직 확정하면 안 되는 것은 새 block schema, paragraph soft break, multi-range,
collaboration operation model, rich node graph paste, generated compatibility docs,
file-level 분할 정책이다. 현재 근거로는 동작을 넓히는 새 개념보다 현 command seam을
유지하는 쪽이 더 올바르다.
