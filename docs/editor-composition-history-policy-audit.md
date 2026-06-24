# Editor composition history policy audit

작성일: 2026-06-22

범위: IME composition, native text leaf buffer flush, autocorrect/replacement,
paste/drop, markdown shortcut transform, toolbar command가 undo/redo history에 어떤
단위로 들어가야 하는지 정리한다.

## 판정

Composition preedit은 history entry가 아니다. History entry는 canonical document patch가
생기는 release boundary에서만 만들어진다.

- composing 중 `historyUndo`/`historyRedo`는 document mutation 없이 explicit no-op으로
  막는다.
- final commit은 active text leaf flush 또는 active-mark command commit으로 수렴하고,
  그 결과 patch가 있으면 undo unit 하나가 된다.
- composition 중 Enter confirmation은 final commit 뒤 Enter command를 지연 실행한다.
- active native text leaf edit은 blur, copy/cut/paste/drop, toolbar command,
  undo/redo 같은 command boundary 전에 flush되고, flush 결과는 하나의 replace patch이자
  undo unit 하나다.
- Paste/drop은 native DOM paste 결과가 아니라 transfer adapter command patch로 history에
  들어간다.
- Markdown shortcut transform은 현재 live typing feature가 아니다. 미래에 추가하면
  triggering text input과 구조 transform을 같은 undo unit으로 묶지 말지 명시해야 하며,
  Lexical #8365 근거상 transform만 되돌리는 별도 undo unit이 필요할 수 있다.
- Autocorrect/OS replacement는 `insertReplacementText` plain text command로 다룬다.
  Composition phase 안에서는 native composition owner가 우선이고, phase 밖에서는 selection
  replacement command가 하나의 undo unit이다.

## 외부 근거

| 근거 | 내용 | 우리 쪽 해석 |
| --- | --- | --- |
| Lexical #8142: https://github.com/facebook/lexical/pull/8142 | 2026-02-16 merged. Composition 관련 history/format 문제를 고쳤고, composing characters가 history stack에 들어가는 것을 문제로 다뤘다. | preedit character를 undo stack에 직접 넣지 않는다. Composition release boundary만 history entry가 된다. |
| Lexical #8162: https://github.com/facebook/lexical/pull/8162 | 2026-02-23 merged. Composition text가 multiple formatted text nodes를 replace할 때 format/style 유지가 깨지는 회귀를 고쳤다. | composition commit은 text, selection, active marks/style을 한 묶음으로 봐야 하며 중간 preedit 단위 history를 만들면 stale format/state가 섞인다. |
| Lexical #8365: https://github.com/facebook/lexical/pull/8365 | 2026-04-18 merged. Markdown shortcut transform이 triggering text input과 merge되어 undo가 input까지 지우는 문제를 고쳤고, transform 성공 시 별도 history push tag를 추가했다. | live transform은 plain text 입력과 같은 undo grouping으로 자동 병합하면 안 된다. 기능 추가 시 transform origin을 history policy에 노출해야 한다. |
| ProseMirror-view changelog 1.31.0/1.31.7: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | DOM changes에서 생성된 transaction에 `"composition"` meta를 붙였고, compositionend final changes timing 관련 bug를 고쳤다. | composition에서 나온 document changes는 일반 input과 구분되는 metadata/evidence가 필요하다. |
| ProseMirror-view changelog 1.9.0 | composition 중 changes를 끝에서 한 번이 아니라 update마다 transaction으로 fire하도록 바꿨다. | ProseMirror는 schema-aware transaction/metadata/history plugin을 가진 구조다. Current editor는 그보다 좁게 active leaf buffer를 release boundary에서만 history로 기록한다. |

## 현재 코드 판정

