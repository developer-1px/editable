# Editor Feature Coverage Audit

작성일: 2026-06-21
갱신일: 2026-06-22

범위: 현재 dirty workspace 기준. `docs/editor-required-feature-list.md`의 15개
섹션과 `docs/editor-input-contract.md`의 P0 입력 계약을
`docs/editor-issues.md`의 ED-001~ED-029 상태와
`src/editor/internal/**/*.test.*` 실행 테스트에 대조했다.

이 문서는 `docs/editor-required-feature-list.md`를 구현 완료 문서로 바꾸지
않는다. required list는 계속 제품/QA 기대 목록이고, 이 문서는 현재 코드에서
어디까지 확정으로 말할 수 있는지만 구분한다.

## 판정 기준

- 확정: ED acceptance가 완료되어 있고, 해당 동작을 직접 깨뜨리는 테스트가
  있다. 이 범위를 제거하면 현재 검증 기준선이 깨진다.
- 부분확정: 핵심 command/model/view 경로는 테스트가 있지만, 체크리스트 문구가
  더 넓은 제품/브라우저/UX 보장을 요구한다.
- 애매: 코드나 테스트 근거가 직접 보이지 않거나, 구현 의도만 있고 회귀 근거가
  부족하다.
- P0 입력: `docs/editor-input-contract.md`의 event sequence, intent, model
  result, selectionAfter, render state 중 하나라도 직접 근거가 없으면 부분확정
  또는 애매로 둔다.

## 요약

