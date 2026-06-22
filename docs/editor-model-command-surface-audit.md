# Editor Model Command Surface Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `createEditor()`와 internal model command
registry가 빼면 안 되는 deep module인지, 그리고 어떤 command/API는 아직
제품/API 결정으로 남겨야 하는지 구분한다.

## 판정

`createEditor()`는 headless editor의 작은 interface다. public caller가 배워야
하는 method는 `snapshot`, `subscribe`, `dispatch`, `can`, `query`, `dispose`
여섯 개이고, 그 뒤에 JSON document history, selection snapshot, command registry,
batch atomicity, view geometry adapter가 숨는다.

유지 확정 command surface는 `setSelection`, `selectAll`, `moveSelection`,
`insertText`, `insertNode`, `delete`, `split`, `toggleMark`, `undo`, `redo`,
`replaceDocument`다. Query surface는 `document`, `selection`, `activeMarks`,
`canUndo`, `canRedo`, `can`이다.

이번 audit에서 raw `applyPatch` command는 제거 확정으로 판정했다. 현재 근거는
batch 실패 테스트뿐이고, public caller에게 arbitrary JSON Patch를 command로
보장하면 `insertText`/`insertNode`/`replaceDocument` 같은 schema-aware command
interface보다 넓은 mutation escape hatch가 된다. Batch atomicity 테스트는 invalid
`replaceDocument` 실패로 같은 성질을 검증한다.

## 확정 근거

| 주제 | 확정 동작 | 근거 |
| --- | --- | --- |
| editor method surface | `createEditor()` object는 `can`, `dispatch`, `dispose`, `query`, `snapshot`, `subscribe`만 노출한다. | `editorCore.test.ts` |
| single mutation entrypoint | text insert, node insert, mark toggle, delete/split, replace document, undo/redo가 `dispatch(command)`로 들어간다. | `editorCore.ts`, `editorCore.test.ts`, command tests |
| command registry | command names는 descriptor map에서 나온 closed union이고 per-command public method를 만들지 않는다. | `editorCore.ts`, public facade tests |
| `can` without commit | `can(command)`은 draft에서 평가하고 document를 mutate하지 않는다. geometry가 필요한 movement는 geometry 부재를 실패로 보고한다. | `editorCore.test.ts` |
| view adapter escape hatch | model command surface가 DOM을 직접 알지 않고, line/page movement만 `EditorViewAdapter.geometry()`를 통해 geometry를 요청한다. | `editorCore.test.ts`, `cursorCommands.test.ts` |
| batch atomicity | batch는 draft document에서 순서대로 평가하고, 실패하면 실제 document를 바꾸지 않는다. 성공하면 한 번 commit한다. | `editorCore.ts`, `editorCore.test.ts` |
| history commands | `undo`/`redo`는 direct non-batch command이고 document와 selection history를 같이 복원한다. | `editorCore.ts`, `editorCore.test.ts`, `editor-history-grouping-audit.md` |
| selection-only command | patch 없는 movement/selection command는 selection을 restore하지만 document undo entry를 만들지 않는다. | `editorCore.test.ts` |
| insertable node surface | public insert payload는 `InsertableEditorNode` 하나로 mention/figure strategy를 감춘다. | `editorCommandStrategies.ts`, `editor-public-type-export-audit.md` |
| generic document validation error | `replaceDocument` invalid input은 document를 mutate하지 않고 `"Document is invalid."`만 반환한다. | `editorCore.test.ts`, `editor-public-schema-audit.md` |
| active marks query | collapsed mark context는 selection state에 저장되고 `query({ type: "activeMarks" })`로 읽는다. | `editorCore.test.ts`, `markCommands.test.ts` |
| canonical normalization helpers | empty document/block fallback, empty text-run removal, adjacent text merge, deterministic mark ordering은 model normalization rule이다. | `normalizer.ts`, `normalizer.test.ts` |
| low-level command coverage | cursor, text, mark, block, input translation, regression scenarios가 command implementation의 behavior baseline이다. | `cursorCommands.test.ts`, `textCommands.test.ts`, `markCommands.test.ts`, `blockCommands.test.ts`, `inputAdapter.test.ts`, `editorRegressionScenarios.test.ts` |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| six-method `Editor` interface | 실행 테스트로 확정 | `editorCore.test.ts`가 `createEditor()` runtime object key를 `can`, `dispatch`, `dispose`, `query`, `snapshot`, `subscribe`로 고정한다. |
| closed command descriptor registry | 소스 AST 테스트로 확정 | `editorCore.test.ts`가 private `commandDescriptors` key를 `setSelection`, `selectAll`, `moveSelection`, `insertText`, `insertNode`, `delete`, `split`, `toggleMark`, `undo`, `redo`, `replaceDocument`로 고정한다. |
| closed query descriptor registry | 소스 AST 테스트로 확정 | `editorCore.test.ts`가 private `queryDescriptors` key를 `document`, `selection`, `activeMarks`, `canUndo`, `canRedo`, `can`으로 고정한다. |
| single dispatch mutation entrypoint | 실행 테스트로 확정 | text insert, insert node, toggle mark, replace document, undo/redo, batch dispatch가 `dispatch(command)` 또는 `dispatch([...])`를 통해 검증된다. |
| `can(command)` no-commit behavior | 실행 테스트로 확정 | `editorCore.test.ts`가 successful insert capability와 geometry-missing movement failure를 확인한 뒤 document가 그대로 남는 것을 검증한다. |
| view adapter escape hatch | 실행 테스트로 확정 | line movement는 `EditorViewAdapter.geometry()`가 있을 때만 성공하고 editor object에는 geometry method가 노출되지 않는다. |
| batch atomicity | 실행 테스트로 확정 | later command failure와 history-command-in-batch failure가 실제 document를 바꾸지 않는 것을 `editorCore.test.ts`가 검증한다. |
| explicit batch undo unit | 실행 테스트로 확정 | command array dispatch는 한 undo unit으로 되돌아가고, successive single dispatch는 각각 undo unit으로 남는다. |
| selection-only command no-history | 실행 테스트로 확정 | movement/selection-only dispatch는 canonical selection을 바꾸지만 document undo history를 만들지 않는다. |
| raw `applyPatch` public command absence | public facade/type/registry 테스트로 확정 | public runtime/type export list와 command descriptor AST inventory 어디에도 `applyPatch`가 없다. |
| React state owner dogfooding | 미정 | public surface audit 기준으로 React app seam과 headless seam은 병렬이지만, `BlockEditor` 내부 state owner를 `createEditor()`로 통합할지는 아직 제품/API 결정이다. |
| input adapter command-only output | 미정 | 현재 `translateEditorInput`은 low-level patch/selection result를 반환한다. 이를 `EditorCommand`만 반환하게 바꾸는 것은 contenteditable flush와 selection restore 설계를 함께 바꾸는 별도 결정이다. |
| custom command/plugin registry | 미정 | 현재 registry는 closed map이고 두 번째 command provider가 없다. 외부 plugin 요구가 생길 때 새 seam을 설계해야 한다. |
| transaction metadata/collaboration/persistence layer | 미정 | batch dispatch와 local selection-aware history는 확정했지만 label/origin/mergeKey, remote op, persistence, conflict resolution command는 public contract가 아니다. |