| 경로 | 현재 동작 |
| --- | --- |
| `src/editor/internal/view/contenteditable/contentEditableViewEngine.ts` | phase가 `composing` 또는 `awaitingCommit`일 때 `historyUndo`/`historyRedo` beforeinput을 `{ kind: "ignore" }`로 분류한다. |
| `src/editor/internal/react/block-editor/useBlockEditorController.tsx` | composition phase의 keydown은 command path로 보내지 않고 prevent한다. Plain Enter는 final commit 뒤 실행할 deferred command로 저장한다. |
| `src/editor/internal/react/block-editor/useBlockEditorController.tsx` | `history` decision은 active native edit을 먼저 flush한 뒤 editor undo/redo command를 dispatch한다. |
| `src/editor/internal/react/block-editor/useBlockEditorController.tsx` | toolbar/copy/cut/paste/drop/history command 전에 active native text edit을 flush한다. |
| `src/editor/internal/model/input-adapter/inputAdapter.ts` | `insertReplacementText`, paste/drop beforeinput, delete/cut, Enter, history keydown이 command layer로 수렴한다. |
| `src/editor/internal/model/editorCoreDispatch.ts` | batch dispatch는 하나의 undo unit, 연속 single dispatch는 별도 undo unit, history command batch는 거절한다. |

## 실행 증거

| 증거 | 의미 |
| --- | --- |
| contentEditable view split tests: `ignores browser history input while composition owns the native edit` | composition phase에서는 browser history input을 실행하지 않는다. |
| `BlockEditor.imeTrace.test.tsx`: `keeps history undo explicit no-op while composition is active` | `historyUndo` beforeinput은 prevent되고 explicit no-op으로 감사된다. |
| BlockEditor split tests: `ignores history shortcuts while composition is active` | `Cmd/Ctrl+Z`와 `beforeinput historyUndo` 모두 composition 중 document를 되돌리지 않는다. |
| BlockEditor split tests: `flushes active native text edits before keyboard undo and redo` | active native leaf edit은 keyboard undo 전에 history entry로 flush되고 undo/redo로 복원된다. |
| BlockEditor split tests: `flushes active native text edits before beforeinput history undo and redo` | browser `historyUndo`/`historyRedo` inputType도 같은 editor history command로 수렴한다. |
| BlockEditor split tests: `records blur-flushed native text edits as one undo unit` | blur release는 하나의 undo unit이다. |
| BlockEditor split tests: `keeps separate blur-flushed native text edit sessions as separate undo units` | blur로 끊긴 session은 자동 merge되지 않는다. |
| `BlockEditor.imeTrace.test.tsx`: Enter confirmation trace | composition commit 뒤 deferred Enter split이 실행된다. |
| `editorCore split tests` history grouping tests | batch, single dispatch, selection-only, undo/redo command routing의 headless contract가 고정되어 있다. |

## History grouping policy

| 입력/작업 | history entry | 이유 |
| --- | --- | --- |
| composition preedit update | 만들지 않음 | DOM native buffer 단계이고 canonical patch가 아니다. |
| composition final commit | patch가 있으면 하나 | active leaf flush 또는 active mark insert command가 canonical text patch를 만든다. |
| composition 중 `historyUndo`/`historyRedo` | no-op | preedit owner를 깨지 않고, final commit/flush 전 history stack을 건드리지 않는다. |
| composition 중 Enter confirmation | final commit 뒤 Enter command | Enter를 즉시 split으로 처리하면 wrong selection에서 content를 지울 수 있다. |
| active native typing session blur | 하나 | flush가 one text path replace patch를 만든다. |
| blur로 끊긴 여러 native sessions | 각각 별도 | session boundary가 release boundary다. 자동 merge하지 않는다. |
| copy/cut/paste/drop 전 active native edit | 먼저 flush 후 clipboard/transfer command | clipboard command가 stale DOM selection/text 위에서 실행되지 않게 한다. |
| paste/drop | command 결과 하나 | transfer reader가 plain/markdown command path로 정규화한다. Native DOM paste는 authority가 아니다. |
| toolbar command 중 active native edit | 먼저 flush 후 toolbar command | toolbar command가 preedit/native DOM state를 건너뛰지 않게 한다. |
| toolbar command 중 active composition | composition UI state 종료 후 command | 현재 test는 UI state 종료와 command 실행을 고정한다. 실제 final preedit text 보존 범위는 별도 fixture가 필요하다. |
| `insertReplacementText`/autocorrect | phase 밖에서는 selection replacement 하나 | OS replacement는 plain replacement command다. Composition phase 내부에서는 composition owner가 우선한다. |
| markdown shortcut live transform | 현재 없음. 추가 시 transform origin별 별도 정책 필요 | Lexical #8365처럼 transform이 input과 merge되면 undo가 과하게 지울 수 있다. |
| explicit command-array batch | 하나 | caller가 명시적으로 grouping을 요청한 유일한 public seam이다. |
| successive single dispatch | 각각 별도 | public `mergeKey`/transaction metadata가 없다. |

