# Editor History Grouping Audit

작성일: 2026-06-21

범위: 현재 dirty workspace 기준. history undo unit이 어디까지 확정인지, 그리고
`json-document`의 transaction/merge metadata를 editor public surface로 노출해야
하는지 판정한다.

## 판정

현재 editor history policy는 **명시적 batch와 단일 dispatch undo 단위까지 확정**이다.

- 확정: `createEditor().dispatch([...])` batch는 undo unit 하나다.
- 확정: `undo`/`redo` 같은 history command는 batch에 섞을 수 없다.
- 확정: 연속된 별도 `createEditor().dispatch({ type: "insertText" })` 호출은
  자동 merge되지 않고 각각 undo unit이 된다.
- 확정: patch 없는 selection-only dispatch는 document undo entry를 만들지 않는다.
- 확정: undo/redo는 document와 selection을 같이 복원한다.
- 확정: `BlockEditor`의 active native text edit은 history undo/redo 전에 flush된다.
- 확정: blur가 active native text edit을 flush하면 그 edit은 undo unit 하나로
  기록된다.
- 확정: blur로 끊긴 여러 native text edit session은 자동 merge되지 않고 각각
  undo unit으로 남는다.
- 제거 확정: `DispatchOptions` public type과 `dispatch(command, options)` surface는
  제거했다.
- 애매: 현재 확정 정책 위에 시간/원인 기준 자동 typing merge나 transaction surface를
  추가할지는 아직 제품 정책이 아니다.

## 왜 DispatchOptions를 뺐나

`DispatchOptions`는 `label`, `origin`, `mergeKey`를 담고 있었지만 현재
`createEditor` interface에서 이 metadata를 읽는 public query가 없다. 또한 현재
확정된 headless 정책은 batch가 아닌 연속 단일 dispatch를 자동 merge하지 않는다.
따라서 이 option을 public surface로 두면 실제 동작보다 큰 contract를 암시한다.

Editor caller가 지금 확정적으로 쓸 수 있는 grouping interface는 command array
batch다. 자동 typing merge나 transaction surface는 별도 설계가 필요하다.

## 확정 근거

| 근거 | 의미 |
| --- | --- |
| `editorCore split tests` batch dispatch test | 여러 command를 draft에서 평가하고 실제 document에 한 번 commit하므로 undo unit 하나가 된다. |
| `editorCore split tests` history command batch rejection test | `undo`/`redo` 같은 direct history command는 patch draft에서 평가하지 않고 batch 전체를 실패시킨다. |
| `editorCore split tests` successive single dispatch test | batch가 아닌 연속 headless `insertText` 호출은 각각 undo unit이 된다. |
| `editorCore split tests` selection-only test | selection movement는 document history entry를 만들지 않는다. |
| BlockEditor split tests history tests | beforeinput history undo/redo 전에 native text edit을 flush하고 selection을 복원한다. blur-flushed native edit도 undo 한 번으로 되돌리고 redo로 복원한다. blur로 끊긴 여러 native edit session은 separate undo unit으로 남는다. |
| `editorCore.ts` dispatch signature | public dispatch는 더 이상 options를 받지 않는다. |

## 증거 강도

| 판정 대상 | 강도 | 근거 |
| --- | --- | --- |
| explicit command-array batch as one undo unit | 실행 테스트로 확정 | `editorCore split tests`가 두 `insertText` command를 한 batch로 dispatch한 뒤 undo 한 번으로 원래 document를 복원하고 redo 한 번으로 batch 결과를 복원한다. |
| history command batch rejection | 실행 테스트로 확정 | `editorCore split tests`가 `{ type: "undo" }`가 포함된 batch를 `"History commands cannot be batched."`로 거절하고 document와 undo stack을 보존함을 확인한다. |
| successive single dispatch separation | 실행 테스트로 확정 | `editorCore split tests`가 batch가 아닌 두 `insertText` dispatch를 undo 두 번으로 각각 되돌린다. |
| selection-only no document history | 실행 테스트로 확정 | `editorCore split tests`가 selection movement 후 `canUndo`가 false임을 확인한다. |
| keyboard/beforeinput history flush | 실행 테스트로 확정 | BlockEditor split tests가 active native text edit을 keyboard and beforeinput undo/redo 전에 flush하고 redo로 복원함을 확인한다. |
| native caret restore after history undo | 실행 테스트로 확정 | BlockEditor split tests가 observed native range에서 history undo 후 native collapsed caret과 overlay가 canonical selection으로 복원됨을 확인한다. |
| blur-flushed native edit undo unit | 실행 테스트로 확정 | BlockEditor split tests가 blur로 flush된 native text edit을 undo 한 번으로 되돌리고 redo로 복원한다. |
| separate blur-flushed sessions | 실행 테스트로 확정 | BlockEditor split tests가 blur로 끊긴 두 native edit session이 자동 merge되지 않고 undo 두 번으로 각각 되돌아감을 확인한다. |
| `DispatchOptions`/`mergeKey` public absence | source/public surface 확정 | `createEditor().dispatch`는 command or command array만 받고 options overload/export가 없다. `rg`도 `DispatchOptions`/`mergeKey` surface가 없음을 확인한다. |
| automatic typing merge and transaction metadata | 미정 | focus를 유지한 여러 native edit session, timer/punctuation/composition merge, collaboration/persistence transaction metadata는 current tests가 닫은 policy가 아니다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| batch dispatch undo unit | 유지 확정 | 작은 interface로 여러 command를 하나의 history entry로 묶는 검증된 기능이다. |
| history command batch rejection | 유지 확정 | history operation을 draft patch command처럼 평가하지 않으므로 batch semantics가 단순하게 유지된다. |
| successive single dispatch undo unit | 유지 확정 | 별도 headless command 호출을 암묵적으로 합치지 않는 현재 behavior다. |
| selection-only no-history behavior | 유지 확정 | cursor movement가 document undo stack을 오염시키지 않는다. |
| blur-flushed native edit undo unit | 유지 확정 | focus를 잃으며 flush된 active native text edit은 한 replace patch로 commit되고 undo 한 번에 되돌아간다. |
| separate blur-flushed native edit sessions | 유지 확정 | focus loss로 session이 끊기면 별도 history entry가 되며 undo 한 번에 여러 session을 같이 되돌리지 않는다. |
| `DispatchOptions` public export | 제거 확정 | 현재 editor surface에서 관측 가능한 value가 없고, `mergeKey` grouping도 보장되지 않는다. |
| future automatic typing merge | 보류 | focus를 유지한 여러 native edit session, timer, punctuation, composition 기준 merge를 제품 정책으로 정해야 한다. |

## 현재 결론

history grouping은 “없음”이 아니다. batch dispatch, successive single dispatch
separation, selection-only no-history, blur-flushed native edit undo unit, separate
blur-flushed native edit session은 빼면 안 되는 확정 동작이다. 다만
`mergeKey`/transaction을 public editor surface로 노출하는 것은 아직 확정할 수
없으므로 제거했다. 자동 typing grouping은 별도 제품/API 결정으로 남긴다.
