# 레포 분석 리포트

작성일: 2026-06-21
갱신일: 2026-06-23

범위: 현재 dirty workspace 기준. 기존 사용자 변경은 되돌리지 않고, 지금
존재하는 에디터 구조를 기준으로 확정/애매를 나눴다.

## 검증 기준선

`pnpm run verify:internal -- --repeat=1`로 확인한 항목:

- focused/skipped/todo test marker scan: 112개 test/spec 파일, violation 없음
- Vitest discovery parity: Vitest 112개 test file, marker scan 112개 test file,
  차이 없음
- `pnpm run verify:docs`
- `pnpm run verify:boundaries`
- `pnpm exec tsc --noEmit`
- `pnpm test`: 112개 파일, 894개 테스트
- `pnpm exec vitest run --sequence.shuffle --sequence.seed=20260621`: 112개
  파일, 894개 테스트
- `pnpm check`: Biome 301개 파일
- `pnpm build`: client/SSR build와 route tree stability 확인
- `git diff --check`

상태: 전부 통과.

## 증거 강도 커버리지

| 항목 | 현재 상태 | 판정 |
| --- | --- | --- |
| `docs/editor-*.md` evidence section | 88 / 88 files have `## 증거 강도` | 확정 |
| README Docs inventory and editor evidence coverage | 90 docs entries, 88 editor evidence sections, `verify:docs` 통과 | 확정 |
| `docs/editor-issues.md` | ED-001~ED-029 accepted work ledger, unchecked acceptance 0개 | 확정 현재 상태 |
| `docs/editor-required-feature-list.md` | 15-section product/QA checklist, implementation-complete interpretation 제거 | 확정/미정 분리 |
| `docs/editor-feature-coverage-audit.md` | required 15 sections를 coverage summary 15 rows로 대조 | 확정/부분확정/미정 분리 |

이 커버리지는 "모든 제품 기능 완료"가 아니라 "각 editor 문서가 자신이
증명할 수 있는 것과 아직 증명하지 않는 것을 명시한다"는 상태를 뜻한다.
`docs/repo-analysis-report.md`와 `docs/rich-model-design.md`는 각각 synthesis와
design reference라서 `editor-*.md` evidence-section 커버리지 대상이 아니다.

## OCP 분기 점검

변경 시나리오: "새 block type `callout`, 새 inline atom `emoji`, 새 mark
`underline`을 추가하면?"

최신 SRP split 이후 `textCommands.ts`는 public facade라 더 이상 branch hotspot이
아니다. 단순 `if`/`switch` count 기준 상위 압력은
`markdownInlineImport.ts` 30 if/0 switch,
`contentEditableTextPoint.ts` 25 if/0 switch,
`textCommandDeletion.ts` 24 if/0 switch,
`contentEditableViewEngine.ts` 23 if/0 switch,
`cursorMovement.ts` 20 if/0 switch다. 이는 "if가 많으니 곧바로 설계 문제"가
아니라, 같은 variant 집합을 여러 소비자가 알아야 하는지 확인하기 위한 출발점이다.

### 분기 수집

| # | 위치 | 함수/모듈 | 분기 대상 | case/조건 수 | 소비자 여부 |
| --- | --- | --- | --- | --- | --- |
| 1 | `src/editor/internal/model/noteDocument.ts` | schema/type guards | block/inline/mark literal set | mark 4, inline atom 1, block 6 | N, 필수 정의 지점 |
| 2 | `src/editor/internal/react/DocumentRenderer.tsx` | `BlockView`, `InlineView`, `renderMark` | block/inline/mark render projection | block 5 + fallback, inline 1 + fallback, mark 3 + fallback | Y |
| 3 | `src/editor/internal/model/markdown.ts` | import/export helpers | markdown syntax to/from block/inline/mark | block 5 + fallback, inline 1 + fallback, mark 4 | Y |
| 4 | `src/editor/internal/model/cursor.ts` and cursor helpers | cursor facade, movement, endpoint, map/index/address projection | figure/code/inlineText/mention cursor semantics | helper별로 격리된 figure/code/mention branches | Y |
| 5 | `src/editor/internal/model/text-command/textCommandSelection.ts` | block start/end selection snaps | figure/code/inline text/mention selection target | start/end duplicated atom/code/text branches | Y |
| 6 | `src/editor/internal/model/text-command/textCommands.ts` | split/merge/range replacement | paragraph/block/codeBlock/atom mutation semantics | hotspot 79 branches | Y |
| 7 | `src/editor/internal/view/cursor-geometry/cursorGeometryDom.ts` | DOM class classifiers | text block, block atom, inline atom geometry classes | text-block class set, figure, mention | Y |

### 수정 지점 수집

| # | 파일 | 함수/모듈 | 새 항목 추가 시 수정 내용 | 필수 정의 지점인가 |
| --- | --- | --- | --- | --- |
| 1 | `noteDocument.ts` | schema/type guard/factory | 새 literal과 normal form 정의 | Y |
| 2 | `DocumentRenderer.tsx` | block/inline/mark rendering | DOM tag/class/data-path/contentEditable/render policy | N |
| 3 | `markdown.ts` | import/export | syntax, fallback, round-trip policy | N |
| 4 | cursor facade/helpers | cursor stream/path addressing | text leaf/atom/block edge semantics, 단 paragraph-like inline text block은 기존 guard를 재사용할 수 있음 | N |
| 5 | `textCommandSelection.ts` | selection snap | block/inline boundary selection target, 단 paragraph-like inline text block은 기존 guard를 재사용할 수 있음 | N |
| 6 | `textCommands.ts` | mutation commands | split/merge/delete/replace behavior, 단 paragraph-like inline text block은 기존 generic path를 재사용할 수 있음 | N |
| 7 | `cursorGeometryDom.ts` and layout helpers | geometry classification | DOM class to text/atom/block geometry role mapping, 단 `.text-block`을 유지하면 추가 분기가 없을 수 있음 | N |

동반 변경 지수: 단순 paragraph-like `callout`은 필수 schema/type guard와 renderer,
필요 시 Markdown fidelity 정도로 끝날 수 있다. 이 경우 추가 수정 지점은 1~2곳이라
OCP 위반이라고 단정하지 않는다. 반대로 새 block/inline atom/mark를 public/custom
extension으로 열고 고유 render, Markdown, cursor, selection, mutation, geometry
semantics를 보존해야 하면 필수 정의 지점 외에도 여러 소비자가 같이 열리므로
추가 수정 지점이 2곳을 크게 넘는다.

### 열린/닫힌 판단

| 분기 대상 | 열린/닫힌 | 값의 정의 소스 | 근거 |
| --- | --- | --- | --- |
| block type | 현재 닫힘 | `NoteBlockSchema`, `schemaVersion: 1` | current normal form은 paragraph/heading/quote/listItem/codeBlock/figure로 닫혀 있고, richer/custom block schema는 별도 제품/API 결정으로 남겨져 있다. |
| inline atom type | 현재 닫힘 | `InlineNodeSchema` | current inline set은 text/mention이고, plugin-defined inline node나 custom atom cursor semantics는 아직 없다. |
| mark type | 현재 닫힘 | `MarkSchema` | current mark set은 bold/italic/code/link이며 underline/strike/color/public mark plugin은 미정이다. |
| renderer/Markdown/cursor extension | 보류 | 제품/API scope 없음 | custom node renderer, schema-aware exporter, custom cursor descriptor 요구가 아직 실제 caller contract로 닫히지 않았다. |

### 결론

판정: 현재 scope에서는 OCP 허용, future plugin/custom node scope에서는 OCP 위반
위험이 높다.

근거: `schemaVersion: 1`의 block/inline/mark 집합은 현재 닫힌 normal form이므로
타입별 `if` 자체는 제거 대상이 아니다. 단순히 기존 inline text block semantics를
공유하는 variant라면 기존 generic path를 일부 재사용할 수 있다. 반대로 새
block/inline/mark를 외부 확장점으로 열고 고유 semantics를 보존해야 한다면
renderer, markdown, cursor, selection, mutation, geometry가 같은 variant 이름을
반복해서 알아야 하므로 descriptor/strategy 없이는 추가 수정 지점이 2곳을 크게
넘는다.

다음 단계: 지금은 새 추상화를 넣지 않는다. custom block/inline/mark가 실제 제품
요구로 확정되면, 한 덩어리의 거대한 registry가 아니라 책임별 descriptor
(`render`, `markdown`, `cursor`, `mutation`, `geometry role`)로 추가 수정 지점을
0~1곳까지 줄이는 설계를 별도로 잡는다.

## 30년 구조 판정

여기서 "30년 갈 구조"는 시간이 지나도 문제 자체가 바뀌지 않는 core editor
architecture를 말한다. 즉 novel architecture가 아니라 이미 검증된 rich-text editor
해법인 document model, transaction/command layer, selection/cursor model, DOM/view
adapter, input normalization pipeline을 서로 섞지 않는 구조다.

사용자가 말한 "이미 해법이 나온 문제이고 앞으로도 변하지 않을 문제"라는 기준으로
보면, 이 평가는 최신 프레임워크 취향이나 파일 개수 평가가 아니다. 긴 수명의
편집기는 보통 다음 원칙을 어기지 않을 때만 30년형 구조라고 부를 수 있다.

- DOM/contenteditable/native selection은 입력 장치이자 projection일 뿐, 문서의
  진실이 아니다.
- canonical document와 canonical selection이 모든 command의 입출력이다.
- command는 patch와 `selectionAfter`를 반환하고 DOM을 읽지 않는다.
- browser/IME/geometry 차이는 view adapter 뒤에 숨긴다.
- public interface는 작게 유지하고, 내부 구현은 verifier가 막는 internal surface
  안에서 계속 바꿀 수 있어야 한다.
- 닫힌 product schema의 `if`는 결함이 아니다. 다만 같은 닫힌 문제를 여러
  controller/command 파일이 반복해서 풀고 있으면 장기 구조가 약하다.

### 현재 구현 컨셉 맵

```text
editor
+-- public seams
|   +-- src/editor/public
|   |   +-- createEditor()
|   |   +-- parseNoteDocument()
|   |   +-- public document/command/query/result types
|   +-- src/editor/react
|       +-- BlockEditor
|       +-- BlockEditorProps
+-- internal stable core
|   +-- model
|   |   +-- noteDocument schema and normal form
|   |   +-- richSelection and cursor stream
|   |   +-- cursorWordMovement word boundary resolver
|   |   +-- text-command/
|   |   |   +-- text mutation command implementation and tests
|   |   +-- input-adapter/
|   |   |   +-- keydown/beforeinput/paste translation and tests
|   |   +-- mark/block/cursor commands
|   |   +-- editorCore dispatch shell
|   |   +-- editorCoreDescriptors command/query registry
|   |   +-- markdown and clipboard model adapters
|   +-- testing contracts
|       +-- p0 input conformance matrix
|       +-- trace replay
+-- internal view adapters
|   +-- contenteditable/
|   |   +-- contentEditableViewEngine
|   |   +-- native text leaf buffer
|   |   +-- beforeinput/composition decision
|   |   +-- flush to canonical patch + selection
|   |   +-- InputEvent paste/drop transfer normalization
|   |   +-- native selection bridge and scroll reveal
|   +-- cursor-geometry/
|   |   +-- cursorGeometry factory/query implementation
|   |   +-- rect/range/hit-test/vertical movement fixtures
|   +-- keyboard/focus/clipboard DOM policy
+-- internal react wiring
|   +-- BlockEditor wrapper
|   +-- block-editor/
|   |   +-- BlockEditor markup
|   |   +-- useBlockEditorController
|   |   +-- top-level state/ref wiring
|   |   +-- handler composition surface
|   |   +-- useBlockEditorBeforeInputHandler
|   |   +-- beforeinput native event bridge
|   |   +-- contenteditable decision dispatch
|   |   +-- composition commit handoff
|   |   +-- useBlockEditorCompositionHandlers
|   |   +-- composition start/end lifecycle
|   |   +-- native input cursor preview tracking
|   |   +-- read-only composition reset
|   |   +-- useBlockEditorContentEditableTransactions
|   |   +-- native buffer reset/flush transaction
|   |   +-- input result patch/selection application
|   |   +-- command dispatch bridge
|   |   +-- useBlockEditorKeyDownHandler
|   |   +-- keymap command bridge
|   |   +-- read-only keydown guard
|   |   +-- headless keydown dispatch
|   |   +-- useBlockEditorLayoutState
|   |   +-- layout measured/version state
|   |   +-- selection reveal scroll effect
|   |   +-- useBlockEditorNativeSelectionHandlers
|   |   +-- focus/autofocus selection projection
|   |   +-- canonical to native selection sync
|   |   +-- selectionchange/select native range tracking
|   |   +-- useBlockEditorPointerHandlers
|   |   +-- pointer down/move/up/cancel handlers
|   |   +-- atom/text hit selection policy
|   |   +-- drag range lifecycle
|   |   +-- useBlockEditorClipboardHandlers
|   |   +-- native copy/cut/paste/drop handlers
|   |   +-- clipboard keymap bridge
|   |   +-- drop coordinate to selection policy
|   |   +-- useBlockEditorToolbarCommandHandlers
|   |   +-- toolbar insert mention/figure commands
|   |   +-- undo/redo command bridge
|   |   +-- before-command flush/focus restore
|   +-- DocumentRenderer
|   +-- CursorOverlay / SelectionOverlay
|   +-- Toolbar / debug recorder
+-- internal diagnostics
|   +-- debug/interaction-recorder
|       +-- recorder hook, event serialization, report, timeline, diagnostics
+-- gates
    +-- verify:docs
    +-- verify:boundaries
    +-- tsc / vitest / shuffled vitest / biome / build / diff check
```

### 정석과 맞는 부분

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| DOM이 source of truth가 아닌 구조 | 확정 | README, model/view/react split, `contentEditableViewEngine` tests가 canonical JSON state와 native text buffer를 분리한다. 이건 장기 구조의 핵심이다. |
| public facade 2개 | 확정 | headless `src/editor/public`과 React `src/editor/react`가 작고, verifier가 internal leak을 막는다. public interface가 작아서 내부 재구성이 가능하다. |
| command/query registry | 확정 | `createEditor()`는 six-method interface 뒤에 command descriptors, selection-aware history, batch atomicity, geometry adapter escape hatch를 숨긴다. |
| schemaVersion 1 closed normal form | 확정 current scope | 현재 block/inline/mark set은 닫힌 product schema다. 닫힌 집합이면 type별 분기 자체는 설계 결함이 아니다. |
| selection/cursor model | 확정 | text path+offset, atom before/after edge, logical cursor stream, geometry-backed movement가 model/view adapter 사이에 놓여 있다. |
| contenteditable/IME 격리 | 확정 방향 | native DOM edit, IME phase, composition final commit, DOM restore가 view adapter로 분리되어 React handler에 완전히 흩어지지는 않는다. |

### 30년 구조로는 아직 약한 부분

| 항목 | 판정 | 근거 | 필요한 방향 |
| --- | --- | --- | --- |
| `useBlockEditorController.tsx` top-level wiring | 유지/C | 현재 import 제외 LOC 317, `if` 6개다. DOM pointer capture fallback은 `blockEditorPointerCapture.ts`, pointer drag/selection handler는 `useBlockEditorPointerHandlers.ts`, beforeinput bridge는 `useBlockEditorBeforeInputHandler.ts`, composition start/end/input lifecycle은 `useBlockEditorCompositionHandlers.ts`, contenteditable reset/flush/input/command transaction은 `useBlockEditorContentEditableTransactions.ts`, keydown bridge는 `useBlockEditorKeyDownHandler.ts`, native focus/selection listener는 `useBlockEditorNativeSelectionHandlers.ts`, layout/reveal state는 `useBlockEditorLayoutState.ts`, clipboard/cut/paste/drop bridge는 `useBlockEditorClipboardHandlers.ts`, toolbar command bridge는 `useBlockEditorToolbarCommandHandlers.ts`, patch/selection projection helper는 `blockEditorSelectionState.ts`로 빠졌다. 남은 코드는 document owner, refs/state, geometry/overlay, selection source callback, 하위 hook composition, return shape를 잇는 controller 책임 1개다. | 300 LOC를 넘는다는 이유만으로 더 쪼개지 않는다. 별도 product owner가 생기는 title/toolbar/debug state 같은 변경 이유가 반복될 때만 다시 판정한다. |
| input key/beforeinput translation | 부분해소/K | Root `inputAdapter.ts`는 compatibility wrapper가 되었고 구현과 split tests는 `model/input-adapter/`에 모았다. `input-adapter/inputAdapter.ts`는 beforeinput/paste translation, `inputAdapterKeyDown.ts`는 editing shortcut/read-only keydown policy, `inputAdapterNavigationKeyDown.ts`는 navigation keydown mapping을 맡는다. React keydown event bridge는 `react/block-editor/useBlockEditorKeyDownHandler.ts`, React beforeinput event bridge는 `react/block-editor/useBlockEditorBeforeInputHandler.ts`에 있다. | keydown policy는 독립 파일/폴더로 격리됐지만 여전히 절차형이다. 실제 shortcut 추가/변경 비용이 반복되면 declarative keymap descriptor table을 별도로 검토한다. |
| text mutation file surface | 부분해소/K | Root `textCommands.ts`는 compatibility wrapper가 되었고 text mutation command 구현과 split tests는 `model/text-command/`에 모았다. Insert/delete/split/fragment/figure/mention/document-range/selection-target/helper 파일은 모두 같은 text mutation 변경 이유를 공유한다. `textCommandInsertion.ts`는 insert text command routing, selected text/range dispatch, selected atom-to-text replacement를 소유하고, collapsed inline atom edge insertion은 `textCommandEdgeInsertion.ts`, block/text-block edge insertion은 `textCommandBlockEdgeInsertion.ts`, shared inline text child add primitive는 `textCommandInlineTextInsertion.ts`로 빠졌다. | SRP 기준으로 책임 귀속이 Clear한 helper부터 계속 분리한다. 라인 수를 맞추기 위한 분리는 하지 않는다. |
| `splitParagraph.ts` block-specific split command | 유지/C | 현재 import 제외 LOC 307, `if` 18개다. selected document range split, inline text block split, codeBlock newline insertion, inline atom edge split, figure/block edge paragraph insertion, empty heading/quote/listItem paragraph exit은 모두 `Enter`/`insertParagraph`/`insertLineBreak`가 수렴하는 block-specific split contract의 variant 구현이다. | paragraph soft-break node, block type conversion, list command owner 같은 별도 feature가 생기기 전에는 책임 1개로 유지한다. |
| cursor map/index/word/endpoint/movement surface | 부분해소/C | `cursor.ts`의 `NoteDocument -> CursorMap/CaretMap` builder는 `cursorMap.ts`, cursor path/address parser는 `cursorAddressing.ts`, `CursorMap/CaretMap -> index/point` projection은 `cursorIndexProjection.ts`로 분리했다. 단어 이동의 separator/word/atom boundary resolver는 `cursorWordMovement.ts`, public index/query wrapper는 `cursorDocumentIndex.ts`, first/last cursor point와 block/inline endpoint projection은 `cursorEndpoints.ts`로 분리했다. Basic stream/block-boundary movement는 `cursorMovement.ts` 253 LOC/`if` 20개, cursor point normalization/selection adapter는 `cursorNormalization.ts` 25 LOC/`if` 2개로 분리했고, `cursor.ts`는 35 LOC/`if` 0개 facade다. | cursor stream 자체는 확정 core지만, 구현은 facade 뒤 helper들에 귀속된다. 추가 분리는 다음 Clear 책임 경계가 보일 때만 한다. |
| React runtime owner와 headless owner 관계 | 미정 | `BlockEditor`는 현재 `createEditor()`를 dogfood하지 않는다. 문서도 이 상태를 결함으로 단정하지 않는다. | dogfooding이 얕은 wrapper가 되지 않을 때만 통합한다. 아니라면 병렬 seam을 유지한다. |

### 30년 기준 결론

현재 foundation은 30년형 방향이 맞다. 작은 public facade, canonical document
model, command registry, selection/cursor model, DOM/view adapter 분리는 이미 나온
정석 해법과 맞고 빼면 안 된다.

하지만 현재 내부 구현 전체가 30년 갈 만큼 닫혔다고 말하면 과장이다.
특히 React controller에 policy가 아직 많이 남아 있고, input/text/cursor의 일부
절차형 분기는 "이미 답이 나온 문제"라면 더 table/descriptor/builder 형태로 깊게
숨길 여지가 있다. 여기서의 목표는 새 추상화를 늘리는 것이 아니라, 이미 확정된
문제를 controller와 거대 command 파일에 반복 구현하지 않도록 stable core와 volatile
adapter를 더 선명하게 갈라내는 것이다.

30년 구조로 닫아도 되는 것과 닫으면 안 되는 것은 다음처럼 구분한다.

| 구분 | 닫아도 되는 것 | 닫으면 안 되는 것 |
| --- | --- | --- |
| core model | schemaVersion 1 normal form, command result patch+selection, logical cursor stream | future schema migration UX, collaboration/persistence protocol |
| view adapter | DOM is not truth, contenteditable leaf buffer, geometry adapter seam | browser/OS IME 전체 matrix를 코드 구조만으로 해결했다는 주장 |
| public API | small headless facade, small React facade, internal boundary verifier | convenience public methods, public Markdown/schema/plugin API |
| refactor policy | Clear(C) 책임 분리, descriptor가 실제 동반 변경을 줄이는 경우 | 두 번째 adapter/provider 없는 generic abstraction |

엄격 판정은 이렇다. "정석 설계 방향"은 확정으로 맞다. 하지만 "현재 내부 구현까지
30년 동안 그대로 둬도 된다"는 판정은 아니다. 30년 갈 것은 public facade,
canonical model, command/query seam, selection/cursor model, view adapter 원칙이고,
갈아야 하는 것은 그 원칙을 구현한 내부 파일들의 책임 배치다. 현재 runtime에서
300 LOC 이상 남은 후보는 `useBlockEditorController.tsx` 317 LOC/`if` 6개와
`splitParagraph.ts` 307 LOC/`if` 18개이며, 둘 다 책임 1개 유지 판정이다.
테스트/fixture까지 포함한 현재 300 LOC 이상 후보는 별도 관리한다. 이번에 분리한
cursor model split tests는 모두 300 LOC 미만이다. 이번에 분리한
cursor command split tests 중 `cursorCommandsVerticalMovement.test.ts` 328
LOC/`if` 0개는 geometry-backed vertical/page movement 책임 1개로 유지한다.
이번에 분리한 cursorGeometry split tests
중 `cursorGeometryInvariantFixtures.ts` 410 LOC/`if` 9개는 invariant fixture
corpus 생성 책임 1개로 유지한다. 이번에 분리한 contentEditable view split tests 중
`contentEditableComposition.test.ts` 404 LOC/`if` 6개와
`contentEditableNativeFlush.test.ts` 351 LOC/`if` 8개는 각각 composition
lifecycle, native text flush/DOM repair 책임 1개로 유지한다. 이번에 분리한
inputAdapter split tests 중 `inputAdapterNavigation.test.ts` 651 LOC/`if` 0개,
`inputAdapterBeforeInput.test.ts` 444 LOC/`if` 0개, `inputAdapterShortcut.test.ts`
443 LOC/`if` 0개, `inputAdapterStructuralEditing.test.ts` 325 LOC/`if` 0개,
`inputAdapterPaste.test.ts` 300 LOC/`if` 0개는 각각 navigation key,
beforeinput mutation, shortcut/context, structural editing key, paste/transfer
책임 1개로 유지한다. 이번에 분리한
BlockEditor split tests 중 clipboard/transfer bridge는 이번 SRP에서 paste/drop, copy,
cut, keymap으로, pointer selection은 atom/text/drag pointer selection으로,
native text buffer는 toolbar, flush, clipboard, history로 추가 분리했다.
text command split tests 중 `textCommandDeletion.test.ts` 598 LOC/`if`
0개, `splitParagraph.test.ts` 485 LOC/`if` 0개, `textCommandInsertion.test.ts`
377 LOC/`if` 0개도 각각 deletion/split/insertion behavior 책임 1개로 유지한다.
`p0InputConformanceMatrix.ts` 669 LOC/`if` 0개는
P0 input conformance row data 책임 1개라 유지 판정이다.
`cursor.ts`는 facade 35 LOC/`if`
0개가 되었고, basic stream/block-boundary movement는 `cursorMovement.ts`
253 LOC/`if` 20개, normalize/to-selection adapter는
`cursorNormalization.ts` 25 LOC/`if` 2개로 분리됐다. `cursor.ts`의 first/last cursor endpoint
projection은 `cursorEndpoints.ts` 160 LOC/`if` 18개로 분리되어 있다.
`editorCore.ts`도 command dispatch pipeline을 `editorCoreDispatch.ts` 189 LOC/`if`
15개로 분리해 lifecycle/facade 파일은 160 LOC/`if` 3개가 되었고 현재 300 LOC
후보에서 빠졌다.
`contentEditableViewEngine.ts`도 input policy, DOM text restore/read helper, text
flush helper를 분리해 242 LOC/`if` 23개가 되었고 현재 300 LOC 후보에서 빠졌다.
`editorCommandStrategies.ts`도 movement strategy table을
`editorMoveCommandStrategies.ts` 159 LOC/`if` 0개로 분리해 165 LOC/`if` 1개가
되었고 현재 300 LOC 후보에서 빠졌다.
`inputAdapterKeyDown.ts`는 191 LOC/`if` 20개가 되었고,
navigation keydown mapping은 `inputAdapterNavigationKeyDown.ts` 216 LOC/`if`
25개로 분리되어 현재 300 LOC 후보에서 빠졌다.
`debugInteractionSnapshot.ts`도 shared target serializer를
`debugInteractionTarget.ts` 80 LOC/`if` 8개로 분리해 263 LOC/`if` 24개가
되었고 현재 300 LOC 후보에서 빠졌다.
`contentEditableSelection.ts`도 contenteditable text point/path/offset projection을
`contentEditableTextPoint.ts` 259 LOC/`if` 25개로 분리해 135 LOC/`if` 11개가
되었고 현재 300 LOC 후보에서 빠졌다.
`textCommandDeletion.ts`도 word deletion adapter를 `textCommandWordDeletion.ts` 37
LOC/`if` 2개로 분리해 296 LOC/`if` 24개가 되었고 현재 300 LOC 후보에서 빠졌다.
`textCommandInsertion.ts`는 insert text command routing과 selected atom replacement
중심으로 123 LOC/`if` 10개가 되었고, collapsed inline atom edge insertion은
`textCommandEdgeInsertion.ts` 144 LOC/`if` 9개, block/text-block edge insertion은
`textCommandBlockEdgeInsertion.ts` 179 LOC/`if` 11개, shared inline text child add
primitive는 `textCommandInlineTextInsertion.ts` 24 LOC/`if` 0개로 분리됐다.
`cursorGeometryQueries.ts`도 `CursorGeometry` factory 32 LOC/`if` 0개로 좁혔고,
point/line/order lookup은 `cursorGeometryPointLookup.ts` 164 LOC/`if` 19개,
rect/range projection은 `cursorGeometryRectQueries.ts` 147 LOC/`if` 11개,
vertical line/page movement는 `cursorGeometryVerticalMovement.ts` 86 LOC/`if`
8개로 분리했다. `cursorGeometryLayout.ts`는 dispatcher,
Pretext layout, fallback layout 중심으로 284 LOC/`if` 16개가 되었고,
hard-break/blank-row layout은 `cursorGeometryHardBreakLayout.ts` 181 LOC/`if`
13개로 분리됐다. `markdownImport.ts`는 block/document
line scanner로 207 LOC/`if` 20개가 되었고, inline grammar는
`markdownInlineImport.ts` 267 LOC/`if` 30개로 분리됐다. `cursorCommands.ts`는
public command wrapper와 logical movement 중심으로 256 LOC/`if` 2개가 되었고,
selection collapse/projection은 `cursorCommandSelection.ts` 108 LOC/`if` 7개,
geometry-backed line/page movement는 `cursorGeometryCommands.ts` 159 LOC/`if`
5개로 분리됐다.
`textCommandMentionInsertion.ts`는 분리 후 250 LOC/`if`
17개로 후보 하한 아래에 있고, mention atom insertion/replacement라는 독립 책임
1개를 소유한다.
`textCommands.ts`는 facade라 더 이상 mutation 압력 파일이 아니다.
`textCommandDocumentRange.ts`는 selected document range public facade 87 LOC/`if`
5개로 좁혔고, non-code paragraph/block replacement는
`textCommandNonCodeDocumentRange.ts` 208 LOC/`if` 6개, code-aware replacement는
`textCommandCodeDocumentRange.ts` 193 LOC/`if` 7개로 분리했다. selected range split은
`splitParagraph.ts`, block fragment splice primitive는 `spliceBlockFragment.ts`로 이동했다.
`textCommandDeletion.ts`는
backward/forward delete와 merge-on-delete policy를 소유하고, word delete adapter는
`textCommandWordDeletion.ts` 37 LOC/`if` 2개, whole-atom removal primitive는
`textCommandAtomDeletion.ts` 76 LOC/`if` 3개로 분리했다.
`switch`가 없다는 점은
중요하지 않다. 문제는 닫힌 정석 문제를 한 깊은 module 뒤에 숨겼는지, 아니면
controller와 command surface 곳곳이 직접 알고 있는지다.