| 섹션 | 판정 | 확정으로 말할 수 있는 범위 | 남는 애매함 |
| --- | --- | --- | --- |
| 1. Selection State | 부분확정 | caret/range/node selection, selectedPointers 규칙, select-all, Escape context clear, normalization, focus loss selection preservation | 모든 native selection 전환 조합 |
| 2. Text Input And Replacement | 확정 | collapsed/range/node replacement, beforeinput insertion variants, active marks, atom/figure edge insertion, native text leaf gate | 제품 레벨 추가 입력 타입이 생기면 별도 갱신 필요 |
| 3. IME And Composition | 부분확정 | composition final commit, duplicated commit 제거, Korean trace, Enter confirmation, stale composition end 방지 | 브라우저/OS별 IME와 composition 중 selection 이동 전체 행렬 |
| 4. Clipboard And Transfer | 부분확정 | collapsed copy no-op, range/atom serialization, structured text/markdown envelope, custom/plain/markdown text fallback, custom and external markdown restore for marks/link/mention/figure/multi-block fragments, paste/drop/cut command path | custom MIME rich restore를 node graph/topology로 확장하는 제품 범위 |
| 5. Horizontal Keyboard Navigation | 확정 | ArrowLeft/Right, Shift range extension, inline/block atoms as one unit, boundary stability, preferredX clear | 없음. 현재 command surface 기준 확정 |
| 6. Word Keyboard Navigation | 부분확정 | Alt/Option word movement, Shift extension, atom unit movement, punctuation separators, marked text-run boundaries | locale/browser-specific word segmentation matrix |
| 7. Vertical And Page Keyboard Navigation | 확정 | geometry adapter 기반 ArrowUp/Down/PageUp/PageDown, preferredX, clamp, fallback | 실제 브라우저 layout matrix는 별도 QA |
| 8. Line, Block, And Document Boundary Navigation | 확정 | Home/End, Cmd/Ctrl line/document movement, Alt/Option block boundary movement, Shift extension | 없음. 현재 key mapping 기준 확정 |
| 9. Deletion | 확정 | character/grapheme/word/range/node deletion, inline/block atom deletion, paragraph merge, selectionAfter | 없음. 현재 model command 기준 확정 |
| 10. Block Editing | 확정 | Enter split, insertParagraph/insertLineBreak block-specific policy, atom edge split, list Tab/Shift+Tab, multi-block list indent, non-list Tab insert-text policy | 별도 paragraph soft-break model은 future feature 후보 |
| 11. Marks And Rich Text | 부분확정 | bold/italic/code/link command, active marks, pending href requirement, command href allowlist, markdown import/paste href allowlist, persisted href validation, range mark application, canonical mark merge, visible text offsets, renderer href safety | 실제 link 입력 UX와 legacy URL migration/sanitization 정책 |
| 12. History | 부분확정 | undo/redo document mutation restore, selection restore, beforeinput history, active native edit flush, explicit batch undo unit, successive single dispatch separate undo units, selection-only dispatch no undo entry, separate blur-flushed native edit sessions | future automatic typing merge/transaction 제품 정책 |
| 13. Pointer And Mouse Selection | 부분확정 | text caret click, atom click, double-click word selection, stale native range 방지, Shift pointer extension, triple block selection, drag range | 실제 브라우저 좌표/selection matrix는 별도 QA |
| 14. Rendering And Scrolling | 확정 | caret/range/selected atom overlay, pointer caret, focus affordance, overlay non-mutation, empty text rect, wrapped/atom geometry, scroll reveal | 보조 기술 announcement QA는 별도 |
| 15. Platform And Browser Policy | 부분확정 | Cmd/Ctrl intent mapping, unsupported command pass-through, F-key pass-through, beforeinput variants, explicit no-op keys, focused editor affordance | assistive-tech focus/selection announcement의 제품 수준 검증 |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| required feature list authority | 확정 | `docs/editor-required-feature-list.md`는 15개 제품/QA 기대 섹션을 담지만 구현 완료 문서가 아니다. 이 문서가 required list와 ED/test coverage 사이의 coverage map 역할을 한다. |
| P0 input contract authority | 확정 계약 | `docs/editor-input-contract.md`는 브라우저 event sequence를 editor intent, model result, selectionAfter, render state로 연결하는 기준표다. coverage는 이 계약의 각 필드가 실행 근거를 갖는지로도 판정한다. |
| ED implementation ledger | 확정 현재 상태 | `docs/editor-issues.md`는 ED-001~ED-029의 acceptance를 모두 체크 완료로 둔다. 단, ED ledger만으로 required list 전체 제품 완료를 증명하지는 않는다. |
| editor executable coverage inventory | 확정 snapshot | 현재 editor test file inventory는 `src/editor/internal`, `src/editor/public`, `src/editor/react` 아래 26개 test file이고, 전체 `pnpm test` 기준선은 29 files/755 tests다. |
| fully confirmed checklist sections | 확정 | Text Input And Replacement, Horizontal Keyboard Navigation, Vertical And Page Keyboard Navigation, Line/Block/Document Boundary Navigation, Deletion, Block Editing, Rendering And Scrolling은 현재 command/model/local rendering gate 범위에서 직접 깨지는 테스트가 있다. |
| partially confirmed checklist sections | 부분확정 | Selection State, IME And Composition, Clipboard And Transfer, Word Keyboard Navigation, Marks And Rich Text, History, Pointer And Mouse Selection, Platform And Browser Policy는 핵심 command/model/view 경로가 테스트되지만 제품/브라우저/UX/접근성 범위가 더 넓다. |
| clipboard rich transfer scope | 부분확정 | 현재 확정된 transfer seam은 `schema`, `plainText`, `markdown` 중심 envelope과 plain/markdown fallback이다. node graph, selection topology, future schema-specific payload 복원은 제품 범위가 아니다. |
| link mark policy | 부분확정 | command/model/markdown/render/persisted parse의 href allowlist와 unsafe href 방어는 확정이다. link 입력 UI와 legacy unsafe URL migration/drop policy는 정해지지 않았다. |
| history grouping policy | 부분확정 | 명시적 batch undo unit, separate single dispatch undo unit, selection-only no history entry, active native edit flush는 확정이다. timer/punctuation/composition 기준 automatic typing merge는 제품 정책이 없다. |
| required list 전체 완료 선언 | 제거 확정 | required list를 구현 완료 문서로 읽으면 `남은 Gap Map`의 browser/OS/assistive-tech matrix, 제품/API, 제품/UX, future feature, public import/migration 미정 항목을 지우게 된다. 이 해석은 유지하지 않는다. |
| browser/OS/assistive-tech matrix | 미정 | jsdom/local integration과 단일 Chrome smoke가 일부 증거를 주지만, OS별 IME, locale word segmentation, real browser pointer/selection event ordering, 보조 기술 announcement까지 닫는 matrix는 없다. |

## 남은 Gap Map