## Undo/redo 후 DOM selection sync

| 상황 | 정책 |
| --- | --- |
| active native edit이 있었음 | undo/redo 전에 flush해서 history stack에 canonical patch를 만든다. |
| native range가 관측되어 있었음 | undo 후 canonical selection을 DOM collapsed caret과 overlay로 복원한다. |
| composition phase 안 | undo/redo를 실행하지 않고 prevent/no-op 처리한다. |
| flush 실패 | history command보다 canonical reset/selection restore가 우선이다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| composition 중 undo/redo no-op | 실행 테스트로 확정 | contentEditable view split tests, `BlockEditor.imeTrace.test.tsx`, BlockEditor split tests | 모든 OS/browser IME shortcut event ordering은 닫지 않는다. |
| composition preedit no-history | source/test 정책 확정 | composition phase는 native buffer이고 model patch가 없으며 Lexical #8142가 preedit history pollution을 버그로 다룬다. | 실제 browser history stack과 editor history stack 동시 동작은 manual trace가 필요하다. |
| final commit/blur/native flush as one undo unit | 실행 테스트로 확정 | blur/history/copy/paste/toolbar boundary tests와 view engine flush tests | focus 유지 중 timer/punctuation 기준 automatic merge는 미정이다. |
| paste/drop command history | 실행 테스트로 확정 | clipboard/input adapter tests와 history-before-command flush tests | external rich HTML import는 별도 paste policy다. |
| toolbar command before/after composition | 부분확정 | toolbar tests가 composition UI state 종료와 active native edit flush를 고정한다. | active preedit text를 toolbar command와 어떻게 coalesce할지 모든 fixture가 있는 것은 아니다. |
| autocorrect/replacement text | source 정책 확정 | `insertReplacementText` command mapping과 beforeinput policy | real OS autocorrect event order는 trace가 없다. |
| markdown shortcut transform history | 정책 미정/후속 | current editor에는 live markdown shortcut transform이 없고 Lexical #8365는 별도 undo entry 필요성을 보여준다. | 기능 추가 전까지 구현 증거가 아니다. |
| automatic typing merge | 미정 | `docs/editor-history-grouping-audit.md`도 제품 정책으로 남긴다. | `mergeKey`/transaction metadata public surface는 없다. |

## 후속 이슈화 대상

| 항목 | 이유 |
| --- | --- |
| live markdown shortcut transform history policy | current editor에는 live transform이 없고, 추가 시 trigger text와 transform undo unit을 분리할지 정해야 한다. |
| OS autocorrect/replacement 실브라우저 trace | `insertReplacementText` mapping은 있지만 macOS/iOS/Android autocorrect event order는 닫지 않았다. |
| composition 중 toolbar command와 preedit flush/coalesce fixture | 현재 UI state 종료는 테스트되지만, active preedit text가 있는 상태의 toolbar command history grouping은 더 좁은 fixture가 필요하다. |

## 현재 결론

Current editor의 세련된 기준은 composition update마다 history entry를 만들지 않는 것이다.
Composition은 native text leaf buffer가 소유하고, canonical patch가 생기는 final
commit/blur/command boundary에서만 history가 움직인다. Undo/redo는 composition 중
실행하지 않고 prevent/no-op으로 막으며, composition이 끝난 뒤에는 flush된 canonical
selection/document를 기준으로 editor history command가 실행된다. Markdown shortcut,
autocorrect, timer-based typing merge 같은 더 넓은 grouping은 실제 기능/trace가 생길 때
origin별 transaction policy로 추가해야 한다.