## 아직 애매하거나 제품/API 결정으로 남은 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| React state owner dogfooding | `BlockEditor`는 현재 `createEditor()`를 runtime owner로 쓰지 않고 native DOM selection, contenteditable buffer, geometry lifecycle을 직접 조합한다. 이것은 public surface audit 기준으로 결함이 아니다. | React 내부도 `createEditor()` command owner로 통합할지, 별도 React implementation으로 둘지 결정해야 한다. |
| input adapter output 형태 | `translateEditorInput`은 현재 low-level patch/selection result를 반환한다. `EditorCommand`만 반환하게 바꾸면 dispatch owner가 하나로 줄지만 contenteditable flush와 selection restore 요구도 같이 재설계해야 한다. | command duplication을 실제 유지보수 문제로 확인한 뒤 adapter interface를 바꾼다. |
| custom command/plugin registry | command registry는 closed map이다. 외부 plugin이 새 command를 등록하는 interface는 없다. | plugin/custom node 요구가 생기면 command registry extension seam을 별도 설계한다. |
| transaction metadata | batch dispatch는 확정이지만 label/origin/mergeKey 같은 metadata는 public contract에서 제거했다. | 자동 typing merge나 named transaction이 필요해질 때 별도 transaction surface를 설계한다. |
| untrusted initial/migration diagnostics | `createEditor({ initial })`은 trusted `NoteDocument`를 받는다. untrusted JSON은 `parseNoteDocument`를 먼저 거쳐야 하고 failure reason은 generic이다. | schema migration, field-level diagnostics, ergonomic untrusted initial option은 public import 정책으로 결정한다. |
| collaboration/persistence commands | current command surface는 local JSON document mutation과 selection/history 중심이다. remote op, persistence, conflict resolution command는 없다. | document product app이나 collaboration 요구가 생기면 별도 data/remote command layer를 설계한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| six-method `Editor` interface | 유지 확정 | 많은 model behavior를 작은 headless interface 뒤에 숨기는 deep module이다. |
| descriptor-based command registry | 유지 확정 | command type union, `can`, dispatch, query가 한 registry에서 나온다. per-command method를 늘리지 않는다. |
| patch + `selectionAfter` command result | 유지 확정 | model command가 document mutation과 canonical selection restore를 같이 전달하는 현재 seam이다. |
| `EditorViewAdapter.geometry()` | 유지 확정 | model이 DOM을 모르면서 line/page movement를 지원하는 좁은 host-specific escape hatch다. |
| raw `applyPatch` public command | 제거 확정 | schema-aware command보다 넓은 mutation escape hatch이고, 현재 근거는 실패 테스트뿐이다. |
| public per-command convenience methods | 보류 | 지금은 `dispatch(command)` 하나로 충분하다. caller ergonomics 문제가 확인되기 전에는 method를 늘리지 않는다. |
| custom command registration | 보류 | 두 번째 command provider가 없으므로 현재는 hypothetical seam이다. |

## 현재 결론

model command surface에서 빼면 안 되는 것은 `createEditor()`의 six-method
interface, descriptor registry, command evaluation result의 patch/selection pairing,
batch atomicity, selection-aware history, schema-aware `replaceDocument`, geometry
adapter escape hatch다. 빼야 하는 것은 public raw `applyPatch` command다. 아직
확정하면 안 되는 것은 React state owner 통합, input adapter command-only 전환,
custom command/plugin registry, transaction metadata, untrusted import diagnostics,
collaboration/persistence command layer다.