required list의 남은 항목은 구현 누락 한 종류가 아니다. ED-001~ED-029는 모두
완료됐지만, required checklist 문구 중 일부는 실행 테스트보다 넓은
제품/브라우저/마이그레이션 결정을 포함한다. 아래 항목은 아직 완료로 말하지 않는다.

| 분류 | 섹션 | 확정으로 유지할 것 | 아직 확정하지 않을 것 | 다음 이슈 성격 |
| --- | --- | --- | --- | --- |
| 브라우저/QA matrix | 1. Selection State | canonical caret/range/node selection, focus loss selection preservation, select-all, Escape context clear | native selection, selectionchange, blur/focus event-ordering 전체 조합 | Playwright/browser matrix QA |
| 브라우저/QA matrix | 3. IME And Composition | final commit, duplicate commit 제거, Korean trace, Enter confirmation, stale composition end 방지 | OS/browser별 IME와 composition 중 selection 이동 전체 행렬 | IME fixture와 real-browser trace 수집 |
| 제품/API 결정 | 4. Clipboard And Transfer | `{ schema, plainText, markdown }` custom MIME envelope, markdown/plain fallback, supported markdown fragment restore | node identity, selection topology, future schema-specific data를 담는 node graph paste | rich clipboard payload scope 결정 |
| 브라우저/QA matrix | 6. Word Keyboard Navigation | Alt/Option word movement, Shift extension, atom unit, punctuation, marked text-run boundary | locale/browser-specific word segmentation 전체 행렬 | locale segmentation fixture 결정 |
| future feature 후보 | 10. Block Editing | 현재 `insertLineBreak`는 block-specific split policy로 닫힘 | paragraph 내부 soft-break node/model 추가 | 별도 schema/UX feature로 평가 |
| 제품/UX 결정 | 11. Marks And Rich Text | command/model link seam, href allowlist, persisted href validation, renderer safety | link 입력 UI와 legacy unsafe URL migrate/drop policy | UX prompt와 migration policy 결정 |
| 제품/API 결정 | 12. History | explicit batch undo unit, separate single dispatch undo units, native edit flush unit | focus 유지 typing merge, timer/punctuation/composition 기준 transaction policy | history grouping contract 결정 |
| 브라우저/QA matrix | 13. Pointer And Mouse Selection | jsdom/local gate의 click, double/triple click, Shift extension, drag range | 실제 브라우저 좌표, text measurement, native selection event ordering | Playwright pointer matrix QA |
| 접근성 QA | 14, 15. Rendering/Platform | visual overlay, focus affordance, no-op key policy, Cmd/Ctrl intent mapping | assistive-tech focus/selection announcement | 보조 기술별 QA 기준 결정 |
| public import/migration | public surface/schema | `parseNoteDocument` -> `createEditor({ initial })`, generic invalid reason, internal schema 유지 | schema migration, field-level diagnostics, `untrustedInitial` ergonomics | public import contract 결정 |

## 섹션별 근거

### 1. Selection State

부분확정이다. ED-001, ED-017, ED-018, ED-029가 selection contract를 닫고,
`richSelection.test.ts`, cursor command split tests, cursor model split tests,
inputAdapter split tests, BlockEditor split tests가 caret/range/node serialization,
selectedPointers 규칙, select-all, Escape context clear, atom range rendering,
focus loss 후 canonical range selection 보존을 검증한다.

focus loss가 canonical selection 자체를 지우지 않는 정책은 이제 실행 테스트로
닫혔다. 아직 전체 확정이라고 부르기 어려운 지점은 browser native range,
selectionchange, blur/focus 전환의 모든 event-ordering 조합이다.

### 2. Text Input And Replacement

확정이다. ED-003, ED-020, ED-021, ED-022가 command와 native buffer 경로를
닫고, text command split tests, inputAdapter split tests,
contentEditable view split tests, BlockEditor split tests가 collapsed insert,
range replacement, explicit atom replacement, `insertText`,
`insertReplacementText`, active mark insertion, inline atom 주변 삽입, figure
주변 paragraph 생성, active text leaf gate를 검증한다.

현재 체크리스트의 범위 안에서는 빼면 안 되는 확정 동작이다.

### 3. IME And Composition

부분확정이다. ED-010, ED-020, ED-021과
contentEditable view split tests, `BlockEditor.imeTrace.test.tsx`,
BlockEditor split tests가 composition 중 model mutation 지연, final commit flush,
중복 final commit 제거, Korean composition trace, stale composition end 방지,
Enter confirmation, toolbar/history 전 flush 경로를 검증한다.