## 고친 확정 결함

아래는 애매한 개선점이 아니라, 검증을 막거나 실행 테스트와 충돌한 확정
결함이다.

| 영역 | 분류 | 결과 |
| --- | --- | --- |
| IME composition commit 정규화 | 확정 결함 | `normalizeCompositionCommitText` 호출/시그니처 불일치를 고쳤고, composed DOM text가 관측되지 않은 경우 실제 final commit text를 지우지 않게 했다. final commit 유지와 중복 commit 제거 회귀 테스트를 추가했다. |
| 키보드 소유 정책 | 확정 결함 | `Alt+Enter`도 editor-owned structural key로 잡도록 했다. adapter에서는 계속 명시적 no-op으로 처리한다. |
| keyboard input policy audit | 확정 문서/테스트 정리 | `docs/editor-keyboard-input-policy-audit.md`를 추가했다. `isHeadlessKeyDown` ownership gate와 `translateEditorInput` adapter를 분리했고, Tab/movement/supported shortcut ownership과 F-key/unsupported `Cmd/Ctrl`/`Alt+Tab` pass-through를 테스트로 고정했다. global app shortcut policy, OS/browser matrix, underline mark, shortcut customization은 별도 제품/API 결정으로 남겼다. |
| keyboard input evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-keyboard-input-policy-audit.md`에 증거 강도를 추가했다. Keydown ownership gate, printable keydown pass-through, browser/system shortcut pass-through, unsupported structural shortcut no-op, model input adapter mapping, beforeinput/paste adapter mapping, React keydown/beforeinput split, composition/read-only guards, line break/list policy는 확정했다. Global app shortcut layer, OS/browser shortcut matrix, shortcut customization, underline mark shortcut, assistive-tech keyboard announcement는 미정으로 분리했다. |
| contenteditable buffer audit | 확정 문서 정리 | `docs/editor-contenteditable-buffer-audit.md`를 추가했다. `contentEditableViewEngine`을 native text buffer, beforeinput decision, composition phase, one-patch flush, DOM restore, selection mapping을 소유하는 view adapter로 확정했고, browser/OS IME matrix, future input backend abstraction, MutationObserver policy, full event-ordering matrix는 별도 제품/플랫폼 결정으로 남겼다. |
| contenteditable buffer evidence classification | 확정/애매 코드/문서/테스트 정리 | `docs/editor-contenteditable-buffer-audit.md`에 증거 강도를 추가했다. `contentEditableViewEngine` module, active text leaf gate, active mark insertion guard, one-patch native flush, DOM restore/recovery, grapheme-safe selection mapping, composition phase handling, beforeinput transfer/history decision은 확정했다. Open range 일반 `insertText`가 headless command path에 남는 회귀 테스트도 추가했다. Generic input backend abstraction, MutationObserver drift guard, release-level IME/browser matrix는 미정으로 분리했다. |
| native selection bridge audit | 확정 문서 정리 | `docs/editor-native-selection-bridge-audit.md`를 추가했다. DOM root containment, text-run `data-path` translation, grapheme snapping, mark element boundary handling, empty text run native caret, code block backing leaf, scroll reveal, observed native range command source, overlay coherence는 확정했다. Public native selection API, generic selection backend, full browser selectionchange ordering, cross-browser DOM Range matrix, multi-range, touch handles, assistive-tech announcement, persisted/session selection restore는 별도 제품/플랫폼 결정으로 남겼다. |
| native selection bridge evidence classification | 확정/애매 코드/문서/테스트 정리 | `docs/editor-native-selection-bridge-audit.md`에 증거 강도를 추가했다. Internal view seam, root containment guard, text-run `data-path` translation, collapsed/range selection read, grapheme and mark boundary mapping, canonical to native caret restore, scroll reveal, observed command selection, overlay/read-only coherence는 확정했다. Editor root 밖 selection 무시와 native text range to canonical range 변환 회귀 테스트도 추가했다. Public native selection API, generic selection backend, browser/mobile/accessibility matrix는 미정으로 분리했다. |
| cursor geometry audit | 확정 문서 정리 | `docs/editor-cursor-geometry-audit.md`를 추가했다. `CursorGeometry`를 caret/range/atom rect, coordinate hit testing, vertical/page/line movement를 제공하는 view adapter로 확정했고, cross-browser pixel parity, BiDi/RTL/vertical writing, virtualization, exact font measurement policy는 별도 제품/플랫폼 결정으로 남겼다. |
| cursor geometry evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-cursor-geometry-audit.md`에 증거 강도를 추가했다. `CursorGeometry` interface, legal cursor stop rects, text caret/range geometry, inline/block atom geometry, coordinate hit testing, vertical/page/line movement support, overlay projection from geometry는 확정했다. Cross-browser pixel parity, BiDi/RTL/vertical writing, virtualization/offscreen measurement, exact font/layout measurement policy는 미정으로 분리했다. |
| cursor geometry if cleanup | 확정 코드/테스트 정리 | `$doubt if`로 cursor/selection runtime 분기를 AST 기준 집계했다. `cursorGeometry.ts`의 coordinate-to-line point 변환 분기 중복은 이미 존재하는 `pointFromLineCoordinate` helper로 합쳐 if 53 -> 48로 줄였다. 이후 hard-newline blank-row marker guard와 SRP split이 추가되었다. 현재 `cursorGeometry.ts`는 DOM factory 7 LOC/if 0이고, `cursorGeometryQueries.ts`는 `CursorGeometry` query factory 32 LOC/if 0, `cursorGeometryPointLookup.ts`는 164 LOC/if 19, `cursorGeometryRectQueries.ts`는 147 LOC/if 11, `cursorGeometryVerticalMovement.ts`는 86 LOC/if 8, `cursorGeometryPointMapping.ts`는 if 11, `cursorGeometryLayout.ts`는 if 16, `cursorGeometryHardBreakLayout.ts`는 if 13이다. cursorGeometry split tests, contentEditable view split tests 359개가 통과한다. Null/DOM-shape/layout-edge guard는 cursor geometry adapter의 입력 방어와 visual row 판정이므로 무조건 제거 대상이 아니다. |
| blank visual row cursor hit testing | 확정 결함 수정 | 빈 paragraph 자체는 rendered empty text-run 좌표 hit-test로 offset `0`에 남는 것을 확인했다. 실제 결함은 hard newline 사이 빈 visual row였다. `A\n\nB` 가운데 빈줄 whitespace click이 offset `3`으로 다음 줄에 붙던 것을 red test로 재현했고, newline fragment를 line-break marker로 표시해서 selection rect는 유지하되 hit-test와 line end는 offset `2`에 남게 고쳤다. 같은 렌즈로 `\n\nA`, `A\n\n\nB`, `A\n\n`의 선행/연속/후행 blank row도 hit-test, line start/end, vertical movement 테스트로 추가 확인했다. cursorGeometry split tests는 321개가 통과한다. 브라우저/OS pixel parity는 여전히 별도 QA 결정이다. |
| model command surface audit | 확정 코드/문서 정리 | `docs/editor-model-command-surface-audit.md`를 추가했다. `createEditor()` six-method interface, descriptor registry, patch/selection pairing, batch atomicity, selection-aware history, geometry adapter escape hatch를 확정했고, 근거가 약한 raw `applyPatch` public command는 제거했다. React state owner 통합, input adapter command-only 전환, custom command/plugin registry, transaction metadata, collaboration/persistence command layer는 별도 제품/API 결정으로 남겼다. |
| model command evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-model-command-surface-audit.md`에 증거 강도를 추가했다. `createEditor()` six-method interface, command descriptor registry, query descriptor registry, single dispatch mutation entrypoint, `can(command)` no-commit behavior, view adapter escape hatch, batch atomicity, explicit batch undo unit, selection-only no-history, raw `applyPatch` public absence는 확정했다. React state owner dogfooding, input adapter command-only output, custom command/plugin registry, transaction metadata/collaboration/persistence layer는 미정으로 분리했다. `editorCore split tests`가 `editorCoreDescriptors.ts`의 command/query descriptor key를 source-level AST inventory로 고정한다. |
| markdown adapter audit | 확정 문서 정리 | `docs/editor-markdown-adapter-audit.md`를 추가했다. Markdown은 canonical state가 아니라 internal import/export adapter이며, supported rich fragment import/export, clipboard `text/markdown` fallback, mention/figure deterministic syntax, safe link href filtering, delimiter-independent cursor model은 확정했다. CommonMark/GFM 전체 호환, public Markdown API, source mode, figure/media source trust policy, node graph paste restore는 별도 제품/API 결정으로 남겼다. |
| markdown adapter evidence classification | 확정/애매 문서 정리 | `docs/editor-markdown-adapter-audit.md`에 증거 강도를 추가했다. Canonical model separation, import block coverage, import inline coverage, safe link import, supported export/round-trip, deterministic atom fallback, clipboard markdown fallback, markdown-looking plain paste guard, public facade non-exposure는 확정했다. CommonMark/GFM full compatibility, public Markdown import/export API, Markdown source mode, figure/media source trust and node graph restore, generated compatibility docs는 미정으로 분리했다. |
| public Markdown surface guard | 확정 코드/문서 정리 | `importMarkdown`, `exportMarkdown`, `exportInlineMarkdown`는 internal Markdown adapter로 유지하고 public runtime facade에 노출하지 않는 것으로 고정했다. `src/editor/public/index.test.ts`가 runtime 비노출을 명시하고, `scripts/verify-editor-boundaries.mjs`가 direct export, aliased export-from, import-then-export alias, namespace-style helper 재노출, internal implementation `export *`/`export * as` 누수를 막는다. boundary verifier split tests가 해당 failure cases를 고정한다. External Markdown API 설계는 error shape, migration, sanitization, compatibility table과 함께 별도 제품/API 결정으로 남겼다. |
| document normal form audit | 확정 문서 정리 | `docs/editor-document-normal-form-audit.md`를 추가했다. `NoteDocumentSchema`와 `normalizeDocument`가 닫은 schemaVersion 1 structured document normal form, block/inline/mark set, empty document fallback, inline placeholder, empty text pruning, adjacent text merge, mark canonicalization은 확정했다. Future migration interface/support policy, field-level diagnostics, attrs semantic ownership, media source trust, global/collaboration id policy, nested containers는 별도 제품/API 결정으로 남겼다. |
| schema migration policy audit | 확정 테스트/문서 정리 | `docs/editor-schema-migration-policy-audit.md`를 추가했다. schemaVersion 1 literal, `parseNoteDocument` validation seam, parse/replace generic failure, unsupported version no-migration, invalid replace no-mutation은 확정했다. v2/legacy migration location, support window, field-level diagnostics DTO, destructive migration behavior, generated compatibility docs는 별도 제품/API 결정으로 남겼다. |
| schema migration evidence classification | 확정/애매 문서 정리 | `docs/editor-schema-migration-policy-audit.md`에 증거 강도를 추가했다. Current `schemaVersion: 1`, public parse success/failure, parse no-migration, generic parse failure, replace validation/no-mutation, invalid replace가 섞인 batch atomicity, schema object public non-contract는 확정했다. Migration API absence는 current source behavior일 뿐 future product policy가 아니며, destructive/sanitizing migration은 미정으로 분리했다. |
| document metadata surface audit | 확정 테스트/문서 정리 | `docs/editor-document-metadata-surface-audit.md`를 추가했다. `NoteDocument`의 `id`, `title`, `tags` fields, React title input, editable title `/title` mutation, title undo/redo history, read-only title guard, Markdown import option metadata injection은 확정했다. Document route identity, storage/autosave, tags UI, empty-title UX, title/body separate history, title-only public commands, Markdown frontmatter, global/collaboration id policy는 별도 제품/API 결정으로 남겼다. |
| document metadata evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-document-metadata-surface-audit.md`에 증거 강도를 추가했다. metadata schema fields, non-empty document id validation, empty title current behavior, duplicate string tags preservation, public persisted parse seam, React title input/mutation/history/read-only guard, Markdown metadata options, first heading non-title behavior, demo/helper metadata non-public, route/storage binding absence는 확정했다. Tags UI/API, frontmatter, metadata-only public commands, title/body separate history는 미정으로 분리했다. |
| document normal form evidence classification | 확정/애매 문서 정리 | `docs/editor-document-normal-form-audit.md`에 증거 강도를 추가했다. Canonical structured document, block set/defaults, inline/mark set, persisted safe link validation, document/inline fallback, empty text pruning and adjacent merge, attrs preservation/removal split, codeBlock compatibility shape, schemaVersion 1 no-migration behavior, id and duplicate-id current behavior는 확정했다. Field-level diagnostics와 normal form evolution policy는 미정으로 분리했다. |
| attrs extension surface audit | 확정 테스트/문서 정리 | `docs/editor-attrs-extension-surface-audit.md`를 추가했다. document/root/block/inline atom attrs JSON metadata 보존, mark attrs canonical removal, typed field precedence, renderer attrs 무시, Markdown attrs non-round-trip, public schema object 숨김은 확정했다. attrs semantic ownership, reserved key namespace, mark attrs future, attrs migration/import-export fidelity, renderer/plugin hook은 별도 제품/API 결정으로 남겼다. |
| attrs evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-attrs-extension-surface-audit.md`에 증거 강도를 추가했다. schema shape, document/root/block/inline atom attrs 보존, mark attrs 제거, renderer non-projection, Markdown arbitrary attrs non-round-trip, typed field precedence, public schema object 비노출은 확정했다. 일부 factory-generated typed-field echo attrs는 external extension data가 아니며, semantic ownership, reserved namespace, plugin hooks, schema-aware exporter는 미정으로 분리했다. |
| code block compatibility audit | 확정 테스트/문서 정리 | `docs/editor-code-block-compatibility-audit.md`를 추가했다. `codeBlock.text`가 canonical content이고 `codeBlock.children`은 persisted schema compatibility field라는 경계를 확정했다. `readBlockText`, renderer, Markdown export, code text path는 모두 `text` field를 사용한다. Compatibility field support 기간, text/children mismatch diagnostics, future code child/token model, language registry는 별도 제품/API 결정으로 남겼다. |
| code block evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-code-block-compatibility-audit.md`에 증거 강도를 추가했다. schema shape, missing `text`/`children` defaulting, compatibility `children` 보존, canonical `text` read path, renderer children non-contract, Markdown children non-round-trip은 확정했다. Compatibility support window, text/children mismatch diagnostics, future child/token model은 미정으로 분리했다. |
| figure media trust audit | 확정 테스트/문서 정리 | `docs/editor-figure-media-trust-audit.md`를 추가했다. Figure block atom shape, non-empty `src`, optional `alt` with empty fallback, non-editable renderer path, `/sample-figure.svg` toolbar fixture, Markdown image syntax round-trip은 확정했다. Media source trust, remote image privacy, user-provided SVG, broken-media UX, captions/metadata, broader Markdown media compatibility는 별도 제품/보안 결정으로 남겼다. |
| figure media evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-figure-media-trust-audit.md`에 증거 강도를 추가했다. figure schema shape, non-empty `src`, optional `alt` fallback, empty text extraction, non-editable block atom rendering, `insertFigure` block atom insertion, toolbar `/sample-figure.svg` fixture, Markdown image round-trip은 확정했다. Media URL trust policy와 upload/picker/caption/media metadata model은 미정으로 분리했다. |
| identity policy audit | 확정 테스트/문서 정리 | `docs/editor-identity-policy-audit.md`를 추가했다. Non-empty document/root/block ids, local sequential `block-N` generation, fresh ids for inserted/imported blocks, duplicate block id render tolerance, debug duplicate-id inventory/diagnostics는 확정했다. Schema-fatal unique id validation, global id provider, route/storage binding for `NoteDocument.id`, collaboration ownership은 별도 제품/data-layer 결정으로 남겼다. |
| identity evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-identity-policy-audit.md`에 증거 강도를 추가했다. document/root/block non-empty id schema, local generated block ids, paragraph helper id non-collision, imported fragment fresh ids, duplicate id schema acceptance, duplicate render tolerance, duplicate debug inventory/report diagnostic, route/storage binding absence는 확정했다. Schema-fatal unique id validation과 global/collaboration id ownership은 미정으로 분리했다. |
| render surface audit | 확정 문서 정리 | `docs/editor-render-surface-audit.md`를 추가했다. `DocumentRenderer`가 canonical document를 stable `data-path`, block/inline/mark/atom DOM, empty text measurable target, selection data attributes, renderer-level link href safety로 투영하는 adapter인 점은 확정했다. Published semantic HTML, assistive-tech announcement matrix, media trust, custom node renderer, static export, virtualization은 별도 제품/플랫폼 결정으로 남겼다. |
| render surface evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-render-surface-audit.md`에 증거 강도를 추가했다. Root inspection surface, stable `data-path` cursor surface, block variant DOM mapping, empty text measurable target, structured mark rendering, renderer link href safety, atom DOM mapping, selection overlay projection, renderer state ownership absence는 확정했다. Final semantic HTML policy, accessibility announcement matrix, media/figure trust policy, custom node renderer/static export/virtualization은 미정으로 분리했다. `DocumentRenderer split tests`는 root selection inspection data attributes와 block variant data attributes를 직접 고정한다. |
| selection model audit | 확정 문서 정리 | `docs/editor-selection-model-audit.md`를 추가했다. `RichSelection`을 public selection interface로 유지하고 `SelectionSnap`은 internal/json-document state로 숨기는 구조, caret/range/node variants, range source `selectedPointers` 비움, render atom derivation, node selection, command input normalization, selection-only no-history behavior는 확정했다. Native selection event-ordering matrix, multi-range, persisted selection, context semantics, collaboration/presence, accessibility announcement는 별도 제품/플랫폼 결정으로 남겼다. |
| selection model evidence classification | 확정/애매 코드/문서/테스트 정리 | `docs/editor-selection-model-audit.md`에 증거 강도를 추가했다. Public `RichSelection` interface, `SelectionSnap` facade 비노출 guard, caret/range/node variants, caret/range/node normal form, render atom derivation, adjacent text-run boundary collapse, default/invalid selection normalization, selectAll/movement context, selection-only no-history, geometry adapter seam은 확정했다. Native event ordering/browser matrix, persisted selection, collaboration/presence, public context DTO는 미정으로 분리했다. |
| pointer selection audit | 확정 문서 정리 | `docs/editor-pointer-selection-audit.md`를 추가했다. Atom DOM target selection, stale native range보다 atom 우선, geometry-backed text hit testing, shift extension, double word selection, triple block selection, drag range selection은 확정했다. Real browser coordinate matrix, full native selection event ordering, touch/pen gesture, drag auto-scroll, multi-range pointer selection, assistive-tech announcement는 별도 제품/플랫폼 결정으로 남겼다. |
| pointer selection evidence classification | 확정/애매 코드/문서/테스트 정리 | `docs/editor-pointer-selection-audit.md`에 증거 강도를 추가했다. Pointer-to-selection React wiring, primary pointer gate, atom DOM target selection, stale native range priority, geometry-backed text hit testing, shift/double/triple policies, drag selection lifecycle, range source atom policy, native cursor preview는 확정했다. Non-primary pointer ignore, pointer capture/release, pointer cancel 후 drag no-op 회귀 테스트도 추가했다. Public pointer selection API와 browser/touch/accessibility matrix는 미정으로 분리했다. |
| text mutation command audit | 확정 문서 정리 | `docs/editor-text-mutation-command-audit.md`를 추가했다. Text mutation command가 JSON Patch와 `selectionAfter`를 같이 반환하는 구조, text/code leaf editing, range replacement, grapheme/word deletion, atom deletion/replacement, paragraph split/merge, figure edge handling, fragment insertion, list depth command는 확정했다. Richer block schema, paragraph soft-break, multi-range editing, collaboration operation merge, rich node graph paste, generated compatibility matrix, file split policy는 별도 제품/모듈 결정으로 남겼다. |
| text mutation evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-text-mutation-command-audit.md`에 증거 강도를 추가했다. Command result contract, text/code leaf editing, structured mark preservation, selected range replacement, grapheme/word deletion, atom deletion/replacement, paragraph/code split policy, block merge/figure/block edge behavior, fragment insertion/id cleanup, input adapter convergence, raw public patch/per-case public method absence는 확정했다. Richer block schema expansion, paragraph soft-break model, multi-range/collaboration operation model, generated compatibility docs/file split policy는 미정으로 분리했다. text command split tests는 insert/delete/split이 input document를 직접 mutate하지 않고 patch와 `selectionAfter`를 반환하는 것을 고정한다. |
| block command audit | 확정 문서 정리 | `docs/editor-block-command-audit.md`를 추가했다. `adjustSelectedListDepth`가 selection-touched list items만 depth patch로 바꾸는 내부 block command인 점과 list/non-list Tab policy는 확정했다. Public `adjustListDepth` command, block type conversion, nested list tree semantics, paragraph soft-break, custom block command registry는 별도 제품/API/schema 결정으로 남겼다. |
| block command evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-block-command-audit.md`에 증거 강도를 추가했다. list item target only, collapsed list item adjustment, open range touched-list targeting, outdent clamp, `/root/children/{index}/depth` JSON Patch shape, list `Tab`/`Shift+Tab` adapter policy, non-list plain `Tab` insertion, non-list `Shift+Tab` selection-only no-op, text mutation split ownership, public `adjustListDepth` absence는 확정했다. Block type conversion, nested list tree semantics, custom block command registry는 미정으로 분리했다. |
| mark command audit | 확정 문서 정리 | `docs/editor-mark-command-audit.md`를 추가했다. `bold`/`italic`/`code`/`link` mark set, `toggleMark`/`toggleLink` command seam, range split/remove policy, collapsed active marks, pending link href safety, active mark normalization, shortcut mapping, renderer/schema/markdown alignment는 확정했다. Link input UX, legacy URL migration, additional marks, mark exclusivity, active context persistence, public mark plugin, generated compatibility matrix는 별도 제품/API 결정으로 남겼다. |
| mark command evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-mark-command-audit.md`에 증거 강도를 추가했다. Mark schema set, public Mark concept/facade guard, range split/selection restore, remove-if-fully-marked, inline atom non-marking, collapsed active marks, active mark normalization, link creation/removal seam, pending href trim/allowlist/rejection, shortcut mapping/Escape context clear, renderer/schema/Markdown alignment는 확정했다. Link input UX, legacy unsafe URL migration, additional mark set, mark exclusivity, active context persistence, public mark plugin, generated compatibility matrix는 미정으로 분리했다. |
| cursor navigation model audit | 확정 문서 정리 | `docs/editor-cursor-navigation-model-audit.md`를 추가했다. Logical cursor stream, visible character/grapheme movement, adjacent marked run boundary, mention/figure atom unit, word/block/document movement, range collapse/extension, preferredX context, geometry-backed line/page movement, keyboard mapping은 확정했다. Locale word segmentation matrix, BiDi/RTL/vertical writing, cross-browser visual parity, multi-cursor, virtualization, custom node cursor semantics, shortcut customization은 별도 제품/플랫폼 결정으로 남겼다. |
| cursor navigation evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-cursor-navigation-model-audit.md`에 증거 강도를 추가했다. Cursor coordinate contract, logical stream, grapheme/visible character movement, atom unit movement and coverage, horizontal/word/block/document movement, range extension, preferredX and geometry-backed movement, keyboard mapping, selection-only history는 확정했다. Per-key public movement methods, locale-specific word segmentation, BiDi/RTL/vertical writing, cross-browser visual movement parity, multi-cursor, virtualization, custom node cursor semantics은 미정으로 분리했다. |
| native DOM range selection | 확정 결함 | `BlockEditor`가 stale model selection보다 실제 non-collapsed native text range를 우선하도록 했다. native range가 없을 때만 canonical selection으로 fallback한다. |
| native DOM range overlay | 확정 결함 | contenteditable의 native range selection이 보이는 동안 custom caret/selection overlay가 stale하게 남지 않도록 native `select`/`selectionchange` 경로로 overlay 상태를 갱신하게 했다. |
| collapsed selection / active mark context | 확정 결함 | collapsed caret인데 `selectedPointers`가 남은 selection이 `Ctrl+B`를 range mark 명령으로 오판하게 했다. keydown command 입력에서 collapsed selection을 정규화하고, native collapsed caret paste/flush에는 transient context를 보존하게 했다. IME active mark commit은 DOM reset 충돌 없이 model command로 커밋한다. |
| pointer/mouse selection coverage | 확정 근거 강화 | `BlockEditor` integration에 single pointer text caret placement와 double pointer word selection/copy serialization 테스트를 추가했다. pointer 섹션의 "double-click 테스트 부족" 애매함은 제거했고, 남은 애매함은 실제 브라우저 좌표/selection matrix로 좁혔다. |
| word navigation punctuation/mark coverage | 확정 근거 강화 | cursor command split tests에 word movement가 punctuation separator를 건너뛰고 marked text-run boundary를 넘어가는 회귀 테스트를 추가했다. 남은 애매함은 locale/browser-specific word segmentation matrix로 좁혔다. |
| Enter/line-break 정책 | 확정 근거 강화 | `insertLineBreak` adapter 테스트를 paragraph block split과 codeBlock newline 삽입까지 분리해서 고정했다. 현재 정책은 확정이고, 별도 paragraph soft-break model은 future feature 후보로 분리했다. |
| line-break policy audit | 확정 문서 정리 | `docs/editor-line-break-policy-audit.md`를 추가했다. `insertLineBreak`는 현재 미정이 아니라 block-specific split policy로 닫혀 있고, paragraph soft-break는 future feature 후보로 분리했다. |
| line-break evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-line-break-policy-audit.md`에 증거 강도를 추가했다. `Enter` keydown, `insertParagraph`/`insertLineBreak` beforeinput adapter mapping, paragraph/inline text block split, codeBlock newline, inline atom/figure edge handling, React beforeinput convergence, `Alt+Enter`/command Enter no-op은 확정했다. Paragraph soft-break inline node와 full platform-specific Enter/IME/browser ordering matrix는 미정으로 분리했다. |
| clipboard transfer fallback | 확정 근거 강화 | malformed/wrong-schema structured clipboard payload가 plain text로 fallback하는 테스트를 추가했다. custom MIME paste seam은 node graph가 아니라 text/markdown envelope로 들어가는 정책까지 확정이다. 외부 fallback order는 source상 custom MIME -> `text/plain` -> `text/markdown`이지만, external rich paste UX policy로 닫힌 것은 아니다. |
| clipboard structured envelope cleanup | 확정 코드/문서 정리 | custom clipboard MIME은 유지하되 현재 paste가 읽지 않는 `selectedPointers`, anchor/focus topology를 payload에서 제거했다. 확정 contract는 `{ schema, plainText, markdown }` text/markdown envelope이고, custom MIME rich node graph restore는 제품/API 결정으로 남겼다. |
| clipboard structured markdown restore | 확정 코드/테스트 정리 | custom envelope의 `markdown`은 same-app deterministic markdown fallback으로 읽고, supported marks/link/mention/figure/multi-block fragment를 command layer에서 복원한다. `plainText`는 structured markdown이 없을 때 plain format fallback으로 남긴다. |
| clipboard structured metadata ignored | 확정 근거 강화 | custom MIME에 `selectedPointers`, `nodes` 같은 extra metadata가 들어와도 paste reader는 node graph로 승격하지 않고 `markdown` 또는 `plainText` 문자열 result만 반환하는 테스트를 추가했다. |
| markdown paste rich fallback coverage | 확정 근거 강화 | markdown-format paste가 bold/italic/code/link marks를 inline mark로 복원하는 테스트를 추가했다. clipboard markdown fallback의 확정 범위는 marks/link/mention/figure/multi-block fragment까지이고, 남은 애매함은 markdown으로 표현하지 못하는 node graph/topology 복원이다. |
| beforeinput paste test data | 확정 결함 | BlockEditor split tests의 markdown `beforeinput insertFromPaste` 회귀 테스트가 없는 `transferData` helper로 `DataTransfer`를 만들려고 해서 `tsc`를 실패시켰다. 기존 `createClipboardData()`를 직접 사용하도록 정리해 테스트 입력 형태를 고정했다. |
| history undo unit coverage | 확정 근거 강화 | `createEditor().dispatch([...])` batch가 undo unit 하나로 복원되고, selection-only dispatch가 document undo entry를 만들지 않는 테스트를 추가했다. active native text edit flush는 여러 글자 edit도 undo 전에 한 replace patch로 기록되는지 확인하게 했다. |
| blur native edit undo unit | 확정 근거 강화 | `BlockEditor`에서 blur가 active native text edit을 flush하면 undo 한 번으로 되돌아가고 redo로 복원되는 테스트를 추가했다. blur-flushed edit은 현재 확정 undo unit이고, 남은 애매함은 focus를 유지한 typing merge/timer/punctuation/composition 정책이다. |
| separate native edit session history | 확정 근거 강화 | blur로 끊긴 두 active native text edit session이 자동 merge되지 않고 각각 undo unit으로 남는 테스트를 추가했다. focus를 유지한 timer/punctuation/composition 기준 typing merge는 별도 제품 정책으로 남겼다. |
| history grouping surface cleanup | 확정 코드/문서 정리 | `DispatchOptions` public type과 `dispatch(command, options)` surface를 제거했다. 확정된 public policy는 explicit batch가 하나의 undo unit이고, batch가 아닌 single dispatch는 별도 undo unit이라는 점이다. |
| history headless dispatch grouping | 확정 근거 강화 | batch가 아닌 연속 `createEditor().dispatch({ type: "insertText" })` 호출은 자동 merge되지 않고 각각 undo unit이 되는 회귀 테스트를 추가했다. 현재 정책은 explicit batch와 separate single dispatch를 구분한다. |
| history grouping evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-history-grouping-audit.md`에 증거 강도를 추가했다. explicit command-array batch, history command batch rejection, successive single dispatch separation, selection-only no-history, keyboard/beforeinput history flush, native caret restore, blur-flushed undo unit, separate blur sessions, `DispatchOptions`/`mergeKey` public absence는 확정했다. Automatic typing merge, transaction metadata, collaboration/persistence history policy는 미정으로 분리했다. |
| link mark fallback cleanup | 확정 코드/문서 정리 | pending href 없이 새 link를 만들 때 `https://example.com`을 넣던 no-prompt demo fallback을 제거했다. link mark command seam은 유지하되, 새 link 생성은 explicit `pendingLinkHref`가 있을 때만 성공한다. link 입력 UI와 legacy URL migration policy는 제품 결정으로 남겼다. |
| link command href policy | 확정 코드/테스트 정리 | command-created link href는 renderer와 같은 trim/allowlist 정책을 통과해야 한다. `http:`, `https:`, `mailto:`, `tel:`, relative URL만 새 link mark로 쓰고, unsafe pending href는 document mutation 전에 거절한다. 다만 relative URL의 route/trust 제품 policy는 이 행으로 닫지 않는다. |
| markdown import/paste link href policy | 확정 코드/테스트 정리 | markdown import와 markdown-format paste도 command-created link와 같은 allowlist를 통과한 href만 link mark로 쓴다. unsafe markdown link는 label text만 보존하고 canonical link mark를 만들지 않는다. |
| link render href safety | 확정 코드/테스트 정리 | link mark href는 canonical document에는 보존하되, renderer가 `javascript:` 같은 unsafe scheme을 clickable DOM `href`로 내보내지 않게 했다. 허용된 clickable href는 `http:`, `https:`, `mailto:`, `tel:`, relative URL로 좁혔다. |
| persisted link mark href validation | 확정 코드/테스트 정리 | `NoteDocumentSchema`와 `parseNoteDocument`가 persisted link mark의 safe `href`만 받아들이고 empty/unsafe href를 generic failure로 거절하게 했다. legacy unsafe href migration/drop policy는 별도 제품/API 결정으로 남긴다. |
| link href evidence classification | 확정/애매 문서 정리 | `docs/editor-link-mark-audit.md`에 증거 강도를 추가했다. `normalizeLinkHref`/`renderableLinkHref`가 schema, command, selection context, markdown import, renderer가 공유하는 href policy interface인 점과 pending href, unsafe rejection, markdown paste, renderer safety, persisted parse는 확정했다. Relative URL 허용은 current source/test behavior이지만 앱 route/trust compatibility policy, link 입력 UX, legacy unsafe migration은 미정으로 분리했다. |
| public surface dogfooding audit | 확정 문서 정리 | `src/routes/index.tsx`는 React facade만 쓰고 `src/editor/public`은 현재 앱 runtime path가 아니라 headless embedding seam임을 import matrix로 고정했다. 현재 dogfooding 비강제는 결함이 아니며, 남은 결정은 future state owner 통합 여부로 좁혔다. |
| public/react facade separation guard | 확정 코드/테스트 정리 | `src/editor/public`은 headless surface, `src/editor/react`는 React surface로 서로 재노출하지 않게 verifier를 강화했다. public facade는 `BlockEditor`를 노출하지 않고, React facade는 `createEditor`/`parseNoteDocument`를 runtime export하지 않는다. 현재 React facade source-level inventory는 runtime `BlockEditor` 1개와 type `BlockEditorProps` 1개다. Boundary script test가 React facade의 `../public` 혼입과 non-react internal alias 재노출을 violation으로 고정한다. |
| React facade canonical export-name guard | 확정 코드/테스트 정리 | React facade가 `BlockEditor`와 `BlockEditorProps` 외 internal React helper를 direct named export나 import-then-export alias로 재노출하는 경로를 차단했다. 허용된 `BlockEditor`도 `EditorShell` 같은 새 public 이름으로 alias export하지 못한다. `export *`/`export * as`로 internal React implementation을 통째로 올리는 경로도 차단했다. `EditorToolbar` 같은 runtime helper는 현재 React implementation 내부이고 app-facing interface가 아니다. Targeted React facade/boundary test는 2 files / 40 tests로 고정한다. |
| public facade export audit | 확정 코드/문서 정리 | `initialNoteDocument`, `createNoteDocument`, `NoteDocumentSchema`를 `src/editor/public` facade에서 제거했다. 현재 source-level runtime public export는 `createEditor`, `parseNoteDocument` 2개로 고정했고, Zod schema 객체 대신 좁은 persisted document parse seam을 노출한다. |
| public export evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-public-export-audit.md`에 증거 강도를 추가했다. Runtime public facade 2개 export, `createEditor`/`parseNoteDocument` 유지, `initialNoteDocument`/`createNoteDocument`/`NoteDocumentSchema` 제거, Markdown adapter runtime 비노출, arbitrary internal helper 비노출, canonical export name guard, namespace/star export leak 방지는 확정했다. Future migration, field diagnostics, untrusted initial option, public Markdown API는 미정으로 분리했다. |
| public facade canonical export-name guard | 확정 코드/테스트 정리 | public facade가 `editorCore`, `noteDocument`, `richSelection`의 확정 public 이름 외 internal model helper를 named export하거나 import-then-export alias로 재노출하는 경로를 차단했다. 허용된 `createEditor`도 `makeEditor` 같은 새 public 이름으로 alias export하지 못한다. `activeMarksFromSelection` 같은 arbitrary helper leak은 public interface를 넓히는 확정 결함으로 보고 script test로 고정했다. |
| public facade namespace star export guard | 확정 코드/테스트 정리 | `export * as name from "../internal/model/..."`가 internal model namespace 전체를 public facade로 올리는 우회 경로라서 boundary verifier가 `export *`와 같은 leak으로 차단하게 했다. Script test가 direct namespace star export leak reporting을 고정한다. |
| public schema validation audit | 확정 코드/문서 정리 | `docs/editor-public-schema-audit.md`를 갱신했다. `NoteDocumentSchema`는 internal canonical validation rule로 유지하되 public에서는 제거했고, persisted JSON을 `NoteDocument`로 좁히는 `parseNoteDocument(value)`를 public validation seam으로 확정했다. |
| public parse-before-create bootstrap | 확정 근거 강화 | public facade 테스트가 persisted JSON을 `parseNoteDocument`로 좁힌 뒤 success `document`를 `createEditor({ initial })`에 넘겨 headless editor를 boot하는 현재 contract를 고정한다. 별도 `untrustedInitial` option은 future ergonomics/migration 결정으로 남겼다. |
| public parse error contract | 확정 코드/테스트 정리 | `parseNoteDocument` 실패는 Zod issue message를 노출하지 않고 `{ ok: false, reason: "Document is invalid." }`로 고정했다. field-level import diagnostics는 별도 제품/API 결정으로 남겼다. |
| replaceDocument error contract | 확정 코드/테스트 정리 | public headless `replaceDocument` command도 invalid document에서 Zod issue text를 노출하지 않고 `{ ok: false, reason: "Document is invalid." }`로 고정했다. invalid replace는 document를 mutate하지 않는다. |
| public schema evidence classification | 확정/애매 문서 정리 | `docs/editor-public-schema-audit.md`에 증거 강도를 추가했다. Public runtime facade 2개 export, `parseNoteDocument` seam, parse-before-create bootstrap, generic parse failure, persisted link href validation, `replaceDocument` generic/no-mutation behavior, internal schema authority, public re-export guard는 확정했다. `CreateEditorOptions.initial`은 trusted `NoteDocument` source behavior이고, `untrustedInitial`, migration, field-level diagnostics DTO는 미정으로 분리했다. |
| public type export audit | 확정 코드/문서 정리 | `FigureBlockInput`, `MentionInlineInput`, `InlineNode`, `NoteBlock`을 `src/editor/public`에서 제거했다. 이 판정은 editor core command/query/result/support type 전체가 아니라 document subtype convenience name과 insert-node input helper 축소다. 현재 source-level public type export는 19개이며, 유지 확정 type surface는 실제 facade와 verifier allowlist 기준으로 `CreateEditorOptions`, `Editor`, `EditorCapability`, `EditorCommand`, `EditorDeleteUnit`, `EditorListener`, `EditorMoveDirection`, `EditorMoveUnit`, `EditorQuery`, `EditorQueryResult`, `EditorResult`, `EditorSnapshot`, `EditorViewAdapter`, `InsertableEditorNode`, `ToggleMarkCommandType`, `NoteDocumentParseResult`, `Mark`, `NoteDocument`, `RichSelection`이다. `InsertableEditorNode`가 insert node command payload의 public 이름이고, document subtype은 `NoteDocument`에서 도출 가능하므로 별도 public contract로 보장하지 않는다. `scripts/verify-editor-boundaries.mjs`가 제거한 타입과 runtime helper의 재노출을 막는다. |
| public type evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-public-type-export-audit.md`에 증거 강도를 추가했다. Runtime public facade 2개 export, source-level public type inventory 19개, editor core command/query/result/support type 유지, `NoteDocument`/`Mark`/`RichSelection`/`NoteDocumentParseResult`/`InsertableEditorNode` 유지, removed document subtype/input helper 재노출 금지, schema/demo/Markdown/React helper 재노출 금지는 확정했다. Generated public schema/type docs와 document subtype convenience names 재도입은 미정으로 분리했다. |
| clipboard grapheme serialization | 확정 결함 | `serializeCursorUnit`이 같은 text path에서 `to.offset === from.offset + 1`만 직렬화해서 emoji 같은 multi-code-unit grapheme을 누락했다. cursor boundary의 실제 `[from.offset, to.offset)` slice를 쓰도록 고쳤고, deterministic shuffle seed에서 회귀를 확인했다. |
| atom text normalization test contract | 확정 근거 강화 | inline atom 삭제/치환 뒤 adjacent text가 canonical하게 합쳐지는 현재 model behavior에 맞춰 patch-shape 중심 기대를 결과 중심 기대로 정리했다. `BlockEditor` explicit atom typing selection path도 merged text run 기준으로 고정했다. |
| git rename audit | 확정 문서 정리 | legacy editor tracked 파일 39개와 새 `internal/public/react` tree 75개를 대조한 `docs/editor-git-rename-audit.md`를 추가했다. 새 tree 분포는 `internal` 70개, `public` 3개, `react` 2개다. 37개는 basename 대응이 있고, `editingHostInputSession.*` 2개는 `contentEditableViewEngine.*`으로 확장 대체된 근거를 남겼다. |
| git rename similarity evidence | 확정 근거 강화 | index를 건드리지 않고 HEAD legacy tree와 current new tree를 `/tmp`에 복사해 `git diff --no-index --find-renames=35% --summary`를 2026-06-22 재실행했다. 결과는 39 legacy files, 75 new files, 32 rename, 43 create, 7 delete로, accidental deletion보다 boundary refactor라는 근거를 강화한다. 현재 새 tree가 untracked인 동안 plain `git diff --summary --find-renames -- src/editor`는 삭제만 보지만, 이는 새 파일을 diff가 보지 못하는 git presentation 문제다. 실제 PR/commit diff 표현은 old delete와 new add를 stage한 뒤 `git diff --cached --summary --find-renames`로 확인해야 한다. |
| visual selection styling cleanup | 확정 코드/문서 정리 | caret/range/atom overlay mechanism은 유지하되, 기능 테스트가 요구하지 않는 `tomato` caret과 figure 전용 dashed outline을 제거했다. caret은 기존 text color, range/atom affordance는 기존 link color 계열로 맞췄고, 남은 애매함은 보조 기술별 announcement QA로 좁혔다. |
| visual selection evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-visual-selection-audit.md`에 증거 강도를 추가했다. Custom caret overlay, text range overlay, selected atom overlay, overlay non-interference surface, native range/IME overlay coherence, focus-only affordance, visual styling cleanup은 확정했다. Chrome visual QA는 단일 browser snapshot으로만 두고, final visual style, assistive-tech selection announcement, real browser pointer/drag matrix는 미정으로 분리했다. |
| visual selection browser QA | 확정 근거 강화 | Chrome headless에서 keyboard range overlay와 mention/figure atom overlay가 실제 rect, link-color fill/border, `pointer-events: none`으로 렌더링되는 것을 확인했다. native drag range 뒤 stale custom overlay도 관측되지 않았다. |
| visual focus affordance | 확정 코드/브라우저 QA | editor focus state를 `data-focused`로 노출하고 기존 link color 계열 inset shadow를 적용했다. BlockEditor split tests가 focus/blur attribute를 고정하고, Chrome headless computed style에서 focused editor box-shadow를 확인했다. |
| visual pointer caret QA | 확정 브라우저 QA | Chrome headless에서 실제 pointer click 후 focused editor가 `data-focused="true"`이고 `.selection-caret` 1개가 `2px x 29.71875px`, 기존 text color로 렌더링되는 것을 확인했다. |
| desktop/mobile layout smoke | 확정 근거 강화 | production preview를 Chrome headless `Chrome/149.0.7827.156`에서 1280x900 desktop과 390x844 mobile viewport로 열었다. 두 viewport 모두 horizontal overflow가 없고 title/editor/toolbar가 pane 안에 있으며 toolbar는 1줄이었다. Screenshot은 각각 1280x900, 1170x2532 PNG로 캡처됐고 runtime/log error는 0건이었다. |
| cursor/selection/contenteditable boundary regression | 확정 결함 | 결합문자 grapheme word boundary, raw empty inline block synthetic caret, raw empty block edge range collapse, adjacent text-run boundary collapse, range collapse affinity, mark element DOM boundary, retargeted composition text leaf를 고쳤다. 관련 테스트가 단독 통과하고 전체 gate도 통과한다. |
| 포맷 게이트 | 확정 결함 | `pnpm check`가 요구한 Biome 포맷을 적용했다. |
| README | 확정 결함 | TanStack starter README가 현재 editor boundary, canonical-state 원칙, 검증 스크립트를 설명하지 못했다. 프로젝트 전용 README로 교체했다. |
| `docs/keyboard-mapping-tbd.md` 삭제 | 확정 문서 정리 | 삭제된 문서는 구현 완료 상태를 중복으로 담고 있었다. `docs/editor-issues.md`에 키보드 구현 상태의 권위 있는 출처를 명시해서 ED-010, ED-021-ED-029와 실행 테스트가 대체한다는 관계를 고정했다. |
| issue ledger evidence classification | 확정/애매 문서 정리 | `docs/editor-issues.md`에 증거 강도를 추가했다. 이 파일은 ED-001~ED-029 implementation issue history와 accepted work ledger로 확정했고, 현재 unchecked acceptance checkbox는 없다. 다만 checkbox는 독립 실행 증거가 아니므로 executable proof는 feature coverage audit과 관련 tests가 함께 담당한다. Required feature/product completion, external issue tracker/PR/release linkage는 미정으로 남겼고, `docs/keyboard-mapping-tbd.md` 복구는 중복 authority라 제거 확정으로 분리했다. |
| feature checklist coverage audit | 확정 문서 정리 | `docs/editor-required-feature-list.md`를 구현 완료 문서로 오해하지 않도록, 15개 섹션을 ED/test 근거와 대조한 `docs/editor-feature-coverage-audit.md`를 추가했다. |
| feature checklist evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-feature-coverage-audit.md`에 증거 강도를 추가했다. Required feature list는 제품/QA 기대 목록, ED-001~ED-029는 accepted implementation ledger, feature coverage audit은 둘 사이의 coverage map으로 분리했다. Text Input, Horizontal Keyboard, Vertical/Page Keyboard, Line/Block/Document Boundary, Deletion, Block Editing, Rendering/Scrolling은 현재 command/model/local rendering gate 범위에서 확정했다. Selection, IME, Clipboard, Word Keyboard, Marks/Rich Text, History, Pointer/Mouse, Platform/Browser는 부분확정으로 두고 browser/OS/assistive-tech matrix, link 입력 UX, rich clipboard graph restore, history automatic typing merge, public import/migration은 미정으로 남겼다. Required list 전체 완료 선언은 제거 확정 해석이다. |
| required feature list evidence classification | 확정/애매 문서 정리 | `docs/editor-required-feature-list.md`에 증거 강도를 추가했다. 이 문서는 15개 섹션의 product/QA checklist와 canonical-state 원칙으로 확정했고, 구현 완료 해석은 제거 확정으로 분리했다. Executable coverage와 future product options는 이 파일만으로는 증명하지 않으므로 feature coverage audit, issues ledger, topic audits, verify output을 함께 봐야 한다. |
| feature checklist gap map | 확정 문서 정리 | required list의 남은 부분확정 항목을 브라우저/QA matrix, 제품/API 결정, 제품/UX 결정, future feature 후보, 접근성 QA, public import/migration으로 나눴다. ED 완료와 제품 완료를 섞어 말하지 않도록 고정했다. |
| Tab outside list policy audit | 확정 문서 정리 | required list의 "configured editor policy"는 현재 list 밖 plain `Tab`을 tab text insertion으로, list 밖 `Shift+Tab`을 selection no-op으로 닫은 상태다. DOM focus 이동 정책이 아니며 inputAdapter split tests가 직접 고정한다. |
| git rename audit cleanup | 확정 문서 정리 | `docs/editor-git-rename-audit.md`에 섞여 있던 public schema migration 문구를 제거했다. 이 문서는 staging 전 rename/refactor 증거만 다루고, public import/migration 결정은 별도 public schema/surface audit에 둔다. |
| git rename evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-git-rename-audit.md`에 증거 강도를 추가했다. Delete-only unstaged diff와 current new tree inventory, basename continuity, temp-tree similarity, public/react/internal seam preservation은 확정했다. Accidental deletion 해석과 pure rename 해석은 제거 확정으로 분리했고, PR/commit rename presentation은 staged diff를 보지 않았으므로 미정으로 남겼다. |
| read-only React policy audit | 확정 근거 강화 | `BlockEditor readOnly`의 public React prop, title/body `aria-readonly`, keyboard/input adapter, DOM recovery, paste/cut/drop, native range transition, toolbar no-op, keyboard/beforeinput history Undo/Redo no-op, composition start/end/input reset 경로를 실행 테스트로 닫았다. toolbar disabled affordance, headless read-only option, 보조 기술 announcement, real browser/OS IME matrix는 제품/API/QA 결정으로 남겼다. |
| toolbar command audit | 확정 문서 정리 | `docs/editor-toolbar-command-audit.md`를 추가했다. Undo/Redo/Insert mention/Insert figure 네 command bridge, accessible icon buttons, focus steal prevention, before-command native/composition flush, read-only mutation guard는 확정했다. Link input toolbar, broad formatting toolbar, enabled/disabled visual state, mention/media picker, toolbar customization/plugin, assistive-tech command announcement는 별도 제품/UX/API 결정으로 남겼다. |
| toolbar command evidence classification | 확정 코드/문서 정리 | `EditorToolbar.test.tsx`를 추가해 네 callback interface, fixed button set, accessible names, hidden icons, callback dispatch, mouse down focus-steal prevention을 실행 테스트로 닫았다. BlockEditor split tests는 before-command native/composition flush, read-only guard, toolbar insertion, Undo/Redo integration을 닫는다. 현재 toolbar는 React internal command bridge이고 public/headless toolbar surface가 아니며, disabled/enabled state와 broader toolbar scope는 제품/UX/API 결정으로 남겼다. |
| debug recorder audit | 확정 코드/문서 정리 | `DebugRecordingInspector`와 `src/editor/internal/debug`를 내부 진단 surface로 분리했다. 내부 hook input은 `LatestSnapshot`, inspector output은 `phase`/`elapsedMs`/`entryCount`로 좁고, public/react facade와 route source는 recorder를 export하지 않는다. hotkey recording, active compact status, compact clipboard report, raw in-page storage, 최근 5개 raw retention, selection/timeline summary, warn/error diagnostics, copy-failed inspector phase는 실행 테스트로 확정했다. Idle inspector 상시 노출은 제거했고, SSR HTML과 Chrome headless DOM에서 idle debug output이 없음을 확인했다. Production hotkey availability, privacy/redaction, retention count의 운영 contract, copy failure UX, replay compatibility는 제품/운영 결정으로 남겼다. |
| verification gate audit | 확정 문서 정리 | `verify:internal`, `verify:docs`, `verify:boundaries`가 실제로 보장하는 focused/skipped/todo test marker scan, Vitest discovery parity, docs inventory/evidence coverage, route tree stability, boundary, type/test/shuffle/check/build/diff-check 범위를 분리했다. 현재 `--repeat=1` 기준선은 marker scan 112 test files/no violations, Vitest discovery 112 files/marker scan 112 files/no diff, README Docs 90 files, editor evidence sections 88 files, normal Vitest 112 files/894 tests, seeded shuffle 112 files/894 tests, Biome 301 files, client/SSR build, route tree unchanged, diff-check 통과다. Docs verifier는 missing/stale/duplicate README Docs entry, missing `## Docs` section, missing editor `## 증거 강도` section reporting을 script test로 고정한다. Boundary verifier는 public facade의 direct/aliased/arbitrary internal-helper/canonical-name/namespace/star/star-as re-export 누수, React facade의 headless public/non-react internal/arbitrary React helper/canonical-name/star/star-as 누수, external static/type-only/export-from/dynamic/commented-dynamic/Vite glob/require/import-equals/import-type hidden implementation 누수, internal segment direction, runtime test-only import 위반, testing helper implementation import, fixture non-testing import reporting을 script test로 고정한다. Internal verifier는 test marker scan, Vitest discovery parity, repeat parsing, route tree 변경 시 restore/fail 동작을 script test로 고정한다. `pnpm check`는 source/config/scripts/CSS surface 기준이고 docs markdown formatting은 `git diff --check` 수준까지만 확정이다. one-off preview/Chrome smoke evidence와 package audit evidence는 별도로 확인했고, browser/AT matrix, staged git rename presentation, dependency/security release gate, runtime smoke gate는 별도 결정으로 남겼다. |
| verification gate evidence classification | 확정/애매 문서 정리 | `docs/editor-verification-gate-audit.md`에 증거 강도를 추가하고 현재 실행 기준선을 marker scan 112 test files/no violations, Vitest discovery parity 112 files/no diff, Vitest 112 files/894 tests, Biome 301 files로 갱신했다. Package verification script surface, `verify:internal` command chain, focused/skipped/todo test marker guard, Vitest discovery parity gate, repeat parsing, route tree stability wrapper, README docs inventory and editor evidence coverage, boundary import scanner forms, public/React facade guards, internal segment/test-only rules, type/test/build/check baseline은 확정했다. Docs markdown formatting과 runtime/browser/release gate는 미정으로 분리했다. |
| Vitest jsdom timeout budget | 확정 테스트 인프라 정리 | Seeded shuffle에서 BlockEditor split tests가 기능 assertion 실패 없이 timeout에 걸리는 flake를 보였다. 같은 테스트 단독 shuffle 실행은 82개 테스트가 통과했고, full-suite shuffle 부하에서는 일부 integration 케이스가 15초를 넘었다. `vite.config.ts`의 Vitest `testTimeout`을 30초로 올려 전체 jsdom integration gate의 부하 민감 timeout false failure를 줄이되 hang 검출은 유지한다. |
| trace replay timeout override cleanup | 확정 테스트 안정화 | Full-suite 부하에서 `BlockEditor.imeTrace.test.tsx`와 `BlockEditor.inputTrace.test.tsx`의 per-test `10_000` timeout이 `vite.config.ts`의 전역 timeout policy를 덮어써 trace replay가 timeout으로 실패했다. 개별 timeout override를 제거해 repo-level `testTimeout: 30_000` 정책을 따르게 했고, 실패 파일 단독 실행과 trace 묶음 실행을 통과시켰다. |
| commented dynamic import boundary guard | 확정 코드/테스트 정리 | `import(/* @vite-ignore */ "../editor/internal/...")` 같은 block-commented dynamic import가 기존 hidden implementation import gate를 우회할 수 있었다. 기존 rule의 의도인 dynamic import 차단 범위 안에 있는 결함이므로 새 개념을 만들지 않고 `scripts/verify-editor-boundaries.mjs`의 call import scanner를 보강했다. boundary verifier split tests가 commented dynamic import violation reporting을 고정한다. |
| Vite glob boundary guard | 확정 코드/테스트 정리 | `import.meta.glob("../editor/internal/...")`는 Vite bundle import surface라서 app code가 editor implementation을 facade 밖에서 끌어오는 우회 경로다. `scripts/verify-editor-boundaries.mjs`가 TypeScript AST로 import/export/dynamic import/`require`/current Vite glob specifier를 수집하게 바꿨고, lazy glob, `{ eager: true }` glob, glob array의 hidden path를 script test로 고정했다. 현재 설치된 Vite type surface에 없는 `globEager` legacy 이름은 확정 범위에서 제거했다. |
| export-from/import-equals boundary guard | 확정 근거 강화 | external app source가 `export { x } from "../editor/internal/..."`로 hidden implementation을 재노출하거나 TypeScript `import x = require("../editor/internal/...")`로 가져오는 경로도 같은 facade seam 위반이다. AST scanner가 이미 수집하는 문법을 boundary verifier split tests 대표 violation으로 고정했다. |
| type-only boundary guard | 확정 코드/테스트 정리 | `import type { X } from "../editor/internal/..."`와 `type X = import("../editor/internal/...").X`는 runtime import가 아니지만 외부 caller가 hidden implementation type을 interface로 알게 만드는 coupling이다. `scripts/verify-editor-boundaries.mjs`가 type-only import declaration과 TypeScript `ImportTypeNode` specifier를 수집하고, 두 leak 경로를 script test로 고정했다. |
| IME trace replay audit | 확정 문서 정리 | `editorTraceReplay`와 Korean Hangul fixture를 내부 React regression replay surface로 분리했다. Current trace surface는 replay helper 1개와 fixture 2개이고, adjacent composition trace는 test 안의 inline fixture다. `editable-trace-replay@1`, `event`/`selection`/`text`/`timers` step union, keyboard/composition/input event replay, replayed `defaultPrevented` assertion, duplicate commit 방지, stale composition end 방지, Enter confirmation은 확정이다. Runtime implementation의 testing/fixture import 금지와 test-file import 허용도 boundary verifier로 고정했다. Browser/OS IME matrix, trace capture/import pipeline, debug recorder compatibility, replay event 범위 확장, external JSON validation은 별도 결정으로 남겼다. |
| style surface audit | 확정 코드/문서 정리 | `src/styles.css`와 React renderer class/data surface를 기능 affordance와 제품 스타일 결정으로 나눴다. selection/caret/focus, block/inline semantic class, empty text measurable target, toolbar accessible icon command, debug phase indicator는 확정이고, CSS는 Biome check 대상에 포함했다. Duplicate `min-height`와 `outline: 0 !important`는 제거했다. final palette/layout/title scale/toolbar disabled styling은 별도 디자인 결정으로 남겼다. |
| style surface evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-style-surface-audit.md`에 증거 강도를 추가했다. Editor surface caret/focus/composition affordance, document selection data attributes, overlay roots and geometry rect projection, empty text measurable target, block/inline semantic class surface, toolbar icon command surface, debug recorder phase indicator, CSS check scope and hygiene는 확정했다. Desktop/mobile layout smoke는 확정 snapshot으로만 두고, `.document-stage` positioning role, final palette/layout/title scale, toolbar disabled styling, debug recorder production availability, browser/accessibility visual matrix는 미정으로 분리했다. 기존 확정 표의 `.document-stage` positioning 주장은 근거가 약해 애매 항목으로 내렸다. |
| app route embedding audit | 확정 문서 정리 | `src/routes/index.tsx`와 root/router 구성을 app embedding 관점으로 분리했다. Route source inventory는 `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/router.tsx`, `src/routeTree.gen.ts` 4개다. `/` route가 `src/editor/react` facade의 `BlockEditor`만 렌더링하고 root shell이 stylesheet/head/scripts를 제공하는 것, generated route tree가 TanStack Start build output과 일치하는 것은 확정이고, app code hidden implementation 차단 범위도 static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type으로 맞췄다. route/router/generated files에는 loader/server/storage/params/search/document-id/read-only mapping이 없으므로 product document app 범위는 아직 닫지 않았다. preview server smoke와 단일 Chrome headless browser smoke도 통과했다. persistence/document-id routing/app-level state owner/browser smoke 자동 gate와 matrix는 제품 결정으로 남겼다. |
| app route embedding evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-app-route-embedding-audit.md`에 증거 강도를 추가했다. Route source inventory, `/` route React facade host, root shell head/style/scripts, router config and route tree shape, generated route tree stability, hidden editor implementation import guard는 확정했다. Route data policy absence는 현재 상태로 확정했고, preview/Chrome smoke는 확정 snapshot으로만 뒀다. Persistence/document identity, app-level state owner, read-only route policy, product app shell/browser gate는 미정으로 분리했다. |
| package surface audit | 확정 코드/문서 정리 | source/config 근거가 없거나 현재 Start build output과 충돌하는 starter direct dependency entries 7개를 제거했고, unused `#/*`/`@/*` aliases도 제거했다. direct `latest` ranges는 현재 lockfile 버전의 caret range로 좁혔으며, `format` script는 `biome format --write` 수동 fixer로 맞췄고 중복 `lint` script는 제거했다. 현재 `pnpm list --depth=0` 기준 direct production dependencies는 10개, direct devDependencies는 11개다. 남긴 확정 surface는 editor model/runtime, TanStack Start/Router app, Vite/Tailwind/React build, Vitest/jsdom/Testing Library test runtime, TypeScript/Biome, route generation through Start build, docs/route/internal verification scripts, manual `preview`/`format` workflow다. `pnpm.onlyBuiltDependencies`는 install lifecycle script allowlist를 `esbuild`/`lightningcss`로 좁히며, 현재 installed graph에는 `lightningcss@1.32.0` path가 있고 `esbuild` path는 없다. preview/Chrome smoke evidence는 확인했고, `pnpm why @vitest/browser-playwright`는 installed dependency path가 없으므로 browser smoke provider/gate는 별도 결정으로 남겼다. caret range vs exact pin policy, dependency/security gate policy도 아직 닫지 않았다. |
| package surface evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-package-surface-audit.md`에 증거 강도를 추가했다. Direct dependency inventory, editor/runtime/build dependency roles, test/type/check tooling roles, verification script surface, Start build 기반 route generation, removed starter dependency absence, unused alias removal, direct `latest` range removal, manual workflow script roles, install build-script allowlist, current audit/license snapshot은 확정했다. Release/CI script policy, semver range vs exact pin policy, dependency/security release gate, browser smoke dependency/gate는 미정으로 분리했다. |
| static public assets audit | 확정 코드/문서 정리 | React/TanStack starter `manifest.json`, `favicon.ico`, `logo192.png`, `logo512.png`, allow-all `robots.txt`를 public surface에서 제거했다. 현재 `public/` top-level file은 `sample-figure.svg` 하나이고, Vite build output의 `dist/client/sample-figure.svg`도 원본과 동일하다. default document와 toolbar figure insert는 `/sample-figure.svg` fixture로 옮겼다. 남은 확정 asset은 deterministic sample figure뿐이고, product favicon/PWA manifest/crawl policy/final demo visual은 별도 제품 결정으로 남겼다. |
| static public assets evidence classification | 확정/애매 문서 정리 | `docs/editor-static-assets-audit.md`에 증거 강도를 추가했다. Public directory inventory, removed starter asset absence, sample figure fixture role, figure render/serialization path, build copy behavior, no linked web manifest, starter favicon/logo restoration 제거, allow-all robots restoration 제거는 확정했다. Product favicon/PWA manifest, crawl policy, final demo visual은 미정으로 분리했다. |
| root config audit | 확정 코드/문서 정리 | `.cta.json` scaffold metadata와 alias가 없는 현재 `tsconfig`에서 의미 없는 `resolve.tsconfigPaths: true` Vite hook을 제거했다. 유지 확정 config는 TypeScript strict/no-emit, Vite Tailwind/Start/React plugin chain, TanStack Router React target, Biome source/scripts/CSS check scope, generated output `.gitignore` baseline, repo-local VS Code routeTree/formatter settings다. 현재 generated output은 `dist/client`, `dist/server`, `.tanstack/tmp`로 확인되고, `git check-ignore -v`가 `dist`, `.tanstack`, `.vinxi`, `.nitro`, `.output`, `.wrangler`, `.env.local`, `node_modules` ignore baseline을 확인한다. docs markdown formatting gate와 deployment target-specific ignore policy는 별도 결정으로 남겼다. |
| root config evidence classification | 확정/애매 문서 정리 | `docs/editor-root-config-audit.md`에 증거 강도를 추가했다. TypeScript config, Vite plugin chain, TanStack Router target config, Biome check scope, repo-local VS Code settings, generated output ignore baseline, current generated output shape, `.cta.json` scaffold metadata removal, unused tsconfig paths hook removal은 확정했다. Docs markdown formatting gate와 deployment-specific ignore policy는 미정으로 분리했다. |
| internal module surface audit | 확정 코드/문서 정리 | `scripts/verify-editor-boundaries.mjs`에 internal segment import direction gate를 추가했다. `model`은 `view/react/debug/testing/fixtures`를 모르고, `view`/`debug`는 internal dependency로 `model`만 쓴다. Runtime implementation files는 `testing`/`fixtures`를 import하지 못하지만, fixture data는 replay type을 위해 `testing`만 type dependency로 참조할 수 있다. 현재 source scan 기준 allowed edge는 runtime `view -> model` 43, `react -> model` 56, `react -> view` 31, `react -> debug` 2, `debug -> model` 4, `fixtures -> testing` 7이며 test-only edge는 `view -> model/fixtures`, `model -> fixtures/testing`, `react -> model/view/fixtures/testing`, `debug -> model`, `testing -> fixtures`다. Public facade가 확정 public allowlist 밖 internal helpers를 direct/alias/namespace/star/star-as로 재노출하거나 확정 이름을 다른 이름으로 alias export하는 경로와 React facade가 `BlockEditor`/`BlockEditorProps` allowlist 밖 headless/non-react/React helper를 재노출하거나 확정 이름을 다른 이름으로 alias export하거나 internal React implementation을 star/star-as로 올리는 경로도 막고, external source가 static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type으로 hidden editor implementation을 가져오는 경로도 차단한다. Script test가 runtime implementation의 test-only helper/fixture import 차단, test file 허용, testing helper의 implementation import 차단, fixture의 non-testing import 차단까지 고정한다. `model`, `view`, `react`, `debug`, `fixtures`, `testing` 역할과 하위 응집도 폴더는 확정했고, public package taxonomy/debug production policy/replay helper externalization/하위 폴더별 verifier는 별도 결정으로 남겼다. |
| internal module surface evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-internal-module-surface-audit.md`에 증거 강도를 추가했다. Internal segment taxonomy, `model` isolation, `view`/`debug` dependency direction, React runtime wiring role, test-only `testing`/`fixtures` surface, external hidden implementation blocking, public facade guard, React facade guard, current clean boundary run, segment 내부 응집도 폴더는 확정했다. Package taxonomy, `debug` production policy, replay helper externalization, 하위 폴더별 import direction verifier는 미정으로 분리했다. |
| dependency/security audit evidence | 확정 근거 강화 | `pnpm audit --json`은 현재 installed graph 257 dependencies에서 info/low/moderate/high/critical vulnerability 0건, `pnpm audit --prod --json`은 production graph 163 dependencies에서 0건을 반환했다. `pnpm licenses list --json`으로 207 license entries inventory도 확인했고, `pnpm.onlyBuiltDependencies`는 install build-script allowlist를 `esbuild`/`lightningcss`로 좁힌다. 다만 release gate 포함 여부, license allowlist/denylist, SBOM/provenance 검증은 별도 정책으로 남겼다. |
| preview server smoke evidence | 확정 근거 강화 | `pnpm build` 뒤 `pnpm preview --host localhost --port 4173 --strictPort`로 `/`가 HTTP 200을 반환하고 SSR HTML에 `<title>Editable</title>`, `Rich note`, `document-view`, `editor-surface`가 포함되는 것을 확인했다. 이 증거는 production preview server smoke이지 browser hydration/screenshot/interaction smoke가 아니다. |
| Chrome headless browser smoke evidence | 확정 근거 강화 | 같은 preview 서버를 Chrome headless `Chrome/149.0.7827.156`에서 열어 hydration 후 `.title-input`, `.document-view`, `.editor-surface`를 확인했다. pointer click 뒤 `Input.insertText(" browser-smoke")`가 document text에 반영됐고, focused surface, selection path/offset, caret 1개, 1280x900 PNG screenshot, runtime/log error 0건을 확인했다. 이 증거는 단일 Chrome smoke이지 자동 release gate나 cross-browser/AT matrix가 아니다. |
| document authority audit | 확정 문서 정리 | `docs/editor-document-authority-audit.md`를 추가했다. `rich-model-design.md`는 design invariant authority, `noteDocument.ts`는 exact schema authority, `editor-issues.md`는 accepted implementation ledger, `editor-required-feature-list.md`는 product/QA expectation list, `editor-feature-coverage-audit.md`는 coverage map으로 분리했다. design 문서를 status tracker나 exact schema contract로 쓰지 않는 정책을 고정했다. |
| document authority evidence classification | 확정/애매 문서 정리 | `docs/editor-document-authority-audit.md`에 증거 강도를 추가했다. Document role taxonomy, design document authority, schema authority, public schema seam, issue ledger authority, required feature list authority, repo analysis/topic audit 역할, README docs inventory and editor evidence gate, docs inventory scope, removed keyboard mapping doc 통합은 확정했다. Semantic stale review, docs formatting, external/generated docs contract는 미정으로 분리했다. |
| docs inventory/evidence verifier | 확정 코드/문서 정리 | `scripts/verify-docs-inventory.mjs`와 `verify:docs`를 추가/확장했다. 현재 top-level `docs/*.md`는 90개이고 README Docs 섹션도 같은 90개를 모두 참조하며, `docs/editor-*.md` 88개는 모두 `## 증거 강도` 섹션을 가진다. 누락된 docs link, 존재하지 않는 extra docs link, duplicate README Docs link, editor evidence section 누락이 생기면 `verify:internal` 앞단에서 실패한다. Verifier 판정은 `verifyDocsInventory()`로 분리했고, matching inventory, missing docs file, stale README entry, duplicate README entry, missing `## Docs` section, missing editor evidence section을 `scripts/verify-docs-inventory.test.mjs`가 고정한다. 이 verifier는 `docs/` 바로 아래 `.md` 파일과 README `## Docs` 섹션의 `- ` bullet line path, `docs/editor-*.md`의 `## 증거 강도` heading만 본다. 현재 nested `docs/**/*.md`는 0개다. README bullet description이나 각 문서 본문 의미의 최신성은 이 gate가 보장하지 않는다. |
| README/document authority verifier wording alignment | 확정 문서 정리 | README `Verify` 목록과 `docs/editor-document-authority-audit.md`의 docs gate 설명을 실제 `verify:docs` 범위에 맞춰 갱신했다. 현재 확정 보장은 README Docs 90개 file/link inventory와 `docs/editor-*.md` 88개 evidence-section presence다. README bullet description, topic audit 본문 semantic freshness, markdown formatting은 여전히 미정/비보장으로 남겼다. |
| docs markdown non-coverage evidence | 확정/미정 분리 | `docs/editor-verification-gate-audit.md`와 `docs/editor-root-config-audit.md`를 갱신했다. 현재 `pnpm check`는 Biome include에 걸린 source/config/scripts/CSS surface 273개를 검사하고 README/docs markdown은 검사하지 않는다. `pnpm exec biome check README.md docs/repo-analysis-report.md docs/editor-verification-gate-audit.md`를 직접 실행해도 current includes 때문에 Checked 0 files와 exit 1이 나온다. `--no-errors-on-unmatched`를 붙이면 exit 0이지만 여전히 Checked 0 files라 coverage가 아니다. 따라서 docs markdown non-coverage는 확정 현재 상태이고, markdown lint/format gate를 추가할지는 별도 workflow/release 정책으로 미정이다. |
| dependency/security snapshot refresh | 확정 snapshot/미정 정책 분리 | 현재 registry 기준 `pnpm audit --json`은 total dependencies 257, vulnerabilities 0건이고 `pnpm audit --prod --json`은 prod dependencies 163, vulnerabilities 0건이다. `pnpm licenses list --json`은 207 entries이며 license counts는 MIT 174, ISC 10, Apache-2.0 6, BSD-3-Clause 4, BSD-2-Clause/MIT OR Apache-2.0/MIT-0/MPL-2.0 각 2, BlueOak-1.0.0/CC-BY-4.0/CC0-1.0/Python-2.0/Unlicense 각 1이다. 이건 current snapshot evidence이고, release gate/allowlist/SBOM/provenance policy는 아직 미정이다. |
| source debt marker inventory | 확정 현재 상태/미정 분리 | `src/editor/internal`, `src/editor/public`, `src/editor/react`, `scripts` 아래 TS/TSX/MJS 파일은 294개이고 그중 test files는 112개다. `rg` 기준 source/scripts/config/README에는 `TODO`, `FIXME`, `XXX`, `HACK`, `TBD`, `not implemented`, `stub`, `temporary`, `workaround` marker가 없다. `throw new Error(`는 verifier validation, document invariant, disposed editor/pretext/mark invariant, trace replay/test helper precondition에 쓰이며 TODO marker가 아니다. Docs 안의 `not implemented` 2건은 block conversion command와 route/storage binding이 제품/API gap이라는 설명이다. 따라서 남은 미정은 source에 방치된 TODO debt가 아니라 문서화된 제품/API/QA 결정이다. |
| runtime throw surface inventory | 확정 현재 상태/미정 분리 | test/spec와 fixture를 제외한 source/scripts의 `throw new Error(`는 44개다. Verification guard 8개는 `verify-internal.mjs` 3개, `verify-internal-test-discovery.mjs` 4개, `verify-internal-route-tree.mjs` 1개로 나뉘며 invalid repeat, route tree regeneration failure, discovery/marker gate failure를 명확히 실패시킨다. `documentInvariants.ts` 14개, `editorCore.ts` 1개, `markCommands.ts` 1개, `cursorGeometryLayout.ts` 1개는 model/view invariant 또는 fallback control path다. `editorTraceReplay.ts` 1개, `editorTraceReplayDom.ts` 5개, `editorTraceReplayEvents.ts` 2개, `editorTraceReplayInvariants.ts` 10개, `preventedEventAudit.ts` 1개는 internal testing helper guard다. 이 throw들은 제품 기능 미구현 marker가 아니며, 제거하면 실패를 숨기거나 fallback/invariant가 흐려진다. 다만 public error taxonomy나 user-facing recovery UX를 설계했다는 뜻은 아니다. |
| type/lint escape hatch inventory | 확정 정리/미정 분리 | `src/editor/internal/model/editorCore.ts`의 `query(...) as never`는 명시적 generic query method로 바꿔 제거했다. `pnpm exec tsc --noEmit`이 통과한다. Generated `src/routeTree.gen.ts`에는 generator가 만든 `eslint-disable`, `@ts-nocheck`, `as any`가 남아 있지만 수동 편집 대상이 아니고 route tree stability check가 Start build output과의 일치를 검증한다. Generated file을 제외한 source/scripts에는 `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `as any`, `: any`, `Record<string, any>`, `as never`가 없다. 남은 high-risk escape line은 6개다. `debugInteractionReport.ts`의 local `window as unknown as { __editableDebugRecordings? }`, `clipboard.ts`의 `JSON.parse(value) as unknown`, `BlockEditor.tsx`의 semantic-element ignore, `DocumentRenderer.tsx`의 array-index-key ignore, invalid document fixture용 `as unknown as NoteDocument` 2개다. 이들은 generated output, narrow browser/debug seam, untrusted JSON narrowing, cursor-coordinate rendering key, invalid schema test fixture로 근거가 있다. Public error DTO, generated route typing policy, 더 엄격한 lint policy는 아직 별도 결정이다. |
| test marker gate | 확정 코드/테스트/문서 정리 | `verify:internal`에 focused/skipped/todo marker scan을 추가했다. Repo-level test/spec 파일의 실제 Vitest property/element access AST에서 `describe`/`suite`/`it`/`test`의 `only`, `skip`, `todo`, `skipIf`, `runIf`, `fails` marker가 발견되면 실패하고 generated/dependency directory는 제외한다. Nearest lexical binding 기준으로 global/direct name, Vitest named-import alias, Vitest namespace import, 사용 지점 전에 초기화된 simple local Vitest alias를 해석하고, marker function alias는 선언 위치에서 보고한다. Non-Vitest `test` 같은 lexical shadow와 아직 초기화되지 않은 later lexical declaration은 Vitest global/alias로 단정하지 않는다. `scripts/verify-internal-test-markers.test.mjs`가 root-level test discovery, generated/dependency directory 제외, 일반 test/`test.each` 통과, 문자열 marker 무시, focused/skipped/todo/conditional/fails/`test["only"]`, `suite`, named alias, namespace import, local alias chain, marker function alias reporting, type-only alias, non-Vitest wrapper/top-level and nested lexical shadow 무시, reserved global-name Vitest alias reporting, nested Vitest alias reporting, out-of-scope alias non-leak, later lexical declaration non-aliasing을 고정한다. 현재 112개 test/spec 파일 marker violation은 0개다. Custom wrapper DSL, destructured marker alias, runtime-computed non-literal property access, browser/AT QA는 이 gate가 보장하지 않는다. |
| Vitest discovery parity gate | 확정 코드/테스트/문서 정리 | `verify:internal`이 `pnpm exec vitest list --filesOnly --json`의 file set과 `verifyNoFocusedOrSkippedTests()`의 file set을 비교한다. 현재 둘 다 112개 file이고 missing/extra가 없다. Vitest list 실패, invalid JSON, file set mismatch는 실패한다. `scripts/verify-internal-test-markers.test.mjs`가 Vitest JSON parse, set compare, mismatch failure를 고정한다. Future custom CLI filters, workspace projects, unusual suffix, Vitest JSON contract 변경은 의도한 discovery policy 판단이 필요하지만 mismatch는 gate에서 드러난다. |
| route tree build stability check | 확정 코드/테스트/문서 정리 | `tsr generate` 단독 output은 TanStack Start build가 붙이는 routeTree register tail과 달라서 standalone `generate-routes`/`verify:routes`는 제거했다. 대신 `verify:internal`이 `pnpm build` 전후의 `src/routeTree.gen.ts`를 비교해 build가 generated route tree를 다시 쓰면 실패하고 원래 content를 복원한다. `scripts/verify-internal-route-tree.test.mjs`가 unchanged build pass와 changed build restore/fail을 고정한다. |
| verification scripts Biome coverage | 확정 코드/문서 정리 | `biome.json` include에 `scripts/**/*.mjs`를 추가했고, verifier scripts와 CSS를 Biome format/check 기준에 맞췄다. 이제 `pnpm check`는 source/config/scripts/CSS surface를 검사한다. |
| boundary verifier SRP split | 확정 코드 정리 | `scripts/verify-editor-boundaries.mjs`는 boundary gate orchestrator와 public re-export facade만 남기고 36 LOC/`if` 2개가 됐다. Public facade guard는 `verify-editor-public-facade-boundary.mjs` 177 LOC/`if` 15개, React facade guard는 `verify-editor-react-facade-boundary.mjs` 134 LOC/`if` 10개, shared export helper는 `verify-editor-facade-export-helpers.mjs` 18 LOC/`if` 1개, import direction/policy는 `verify-editor-boundary-imports.mjs` 105 LOC/`if` 17개, path predicate는 `verify-editor-boundary-predicates.mjs` 58 LOC/`if` 1개, TypeScript source/import scanner는 `verify-editor-boundary-scanner.mjs` 194 LOC/`if` 15개로 분리했다. `verify-editor-boundary-facades.mjs`는 public/React facade check aggregator 2 LOC/`if` 0개다. Boundary verifier split tests와 `pnpm run verify:boundaries`가 통과한다. |
| boundary verifier test SRP split | 확정 코드 정리 | 기존 boundary verifier test 662 LOC/`if` 0개는 public facade, React facade, external hidden import 문법, internal segment/test-only import 규칙을 한 파일에 담고 있었다. 변경 이유가 서로 달라 `verify-editor-public-facade-boundary.test.mjs` 144 LOC/`if` 0개, `verify-editor-react-facade-boundary.test.mjs` 114 LOC/`if` 0개, `verify-editor-external-import-boundary.test.mjs` 274 LOC/`if` 0개, `verify-editor-internal-segment-boundary.test.mjs` 143 LOC/`if` 0개로 분리했다. 네 파일 합산 38개 테스트가 통과한다. |
| internal verifier SRP split | 확정 코드 정리 | `scripts/verify-internal.mjs`는 repeat parsing과 command chain orchestration 92 LOC/`if` 6개로 남겼다. Child process runner는 `verify-internal-command-runner.mjs` 25 LOC/`if` 1개, route tree build stability wrapper는 `verify-internal-route-tree.mjs` 15 LOC/`if` 1개, test marker facade는 `verify-internal-test-markers.mjs` 13 LOC/`if` 0개, Vitest discovery/parity와 repo test file discovery는 `verify-internal-test-discovery.mjs` 113 LOC/`if` 10개, forbidden marker AST/binding resolver는 `verify-internal-test-marker-ast.mjs` 277 LOC/`if` 40개로 분리했다. 기존 `verify-internal.mjs` helper export surface는 re-export로 유지했고 split script tests 34개가 통과한다. |
| internal verifier test SRP split | 확정 코드 정리 | 기존 consolidated internal verifier test 303 LOC/`if` 0개는 repeat parser, route tree stability wrapper, test marker/discovery scanner 테스트를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `verify-internal-repeat.test.mjs` 16 LOC/`if` 0개, `verify-internal-route-tree.test.mjs` 42 LOC/`if` 0개, `verify-internal-test-markers.test.mjs` 243 LOC/`if` 0개로 분리했다. 세 파일 합산 34개 테스트가 통과한다. |
| text command test SRP split | 확정 코드 정리 | 기존 consolidated text command test 2525 raw LOC/`if` 0개는 insertion, edge insertion, deletion, word deletion, split, mention insertion, figure insertion, history, result contract 테스트를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `textCommandInsertion.test.ts` 377 LOC/`if` 0개, `textCommandEdgeInsertion.test.ts` 146 LOC/`if` 0개, `textCommandDeletion.test.ts` 598 LOC/`if` 0개, `textCommandWordDeletion.test.ts` 133 LOC/`if` 0개, `splitParagraph.test.ts` 485 LOC/`if` 0개, `textCommandMentionInsertion.test.ts` 219 LOC/`if` 0개, `textCommandFigureInsertion.test.ts` 231 LOC/`if` 0개, `textCommandHistory.test.ts` 98 LOC/`if` 0개, `textCommandResultContract.test.ts` 41 LOC/`if` 0개로 분리했다. 공통 fixture는 `textCommandTestUtils.ts` 30 LOC/`if` 0개에 둔다. 분리된 9개 test file 합산 58개 테스트가 통과한다. |
| BlockEditor test SRP split | 확정 코드 정리 | 기존 consolidated BlockEditor integration test 2327 LOC(import 제외)/`if` 55개는 lifecycle/owner-document wiring, debug recorder, input bridge, clipboard/transfer, selection projection, read-only boundary, pointer selection, composition bridge, native text buffer transaction, title/toolbar history를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `BlockEditor.lifecycle.test.tsx` 106 LOC/`if` 1개, `BlockEditor.debugRecorder.test.tsx` 260 LOC/`if` 1개, `BlockEditor.inputBridge.test.tsx` 170 LOC/`if` 3개, clipboard/transfer group, `BlockEditor.selectionState.test.tsx` 139 LOC/`if` 3개, `BlockEditor.readOnly.test.tsx` 218 LOC/`if` 6개, pointer selection group, `BlockEditor.composition.test.tsx` 167 LOC/`if` 3개, native text buffer group, `BlockEditor.toolbarHistory.test.tsx` 30 LOC/`if` 0개로 분리했다. clipboard/transfer group은 아래 `BlockEditor clipboard test SRP split`에서, pointer selection group은 아래 `BlockEditor pointer test SRP split`에서, native text buffer group은 아래 `BlockEditor native text buffer test SRP split`에서 다시 세분리했다. 공통 DOM/clipboard/pointer/beforeinput helper는 `blockEditorTestUtils.ts` 156 LOC/`if` 7개에 둔다. 최초 분리된 10개 test file 합산 82개 테스트가 통과했다. |
| BlockEditor clipboard test SRP split | 확정 코드 정리 | 기존 BlockEditor clipboard/transfer bridge test group 397 LOC(import 제외)/`if` 11개는 paste/drop rich transfer, native copy bridge, native cut bridge, clipboard keymap policy를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `BlockEditor.pasteDropTransfer.test.tsx` 220 LOC/`if` 6개, `BlockEditor.copyTransfer.test.tsx` 88 LOC/`if` 3개, `BlockEditor.cutTransfer.test.tsx` 67 LOC/`if` 2개, `BlockEditor.clipboardKeymap.test.tsx` 173 LOC/`if` 6개로 분리했다. 분리된 4개 test file 합산 20개 테스트가 통과한다. |
| BlockEditor pointer test SRP split | 확정 코드 정리 | 기존 BlockEditor pointer selection test group 427 LOC(import 제외)/`if` 6개는 atom node selection, text click/word selection, drag/touch/capture pointer lifecycle을 한 파일에 담고 있었다. 변경 이유가 서로 달라 `BlockEditor.atomPointerSelection.test.tsx` 180 LOC/`if` 4개, `BlockEditor.textPointerSelection.test.tsx` 128 LOC/`if` 0개, `BlockEditor.dragPointerSelection.test.tsx` 224 LOC/`if` 2개로 분리했다. 분리된 3개 test file 합산 12개 테스트가 통과한다. |
| BlockEditor native text buffer test SRP split | 확정 코드 정리 | 기존 BlockEditor native text buffer transaction test group 339 LOC(import 제외)/`if` 14개는 toolbar command flush, native text flush/release, clipboard over active native edits, history undo/redo restoration을 한 파일에 담고 있었다. 변경 이유가 서로 달라 `BlockEditor.nativeTextBufferToolbar.test.tsx` 60 LOC/`if` 2개, `BlockEditor.nativeTextBufferFlush.test.tsx` 90 LOC/`if` 2개, `BlockEditor.nativeTextBufferClipboard.test.tsx` 138 LOC/`if` 5개, `BlockEditor.nativeTextBufferHistory.test.tsx` 189 LOC/`if` 5개로 분리했다. 분리된 4개 test file 합산 14개 테스트가 통과한다. |
| SRP 300 final pass | 확정 유지 판정 | import/export-from/빈 줄/주석 제외 LOC 300 이상 후보 17개를 재산정했다. 남은 후보는 P0 conformance row data, input adapter segment tests, text command behavior tests, cursor geometry fixture corpus, browser input contract, contenteditable composition/flush lifecycle, `useBlockEditorController.tsx` composition facade, `splitParagraph.ts` split contract로 분류된다. 추가 Clear(C) 분리 후보는 없고, `pnpm run verify:internal -- --repeat=1` 기준 marker scan 112 files, Vitest 112 files/894 tests, shuffled Vitest 112 files/894 tests, Biome 301 files, client/SSR build, diff-check가 통과했다. |
| cohesion folder refactor | 확정 코드 정리 | SRP split 이후 segment root에 납작하게 퍼진 같은 변경 이유의 파일군을 하위 폴더로 묶었다. `model/text-command` 34개, `model/input-adapter` 11개, `view/contenteditable` 16개, `view/cursor-geometry` 20개, `react/block-editor` 36개, `debug/interaction-recorder` 13개로 이동했고 root `textCommands.ts`, `inputAdapter.ts`, `contentEditableViewEngine.ts`, `cursorGeometry.ts`, `BlockEditor.tsx`, `useDebugInteractionRecorder.ts`는 compatibility wrapper로 유지했다. Focused cohesion tests는 49 files/580 tests 통과, `pnpm exec tsc --noEmit`, `pnpm run verify:boundaries`, `pnpm check`가 통과한다. |
| DocumentRenderer test SRP split | 확정 코드 정리 | 기존 consolidated renderer test 466 LOC(import 제외)/`if` 0개는 inspection/data-path/selection surface, inline mark/link/mention/empty text rendering, block/figure/code rendering, attrs trust boundary를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `DocumentRenderer.surface.test.tsx` 137 LOC/`if` 0개, `DocumentRenderer.inlineContent.test.tsx` 179 LOC/`if` 0개, `DocumentRenderer.blockContent.test.tsx` 138 LOC/`if` 0개, `DocumentRenderer.attrs.test.tsx` 70 LOC/`if` 0개로 분리했다. 공통 static render/document helper는 `documentRendererTestUtils.tsx` 28 LOC/`if` 0개에 둔다. 분리된 4개 test file 합산 17개 테스트가 통과한다. |
| inputAdapter test SRP split | 확정 코드 정리 | 기존 consolidated input adapter test 2185 LOC(import 제외)/`if` 1개는 navigation key mapping, mark/link/select-all shortcuts, structural editing keys, beforeinput mutations, paste/transfer rich insertion을 한 파일에 담고 있었다. 변경 이유가 서로 달라 `inputAdapterNavigation.test.ts` 651 LOC/`if` 0개, `inputAdapterShortcut.test.ts` 443 LOC/`if` 0개, `inputAdapterStructuralEditing.test.ts` 325 LOC/`if` 0개, `inputAdapterBeforeInput.test.ts` 444 LOC/`if` 0개, `inputAdapterPaste.test.ts` 300 LOC/`if` 0개로 분리했다. 공통 document/result helper는 `inputAdapterTestUtils.ts` 65 LOC/`if` 1개에 둔다. 분리된 5개 test file 합산 51개 테스트가 통과한다. |
| contentEditable view engine test SRP split | 확정 코드 정리 | 기존 consolidated contentEditable view engine test 1546 LOC(import 제외)/`if` 25개는 beforeinput transfer, native edit planning, native flush/DOM repair, DOM selection mapping, composition lifecycle, focused selection scroll을 한 파일에 담고 있었다. 변경 이유가 서로 달라 `contentEditableBeforeInputTransfer.test.ts` 27 LOC/`if` 0개, `contentEditableBeforeInputPlanning.test.ts` 226 LOC/`if` 1개, `contentEditableNativeFlush.test.ts` 351 LOC/`if` 8개, `contentEditableSelectionMapping.test.ts` 274 LOC/`if` 4개, `contentEditableComposition.test.ts` 404 LOC/`if` 6개, `contentEditableSelectionScroll.test.ts` 110 LOC/`if` 0개로 분리했다. 공통 DOM/root/selection/viewport helper는 `contentEditableViewEngineTestUtils.ts` 233 LOC/`if` 7개에 둔다. 분리된 6개 test file 합산 38개 테스트가 통과한다. |
| cursorGeometry test SRP split | 확정 코드 정리 | 기존 consolidated cursor geometry test 1384 LOC(import 제외)/`if` 48개는 invariant/generative fixture corpus, rect/range projection, coordinate hit testing, hard-break visual row policy, vertical/page movement, invalid/null behavior를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `cursorGeometryInvariants.test.ts` 63 LOC/`if` 4개, `cursorGeometryRectProjection.test.ts` 299 LOC/`if` 7개, `cursorGeometryHitTesting.test.ts` 119 LOC/`if` 3개, `cursorGeometryHardBreakRows.test.ts` 278 LOC/`if` 12개, `cursorGeometryVerticalMovement.test.ts` 124 LOC/`if` 5개로 분리했다. 공통 DOM/rect/document helper는 `cursorGeometryTestUtils.ts` 149 LOC/`if` 8개, invariant fixture corpus는 `cursorGeometryInvariantFixtures.ts` 410 LOC/`if` 9개에 둔다. 분리된 5개 test file 합산 321개 테스트가 통과한다. |
| cursorCommands test SRP split | 확정 코드 정리 | 기존 consolidated cursor command test 1148 LOC(import 제외)/`if` 0개는 horizontal character/atom movement, word movement, block/document movement, selection extension, geometry-backed vertical/page movement를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `cursorCommandsHorizontalMovement.test.ts` 272 LOC/`if` 0개, `cursorCommandsWordMovement.test.ts` 143 LOC/`if` 0개, `cursorCommandsBlockDocumentMovement.test.ts` 170 LOC/`if` 0개, `cursorCommandsSelectionExtension.test.ts` 228 LOC/`if` 0개, `cursorCommandsVerticalMovement.test.ts` 328 LOC/`if` 0개로 분리했다. 공통 document/rect helper는 `cursorCommandTestUtils.ts` 31 LOC/`if` 0개에 둔다. 분리된 5개 test file 합산 31개 테스트가 통과한다. |
| cursor model test SRP split | 확정 코드 정리 | 기존 consolidated cursor model test 736 LOC(import 제외)/`if` 0개는 grapheme text cursor units, cursor stream boundaries, atom units/selected pointers, word movement, cursor normalization/JSON selection serialization을 한 파일에 담고 있었다. 변경 이유가 서로 달라 `cursorGraphemeText.test.ts` 140 LOC/`if` 0개, `cursorStreamBoundaries.test.ts` 256 LOC/`if` 0개, `cursorAtomUnits.test.ts` 173 LOC/`if` 0개, `cursorWordMovement.test.ts` 92 LOC/`if` 0개, `cursorNormalization.test.ts` 80 LOC/`if` 0개로 분리했다. 공통 document helper는 `cursorTestUtils.ts` 11 LOC/`if` 0개에 둔다. 분리된 5개 test file 합산 18개 테스트가 통과한다. |
| markdown test SRP split | 확정 코드 정리 | 기존 consolidated markdown adapter test 575 LOC(import 제외)/`if` 1개는 import/sanitization, export shape, round-trip escaping, editor command delimiter independence를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `markdownImport.test.ts` 186 LOC/`if` 0개, `markdownExport.test.ts` 200 LOC/`if` 1개, `markdownRoundTrip.test.ts` 165 LOC/`if` 0개, `markdownCommandIndependence.test.ts` 25 LOC/`if` 0개로 분리했다. 공통 assertion helper는 `markdownTestUtils.ts` 5 LOC/`if` 0개에 둔다. 분리된 4개 test file 합산 17개 테스트가 통과한다. |
| editor regression test SRP split | 확정 코드 정리 | 기존 consolidated editor regression scenarios test 500 LOC(import 제외)/`if` 4개는 atom/text command regression, stored selection regression, vertical movement regression, undo selection recovery를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `editorRegressionAtomTextCommands.test.ts` 87 LOC/`if` 0개, `editorRegressionStoredSelection.test.ts` 36 LOC/`if` 0개, `editorRegressionVerticalMovement.test.ts` 57 LOC/`if` 3개, `editorRegressionUndoSelection.test.ts` 279 LOC/`if` 0개로 분리했다. 공통 document/assertion/rect helper는 `editorRegressionTestUtils.ts` 45 LOC/`if` 1개에 둔다. 분리된 4개 test file 합산 8개 테스트가 통과한다. |
| editorCore test SRP split | 확정 코드 정리 | 기존 consolidated editor core public API test 483 LOC(import 제외)/`if` 2개는 public/descriptor surface, selection state, dispatch/validation, history undo policy를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `editorCoreSurface.test.ts` 70 LOC/`if` 2개, `editorCoreSelection.test.ts` 82 LOC/`if` 2개, `editorCoreDispatch.test.ts` 199 LOC/`if` 2개, `editorCoreHistory.test.ts` 151 LOC/`if` 2개로 분리했다. 공통 document/invalid-doc/rect helper는 `editorCoreTestUtils.ts` 84 LOC/`if` 0개에 둔다. 분리된 4개 test file 합산 18개 테스트가 통과한다. |
| markCommands test SRP split | 확정 코드 정리 | 기존 consolidated mark command test 448 LOC(import 제외)/`if` 0개는 selected range mark toggle/removal, link href add/remove/normalize/reject policy, collapsed selection active mark insertion policy를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `markCommandsRange.test.ts` 146 LOC/`if` 0개, `markCommandsLink.test.ts` 154 LOC/`if` 0개, `markCommandsActiveMarks.test.ts` 184 LOC/`if` 0개로 분리했다. 공통 document/assertion helper는 `markCommandTestUtils.ts` 20 LOC/`if` 0개에 둔다. 분리된 3개 test file 합산 12개 테스트가 통과한다. |
| noteDocument test SRP split | 확정 코드 정리 | 기존 consolidated note document test 430 LOC(import 제외)/`if` 0개는 initial demo seed, paragraph/id factory, metadata/inline mark/schema rejection policy, block/figure/code compatibility schema를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `noteDocumentSeed.test.ts` 63 LOC/`if` 0개, `noteDocumentFactory.test.ts` 45 LOC/`if` 0개, `noteDocumentSchema.test.ts` 153 LOC/`if` 0개, `noteDocumentBlocks.test.ts` 210 LOC/`if` 0개로 분리했다. 분리된 4개 test file 합산 17개 테스트가 통과한다. |
| debug interaction test SRP split | 확정 코드 정리 | 기존 consolidated debug interaction snapshot test 421 LOC(import 제외)/`if` 3개는 raw snapshot selection/document/viewport summary, debug report diagnostics, input event serialization/timeline formatting을 한 파일에 담고 있었다. 변경 이유가 서로 달라 `debugInteractionSnapshotRead.test.ts` 179 LOC/`if` 2개, `debugInteractionReportDiagnostics.test.ts` 115 LOC/`if` 0개, `debugInteractionTimeline.test.ts` 153 LOC/`if` 1개로 분리했다. 분리된 3개 test file 합산 8개 테스트가 통과한다. |
| clipboard test SRP split | 확정 코드 정리 | 기존 consolidated clipboard model test 392 LOC(import 제외)/`if` 0개는 editor selection plain/markdown/custom MIME serialization과 DataTransfer reader fallback/paste contract를 한 파일에 담고 있었다. 변경 이유가 서로 달라 `clipboardSerialization.test.ts` 216 LOC/`if` 0개, `clipboardTransferReader.test.ts` 206 LOC/`if` 0개로 분리했다. 공통 document/transfer fixture는 `clipboardTestUtils.ts` 21 LOC/`if` 0개에 둔다. 분리된 2개 test file 합산 19개 테스트가 통과한다. |
| lint script cleanup | 확정 코드/문서 정리 | `pnpm lint`는 `pnpm check`의 Biome linter 부분집합이고 README/gate에서 쓰이지 않는다. package script surface를 줄이기 위해 별도 `lint` script를 제거했다. |
| selection focus loss coverage | 확정 근거 강화 | BlockEditor split tests에 focus loss가 canonical range selection을 지우지 않는 회귀 테스트를 추가했다. Selection State의 남은 애매함은 focus loss 정책이 아니라 native selection event-ordering 전체 조합으로 좁혔다. |
| public surface audit | 확정 문서 정리 | `createEditor()` headless interface와 `BlockEditor` React interface를 구분한 `docs/editor-public-surface-audit.md`를 추가했다. Headless public seam은 runtime 2개/type 19개이고, React public seam은 runtime `BlockEditor` 1개/type `BlockEditorProps` 1개다. 두 public seam과 facade 분리는 확정이고, 남은 결정은 future state owner 통합 여부로 좁혔다. |
| public surface evidence classification | 확정/애매 문서/테스트 정리 | `docs/editor-public-surface-audit.md`에 증거 강도를 추가했다. Headless runtime facade, headless type surface, `createEditor()` six-method interface, React runtime facade, React type surface, route import seam, facade 분리, 현재 React runtime ownership, React read-only prop은 확정했다. Future state owner 통합, command adapter unification, headless read-only option, public Markdown/migration expansion은 미정으로 분리했다. `src/editor/react/index.test.ts`는 source-level type export가 `BlockEditorProps` 하나뿐임을 고정한다. |
| public API exhaustive inventory | 확정 문서/테스트 정리 | `docs/editor-public-export-audit.md`에 public API 전수 구현 체크를 추가했다. 현재 package는 `private: true`이고 package export map이 없으므로 repo-local public seam은 `src/editor/public`과 `src/editor/react` 두 facade다. Headless runtime은 `createEditor`/`parseNoteDocument`, type surface는 19개, React runtime은 `BlockEditor`, type surface는 `BlockEditorProps`다. `createEditor()` method 6개, command variant 11개, query variant 6개, `parseNoteDocument`, `BlockEditorProps.readOnly`의 구현 상태와 고정 테스트를 표로 묶었다. `NoteDocumentSchema`, demo constructors, Markdown runtime API, document subtype convenience types, `DispatchOptions`, headless read-only, migration/field diagnostics, public Markdown API는 비공개 확정 또는 보류로 분리했다. |
| 30년 구조 판정 | 확정/애매 구조 리포트 | 이 리포트에 30년 구조 판정 섹션을 추가했다. 확정 foundation은 small public facade, canonical document model, command registry, selection/cursor model, DOM/view adapter 분리다. 아직 30년 구조로 닫았다고 말하면 안 되는 부분은 React controller 비대화, input key/beforeinput 절차형 분기, cursor와 text command 내부 책임 경계, React runtime owner와 headless owner 통합 여부다. |
| native marked insertion SRP split | 확정 코드 정리 | active mark가 있는 collapsed native insertion 보정은 React event wiring이 아니라 순수 insertion diff와 model command 재적용 정책이다. `textCommandFromMarkedNativeInsertion`을 `useBlockEditorController.tsx`에서 `nativeMarkedInsertion.ts`로 분리해서 controller가 flush orchestration만 알게 했다. |
| block editor pointer handler SRP split | 확정 코드 정리 | Pointer drag ref, atom/text pointer hit selection, double/triple/shift pointer policy, pointer move range extension, pointer up/cancel release는 contenteditable flush/composition/clipboard 흐름과 독립 변경 이유가 있다. `useBlockEditorPointerHandlers.ts`로 분리했고 controller는 pointer handler hook 결과만 반환 surface에 연결한다. 현재 pointer hook은 167 LOC/`if` 14개다. |
| block editor clipboard handler SRP split | 확정 코드 정리 | Clipboard keymap copy/cut, native copy/cut events, paste/drop transfer parsing, cut deletion, drop coordinate selection은 React controller orchestration과 독립 변경 이유가 있다. `useBlockEditorClipboardHandlers.ts`로 분리했고 controller는 handler hook 결과만 반환 surface와 keymap branch에 연결한다. 현재 clipboard hook은 210 LOC/`if` 13개다. |
| block editor toolbar command handler SRP split | 확정 코드 정리 | Toolbar insert mention/figure, undo/redo, demo id counters, before-command native flush, focus/cursor preview restore는 React controller event orchestration과 독립 변경 이유가 있다. `useBlockEditorToolbarCommandHandlers.ts`로 분리했고 controller는 command dispatch primitive와 hook 결과만 연결한다. 현재 toolbar hook은 129 LOC/`if` 6개다. |
| block editor native selection handler SRP split | 확정 코드 정리 | Initial autofocus, canonical-to-native selection projection, `selectionchange`/`select` native range tracking, focus handler는 input transaction/composition orchestration과 독립 변경 이유가 있다. `useBlockEditorNativeSelectionHandlers.ts`로 분리했고 controller는 native selection state와 hook result만 연결한다. 현재 native selection hook은 193 LOC/`if` 12개다. |
| block editor layout state SRP split | 확정 코드 정리 | Layout measured/version state와 focused selection reveal scroll effect는 input transaction/composition orchestration과 독립 변경 이유가 있다. `useBlockEditorLayoutState.ts`로 분리했고 controller는 `layoutMeasured`/`layoutVersion` 결과만 반환한다. 현재 layout hook은 50 LOC/`if` 4개다. |
| block editor keydown handler SRP split | 확정 코드 정리 | Keymap command bridge, read-only keydown guard, headless keydown ownership/filtering, collapsed selection normalization before keydown command는 beforeinput/composition orchestration과 독립 변경 이유가 있다. `useBlockEditorKeyDownHandler.ts`로 분리했고 controller는 keydown handler hook result만 반환 surface에 연결한다. 현재 keydown hook은 162 LOC/`if` 10개다. |
| block editor beforeinput handler SRP split | 확정 코드 정리 | Beforeinput native event conversion, contenteditable decision dispatch, history command bridge, composition commit handoff, plain beforeinput command dispatch는 native flush/composition start/end orchestration과 독립 변경 이유가 있다. `useBlockEditorBeforeInputHandler.ts`로 분리했고 controller는 refs/state setter와 hook 호출만 연결한다. 현재 beforeinput hook은 196 LOC/`if` 10개다. |
| block editor composition handler SRP split | 확정 코드 정리 | Composition start/end lifecycle, read-only composition reset, native input cursor preview tracking은 contenteditable flush transaction primitive와 독립 변경 이유가 있다. `useBlockEditorCompositionHandlers.ts`로 분리했고 controller는 composition refs/state setter와 hook result만 연결한다. 현재 composition hook은 146 LOC/`if` 9개다. |
| block editor contenteditable transaction SRP split | 확정 코드 정리 | Contenteditable reset, native buffer flush, before-command flushSync bridge, input result patch/selection application, command dispatch bridge는 React controller top-level wiring과 독립 변경 이유가 있다. `useBlockEditorContentEditableTransactions.ts`로 분리했고 controller는 transaction primitives를 받아 하위 handlers에 전달한다. 현재 `useBlockEditorController.tsx`는 317 LOC/`if` 6개, 새 transaction hook은 224 LOC/`if` 12개다. |
| editor core descriptor SRP split | 확정 코드 정리 | Command/query descriptor registry는 public editor lifecycle, listener notification, revision accounting, batch dispatch engine과 독립 변경 이유가 있다. `editorCoreDescriptors.ts`로 분리했고 `editorCore.ts`는 public import path를 유지하며 `EditorCommand`/`EditorQuery`/`EditorQueryResult`를 re-export한다. `editorCore split tests`의 source-level descriptor registry inventory도 새 파일을 읽도록 갱신했다. Descriptor 파일은 246 LOC/`if` 1개다. |
| editor core dispatch SRP split | 확정 코드 정리 | Stateful `createEditor()` lifecycle/subscription/revision accounting과 command dispatch/evaluation/batch/capability engine은 독립 변경 이유가 있다. 기존 `dispatchEditorCommandToJSONDocument` import path는 `editorCore.ts` re-export로 유지하고, dispatch pipeline은 `editorCoreDispatch.ts`로 분리했다. 현재 `editorCore.ts`는 160 LOC/`if` 3개, dispatch 파일은 189 LOC/`if` 15개다. |
| editor move command strategy SRP split | 확정 코드 정리 | `moveSelection` unit/direction strategy table과 geometry requirement는 insert/delete/toggle command strategy와 독립 변경 이유가 있다. Movement command type과 `moveSelectionCommand`를 `editorMoveCommandStrategies.ts`로 분리했고, 기존 public type path는 type re-export로 유지했다. 현재 `editorCommandStrategies.ts`는 165 LOC/`if` 1개, movement strategy 파일은 159 LOC/`if` 0개다. |
| block editor controller helper SRP split | 확정 코드 정리 | React controller hook 하단에 있던 DOM pointer capture fallback과 patch/selection projection helper는 event orchestration 자체와 독립 변경 이유가 있다. `capturePointer`/`releasePointer`/`isTouchPointer`는 `blockEditorPointerCapture.ts`, `documentAfterPatch`/transient selection/context helpers는 `blockEditorSelectionState.ts`로 분리했다. |
| editor trace replay helper SRP split | 확정 코드 정리 | Trace replay runner가 fixture schema/type surface, DOM state reader/equality, event construction/targeting, text/selection DOM manipulation, expectation/invariant assertion, replay loop를 한 파일에 함께 소유하고 있었다. `EditorTraceReplay`/event/state 타입은 `editorTraceReplayTypes.ts`, rendered editor state snapshot/equality reader는 `editorTraceReplayState.ts`, replay DOM mutation/lookup helper는 `editorTraceReplayDom.ts`, synthetic event construction/targeting은 `editorTraceReplayEvents.ts`, trace expectation assertion은 `editorTraceReplayExpectations.ts`, rendered DOM/selection invariant assertion은 `editorTraceReplayInvariants.ts`로 분리했다. 기존 `editorTraceReplay.ts` import surface는 `replayEditorTrace`, `findReplayedEvent`, type re-export, `assertReplayedEditorInvariants` re-export를 유지하고 97 LOC/`if` 6개 runner facade가 됐다. |
| P0 input conformance matrix SRP 유지 | 확정 유지 판정 | `p0InputConformanceMatrix.ts`는 669 LOC/`if` 0개지만 타입 정의, shared fixture blocks, `p0InputConformanceMatrix` 행 데이터로 구성된 P0 input contract matrix 책임 1개다. 길이는 scenario 수의 결과이고 분리 기준이 아니므로 유지한다. |
| composition commit text SRP split | 확정 코드 정리 | IME final commit 유지/중복 제거/대체 commit 정규화는 contenteditable phase state 자체가 아니라 commit text normalization policy다. `normalizeCompositionCommitText`와 helper를 `contentEditableViewEngine.ts`에서 `compositionCommitText.ts`로 분리했다. |
| contenteditable beforeinput event adapter SRP split | 확정 코드 정리 | `InputEvent`에서 paste/drop transfer text와 format을 추출해 engine input DTO로 바꾸는 책임은 native text buffer/IME phase state와 독립 변경 이유가 있다. `contentEditableBeforeInputFromEvent`와 transfer helper를 `contentEditableBeforeInput.ts`로 분리했고, `contentEditableViewEngine.ts`는 기존 import surface를 re-export로 유지한다. Beforeinput adapter는 31 LOC/`if` 1개다. |
| contenteditable engine helper SRP split | 확정 코드 정리 | Active native edit/IME phase state, input type/composition point policy, DOM text restore/read helper, text leaf flush-to-patch helper는 독립 변경 이유가 있다. Input policy는 `contentEditableInputPolicy.ts`, DOM text restore/read는 `contentEditableTextDom.ts`, active text flush patch construction은 `contentEditableTextFlush.ts`로 분리했다. 현재 `contentEditableViewEngine.ts`는 242 LOC/`if` 23개, input policy는 64 LOC/`if` 5개, DOM text helper는 39 LOC/`if` 5개, flush helper는 80 LOC/`if` 4개다. |
| cursor map builder SRP split | 확정 코드 정리 | cursor movement API와 `NoteDocument -> CursorMap/CaretMap` construction은 독립 변경 이유가 있다. `createCursorMap`, `createCaretMap`, position append helpers를 `cursor.ts`에서 `cursorMap.ts`로 분리했다. |
| cursor addressing SRP split | 확정 코드 정리 | JSON pointer path를 cursor용 text/atom/block address로 해석하는 규칙은 cursor movement 자체와 독립 변경 이유가 있다. Empty inline block의 synthetic text path 같은 cursor 전용 해석이 있어 `textCommandAddressing.ts`에 억지로 합치지 않고 `cursorAddressing.ts`로 분리했다. |
| cursor index projection SRP split | 확정 코드 정리 | `CursorMap/CaretMap`과 cursor point 사이의 index projection, block edge projection, point affinity 부여는 cursor movement/word movement와 독립 변경 이유가 있다. `resolveCursorIndexInMap`, `resolveCaretIndexInMap`, `cursorPointAtInMap`과 caret index helper를 `cursorIndexProjection.ts`로 분리했다. |
| cursor word movement SRP split | 확정 코드 정리 | 단어 이동의 separator/word/atom boundary 판정은 기본 cursor stream movement와 독립 변경 이유가 있다. `resolveWordBoundaryCursorPoint`와 unit classification helper를 `cursorWordMovement.ts`로 분리했고, `cursor.ts`의 public `moveCursorByWord` import path는 유지했다. 새 word movement 파일은 143 LOC/`if` 14개다. |
| cursor document index SRP split | 확정 코드 정리 | CursorMap/CaretMap 기반 public index/query wrappers는 basic cursor movement와 독립 변경 이유가 있다. `cursorLength`, `resolveCursorIndex`, `resolveDocumentCursorIndex`, `cursorPointAt`, `documentCursorPointAt`, `moveDocumentCursor`, `createCursorIndexResolver`, `selectedAtomPointersBetween`을 `cursorDocumentIndex.ts`로 분리했고, 기존 `cursor.ts` import surface는 re-export로 유지했다. document index 파일은 64 LOC/`if` 1개다. |
| cursor endpoint SRP split | 확정 코드 정리 | 문서/블록/inline item에서 first/last caret point를 찾는 endpoint projection은 single-step cursor stream movement와 독립 변경 이유가 있다. Figure/code/empty inline block/mention edge 규칙과 adjacent text boundary skip 정책을 `cursorEndpoints.ts`로 분리했고, 기존 `cursor.ts` import surface는 `firstCursorPoint`/`lastCursorPoint` re-export로 유지했다. Endpoint 파일은 160 LOC/`if` 18개다. |
| cursor movement/normalization SRP split | 확정 코드 정리 | `cursor.ts`가 public cursor type/facade와 basic stream movement, word/block-boundary movement wrapper, cursor point normalization을 함께 소유하고 있었다. 기존 import path compatibility는 유지해야 하므로 `cursor.ts`는 type/re-export facade로 남기고, movement traversal은 `cursorMovement.ts`, point normalization/to-selection adapter는 `cursorNormalization.ts`로 분리했다. 현재 `cursor.ts`는 35 LOC/`if` 0개, movement 파일은 253 LOC/`if` 20개, normalization 파일은 25 LOC/`if` 2개다. |
| cursor command selection/geometry SRP split | 확정 코드 정리 | Public cursor command wrapper, selection collapse/projection policy, geometry-backed vertical/line movement는 독립 변경 이유가 있다. `cursorPointInputFromSelection`, open range collapse, extend-selection projection은 `cursorCommandSelection.ts`로, `CursorGeometryAdapter`와 line/page movement implementation은 `cursorGeometryCommands.ts`로 분리했다. 기존 `cursorCommands.ts` import surface는 type/function re-export로 유지한다. 현재 `cursorCommands.ts`는 256 LOC/`if` 2개, selection helper는 108 LOC/`if` 7개, geometry command 파일은 159 LOC/`if` 5개다. |
| cursor geometry inline item SRP split | 확정 코드 정리 | Text block DOM에서 inline text/atom item을 수집하고 width/empty/hard-break를 분류하는 규칙은 line layout strategy와 독립 변경 이유가 있다. `collectInlineItems`, inline width estimate, hard-line count helper를 `cursorGeometryInlineItems.ts`로 분리했다. |
| cursor geometry fragment SRP split | 확정 코드 정리 | `LayoutFragment`/`LayoutLine` construction, pretext fragment consumption, whitespace gap consumption, fragment edge to cursor point projection은 pretext/hard-break/fallback layout strategy와 독립 변경 이유가 있다. `cursorGeometryFragments.ts`로 분리했고, fragment edge projection은 point mapping과 rect projection에서 재사용한다. |
| cursor geometry hard-break layout SRP split | 확정 코드 정리 | Hard newline과 연속 빈 줄의 visual row/caret fragment 구성은 Pretext 기반 일반 wrapping layout과 독립 변경 이유가 있다. `layoutTextBlockWithHardBreaks`를 `cursorGeometryHardBreakLayout.ts`로 분리했고, `cursorGeometryLayout.ts`는 layout dispatcher, Pretext layout, fallback layout을 소유한다. 현재 `cursorGeometryLayout.ts`는 284 LOC/`if` 16개, hard-break layout 파일은 181 LOC/`if` 13개다. |
| cursor geometry point mapping SRP split | 확정 코드 정리 | Coordinate hit-testing, nearest line/figure/fragment 선택, line/figure coordinate를 cursor point로 투영하는 규칙은 rect/range projection facade와 독립 변경 이유가 있다. `pointFromCoordinates`, `pointFromLineCoordinate`, `pointForFigureCoordinate`와 nearest/offset helper를 `cursorGeometryPointMapping.ts`로 분리했다. 현재 point mapping 파일은 141 LOC/`if` 11개다. |
| cursor geometry query SRP split | 확정 코드 정리 | DOM root와 document에서 fresh geometry map을 만드는 factory 책임과, 이미 만들어진 `GeometryMap`을 `CursorGeometry` query method로 투영하는 책임은 독립 변경 이유가 있다. `createCursorGeometryQueries`를 `cursorGeometryQueries.ts`로 분리했고, `cursorGeometry.ts`는 public factory/import surface만 유지한다. 이어서 query factory, point/line/order lookup, rect/range projection, vertical line/page movement도 독립 변경 이유가 명확하므로 `cursorGeometryPointLookup.ts`, `cursorGeometryRectQueries.ts`, `cursorGeometryVerticalMovement.ts`로 분리했다. 현재 `cursorGeometry.ts`는 7 LOC/`if` 0개, query factory는 32 LOC/`if` 0개, point lookup은 164 LOC/`if` 19개, rect query는 147 LOC/`if` 11개, vertical movement는 86 LOC/`if` 8개다. |
| contenteditable selection scroll SRP split | 확정 코드 정리 | Native selection read/write와 DOM text point projection은 viewport scroll/reveal policy와 독립 변경 이유가 있다. `scrollContentEditableSelectionIntoView`와 visual viewport reveal helper를 `contentEditableSelectionScroll.ts`로 분리했고, 기존 `contentEditableViewEngine.ts` re-export surface는 유지했다. |
| contenteditable text point SRP split | 확정 코드 정리 | Native DOM Selection read/write bridge와 contenteditable text point/path/offset projection은 독립 변경 이유가 있다. `ContentEditableTextPoint`, DOM node to text point, cursor point to backing text leaf, `data-path` exact lookup, document text read, text-node offset walk를 `contentEditableTextPoint.ts`로 분리했다. 현재 `contentEditableSelection.ts`는 135 LOC/`if` 11개, text point 파일은 259 LOC/`if` 25개다. |
| text command selection SRP split | 확정 코드 정리 | command 후 selection projection은 patch construction과 독립된 모델 규칙이다. `selectionAfterInlinePrefix`, inserted/replacement block boundary selection helper를 `textCommands.ts`에서 기존 `textCommandSelection.ts`로 옮겼고, `textCommands.ts`/`markCommands.ts`에 중복되던 inline atom unit metric은 `inlineUnits.ts`로 모았다. |
| mark command addressing reuse | 확정 코드 정리 | mark range split은 mark command 책임이지만 inline node construction과 canonical path 문자열 조립은 addressing helper 책임이다. `markCommands.ts`의 로컬 `textInline`, `textPath`, `inlinePath` 중복을 제거하고 기존 `textCommandAddressing.ts` helper를 재사용하게 했다. |
| clipboard transfer SRP split | 확정 코드 정리 | selection clipboard serialization과 paste transfer fallback parsing은 독립 변경 이유가 있다. `clipboard.ts`에는 selection-to-clipboard serialization과 shared MIME/format type을 남기고, structured/plain/markdown/uri-list transfer read policy를 `clipboardTransfer.ts`로 분리했다. |
| inline unit selection SRP split | 확정 코드 정리 | mark command의 mark toggle policy와 selection/cursor를 inline unit range로 변환하고 다시 cursor point로 투영하는 규칙은 독립 변경 이유가 있다. `selectedInlineUnitRange`, `textChildrenInInlineUnitRange`, `cursorPointFromInlineUnitOffset`를 `inlineUnitSelection.ts`로 분리해서 `markCommands.ts`는 mark patch와 mark set 조작에 집중하게 했다. |
| note document runtime helper SRP split | 확정 코드 정리 | document schema/factory와 runtime block type guards/read helper는 독립 변경 이유가 있다. `isInlineTextBlock`, `isCodeBlock`, `isTextBlock`, `isFigureBlock`, `readBlockText`를 `noteDocumentGuards.ts`로 분리하고 기존 `noteDocument.ts` facade re-export는 유지했다. Default demo seed인 `initialNoteDocument`도 `initialNoteDocument.ts`로 분리해 schema/factory 파일에서 제거했다. |
| markdown import/export SRP split | 확정 코드 정리 | Markdown import parser와 export serializer는 같은 adapter domain 안에 있지만 독립 변경 이유가 있다. 기존 `markdown.ts` import path는 facade로 유지하고, import parser를 `markdownImport.ts`, serializer를 `markdownExport.ts`로 분리했다. |
| markdown inline import SRP split | 확정 코드 정리 | Markdown block/document line scanner와 inline mark/link/mention/code-span grammar는 독립 변경 이유가 있다. `parseMarkdownInlineNodes`와 inline escape/link-target helper를 `markdownInlineImport.ts`로 분리했고, `markdownImport.ts`는 block line scanning, figure/code fence parsing, document construction만 소유한다. 현재 `markdownImport.ts`는 207 LOC/`if` 20개, inline import 파일은 267 LOC/`if` 30개다. |
| input adapter keydown SRP split | 확정 코드 정리 | `inputAdapter.ts`가 keydown shortcut/navigation/read-only policy와 beforeinput/paste translation을 함께 소유하고 있었다. Keydown 계열은 독립 변경 이유가 명확하므로 `inputAdapterKeyDown.ts`로 분리하고, 공유 타입/result helper는 `inputAdapterTypes.ts`와 `inputAdapterResult.ts`로 옮겼다. 기존 `inputAdapter.ts` import surface는 유지한다. |
| input adapter navigation keydown SRP split | 확정 코드 정리 | Editing shortcut/read-only keydown policy와 navigation keydown mapping은 독립 변경 이유가 있다. Read-only mode는 navigation만 허용하고 editing key는 block하므로 `translateNavigationKeyDown`과 macOS control navigation helper를 `inputAdapterNavigationKeyDown.ts`로 분리했다. 현재 `inputAdapterKeyDown.ts`는 191 LOC/`if` 20개, navigation keydown 파일은 216 LOC/`if` 25개다. |
| debug interaction target serializer SRP split | 확정 코드 정리 | `debugInteractionSnapshot.ts`가 snapshot summary 생성과 EventTarget debug DTO serialization을 함께 소유하고 있었고, `debugInteractionEvents.ts`도 같은 `serializeTarget`을 사용했다. Target serializer는 snapshot state summary와 독립 변경 이유가 있으므로 `debugInteractionTarget.ts`로 분리했다. 현재 snapshot 파일은 263 LOC/`if` 24개, target serializer 파일은 80 LOC/`if` 8개다. |
| text command fragment helper SRP split | 확정 코드 정리 | block/inline fragment를 plain text fallback으로 투영하는 규칙과 pasted block fragment의 id 재발급/중복 방지 규칙은 core mutation command와 독립 변경 이유가 있다. `inlineNodesPlainText`/`blockPlainText`는 `textCommandPlainText.ts`, `withFreshBlockIds`/`ensureUniqueBlockIds`는 `textCommandBlockIds.ts`로 분리했다. |
| text command split position SRP split | 확정 코드 정리 | cursor point를 paragraph/code/block split position으로 투영하고 split position에서 before/after block list를 만드는 규칙은 command별 mutation 본체와 독립 변경 이유가 있다. Split position type과 `splitPositionFromCursorPoint`, `nonCodeSplitPositionFromCursorPoint`, before/after block helpers, replacement mark lookup을 `textCommandSplitPosition.ts`로 분리했다. |
| text command selection target SRP split | 확정 코드 정리 | `SelectionSnap`을 selected text range, selected atom, document range command target으로 해석하는 규칙은 mutation patch construction과 독립 변경 이유가 있다. `selectedDocumentRange`, `selectedSingleTextRange`, `selectedSingleAtom`과 관련 normalization helper를 `textCommandSelectionTargets.ts`로 분리했다. |
| text command document range SRP split | 확정 코드 정리 | selected document range를 paragraph/code/block split position으로 바꾼 뒤 replacement patch와 `selectionAfter`를 만드는 알고리즘은 command routing, point insertion/delete/split과 독립 변경 이유가 있다. `replaceDocumentRangeWithText`, `replaceDocumentRangeWithInlineNode`, `replaceDocumentRangeWithFigure`, `replaceDocumentRangeWithBlockFragment`는 `textCommandDocumentRange.ts` public facade에 남겼고, non-code paragraph/block replacement는 `textCommandNonCodeDocumentRange.ts`, code-aware replacement는 `textCommandCodeDocumentRange.ts`로 분리했다. selected range split helper는 paragraph split command 책임이므로 `splitParagraph.ts`로 이동했다. 중복 block fragment splice primitive는 `spliceBlockFragment.ts`로 분리해 document range replacement와 fragment insertion이 공유한다. 현재 `textCommandDocumentRange.ts`는 87 LOC/`if` 5개, `textCommandNonCodeDocumentRange.ts`는 208 LOC/`if` 6개, `textCommandCodeDocumentRange.ts`는 193 LOC/`if` 7개, `splitParagraph.ts`는 307 LOC/`if` 18개, `spliceBlockFragment.ts`는 26 LOC/`if` 0개다. |
| text command deletion SRP split | 확정 코드 정리 | backward/forward delete, word delete, atom/block deletion, block merge-on-delete는 insertion/split routing과 독립 변경 이유가 있는 삭제 정책이다. Public delete command 4개는 `textCommands.ts` facade에서 re-export하고, 삭제 구현은 `textCommandDeletion.ts`로 분리했다. Shared text replacement/no-op result builder는 `textCommandEditingPrimitives.ts`로 분리해 deletion과 insertion/split이 같은 primitive를 재사용한다. |
| text command atom deletion SRP split | 확정 코드 정리 | Selected atom replacement에서 insertion command가 `textCommandDeletion.ts`의 `deleteSelectedAtom`을 의존하고 있었다. Whole inline/block atom removal patch와 selection placement는 deletion key command와 독립 변경 이유가 있는 shared primitive라서 `deleteSelectedAtom`, `deleteInlineAtom`, `deleteFigureBlock`을 `textCommandAtomDeletion.ts`로 분리했다. Atom deletion 파일은 76 LOC/`if` 3개다. |
| text command word deletion SRP split | 확정 코드 정리 | Word deletion은 cursor word movement로 extended selection을 만든 뒤 existing delete command에 위임하는 adapter 책임이고, backward/forward grapheme delete와 block merge patch construction과 독립 변경 이유가 있다. `deleteWordBackward`/`deleteWordForward`를 `textCommandWordDeletion.ts`로 분리했고 `textCommands.ts` facade의 public import path는 유지한다. 현재 `textCommandDeletion.ts`는 296 LOC/`if` 24개, word deletion 파일은 37 LOC/`if` 2개다. |
| split paragraph SRP split/유지 판정 | 확정 코드 정리 | `splitParagraph` command는 selected range split, code newline split, inline atom edge split, figure/block edge paragraph insertion, empty typed block exit policy를 함께 소유하는 block-specific split 책임이다. Insertion/atom replacement routing과 독립 변경 이유가 있으므로 `splitParagraph.ts`로 분리하고, 기존 `textCommands.ts` public import surface는 re-export로 유지했다. 현재 307 LOC/`if` 18개지만 실제 책임은 `Enter`/`insertParagraph`/`insertLineBreak` split contract 1개라 추가 분리하지 않는다. |
| text command facade SRP split | 확정 코드 정리 | `textCommands.ts`가 public command import surface와 insertion implementation을 함께 소유하고 있었다. 기존 import path compatibility는 유지해야 하므로 `textCommands.ts`는 command facade로 남기고, insert text/mention/inline fragment/block fragment/figure 및 selected atom replacement 구현을 `textCommandInsertion.ts`로 분리했다. |
| text command edge insertion SRP split | 확정 코드 정리 | Collapsed selection이 inline atom edge 또는 block atom edge에 있을 때 주변 text block에 붙이거나 새 paragraph를 만드는 정책은 insert text command routing과 독립 변경 이유가 있다. `insertTextAtAtomEdge`와 inline/block edge helper를 `textCommandEdgeInsertion.ts`로 분리했고, `textCommandInsertion.ts`는 selected text/range dispatch, selected atom-to-text replacement, collapsed text point insertion을 소유한다. |
| text command block edge insertion SRP split | 확정 코드 정리 | Inline atom edge insertion은 inline child list에 text node를 끼우는 정책이고, block/text-block edge insertion은 block list에 paragraph를 만들거나 existing text/code block 앞뒤에 붙이는 정책이다. Block-side edge insertion을 `textCommandBlockEdgeInsertion.ts`로, shared inline text child add primitive를 `textCommandInlineTextInsertion.ts`로 분리했다. 현재 `textCommandEdgeInsertion.ts`는 144 LOC/`if` 9개, block edge 파일은 179 LOC/`if` 11개, inline text add primitive는 24 LOC/`if` 0개다. |
| text command fragment insertion SRP split | 확정 코드 정리 | inline/block fragment insertion은 fragment normalization, pasted block id refresh, plain-text fallback, split-position insertion을 함께 소유하며 text/mention/figure point insertion과 독립 변경 이유가 있다. `insertInlineFragment`, `insertBlockFragment`, 이미 계산된 split position에 block/inline fragment를 삽입하는 helper를 `textCommandFragmentInsertion.ts`에 둔다. `textCommands.ts` facade가 기존 public command import path를 유지한다. |
| text command figure insertion SRP split | 확정 코드 정리 | figure insertion은 figure src normalization, selected atom-to-figure replacement, paragraph split around figure, code/atom/block edge figure insertion을 소유하며 text/mention insertion과 독립 변경 이유가 있다. `insertFigure`와 figure-specific helper를 `textCommandFigureInsertion.ts`로 분리하고, `textCommands.ts` facade가 기존 public command import path를 유지한다. |
| text command mention insertion SRP split | 확정 코드 정리 | mention insertion은 mention schema normalization, selected text range to inline atom replacement, selected atom-to-mention replacement, code/figure/inline atom edge insertion policy를 소유하며 plain text insertion과 독립 변경 이유가 있다. `insertMention`과 mention-specific helper를 `textCommandMentionInsertion.ts`로 분리하고, `textCommands.ts` facade가 기존 public command import path를 유지한다. |
| browser key press helper focus discipline | 확정 테스트 정리 | Playwright key press helper가 매 key press 전에 editor를 다시 focus하면서 native range selection을 흔들 수 있었다. 브라우저 테스트 helper는 이미 focus된 editor를 검증한 뒤 key를 누르도록 좁혔다. |

## 빼면 안 되는 확정 구조

아래는 코드, 테스트, 검증으로 같이 확인된다. 제거하면 현재 아키텍처나
테스트 기준선을 깨뜨린다.

- `json-document`가 문서와 selection의 canonical state다. DOM은 source of
  truth가 아니라 view와 native text buffer 역할이다.
- `src/editor/internal/*`은 `src/editor/public`, `src/editor/react` 뒤로 숨는
  구조다. `scripts/verify-editor-boundaries.mjs`가 외부/legacy/internal import
  경계를 강제하고, external type-only/export-from/dynamic `import()`/commented dynamic
  `import()`/Vite glob/`require()`/import-equals/import-type hidden implementation import도
  같은 rule로 막는다.
  또한 `model`이 host-specific `view/react/debug`를
  알지 못하고, runtime files가 `testing`/`fixtures`를 import하지 못하도록
  internal segment import direction도 검증한다.
  boundary verifier split tests는 `model -> view` 위반,
  static/type-only/export-from/dynamic/commented-dynamic/Vite-glob/require/import-equals/import-type
  hidden import 위반, public facade arbitrary helper, canonical-name alias, namespace/star/star-as leak,
  React facade의 headless public/non-react internal/arbitrary React helper,
  canonical-name alias, star/star-as leak, runtime의
  test-only helper/fixture import 위반이 실제 violation으로 보고되는 경로를
  고정한다. Test file의 test-only helper/fixture import는 허용하고, testing
  helper의 implementation import와 fixture의 non-testing import는 차단하는 것도
  함께 고정한다.
- `verify:internal`은 내부 품질 gate로 확정이다. Focused/skipped/todo test
  marker scan, `verify:docs`, `verify:boundaries`, `tsc --noEmit`, normal
  Vitest, seed `20260621` shuffled Vitest, Biome check, Vite build, generated
  route tree stability check, `git diff --check`를 같은 순서로 실행한다.
  Test marker scan, repeat parsing, route tree unchanged/changed behavior는
  script test가 고정한다.
  빠른 리포트 기준선은 `--repeat=1`이고, stress/soak script는 같은 command list를
  10/30회 반복한다.
- `src/editor/public`의 `createEditor()`와 `src/editor/react`의 `BlockEditor`는
  둘 다 public seam이다. 전자는 headless embedding interface, 후자는 현재 앱의
  React editor interface다. verifier는 두 facade가 서로 import/re-export되지
  않게 막는다.
- `createEditor()`의 model command surface는 headless deep module로 확정이다.
  public method는 `snapshot`, `subscribe`, `dispatch`, `can`, `query`, `dispose`
  여섯 개이고, descriptor registry가 schema-aware command, query, batch atomicity,
  selection-aware history, geometry adapter escape hatch를 감춘다. Raw JSON Patch를
  받던 `applyPatch` command는 public mutation escape hatch라 제거했다.
- `NoteDocumentSchema`와 `normalizeDocument`가 current document normal form을
  닫는다. schemaVersion 1 structured document가 canonical state이고, block은
  paragraph/heading/quote/listItem/codeBlock/figure, inline은 text/mention, mark는
  bold/italic/code/link다. Normalizer는 empty document fallback, inline placeholder,
  empty text pruning, adjacent text merge, mark ordering/deduplication을 수행하며
  inline atom 양옆 sentinel text node는 강제하지 않는다.
- document metadata surface도 좁게 확정했다. `id`, `title`, `tags`는
  `NoteDocument` normal form의 fields이고, React title input은 canonical `/title`
  mutation을 수행한다. Title change는 same JSON document history에 들어가
  Undo/Redo로 복원된다. 하지만 document route identity, storage/autosave, tags UI,
  title-only public command는 아직 제품/API 결정이다.
- `DocumentRenderer`는 canonical document-to-DOM adapter로 확정이다. Stable
  `data-path`, block/inline/mark/atom DOM mapping, empty text measurable target,
  selection data attributes, renderer-level unsafe link guard가 geometry,
  contenteditable selection, overlay, debug/tests가 읽는 render surface다. Renderer가
  state owner나 command owner가 되는 것은 확정 surface가 아니다.
- `RichSelection`은 public selection interface로 확정이고, low-level
  `SelectionSnap`은 internal/json-document state다. Public selection은
  caret/range/node 세 variant로 좁혀 있고, range source selection은
  `selectedPointers`를 비워 둔 뒤 render 단계에서 atom coverage를 파생한다.
  Selection-only dispatch는 document undo history를 만들지 않는다.
- pointer selection은 React view adapter policy로 확정이다. Atom DOM target은
  explicit node selection으로, text coordinate는 `CursorGeometry` hit testing으로
  canonical cursor point/range로 수렴한다. Shift extension, double word selection,
  triple block selection, drag range selection은 이 adapter 뒤에 숨는다.
- text mutation은 schema-aware command가 JSON Patch와 `selectionAfter`를 함께
  반환하는 구조로 확정이다. `insertText`, `insertNode`, `delete`, `split` 같은
  작은 command surface 뒤에 text/code leaf editing, range replacement,
  grapheme/word deletion, atom deletion/replacement, paragraph split/merge, fragment
  insertion이 숨는다. Raw patch mutation이나 per-case public method는 확정 surface가
  아니다.
- block command는 list depth adjustment만 좁게 확정이다.
  `adjustSelectedListDepth`는 selection-touched `listItem` depth만 patch하고,
  list 밖 Tab policy는 input adapter에서 닫는다. Public block command surface나
  block type conversion command는 아직 확정 surface가 아니다.
- rich text mark는 `bold`/`italic`/`code`/`link` structured mark set과
  `toggleMark`/`toggleLink` command seam으로 확정이다. Range mark는 text run을
  split/merge하고, collapsed mark는 document patch 없이 selection context
  `activeMarks`로 저장된다. Link 생성은 `pendingLinkHref`와 href allowlist를
  통과해야 한다.
- cursor navigation은 document 위의 logical cursor stream과 `moveSelection` command
  seam으로 확정이다. Visible character/grapheme movement, adjacent marked run shared
  boundary, mention/figure atom unit, range collapse/extension, preferredX context,
  geometry-backed line/page movement가 이 seam 뒤에 숨는다.
- Markdown은 canonical state가 아니라 internal import/export adapter다.
  `importMarkdown`, `exportMarkdown`, `exportInlineMarkdown`는 supported rich
  fragment와 clipboard fallback을 위한 adapter이고, editor cursor/selection은
  markdown delimiter가 아니라 structured `NoteDocument` 위에서 동작한다.
- app route embedding은 최소 host로 확정이다. `src/routes/index.tsx`의 `/` route는
  `src/editor/react` facade에서 `BlockEditor`만 가져와 렌더링하고, root route는
  global stylesheet/head/scripts shell을 제공한다. `src/routeTree.gen.ts`는
  TanStack Start build output과 일치해야 하며 `verify:internal`의 build wrapper가
  stale generated route tree를 막는다. app code가 hidden
  `src/editor/internal/*` 또는 legacy editor path를 static/type-only/export-from,
  dynamic/commented-dynamic import, Vite glob, `require()`/import-equals/import-type으로
  가져오면 boundary verifier가 실패한다. preview server의 HTTP SSR shell과 단일
  Chrome headless hydration/interaction/screenshot smoke도 확인했다.
- package surface도 줄였다. `@interactive-os/json-document`, `@chenglou/pretext`,
  React/React DOM, TanStack Start/Router, Vite/Tailwind, `lucide-react`, `zod`,
  Vitest/jsdom/Testing Library, TypeScript/Biome, Start build 기반 route tree 검증,
  verification scripts는
  source/config/test 근거가 있는 확정 surface다. source/config 근거가 없던 direct
  devtools/query/typography/router-plugin/router-cli dependencies와 unused path aliases는 제거했다.
  direct `latest` ranges는 lockfile 기준 caret range로 좁혔다.
  `preview`는 built `dist` serve, `format`은 Biome write fixer로 남기는 manual
  workflow다. 별도 `lint` script는 `check`의 부분집합이라 제거했다. 현재 installed dependency graph의
  `pnpm audit` vulnerability 결과는 0건이다.
- static public asset surface도 줄였다. default document와 toolbar figure insert가
  쓰는 deterministic fixture는 `public/sample-figure.svg` 하나로 고정했고,
  React/TanStack starter manifest/icons와 allow-all `robots.txt`는 제거했다.
  제품 favicon, PWA manifest, crawl policy, final demo visual direction은 아직
  제품 결정으로 남긴다.
- root config surface도 줄였다. scaffold metadata인 `.cta.json`과 alias가 없는
  현재 `tsconfig`에서 의미 없는 `resolve.tsconfigPaths: true` Vite hook은 제거했다.
  TypeScript strict/no-emit, Vite Tailwind/Start/React plugin chain, TanStack Router
  React target, Biome source/scripts/CSS check scope, generated output ignore baseline,
  VS Code routeTree/formatter workflow settings는 확정 유지다.
- CSS gate도 닫았다. `src/styles.css`를 Biome check 대상에 포함했고 duplicate
  `min-height` fallback과 `outline: 0 !important`를 제거했다. 기능 affordance CSS는
  유지하되, 최종 product palette/layout은 여전히 디자인 결정으로 남긴다.
- 문서 권위도 분리했다. `docs/rich-model-design.md`는 design invariant와 module
  responsibility authority이지 구현 상태 tracker나 exact persisted schema contract가
  아니다. 현재 exact schema authority는 `src/editor/internal/model/noteDocument.ts`이고,
  accepted implementation work는 `docs/editor-issues.md`, product/QA expectation은
  `docs/editor-required-feature-list.md`, coverage gap map은
  `docs/editor-feature-coverage-audit.md`가 맡는다. README Docs inventory는
  `verify:docs`가 실제 top-level `docs/*.md` file/link 집합과 일치하는지
  검증하고, 대표 stale inventory failure는 script test가 고정한다. README
  description과 문서 본문 semantic freshness는 별도 review 대상이다.
- persisted document validation seam은 public에 필요하지만 Zod schema 객체 자체는
  필요하지 않다. `parseNoteDocument`가 untrusted JSON을 `NoteDocument`로 좁히고,
  success document를 `createEditor({ initial })`에 넘기는 것이 현재 headless bootstrap
  path다. 실패는 generic `"Document is invalid."` reason으로 반환한다. persisted link
  mark의 non-empty safe `href`도 여기서 검증하고 unsafe href는 거절한다. headless `replaceDocument`
  validation failure도 같은 generic reason을 쓰며 current document를 mutate하지 않는다.
  `NoteDocumentSchema`는 internal validation rule로 남고, boundary verifier는 public
  facade가 이 schema 객체를 다시 export하는 경로를 막는다.
  `CreateEditorOptions.initial`은 trusted `NoteDocument`를 받는 source behavior이며,
  `untrustedInitial`, migration, field-level diagnostics DTO는 아직 public import UX로
  닫지 않았다.
- editor 분리는 실제로 동작한다. model command가 canonical mutation을
  담당하고, `contentEditableViewEngine`은 native text buffering/IME flush를
  담당하며, `BlockEditor`는 React event, focus, toolbar, rendering을 잇는다.
- `contentEditableViewEngine`은 view adapter로 확정이다. native DOM edit은 active
  text leaf 안에서만 허용하고, release 시 canonical replace patch와 snapped selection으로
  되돌린다. beforeinput history/transfer decision, composition phase, DOM restore,
  empty/marked/code text selection mapping도 이 interface가 담당한다.
- `CursorGeometry`도 view adapter로 확정이다. canonical cursor point를 DOM rect와
  coordinate hit testing으로 연결하고, overlay, pointer/drag/drop, vertical/page movement,
  line Home/End movement가 같은 interface를 쓴다.
- IME trace replay는 내부 회귀 재현 surface로 확정이다. `editable-trace-replay@1`
  fixture가 keyboard/composition/input event, native selection, DOM preedit text
  mutation, timers를 재현하고, replayed event의 `defaultPrevented`도 검증한다.
  Korean duplicate commit 방지, stale composition end 방지, Enter confirmation 처리는
  `BlockEditor.imeTrace.test.tsx`에서 고정한다. Runtime implementation이
  `testing`/`fixtures`를 import하지 못하고 test file만 import할 수 있는 것도 boundary
  verifier가 닫는다. 이 helper는 public facade export나 debug recorder replay contract가
  아니며 pointer/clipboard/drop/focus replay interface도 아니다.
- atom/edge cursor semantics는 core model의 일부다. mention/figure atom은 한
  cursor unit이고, selected atom rendering은 explicit node selection 또는
  covered range에서 나온다.
- `Enter`, `insertParagraph`, `insertLineBreak`는 같은 headless split interface로
  수렴한다. 현재 정책은 paragraph/heading/quote/listItem block split,
  codeBlock newline 삽입, atom edge paragraph insertion이며 제거하면
  inputAdapter split tests, text command split tests, BlockEditor split tests
  기준선이 깨진다.
- Tab block editing policy도 확정이다. listItem selection에서는 `Tab`/`Shift+Tab`이
  `adjustSelectedListDepth`로 들어가고, list 밖 plain `Tab`은 tab text insertion,
  list 밖 `Shift+Tab`은 selection no-op이다. 이 범위는
  `docs/editor-block-command-audit.md`와 inputAdapter split tests가 직접 고정한다.
- keyboard input surface는 두 interface로 확정이다. `isHeadlessKeyDown`은
  browser native edit을 막아야 하는 keydown ownership gate이고,
  `translateEditorInput`은 keydown/beforeinput/paste를 canonical command 또는
  selection result로 바꾸는 adapter다. Printable keydown, F-key, writable
  `Cmd/Ctrl+U`, unsupported `Cmd/Ctrl` shortcut, `Alt+Tab`은 browser/system-owned로
  pass-through한다.
- `BlockEditor readOnly`는 React surface의 확정 정책이다. read-only 상태에서도
  focusable textbox와 cursor/selection/copy는 유지하되 title change, text input,
  beforeinput, paste mutation, cut deletion, native DOM edit recovery, native range
  copy selection, toolbar insert/undo/redo mutation 방지는 실행 테스트로 닫혀 있다.
  drop no-op, composition reset, keyboard Undo/Redo shortcut no-op은 source guard로
  확인된다. 내부 `translateEditorInput(..., { readOnly: true })`도 React boundary를
  받치는 확정 implementation이다. 이 확정은 React input boundary 기준이며 public
  headless `createEditor()` option은 아니다.
- toolbar command bridge는 React surface의 확정 implementation이다. `EditorToolbar`
  자체의 interface는 `onUndo`, `onRedo`, `onInsertMention`, `onInsertFigure` 네
  callback뿐이고, fixed button set, accessible labels, hidden icons, callback dispatch,
  focus-steal guard는 `EditorToolbar.test.tsx`로 닫혔다. `BlockEditor` integration은
  native/composition state를 command 전에 flush하고, read-only에서는 mutation을
  no-op으로 막으며, toolbar Undo/Redo가 document history를 복원하는 경로를 닫는다.
  Toolbar concept은 public headless API로 승격하지 않는다.
- clipboard transfer seam은 문자열 fallback 정책까지 확정이다. copy는
  `text/plain`, `text/markdown`, editor structured MIME을 쓰고, custom MIME payload는
  `{ schema, plainText, markdown }` text/markdown envelope로 제한한다. custom MIME
  `markdown`과 외부 `text/markdown` fallback은 markdown format으로 들어가 supported
  marks/link/mention/figure/multi-block fragment를 복원할 수 있고, custom MIME
  `plainText`와 `text/plain`은 plain paste fallback으로 남는다. copy serialization은
  cursor boundary slice를 사용하므로 emoji 같은 multi-code-unit grapheme을 누락하지
  않는다. custom MIME에 extra node/topology metadata가 들어와도 reader는
  text/markdown result만 반환한다. Custom MIME이 없고 외부 `text/plain`과
  `text/markdown`이 같이 있으면 현재 source는 `text/plain`을 먼저 읽지만, 이것을
  external rich paste product policy로 닫지는 않았다.
- history의 기본 undo/redo seam은 확정이다. `json-document`가 document mutation과
  selection을 함께 복원하고, `createEditor` batch dispatch는 undo unit 하나가
  되며, batch가 아닌 연속 single dispatch는 각각 undo unit이 된다. patch 없는
  selection-only dispatch는 document undo entry를 만들지 않는다.
  `BlockEditor`의 blur-flushed active native edit도 undo unit 하나로 기록되고,
  blur로 끊긴 여러 native edit session은 각각 별도 undo unit으로 남는다.
  `DispatchOptions`/`mergeKey`는 public editor contract에서 제거했다.
- link mark의 command/model seam은 확정이다. `Cmd/Ctrl+K`와 `toggleLink`는
  `selection.context.pendingLinkHref`가 있을 때만 새 link mark를 만든다. 이미
  선택된 link나 collapsed active link 제거는 href 없이도 가능하지만, 새 link 생성에
  demo fallback URL을 쓰지는 않는다. `normalizeLinkHref`/`renderableLinkHref`는 schema,
  command, selection context, markdown import, renderer가 공유하는 href policy
  interface다. command-created href와 renderer href는 `http:`, `https:`, `mailto:`,
  `tel:`, relative URL allowlist를 공유하고, unsafe scheme은 document mutation 또는
  DOM `href` 노출 전에 막는다. selection context의 unsafe active link mark도 insertion
  전에 drop된다. markdown import/paste도 같은 allowlist를 통과한 href만 link mark로
  쓰고, unsafe markdown link는 label text만 보존한다. persisted parse도 unsafe link
  href를 generic failure로 거절한다. Relative URL 허용은 current source/test behavior로
  닫혀 있지만 앱 route/trust policy까지 닫은 것은 아니다. 이미 존재하는 legacy
  document의 unsafe href migration/drop policy도 아직 확정하지 않는다.
- visual selection overlay mechanism은 확정이다. custom caret, text range
  highlight, selected atom overlay, focused editor affordance는 geometry와 canonical
  selection/focus state를 사용자에게 보여주는 affordance라서 제거하면
  overlay/integration tests 또는 focus QA 기준선이 깨진다. 다만 figure 전용 dashed
  outline처럼 기능을 늘리지 않는 장식은 제거 확정이다.
- style surface의 기능 affordance는 확정이다. `.editor-surface` focus/IME state,
  `.document-view` selection data attributes, overlay roots의 `aria-hidden`과
  `pointer-events: none`, `.text-block`/`.text-run[data-empty-text]`, block/inline
  semantic classes, toolbar icon buttons, debug recorder phase classes는 renderer,
  geometry, integration tests가 기대하는 DOM interface다.
- debug recorder는 내부 진단 surface로 확정이다. `Cmd+Shift+Backslash` hotkey가
  input/state/clipboard event와 `console.warn`/`console.error` diagnostics 기록을
  시작/종료하고, clipboard에는 compact report만 복사하며, raw JSON/DOM은 page
  memory의 `window.__editableDebugRecordings`에 둔다. React 내부 interface도
  `LatestSnapshot` input과 `phase`/`elapsedMs`/`entryCount` inspector output으로
  좁다. Idle status output은 첫 화면에 렌더링하지 않고, recording/done 상태에서만
  compact status를 보여준다. 이 기능은 `src/editor/internal/debug`와
  `DebugRecordingInspector`에 머물러야 하며 public facade export가 아니다.
- 현재 regression suite는 refactor gate로 의미가 있다. cursor, text command,
  rich selection, clipboard, IME, geometry, toolbar, read-only title/toolbar
  mutation guard, debug recorder, undo/redo selection restore, word punctuation/mark
  boundary movement가 실행 테스트로 덮여 있다.

## 아직 애매하거나 결정이 필요한 것

테스트가 통과한다고 바로 확정이라고 부르면 안 되는 항목이다.

### 미정 결정 인덱스

| 결정 축 | 포함되는 대표 항목 | 왜 아직 확정이 아닌가 | 닫는 방법 |
| --- | --- | --- | --- |
| 제품 앱 범위 | document route, persistence, autosave, app shell, read-only route policy | 현재 `/` route는 React editor host이고 loader/storage/document identity가 없다. | document product app인지 editor-only host인지 먼저 정한다. |
| public API/embedding | headless/React state owner 통합, command registry, plugin hooks, public Markdown/import API, read-only headless option | public facade와 React facade는 둘 다 확정이지만 서로 다른 seam이다. 새 API는 caller contract를 넓힌다. | 실제 embedding/plugin/collaboration caller가 생길 때 interface를 별도 설계한다. |
| schema/data evolution | v2 migration, field diagnostics, attrs semantics, media trust, id uniqueness, metadata commands | schemaVersion 1과 current parse/normalize behavior는 확정이지만 migration/support policy는 없다. | import/export, storage, collaboration 요구와 함께 migration/diagnostics policy를 정한다. |
| browser/platform QA | IME matrix, pointer/selection event ordering, word segmentation, geometry pixel parity, accessibility announcement | jsdom/local tests와 단일 Chrome smoke는 current behavior 증거지만 cross-browser/mobile/AT matrix가 아니다. | Playwright/browser/AT matrix를 release gate로 둘지 결정한다. |
| editor UX expansion | link input UI, toolbar scope, disabled/read-only affordance, final visual style, static assets/branding | 현재 최소 toolbar와 기능 affordance는 확정이지만 제품 UX 방향은 정하지 않았다. | UX scope가 정해질 때 command/query state, accessibility, visual QA를 같이 설계한다. |
| workflow/release gate | CI smoke, dependency/security/license gate, docs markdown lint, staged rename presentation, issue/ADR linkage | `verify:internal`은 내부 품질 gate이고 release 운영 전체를 보장하지 않는다. | PR/release policy로 별도 gate와 ownership을 정한다. |
| debug/diagnostics 운영 | debug recorder production availability, privacy/redaction, trace capture/replay compatibility | internal diagnostic surface는 확정이지만 product/ops contract는 아니다. | dev-only/production policy, retention, redaction, replay import 여부를 결정한다. |

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| future headless/React state-owner 통합 | `docs/editor-public-surface-audit.md` 기준으로 headless public seam과 React app seam은 둘 다 확정이고, verifier가 두 facade의 재노출을 막는다. 현재 앱 route는 `src/editor/react`만 import하고, `src/editor/public`은 앱 runtime owner가 아니다. `BlockEditor`는 native DOM selection, composition, layout lifecycle을 직접 가진다. 따라서 현재 dogfooding 비강제는 확정이다. | 미래에 `BlockEditor` 내부 state owner도 `createEditor()`로 통합할지, 아니면 `createEditor()`를 별도 embedding API로 유지할지 결정해야 한다. 결정 전에는 dogfooding을 verifier로 강제하지 않는다. |
| app product route scope | `docs/editor-app-route-embedding-audit.md` 기준으로 현재 `/` route가 React editor facade를 host하고 production preview server가 SSR shell을 반환하며, 단일 Chrome headless에서 hydration/interaction/screenshot smoke가 통과한 것은 확정했다. Route source inventory는 root route, index route, router factory, generated route tree뿐이고, route/router/generated files에는 hidden editor import나 loader/server/storage/params/search/document-id/read-only mapping이 없다. 하지만 persistence, `/documents/:id` 같은 document identity route, route loader/server function, app-level state owner, read-only route policy, product app shell, automated browser smoke gate, cross-browser/mobile/AT matrix는 없다. | editor-only host로 둘지, document product app으로 확장할지 결정한 뒤 route/data-loading/browser smoke gate를 별도 설계해야 한다. |
| package/tooling policy | `docs/editor-package-surface-audit.md` 기준으로 unused direct dependencies, unsafe standalone route generation script, unused path aliases, direct `latest` ranges는 제거했고, `preview`/`format`의 manual 역할, 중복 `lint` script 제거, direct dependency inventory, current preview server smoke, 단일 Chrome headless smoke, 현재 `pnpm audit` clean evidence, `pnpm.onlyBuiltDependencies` allowlist는 닫았다. 하지만 release/CI runtime smoke/write policy, caret range vs exact pin policy, dependency/security gate policy, license allowlist/denylist, SBOM/provenance 검증, browser smoke dependency/gate 추가 여부는 아직 닫지 않았다. | release/CI runtime smoke/write policy, version pinning/security/browser QA gate를 별도 결정해야 한다. |
| documentation workflow policy | `docs/editor-document-authority-audit.md` 기준으로 문서별 authority는 나눴고, README Docs inventory와 실제 top-level `docs/*.md` 90개 file/link 일치, `docs/editor-*.md` 88개 evidence-section presence는 `verify:docs`가 보장한다. Missing/stale/duplicate README Docs inventory와 missing editor evidence reporting은 script test로 고정했다. 하지만 verifier는 README Docs description과 topic audit 본문이 구현 변경 뒤 의미적으로 stale해지는지는 자동으로 판별하지 않는다. `docs/editor-verification-gate-audit.md` 기준으로 `pnpm check`는 `biome.json` include에 걸린 source/config/scripts/CSS surface만 보고, README/docs direct Biome check도 current includes 때문에 0 files라 coverage가 아니다. docs markdown은 `git diff --check` whitespace 확인까지만 확정이다. Markdown formatting/lint gate, ED ledger와 외부 issue tracker/ADR 관계, generated public schema docs, topic audit semantic stale review 방식, nested docs inventory policy는 아직 닫지 않았다. | docs lint/format, issue/ADR linkage, generated schema docs, semantic stale review를 release/PR 정책으로 둘지 결정해야 한다. |
| product static asset policy | `docs/editor-static-assets-audit.md` 기준으로 starter manifest/icons/robots는 제거했고, figure fixture는 `/sample-figure.svg`로 고정했다. 하지만 제품 favicon, installable PWA manifest, crawl/indexing policy, final default document visual은 아직 제품/brand 결정이 없다. | product brand/SEO/PWA 요구가 생기면 새 asset을 현재 fixture와 분리해서 추가해야 한다. |
| root config workflow policy | `docs/editor-root-config-audit.md` 기준으로 TypeScript/Vite/TanStack/Biome/gitignore baseline, CSS check, repo-local VS Code routeTree/formatter settings는 확정이고, `.cta.json`과 unused Vite tsconfig paths hook은 제거했다. README/docs markdown이 Biome coverage 밖이라는 것도 direct command로 확정했다. 하지만 docs markdown formatting을 gate로 올릴지, deployment target별 ignore baseline을 좁힐지는 아직 닫지 않았다. | docs markdown gate와 deployment target policy를 별도로 결정해야 한다. |
| internal module taxonomy | `docs/editor-internal-module-surface-audit.md` 기준으로 current `model/view/react/debug/testing/fixtures` segment 역할과 import direction은 확정했다. 하지만 이 이름을 public package taxonomy로 승격할지, debug recorder를 product/public surface로 만들지, replay helper를 external trace API로 만들지, segment 내부 파일별 책임을 더 쪼갤지는 아직 결정하지 않았다. | package split, debug production policy, replay externalization, 파일별 SRP/OCP audit는 필요가 생기면 별도로 다룬다. |
| model command/API extension policy | `docs/editor-model-command-surface-audit.md` 기준으로 `createEditor()` six-method interface와 closed descriptor registry는 확정했고 raw `applyPatch` public command는 제거했다. 하지만 React state owner를 `createEditor()`로 통합할지, input adapter가 `EditorCommand`만 반환하게 할지, custom command/plugin registry나 transaction metadata, collaboration/persistence command layer를 둘지는 아직 닫지 않았다. | 실제 embedding/plugin/collaboration 요구가 생기면 command registry extension과 transaction/data layer를 별도로 설계한다. |
| document schema/normal-form evolution policy | `docs/editor-document-normal-form-audit.md` 기준으로 current schemaVersion 1 structured document normal form, block/inline/mark set, safe link validation, empty document fallback, inline placeholder, empty text pruning, adjacent text merge, mark canonicalization은 확정했다. `docs/editor-schema-migration-policy-audit.md` 기준으로 schemaVersion 1 validation, unsupported-version generic failure, no automatic migration, invalid replace no-mutation, invalid replace가 섞인 batch atomicity도 확정했다. `docs/editor-attrs-extension-surface-audit.md` 기준으로 document/root/block/atom attrs 보존, mark attrs 제거, renderer attrs non-projection, Markdown attrs non-round-trip 경계도 확정했다. `docs/editor-code-block-compatibility-audit.md` 기준으로 code block canonical `text`, missing field defaulting, compatibility `children` 보존/비소비 경계도 확정했다. `docs/editor-figure-media-trust-audit.md` 기준으로 figure block atom `src`/`alt` 최소 계약도 확정했다. `docs/editor-identity-policy-audit.md` 기준으로 local ids and duplicate-id tolerance도 확정했다. 하지만 v2/legacy migration location, support window, field-level diagnostics, attrs semantic ownership, media source trust, global/collaboration id policy, codeBlock compatibility support 기간, nested/container block 확장은 아직 닫지 않았다. | persisted import/export 또는 collaboration 요구가 생기면 migration, diagnostics, attrs/media/id policy를 schema extension과 함께 설계해야 한다. |
| attrs extension/product policy | `docs/editor-attrs-extension-surface-audit.md` 기준으로 attrs는 current persisted schema compatibility surface로 유지한다. document/root/block/inline atom attrs 보존과 mark attrs canonical removal, renderer non-projection, Markdown arbitrary attrs non-round-trip은 실행 테스트로 확정했다. 일부 factory-generated typed-field echo attrs는 extension syntax가 아니다. attrs를 public plugin API, DOM/rendering behavior, Markdown/frontmatter fidelity, reserved namespace, schema-aware import/export contract로 승격하지는 않는다. | custom block/inline rendering, rich import/export, plugin 요구가 생기면 attrs namespace, migration, renderer hook, schema-aware exporter를 함께 설계해야 한다. |
| code block compatibility/product policy | `docs/editor-code-block-compatibility-audit.md` 기준으로 code block content source of truth는 `text`이고 `children`은 compatibility field로 유지한다. 하지만 compatibility 지원 기간, text/children conflict diagnostics, future code child/token model, language registry/highlighter binding은 닫지 않았다. | persisted import, syntax highlighting, code annotation 요구가 생기면 migration/diagnostics와 renderer decoration model을 함께 설계해야 한다. |
| figure media trust/product policy | `docs/editor-figure-media-trust-audit.md` 기준으로 figure는 non-empty `src`와 optional `alt`를 가진 block atom이고, renderer non-editable projection, empty text extraction, Markdown image syntax, toolbar fixture는 실행 테스트로 확정했다. 하지만 media URL allowlist/sanitizer/proxy, remote image privacy, user-provided SVG, broken-media UX, captions/metadata는 닫지 않았다. | external media, upload, public deployment privacy 요구가 생기면 schema, renderer, Markdown, CSP/proxy/asset policy를 함께 설계해야 한다. |
| identity/persistence/collaboration policy | `docs/editor-identity-policy-audit.md` 기준으로 non-empty id shape, local generated block ids, imported fragment fresh ids, duplicate id schema acceptance, duplicate render tolerance, debug duplicate inventory/report diagnostics는 확정했다. 하지만 schema-level unique block id validation, global id provider, route/storage binding for `NoteDocument.id`, collaboration ownership/conflict policy는 닫지 않았다. | multi-document storage, import migration, collaboration 요구가 생기면 id provider, duplicate handling, route/storage identity, remote ownership을 함께 설계해야 한다. |
| document metadata/product policy | `docs/editor-document-metadata-surface-audit.md` 기준으로 current metadata schema fields, title field, React title input, Markdown metadata options, first heading non-title behavior는 확정했다. `docs/editor-identity-policy-audit.md` 기준으로 local id behavior도 확정했다. 하지만 document route identity, storage/autosave, tags semantics/UI, empty-title UX, title/body separate history, title-only public command, Markdown frontmatter mapping은 아직 닫지 않았다. | multi-document product scope가 생기면 metadata command/history, storage key, route/data loading, Markdown/frontmatter import/export를 함께 설계해야 한다. |
| render surface/accessibility policy | `docs/editor-render-surface-audit.md` 기준으로 current `DocumentRenderer`의 stable DOM path/class/data surface, empty text measurable target, atom non-editable rendering, renderer link href safety는 확정했다. `docs/editor-figure-media-trust-audit.md` 기준으로 missing figure alt의 empty fallback도 확정했다. 하지만 published semantic HTML, assistive-tech announcement matrix, media source trust, custom node renderer, static export contract, virtualized/offscreen rendering은 아직 닫지 않았다. | public read-only/export renderer, media import, custom node, long document 요구가 생기면 renderer, geometry, selection mapping, accessibility QA를 함께 설계해야 한다. |
| selection model/native selection policy | `docs/editor-selection-model-audit.md` 기준으로 `RichSelection` public interface, internal `SelectionSnap` 비노출 guard, caret/range/node variants, render atom derivation, default/invalid selection normalization, command input normalization, selection-only no-history behavior는 확정했다. 하지만 browser native selection event-ordering matrix, multi-range selection, persisted selection serialization, public context semantics, collaboration/presence, assistive-tech announcement는 아직 닫지 않았다. | browser QA나 collaboration/session restore 요구가 생기면 native selection matrix와 persisted/remote selection DTO를 별도 설계해야 한다. |
| native DOM selection bridge policy | `docs/editor-native-selection-bridge-audit.md` 기준으로 current contenteditable DOM selection read/set/scroll bridge는 internal view adapter로 확정했다. 하지만 이를 public native selection API, generic backend, browser DOM Range compatibility matrix, mobile touch handles, persisted/session restore contract로 승격하는 것은 아직 닫지 않았다. | browser/mobile/accessibility/session restore 요구가 생기면 native selection bridge를 public selection model, pointer policy, contenteditable buffer policy와 함께 재검토해야 한다. |
| pointer selection/browser matrix policy | `docs/editor-pointer-selection-audit.md` 기준으로 current pointer-to-canonical-selection adapter는 확정했다. 하지만 real browser coordinate matrix, native `selectionchange` ordering, touch/pen gestures, drag auto-scroll, multi-range pointer selection, assistive-tech announcement는 아직 닫지 않았다. | Playwright pointer matrix, mobile/touch editing, long-document drag 요구가 생기면 geometry, contenteditable selection, scrolling policy를 함께 검증해야 한다. |
| text mutation/model extension policy | `docs/editor-text-mutation-command-audit.md` 기준으로 current text mutation command seam과 text/code/range/atom/split/merge/fragment behavior는 확정했다. 하지만 richer block schema, paragraph soft-break node, multi-range editing, collaboration operation merge, rich node graph paste restore, generated compatibility matrix, `textCommands.ts` file-level 분할 정책은 아직 닫지 않았다. | 새 schema나 collaboration/editor embedding 요구가 생기면 mutation strategy 확장 지점과 compatibility docs를 별도 설계해야 한다. |
| block command/list structure extension policy | `docs/editor-block-command-audit.md` 기준으로 current list depth adjustment, outdent clamp, list/non-list Tab policy, public `adjustListDepth` absence는 확정했다. 하지만 heading/quote/list type conversion, flat `depth`를 넘는 nested list tree semantics, paragraph soft-break model, custom block command registry는 아직 닫지 않았다. | toolbar/list controls, richer list rendering, custom block schema 요구가 생기면 schema, renderer, cursor, markdown, command registry를 함께 설계해야 한다. |
| mark command/UX extension policy | `docs/editor-mark-command-audit.md` 기준으로 current structured mark set, mark command seam, range split/remove policy, inline atom non-marking, collapsed active marks, active mark normalization, pending link href, renderer/schema/markdown alignment는 확정했다. 하지만 link input UX, legacy unsafe URL migration, underline/strike/color 같은 additional marks, mark exclusivity, active context persistence, public mark plugin, generated compatibility matrix는 아직 닫지 않았다. | mark set이나 link UX를 넓히려면 schema, command, renderer, markdown, toolbar/shortcut policy를 함께 설계해야 한다. |
| cursor navigation/platform policy | `docs/editor-cursor-navigation-model-audit.md` 기준으로 logical cursor stream과 current movement command behavior는 확정했다. 하지만 locale word segmentation matrix, BiDi/RTL/vertical writing, cross-browser visual movement parity, multi-cursor movement, virtualized/offscreen layout, custom node cursor descriptors, platform shortcut customization은 아직 닫지 않았다. | advanced writing mode, custom node, browser QA 요구가 생기면 cursor stream과 geometry adapter contract를 함께 확장해야 한다. |
| markdown compatibility/export policy | `docs/editor-markdown-adapter-audit.md` 기준으로 current Markdown adapter는 supported rich fragment import/export와 clipboard fallback까지 확정했고, public facade 비노출도 test/verifier로 확정했다. `docs/editor-figure-media-trust-audit.md` 기준으로 supported figure image syntax escaping도 확정했다. 하지만 CommonMark/GFM 전체 호환, external public Markdown import/export API 설계, Markdown source mode, figure/media `src` trust policy, generated compatibility docs는 아직 닫지 않았다. | external import/export 요구가 생기면 supported Markdown matrix, media policy, public error shape를 별도 설계한다. |
| feature checklist 완료 여부 | `docs/editor-required-feature-list.md`는 product/QA 기대 목록이지 구현 상태 문서가 아니다. 섹션별 coverage와 gap map은 `docs/editor-feature-coverage-audit.md`로 분리했다. Selection State의 focus loss selection preservation은 실행 테스트로 확정했고, 남은 부분확정은 browser/OS/assistive-tech matrix, 제품/API 결정, 제품/UX 결정, future feature, public import/migration이다. | required list 전체를 완료로 취급하지 않는다. 부분확정 섹션의 남은 항목은 gap map 기준으로 별도 이슈로 쪼개야 한다. |
| keyboard/global shortcut policy | `docs/editor-keyboard-input-policy-audit.md` 기준으로 editor-owned keydown, printable/system pass-through, unsupported structural shortcut no-op, adapter command mapping, React keydown/beforeinput split, composition/read-only guards는 확정했다. 하지만 app shell 저장/검색/프린트 같은 global shortcut layer, OS/browser별 shortcut matrix, underline mark, user-configurable hotkeys, assistive-tech keyboard announcement는 현재 editor correctness 범위가 아니다. | global app shortcut이 필요해지면 editor ownership gate와 별도 app shortcut layer를 설계한다. |
| contenteditable platform/backend policy | `docs/editor-contenteditable-buffer-audit.md` 기준으로 active text leaf gate, one-patch flush, composition phase, DOM restore, selection mapping은 확정했다. 하지만 browser/OS IME matrix, full browser event ordering, generic input backend abstraction, MutationObserver drift guard, native buffer transaction merge는 아직 닫지 않았다. | 실제 두 번째 input backend나 release-level browser QA 요구가 생기면 별도 gate/interface로 설계한다. |
| cursor geometry platform/layout policy | `docs/editor-cursor-geometry-audit.md` 기준으로 DOM geometry adapter와 unit-level rect/hit-test/movement behavior는 확정했다. 하지만 cross-browser pixel parity, final visual style, BiDi/RTL/vertical writing, virtualized layout, exact font measurement policy는 아직 제품/플랫폼 결정이 아니다. | browser layout QA나 advanced writing mode가 필요해질 때 geometry source와 measurement policy를 별도 설계한다. |
| custom MIME node graph paste 복원 | 현재 structured clipboard payload는 `schema`, `plainText`, `markdown`만 담는 text/markdown envelope다. custom MIME `markdown`과 외부 `text/markdown` fallback은 supported marks/link/mention/figure/multi-block fragment를 복원한다. extra `selectedPointers`/`nodes` metadata가 들어와도 reader는 node graph로 승격하지 않고 text/markdown result만 반환한다. 다만 same-app selection topology, node identity, future schema-specific node data를 복원하는 node graph importer는 없다. Custom MIME이 없는 external paste에서 `text/plain`보다 `text/markdown`을 우선할지 여부도 아직 제품 UX policy로 닫히지 않았다. | markdown fallback보다 강한 별도 node payload를 rich restore source로 둘지, external rich paste precedence를 바꿀지 결정해야 한다. |
| future automatic typing merge/transaction policy | active native edit 하나가 undo/redo 전이나 blur 때 flush될 경우 undo unit 하나가 되는 것, blur로 끊긴 여러 native edit session이 각각 undo unit으로 남는 것, explicit batch dispatch가 undo unit 하나가 되는 것, history command는 batch에 섞을 수 없는 것, batch가 아닌 연속 headless `insertText`가 각각 undo unit이 되는 것은 확정했다. `DispatchOptions`/`mergeKey` public surface는 제거했다. 다만 focus를 유지한 여러 native edit session, timer/punctuation/composition 기준 자동 merge와 transaction metadata는 아직 제품 정책으로 닫히지 않았다. | 별도 transaction surface나 typing merge policy를 추가할지, 아니면 batch dispatch와 native edit flush만으로 둘지 결정해야 한다. |
| link 입력 UX와 legacy URL policy | link mark schema, safe markdown import/export, markdown paste/import href allowlist, renderer href safety, pending href 기반 command seam, command-created href allowlist, active link context sanitization, persisted link mark href validation은 확정이다. no-prompt demo fallback은 제거했다. 하지만 toolbar에는 link 입력 버튼이 없고, `pendingLinkHref`를 사용자가 설정하는 UI도 없다. Relative URL 허용은 current source/test behavior지만 route/trust compatibility matrix는 아직 닫지 않았다. 이미 존재하는 legacy document URL migration/sanitization도 아직 닫지 않았다. | link 입력 UI를 만들지, command-only API로 둘지, relative/protocol-relative URL 호환 범위와 legacy URL migration 정책을 어디까지 할지 결정해야 한다. |
| toolbar UX/API expansion policy | `docs/editor-toolbar-command-audit.md` 기준으로 current four-button toolbar command bridge는 확정했다. `EditorToolbar.test.tsx` 기준으로 네 callback interface, fixed accessible button set, callback dispatch, focus-steal prevention도 실행 테스트로 닫았다. 하지만 link input toolbar, broad formatting toolbar, `canUndo`/`canRedo`/read-only 기반 enabled state, mention/media picker, toolbar customization/plugin, assistive-tech command announcement는 아직 닫지 않았다. | product toolbar scope가 커지면 command/query state, active mark/list state, picker/media policy, disabled affordance, accessibility QA를 함께 설계해야 한다. |
| public document migration/untrusted import policy | `docs/editor-public-schema-audit.md` 기준으로 `NoteDocumentSchema` public export는 제거 확정했고, `parseNoteDocument`가 현재 persisted JSON validation seam이다. `parseNoteDocument` success document를 `createEditor({ initial })`에 넘기는 parse-before-create bootstrap도 테스트로 고정했다. `parseNoteDocument`와 headless `replaceDocument` failure reason은 generic이고, persisted link mark empty/unsafe href도 generic failure로 거절한다. `docs/editor-schema-migration-policy-audit.md` 기준으로 unsupported schema versions는 migrate하지 않고 거절하며 invalid replace는 current document를 mutate하지 않고 batch 실패도 atomic하다. 하지만 현재 schema는 `schemaVersion: 1`만 받으며 `createEditor`는 trusted `NoteDocument`만 받는다. Boundary verifier는 `NoteDocumentSchema` re-export를 막지만, generated public schema docs나 semantic import compatibility matrix는 없다. Migration API absence는 current source behavior이지 future import policy까지 닫은 것은 아니다. | future schema migration을 `parseNoteDocument` 내부로 숨길지, 별도 migration interface를 둘지, `createEditor({ untrustedInitial })` 같은 ergonomic option을 추가할지 결정해야 한다. field-level diagnostics가 필요하면 Zod issue가 아니라 좁은 error DTO를 설계해야 한다. |
| read-only UX/headless policy | React `BlockEditor readOnly`의 mutation safety와 내부 input adapter read-only translation은 확정했다. paste/cut/DOM reset/drop/toolbar/history shortcut/composition event path는 실행 테스트로 닫혔다. toolbar button을 disabled로 보여줄지, public headless `createEditor({ readOnly })` 같은 option이 필요한지, `aria-readonly`가 보조 기술에서 충분히 announcement되는지, real browser/OS IME matrix도 아직 닫지 않았다. | read-only UX affordance와 headless embedding read-only 요구가 실제 제품 범위인지 결정해야 한다. release-critical mode로 승격하면 real-browser IME matrix와 accessibility announcement QA를 별도로 추가한다. |
| final visual style policy | `docs/editor-style-surface-audit.md` 기준으로 기능 affordance CSS는 확정했고 debug recorder idle badge 상시 노출은 제거했다. 1280x900 desktop과 390x844 mobile layout smoke도 통과했다. 하지만 body/app shell palette, pane width/spacing의 전체 matrix, title scale, read-only toolbar disabled styling, debug recorder production availability policy는 테스트가 닫은 contract가 아니다. | 제품 visual direction과 전체 viewport/browser/accessibility QA 기준을 별도 결정해야 한다. |
| debug recorder production/privacy policy | debug recorder의 internal-only interface, hotkey, report schema, active compact status, compact clipboard report, raw in-page storage, 최근 5개 raw retention, selected clipboard payload summary, range/duplicate/timeline summary, warn/error diagnostics, copy-failed phase, SSR/Chrome DOM idle inspector hidden behavior는 확정했다. 하지만 `INPUT_EVENT_TYPES` 23종 전체 capture list와 execCommand fallback cleanup detail은 source guard 성격이 더 강하고, 이 implementation을 제품 contract로 닫은 것은 아니다. Hotkey recorder를 production route에 계속 남길지, clipboard/DOM text를 어떻게 redact할지, raw report retention/replay compatibility/copy failure UX를 contract로 둘지도 닫지 않았다. | dev-only gate, privacy redaction, raw retention, copy failure UX, replay import 여부를 운영/제품 정책으로 결정해야 한다. |
| IME trace replay scope | `docs/editor-ime-trace-replay-audit.md` 기준으로 Korean Hangul trace replay는 내부 회귀 재현 surface로 확정했다. 확정된 test interface는 `event`/`selection`/`text`/`timers`와 keyboard/composition/input event replay까지다. contentEditable view split tests가 final commit once, duplicate final removal, differing final commit, repeated-text preedit, history ignore, retargeted composition을 보완하지만, 실제 browser/OS IME matrix, browser에서 trace를 자동 수집해 fixture로 변환하는 pipeline, `editable-debug-trace@3` debug report와 `editable-trace-replay@1` fixture의 호환성, pointer/clipboard/drop/focus replay 확장은 닫지 않았다. | real-browser IME QA gate, trace capture/import format, debug report replay 여부, replay event 범위 확장은 별도로 결정해야 한다. |
| verification gate coverage | `verify:internal`은 focused/skipped/todo test marker 차단, Vitest discovery parity, README docs inventory, editor evidence-section coverage, route tree build stability, scripts/source check와 내부 품질 gate로 확정했지만 실제 browser/AT QA, staged git rename summary, docs markdown formatting, dependency/security audit, preview server/browser smoke, repeat 필수 정책까지 보장하지는 않는다. One-off preview server smoke, Chrome headless browser smoke, package audit evidence는 별도로 확인했다. | 제품 QA와 release gate가 필요하면 `verify:internal`과 별도 command로 설계해야 한다. |
| git rename story | `docs/editor-git-rename-audit.md` 기준으로 accidental deletion보다 intentional boundary refactor라는 근거가 강하다. legacy tracked 파일 39개 중 37개가 새 tree에 basename 대응되고, 나머지 2개는 `contentEditableViewEngine.*`으로 대체됐다. 새 tree는 `internal` 70개, `public` 3개, `react` 2개이며, 임시 no-index similarity audit도 32개 rename을 잡았다. 다만 git index에는 아직 rename으로 stage되어 있지 않고, plain unstaged diff는 untracked 새 tree를 포함하지 않는다. | stage/commit 때 old delete와 new add를 같이 stage한 뒤 `git diff --cached --summary --find-renames`로 리뷰 표현을 확인해야 한다. pure rename이 아니라 facade/debug/view/model split이 포함된 boundary refactor로 설명해야 한다. |
| visual selection assistive-tech QA | `docs/editor-visual-selection-audit.md` 기준으로 overlay mechanism, range overlay, mention/figure atom overlay, focused editor affordance, collapsed pointer caret, tomato caret 제거, dashed figure outline 제거는 확정했다. Chrome headless에서 range/atom overlay, focused editor box-shadow, pointer caret overlay도 확인했다. | 보조 기술별 focus/selection announcement는 실제 브라우저/보조 기술 기준으로 더 확인해야 한다. |
| source TODO/debt marker status | source/scripts/config/README에는 `TODO`, `FIXME`, `XXX`, `HACK`, `TBD`, `not implemented`, `stub`, `temporary`, `workaround` marker가 없다. `throw new Error(` 사용은 runtime invariant, unavailable dependency, trace/test precondition, fixture guard다. Docs의 `not implemented` 표현은 제품 gap 설명으로 남아 있다. | marker 부재가 제품 완료를 증명하지는 않는다. 미정 항목은 feature coverage와 topic audits 기준으로 계속 추적한다. |
| focused/skipped/todo test marker status | `verify:internal`이 repo-level test/spec 파일에서 `describe`/`suite`/`it`/`test`의 `only`, `skip`, `todo`, `skipIf`, `runIf`, `fails` marker를 AST로 검사하고 현재 112개 test/spec 파일의 violation은 0개다. Generated/dependency directory는 제외한다. Nearest lexical binding 기준으로 global/direct name, Vitest named-import alias, Vitest namespace import, 사용 지점 전에 초기화된 simple local Vitest alias, marker function alias는 확정 coverage다. Non-Vitest lexical shadow와 아직 초기화되지 않은 later lexical declaration은 Vitest global/alias로 단정하지 않는다. 이 gate는 테스트가 일부만 실행되거나 의도적으로 빠진 상태로 green이 되는 대표 경로를 막는다. | Custom wrapper DSL, destructured marker alias, runtime-computed non-literal property access는 Vitest semantics로 판별하지 않는다. Browser/AT matrix와 제품 QA는 여전히 별도 gate가 필요하다. |
| Vitest discovery parity | `verify:internal`이 `vitest list --filesOnly --json`의 112개 file과 marker scanner의 112개 file을 비교하고 현재 missing/extra는 0개다. 별도 Vitest config/workspace도 없다. | Custom CLI filters, workspace projects, unusual suffix, Vitest JSON contract 변경은 의도한 discovery policy 판단이 필요하다. Mismatch 자체는 gate에서 드러난다. |
| runtime error taxonomy | non-test throw surface는 verification guard, runtime/model/view invariant, internal trace/test helper precondition으로 분류된다. `cursorGeometryLayout`의 Pretext unavailable throw는 catch되어 fallback layout으로 처리된다. | Public error DTO, user-facing recovery copy, telemetry taxonomy는 아직 설계하지 않았다. 필요하면 public import/migration, debug/privacy, product UX policy와 같이 다뤄야 한다. |
| type/lint escape hatch status | Generated route tree의 `@ts-nocheck`/`as any`는 generator output이고 수동 수정 대상이 아니다. Generated file 밖에는 `@ts-expect-error`, `@ts-ignore`, `@ts-nocheck`, `as any`, `: any`, `Record<string, any>`, `as never`가 없다. Runtime source의 remaining casts/ignores는 debug window property, JSON.parse unknown narrowing, contenteditable semantic role, cursor-coordinate array index key로 좁다. Test casts 2개는 invalid document fixture를 만들기 위한 것이다. | Generated route typing을 직접 고치거나 더 엄격한 lint policy를 도입할지는 아직 root/tooling policy다. |

## 현재 결론

에디터 아키텍처는 코드/테스트 기준으로 검증 가능한 상태까지 올라왔다.
canonical state, internal boundary, model/view/react 분리는 빼면 안 되는 확정
구조다. DOM native selection bridge, document title metadata surface, attrs, code
block, figure media, local identity, schemaVersion 1 validation의 schema
compatibility 경계도 닫혔다.
feature checklist는 15개 섹션 중 command/model 기준 확정과 제품/브라우저
수준 부분확정이 섞여 있다. public surface는 headless `createEditor()` seam과
React `BlockEditor` seam이 병렬로 존재하고 서로 재노출하지 않는 상태까지 확정했다.
문서 권위는 design, exact schema, implementation ledger, product/QA expectation,
coverage audit로 분리됐고, README Docs file/link inventory gate, generated route
tree build stability, design 문서를 status tracker로 쓰지 않는 정책도 닫았다.
현재 `docs/editor-*.md` 88개는 모두 `## 증거 강도` 섹션을 가져서, topic별로
확정/부분확정/미정/제거 확정 해석을 분리한 상태다.
source/scripts/config/README에는 TODO/FIXME/HACK/TBD류 marker가 없으므로, 남은
미정은 코드에 방치된 TODO가 아니라 문서화된 제품/API/QA 결정으로 봐야 한다.
non-test `throw new Error`도 verifier guard, module invariant, internal testing helper
precondition으로 좁혀져 있고, public error taxonomy나 사용자 복구 UX는 별도
제품/API 결정으로 남아 있다.
type/lint escape hatch도 generated route tree와 좁은 internal seams로 분류했고,
`editorCore`의 불필요한 `as never`는 제거했다.
남은 불확실성은 주로 제품/API 포지셔닝이다. future state owner를 통합할지,
document migration/import error detail을 어디까지 public으로 둘지,
부분확정 feature를 어떤 이슈로 닫을지가 다음 판단 지점이다. 현재 미정 항목은
제품 앱 범위, public API/embedding, schema/data evolution, browser/platform QA,
editor UX expansion, workflow/release gate, debug/diagnostics 운영 축으로 묶어
추적한다.
