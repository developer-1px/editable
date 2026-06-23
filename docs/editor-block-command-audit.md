# Editor block command audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. Block editing 중 `Enter` split처럼 text mutation으로
이미 닫힌 영역과, 별도 block command인 list depth adjustment가 어디까지 확정인지
나눈다. 특히 `blockCommands.ts`가 뺄 수 없는 model command인지, 아니면 public block
command surface로 키워야 하는지 판정한다.

## 목적

Block editing은 schema, keyboard adapter, text mutation, cursor selection을 모두
건드린다. 그래서 "블록 명령"이라는 이름만 보고 heading/quote/list toggle, nested list
tree, task item 같은 surface를 미리 만들면 얕은 module이 되기 쉽다.

현재 구현에서 확인되는 독립 block command는 list item depth adjustment 하나다. 이
문서는 그 command는 유지하되, 아직 근거가 없는 public block command 확장은 보류로
남긴다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/blockCommands.ts` | 선택이 닿은 `listItem` block의 `depth`를 indent/outdent 방향으로 patch한다. |
| `src/editor/internal/model/blockCommands.test.ts` | collapsed list selection, open range가 닿은 multi-list selection, non-list no-op을 검증한다. |
| `src/editor/internal/model/input-adapter/inputAdapter.ts` | list selection에서 `Tab`/`Shift+Tab`을 list depth command로 보내고, list 밖 plain `Tab`은 text insertion, list 밖 `Shift+Tab`은 selection no-op으로 둔다. |
| inputAdapter split tests | Tab block editing policy와 unsupported structural shortcut no-op을 검증한다. |
| `src/editor/internal/model/text-command/textCommands.ts` | paragraph/heading/quote/listItem split, codeBlock newline, figure edge insertion 같은 structural editing은 text mutation command가 소유한다. |
| `src/editor/internal/model/editorCore.ts` | public `createEditor()` command surface에는 별도 block command가 없고, `split`, `insertText`, `insertNode`, `delete`, `moveSelection` 등이 좁게 노출된다. |
| `docs/editor-text-mutation-command-audit.md` | block split/merge/fragment insertion은 text mutation seam 뒤에 숨기고, list depth command만 별도 block command라고 정리한다. |
| `docs/editor-keyboard-input-policy-audit.md` | `Tab` ownership과 input adapter policy를 keyboard boundary 관점에서 확정한다. |
| `docs/editor-feature-coverage-audit.md` | Block Editing 섹션은 현재 command/model 기준 확정이고 paragraph soft-break는 future feature 후보로 남긴다. |

## 확정 block command behavior

| 항목 | 확정 내용 |
| --- | --- |
| list item target | `adjustSelectedListDepth`는 `listItem` block만 대상으로 한다. Paragraph, heading, quote, codeBlock, figure selection은 `null`을 반환한다. |
| collapsed selection | caret이 list item 내부에 있으면 해당 list item 하나의 depth만 조정한다. |
| open range selection | range가 겹치는 모든 list item을 대상으로 하되, range 밖 list item과 non-list block은 건드리지 않는다. |
| indent/outdent delta | indent는 `depth + 1`, outdent는 `depth - 1`이다. Outdent는 0 아래로 내려가지 않는다. |
| patch shape | command result는 JSON Patch `replace /root/children/{index}/depth` 목록과 기존 `selectionAfter`를 반환한다. |
| no touched list item | selection이 list item에 닿지 않으면 command가 `null`을 반환하고, input adapter가 다음 policy를 결정한다. |
| keyboard policy | list selection에서 `Tab`은 indent, `Shift+Tab`은 outdent다. List 밖 plain `Tab`은 tab text insertion이고, list 밖 `Shift+Tab`은 selection-only no-op이다. |
| text mutation split | Enter, insertParagraph, insertLineBreak, block split/merge, figure edge insertion은 block command가 아니라 text mutation command 영역이다. |
| public surface | public `createEditor()`에는 별도 `adjustListDepth` command가 없다. 현재 public caller는 generic `dispatch` surface와 keyboard/input adapter 경로를 기준으로 한다. |

## 증거 강도

| 판정 대상 | 강도 | 근거 |
| --- | --- | --- |
| list item target only | 실행 테스트로 확정 | `blockCommands.test.ts`가 non-list selection에서는 `adjustSelectedListDepth`가 `null`을 반환한다고 검증한다. |
| collapsed list item adjustment | 실행 테스트로 확정 | `blockCommands.test.ts`가 collapsed list item selection의 indent/outdent depth patch와 selection preservation을 검증한다. |
| open range touched-list targeting | 실행 테스트로 확정 | `blockCommands.test.ts`가 open range가 닿은 list items만 depth patch로 바꾼다고 검증한다. |
| outdent clamp | 실행 테스트로 확정 | `blockCommands.test.ts`가 depth 0 outdent는 empty patch를 반환하고 selection을 유지한다고 검증한다. |
| JSON Patch shape | 실행 테스트로 확정 | `blockCommands.test.ts`와 inputAdapter split tests가 `/root/children/{index}/depth` replace patch shape를 검증한다. |
| list Tab/Shift+Tab adapter policy | 실행 테스트로 확정 | inputAdapter split tests가 list selection에서 `Tab`은 indent, `Shift+Tab`은 outdent로 번역한다고 검증한다. |
| non-list Tab policy | 실행 테스트로 확정 | inputAdapter split tests가 list 밖 plain `Tab`은 tab text insertion, list 밖 `Shift+Tab`은 selection-only no-op이라고 검증한다. |
| text mutation split ownership | source/tests/docs 확정 | Enter/split/paragraph/code/figure edge structural edits are implemented in `textCommands.ts` and covered by text/input adapter tests, not `blockCommands.ts`. |
| public adjustListDepth absence | source/docs 확정 | `createEditor()` public command descriptor registry에는 `adjustListDepth` command가 없다. Current route uses keyboard/input adapter path. |
| block type conversion commands | 미정 | paragraph-to-heading, quote/list toggle, ordered/unordered conversion semantics and toolbar/shortcut UX are not implemented. |
| nested list tree semantics | 미정 | current canonical model is flat `listItem.depth`; parent/child tree, numbering restart, invalid depth gap normalization are not specified. |
| custom block command registry | 미정 | current command registry is closed; custom node/block command extension requires schema/renderer/cursor/Markdown contracts. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `adjustSelectedListDepth` | 유지 확정 | list range targeting과 depth patch를 input adapter에 흩뿌리지 않고 좁은 model command에 모은다. |
| `blockCommands.ts` 파일 | 유지 확정 | text mutation과 별개인 list depth adjustment만 담고 있어 역할이 작고 분명하다. 삭제하면 Tab policy가 input adapter 내부 구현으로 퍼진다. |
| `Tab` list editing policy | 유지 확정 | feature coverage, keyboard audit, input adapter tests가 같은 current policy를 가리킨다. |
| list 밖 plain `Tab` text insertion | 유지 확정 | current configured editor policy다. DOM focus movement가 아니라 document text insertion으로 테스트가 고정한다. |
| list 밖 `Shift+Tab` selection no-op | 유지 확정 | list target이 없을 때 outdent를 문서 mutation으로 해석하지 않는다. |
| public `adjustListDepth` command | 보류 | public command registry에 아직 없는 surface다. Keyboard-driven list depth만 확인됐고, external embedding ergonomics 요구가 없다. |
| heading/quote/list toggle commands | 보류 | schema에는 block types가 있지만 block type conversion command와 toolbar/markdown shortcut contract는 없다. 지금 만들면 제품 UX 없는 얕은 command가 된다. |
| nested list tree model | 보류 | 현재 list nesting은 flat block `depth` number다. Parent/child tree, numbering restart, list grouping model은 schema extension 정책이다. |
| task list/table/caption block commands | 보류 | current schema 밖이다. 새 block schema, renderer, cursor, markdown, command strategy가 함께 필요하다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| public block command surface | 현재 public editor command union은 closed registry이며 별도 block command가 없다. `Tab` adapter path만으로 충분한지, embedding caller가 programmatic indent/outdent를 원할지는 아직 증거가 없다. | toolbar/list controls나 external embedding 요구가 생기면 `adjustListDepth`를 public command로 승격할지 결정한다. |
| block type conversion | heading, quote, list item schema는 있지만 paragraph-to-heading, quote toggle, ordered/unordered list toggle command는 없다. | formatting toolbar나 markdown shortcut 요구가 생기면 conversion semantics, mark preservation, selection placement를 함께 설계한다. |
| list structure semantics | flat `depth`가 canonical model이다. Nested list tree, parent-child ownership, numbering restart, invalid depth gap normalization은 없다. | list rendering/serialization 요구가 강해지면 normal form과 markdown compatibility matrix를 같이 정한다. |
| paragraph soft break | 현재 Enter/insertLineBreak는 block-specific split policy다. Paragraph 내부 soft-break node는 schema/cursor/render policy가 없다. | soft-break UX가 필요하면 text mutation, cursor stream, markdown export를 함께 설계한다. |
| custom block command registry | 현재 command registry는 closed map이다. Plugin block command나 custom node command extension seam은 없다. | custom schema/plugin 요구가 실제로 생기면 command registry extension과 node descriptor contract를 같이 설계한다. |

## 현재 결론

뺄 수 없는 확정은 `adjustSelectedListDepth`가 담당하는 list item depth adjustment와
input adapter의 Tab policy다. 이 command는 작지만, list range targeting과
outdent clamp를 model layer에 모아 React/key handling으로 흩어지는 복잡도를 막는다.

아직 확정하면 안 되는 것은 public block command surface, heading/quote/list toggle,
nested list tree semantics, paragraph soft-break model, custom block command registry다.
현재 올바른 형태는 list depth만 좁은 internal command로 유지하고, 나머지는 제품
요구가 생길 때 schema/renderer/cursor/markdown까지 같이 설계하는 것이다.