다만 브라우저와 OS별 IME는 상태공간이 크다. composition 중 selection 이동이
문서를 corrupt하지 않는다는 문구는 retargeting 회귀 테스트가 있지만 모든 플랫폼
조합을 닫았다고 보기는 어렵다.

### 4. Clipboard And Transfer

부분확정이다. ED-010, ED-021과 `clipboard split tests`,
inputAdapter split tests, BlockEditor split tests가 collapsed copy no-op, text
range serialization, atom fallback serialization, structured text/markdown envelope,
custom/plain/markdown text fallback, malformed structured payload fallback,
extra node/topology metadata ignored by the structured reader, plain paste/drop,
markdown-format marks/link/mention/figure/multi-block restore, range paste
replacement, cut deletion을 검증한다.

확정으로 말할 수 있는 현재 transfer seam은 문자열 중심이다. copy는
`text/plain`, `text/markdown`, `application/x-editable-selection+json`을 쓰고,
structured payload에는 `schema`, `plainText`, `markdown`만 들어간다. paste reader는
custom MIME을 먼저 읽고, structured `markdown`이 있으면 markdown format으로,
없으면 structured `plainText`를 plain format으로 넘긴다. 지원하지 않거나 비어 있는
payload이면 `text/plain`, 그 다음 `text/markdown`으로 fallback한다. `text/plain`은
plain format으로 들어가고, custom MIME `markdown`과 외부 `text/markdown` fallback은
markdown format으로 command layer에 들어간다. plain paste는 `insertText`이고,
markdown-format paste는 supported markdown fragment를 bold/italic/code/link marks,
mention, figure, multi-block structure로 복원할 수 있다. 이 fallback 정책은
테스트가 있어서 빼면 안 된다. structured payload에 `selectedPointers`나 `nodes`
같은 extra metadata가 들어와도 reader는 node graph로 승격하지 않고 text/markdown
result만 반환한다.

남는 애매함은 "supported rich content"의 의미다. 현재 structured envelope은
복사 데이터에 selection topology를 담지 않는다. custom MIME 붙여넣기에서 markdown으로
표현하지 못하는 node identity, selection topology, future schema-specific node data를
markdown fallback보다 강한 node graph로 복원하는 제품 범위까지 확정된 것은 아니다.

### 5. Horizontal Keyboard Navigation

확정이다. ED-002, ED-010, ED-018과 cursor model split tests,
cursor command split tests, inputAdapter split tests가 ArrowLeft/Right,
Shift+ArrowLeft/Right, inline mention과 figure atom one-unit movement,
document boundary stability, horizontal movement의 preferredX clear를 검증한다.

현재 command surface 기준으로 제거하면 검증이 깨지는 확정 기능이다.

### 6. Word Keyboard Navigation

부분확정이다. ED-025와 cursor model split tests, cursor command split tests,
inputAdapter split tests가 Alt/Option+ArrowLeft/Right, Shift extension, decomposed
letter grapheme, mention과 figure atom word-unit movement, punctuation separator,
marked text-run boundary movement를 검증한다.

체크리스트의 "whitespace, punctuation, marks, block edges 전체에서 deterministic"
문구는 넓다. 현재 model command 기준 대표 word/atom/block edge/punctuation/marked
run 회귀는 있지만, locale/browser-specific word segmentation matrix까지 완료
선언할 만큼 촘촘하게 닫았다고 보기는 어렵다.

### 7. Vertical And Page Keyboard Navigation

확정이다. ED-009, ED-024와 cursorGeometry split tests,
cursor command split tests, inputAdapter split tests, BlockEditor split tests가
ArrowUp/Down, Shift vertical extension, preferredX 유지, document boundary
clamp, PageUp/PageDown, page fallback, scroll reveal을 검증한다.

단, 이 확정은 내부 geometry adapter 계약 기준이다. 실제 브라우저 layout 차이
전체는 별도 시각 QA 범위다.

### 8. Line, Block, And Document Boundary Navigation

확정이다. ED-010, ED-024, ED-027과 inputAdapter split tests,
cursor command split tests, cursorGeometry split tests가 Home/End,
Shift+Home/End, Cmd/Ctrl+ArrowLeft/Right line boundary, Cmd/Ctrl+ArrowUp/Down
document boundary, Alt/Option+ArrowUp/Down block boundary, Shift extension을
검증한다.

현재 key mapping 기준으로는 애매한 잔여 요구가 보이지 않는다.

### 9. Deletion

확정이다. ED-004, ED-005, ED-026과 text command split tests,
inputAdapter split tests가 Backspace/Delete, grapheme deletion, selected range
deletion, explicit node selection deletion, beforeinput delete variants, word
deletion, inline/block atom deletion, paragraph merge, deterministic
selectionAfter를 검증한다.

현재 model command 기준으로 빼면 안 되는 확정 기능이다.

### 10. Block Editing

확정이다. ED-005, ED-021, ED-023과 text command split tests,
inputAdapter split tests, `blockCommands.test.ts`, BlockEditor split tests가 Enter
split, `insertParagraph`와 `insertLineBreak`의 block-specific policy, selected
range delete-then-split, atom edge split, list indent/outdent, multi-block list
indent, non-list Tab policy를 검증한다.

확정으로 말할 수 있는 현재 정책은 이렇다. `Enter`, `insertParagraph`,
`insertLineBreak`는 같은 headless `splitParagraph` interface로 수렴한다.
paragraph/heading/quote/listItem 계열 inline text block에서는 block split을
만들고, codeBlock에서는 같은 command가 newline을 삽입한다. inline atom과
figure edge에서는 유효한 인접 paragraph를 만든다. 이 정책은 테스트가 있어서
빼면 안 된다.

Tab 정책도 현재는 미정이 아니다. listItem selection에서는 `Tab`과 `Shift+Tab`이
headless list depth command로 들어간다. list 밖에서 plain `Tab`은 DOM focus 이동이
아니라 `insertText(document, selection, "\t")`로 들어가고, list 밖 `Shift+Tab`은
문서 mutation 없는 selection no-op으로 닫혀 있다. 이 정책은
inputAdapter split tests의 Tab outside list 회귀 테스트가 직접 고정한다.

paragraph soft-break는 현재 애매함이 아니라 future feature 후보로 분리한다.
현재 document schema에는 paragraph 안의 soft-break node가 없고,
`insertLineBreak`도 별도 inline break를 만들지 않는다. 체크리스트가 "configured
soft-break or block-split policy"라고 열어 둔 지점은 이미 block-split policy로
닫혔다.

### 11. Marks And Rich Text

부분확정이다. ED-015, ED-022, ED-028과 `mark command split tests`,
inputAdapter split tests, `normalizer.test.ts`, cursor model split tests,
`DocumentRenderer split tests`가 bold/italic/code/link toggle, range mark
application, collapsed active marks, active mark insertion, pending
`selection.context.pendingLinkHref`, missing href rejection, canonical mark merge,
visible-text cursor offsets, structured mark rendering을 검증한다.

확정으로 말할 수 있는 현재 link 정책은 command/model seam 기준이다.
`Cmd/Ctrl+K`는 `toggleLink`로 가고, range selection에는 link mark patch를 만든다.
collapsed selection에는 future insertion용 active link mark를 selection context에
저장한다. href는 `selection.context.pendingLinkHref`가 있을 때만 새 link를 만든다.
pending href가 없으면 임의 fallback URL을 넣지 않고 실패한다. document schema,
markdown import/export, renderer는 safe link href/title을 구조화된 mark로 보존한다.
command-created href는 trim 후 `http:`, `https:`, `mailto:`, `tel:`, relative URL
allowlist를 통과해야 한다. markdown import/paste도 같은 allowlist를 통과한 href만
link mark로 쓰고, unsafe markdown link는 label text만 보존한다. renderer도 같은
안전 계층으로 `javascript:` 같은 unsafe scheme을 clickable DOM `href`로 내보내지
않는다. persisted parse도 unsafe link href를 generic failure로 거절한다.

애매함은 link 입력 UX와 legacy URL policy다. toolbar에는 link 버튼이나
prompt가 없고, `pendingLinkHref`를 세팅하는 제품 UI도 아직 없다.
이미 존재하는 legacy document의 unsafe href를 migrate/drop할 별도 정책은 아직 제품
범위로 닫혀 있지 않다.

### 12. History

부분확정이다. ED-003, ED-006, ED-013, ED-017, ED-021과
text command split tests, editor regression split tests,
`richSelection.test.ts`, `editorCore split tests`, BlockEditor split tests가
undo/redo document restore, selection restore, open range restore,
beforeinput history undo/redo, active native edit flush, blur-flushed native edit
as one undo unit, explicit batch dispatch as one undo unit, successive single
dispatch separate undo units, selection-only dispatch no undo entry, separate
blur-flushed native edit sessions를 검증한다.

확정으로 말할 수 있는 현재 정책은 이렇다. `json-document` commit은
`selectionAfter`를 history entry에 저장하고 undo/redo 때 document와 selection을
함께 복원한다. `createEditor().dispatch([...])` batch는 draft에서 여러 command를
평가한 뒤 실제 document에 한 번 commit하므로 undo unit 하나가 된다.
반대로 batch가 아닌 연속 `createEditor().dispatch({ type: "insertText" })`
호출은 자동 merge되지 않고 각각 undo unit이 된다.
`moveSelection`처럼 patch가 없는 selection-only dispatch는 selection만 restore하고
document history entry를 만들지 않는다. `BlockEditor`의 active native text edit은
undo/redo 전에 flush되어 한 번의 replace patch로 기록된다. blur로 active native
edit이 release되는 경우도 undo unit 하나로 기록되고 redo로 복원된다. blur로 끊긴
여러 native edit session은 자동 merge되지 않고 각각 undo unit으로 남는다.

남는 애매함은 future automatic typing merge와 제품 API 정책이다.
`DispatchOptions`/`mergeKey` public surface는 제거했고, 현재 editor surface는
명시적 batch와 별도 single dispatch undo 단위를 구분한다. focus를 유지한 여러
native edit session, timer, punctuation, composition 같은 시간/원인 기준 merge를
추가할지는 아직 제품 정책으로 남아 있다.

### 13. Pointer And Mouse Selection

부분확정이다. BlockEditor split tests와 `blockEditorSelection.ts`가 text caret
click, atom pointer selection, stale native range보다 atom selection 우선, typed
replacement over atom selection, Shift pointer extension, double-click word
selection, triple pointer block selection, drag range selection을 뒷받침한다.

다만 이 확정은 jsdom geometry와 local integration gate 기준이다. 실제 브라우저
좌표, text measurement, native selection event ordering의 전체 matrix까지 닫은
것은 아니다.

### 14. Rendering And Scrolling

확정이다. ED-007, ED-008, ED-011과 `DocumentRenderer split tests`,
`CursorOverlay.test.tsx`, `SelectionOverlay.test.tsx`, cursorGeometry split tests,
BlockEditor split tests가 canonical selection 기반 caret/range/selected atom
rendering, overlay non-mutation, empty text run caret box, wrapped line geometry,
inline/block atom geometry, keyboard movement 후 scroll reveal을 검증한다.

단, 이 확정은 local unit/integration gate 기준이다. `docs/editor-visual-selection-audit.md`
기준으로 range/atom overlay 색상, focused editor affordance, collapsed pointer
caret, dashed figure outline 제거는 Chrome headless에서 확인했다. 남은 브라우저 QA는
assistive-tech announcement다.

### 15. Platform And Browser Policy

부분확정이다. ED-021, ED-029와 inputAdapter split tests,
`editorKeyboardPolicy.test.ts`, BlockEditor split tests,
contentEditable view split tests가 macOS Cmd와 Windows/Linux Ctrl intent
mapping, unsupported shortcut pass-through, F-key pass-through, beforeinput
variant normalization, prevented-but-no-op structural keys를 검증한다.

남는 애매함은 assistive-tech 관점의 focus/selection announcement다. role, focus
경로, visual focused editor affordance는 있지만, 접근성 보조 기술 관점의 제품
검증까지 완료됐다고 보기는 어렵다.

## 다음에 이슈화할 애매 항목

- link mark 입력 UX와 legacy URL migration/sanitization policy 결정.
- future automatic typing merge나 별도 transaction surface 필요 여부 명시.
- custom MIME rich paste를 현재 text/markdown envelope로 유지할지, model node graph
  복원까지 확장할지 결정.
- browser/OS IME matrix, assistive-tech focus/selection announcement, visual selection token QA
  범위 결정.
