# Editor focus selectionchange race audit

작성일: 2026-06-22

범위: focus, blur, selectionchange, select, pointer, toolbar command,
programmatic focus가 서로 엇갈릴 때 stale DOM selection이 canonical selection을
덮거나 scroll/caret 위치를 흔드는 실패 모드를 정리한다.

## 판정

현재 editor에서 focus/selection race를 줄이는 정석은 DOM selection을 document truth로
승격하지 않는 것이다. DOM selection은 command/input observation source이고,
canonical selection은 model layer가 소유한다.

따라서 현재 확정 정책은 아래다.

- blur는 release boundary다. active native edit/composition은 blur에서 즉시 flush한다.
- focus는 canonical selection을 native collapsed range로 복구한다.
- focus로 생기는 scroll jump는 `focusElementPreservingScroll`이 복원한다.
- `selectionchange`는 editor가 active이거나 native selection이 editor를 실제로
  touch할 때만 관찰한다.
- document-level `selectionchange` listener는 하나만 둔다. 중복 listener는 stale
  outside selectionchange가 overlay/native preview state를 흔드는 표면이다.
- native non-collapsed range가 보이면 custom overlay는 숨기고, atom/model selection은
  stale native range보다 우선한다.

## 현재 구현 사실

| 항목 | 현재 상태 | 근거 |
| --- | --- | --- |
| initial autofocus | focus preserve 후 canonical point를 native range로 복구 | `useBlockEditorController.tsx`, `BlockEditor.test.tsx` |
| focus handler | focused state를 켜고 canonical selection point를 native collapsed range로 복구 | `handleFocus` |
| blur handler | `flushContentEditableView()`, overlay/composition/native range state 정리 | `handleBlur` |
| selectionchange guard | active editor 또는 native selection이 editor를 touch할 때만 update | guarded `handleSelectionChange` |
| duplicate listener | 제거 | `BlockEditor.test.tsx`가 document `selectionchange` listener 1개와 cleanup 1개를 고정 |
| native range visibility | non-collapsed native range면 custom overlay 숨김 | `updateNativeSelectionState`, overlay tests |
| collapsed native selection | canonical selection이 collapsed이고 active edit이 아닐 때만 canonical restore | `updateNativeSelectionState` |
| toolbar pointer | mousedown `preventDefault`, command 전 flush | `EditorToolbar`, toolbar tests |
| atom pointer | active edit flush, native ranges 제거, focus preserve | atom pointer tests |
| read-only 전환 | active native edit reset, native range copy source 보존 | read-only tests |

## Event별 ownership

| Event/source | 현재 owner | 정책 |
| --- | --- | --- |
| `focus` | editor root | canonical selection을 DOM selection으로 복구한다. document mutation은 하지 않는다. |
| `blur` | editor root | active native edit/composition을 release하고 custom overlay를 숨긴다. |
| `selectionchange` inside editor | guarded document listener | native range visibility와 collapsed cursor preview를 갱신한다. |
| `selectionchange` outside editor while unfocused | 무시 | outside page selection이 editor selection을 덮지 않는다. |
| `select` on editor root | root listener | contenteditable native selection state를 읽는다. |
| toolbar `mousedown` | toolbar | focus steal을 막기 위해 `preventDefault`한다. |
| toolbar `click` | command bridge | command 전 native buffer를 flush하고 canonical selection에 적용한다. |
| atom `pointerdown` | editor pointer adapter | native range를 비우고 atom/model selection을 canonical state로 둔다. |
| pointer drag | editor pointer adapter | canonical range를 갱신하고 native cursor preview를 끈다. |
| programmatic focus | focus helper | scroll side effect를 복원한다. reveal은 별도 phase다. |

## Stale selectionchange 무시 조건

`selectionchange`는 아래 조건 중 하나가 참일 때만 editor view state를 갱신한다.

| 조건 | 의미 |
| --- | --- |
| `ownerDocument.activeElement === editorRoot` | editor가 현재 keyboard/focus owner다. |
| native selection anchor가 editor root 안에 있다 | browser native selection이 editor content를 실제로 touch한다. |

둘 다 아니면 무시한다. 이 조건은 outside click, 다른 input/iframe/nested owner,
toolbar 아닌 외부 UI selection이 editor의 canonical selection이나 native cursor preview를
덮지 않게 하기 위한 최소 guard다.

갱신하더라도 아래 제한을 둔다.

| 상황 | 제한 |
| --- | --- |
| native range가 non-collapsed | browser native range 표시를 우선하고 custom overlay는 숨긴다. |
| native collapsed selection | canonical selection이 collapsed이고 active edit이 아닐 때만 canonical restore 가능 |
| active native edit/composition | layout effect가 DOM selection sync를 건너뛰고 native buffer가 우선 |
| atom/model selection | stale native text range보다 canonical atom selection이 우선 |
| read-only | mutation 금지. native range는 copy source로만 사용 |

## Scroll/focus 분리

| Phase | 담당 |
| --- | --- |
| focus preserve | `focusElementPreservingScroll`이 focus 전 scroll stack을 저장하고 focus 후 복원 |
| native selection restore | `setContentEditableSelection`이 canonical point를 DOM range로 복구 |
| reveal | `scrollContentEditableSelectionIntoView`가 focused selection target에만 `scrollIntoView(nearest)` 호출 |

focus가 page를 움직였는지와 caret이 보이지 않는지는 다른 문제다. Toolbar/atom click처럼
focus만 복구해야 하는 경로에서 reveal까지 섞으면 scroll jump가 생긴다.

## 현재 테스트로 닫힌 것

| 항목 | 테스트 근거 |
| --- | --- |
| autofocus가 editor focus와 native selection을 복구 | `BlockEditor.test.tsx` |
| toolbar mousedown이 focus/selection을 훔치지 않음 | `BlockEditor.test.tsx` |
| owner-document selectionchange listener 중복 없음 | `BlockEditor.test.tsx` |
| native DOM range가 보이면 custom overlay 숨김 | `BlockEditor.test.tsx` |
| hidden selection class를 만들지 않음 | `BlockEditor.test.tsx` |
| blur 시 canonical range 보존, overlay 숨김 | `BlockEditor.test.tsx` |
| copy 후 observed native range 유지 | `BlockEditor.test.tsx` |
| blur-flushed native edit은 하나의 undo unit | `BlockEditor.test.tsx` |
| separate blur sessions는 separate undo units | `BlockEditor.test.tsx` |
| history undo 뒤 native caret 복구 | `BlockEditor.test.tsx` |
| read-only 전환에서 active edit reset/native range copy 보존 | `BlockEditor.test.tsx` |
| nested scroll focus preserve와 focus options fallback | `focusScroll.test.ts` |

## 아직 닫히지 않은 것

| 항목 | 상태 | 다음 처리 |
| --- | --- | --- |
| Chrome/Safari/Firefox 실제 focus/blur/selectionchange event order trace | 미수집 | 후속 이슈로 분리 |
| iframe/nested document selectionchange handoff | 별도 범위 | #12, #76과 연결 |
| mobile focus auto-zoom/virtual keyboard scroll | 별도 범위 | #78, #81 계열 trace 필요 |
| assistive-tech focus/selection announcement | 미정 | 접근성 QA matrix 필요 |
| timed focus reselection delay | 보류 | 실제 browser trace 없이는 추가하지 않음 |
| full scroll parent stack/fixed/sticky/transform compensation | 보류 | layout/browser trace 뒤 확장 |

## 외부 근거

| 출처 | 이 문서에서 쓰는 의미 |
| --- | --- |
| https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | ProseMirror는 focus 시 이전 selection 복원, focus scroll jump, hidden editor Safari selection crash, blur 뒤 programmatic selection 후 refocus mismatch, pointer drag/decorations selection anchor 이동 등을 반복적으로 수정했다. |
| https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | Lexical changelog에는 Firefox focus edge case, unfocused editor selection 유지, selectionchange listener cleanup, table이 selectionchange를 훔치는 문제, blur 시 selection premature null 회귀가 있다. |
| https://github.com/facebook/lexical/pull/8356 | Firefox synchronous focus edge case에서 deferred callback이 사라지는 문제를 별도 unit test로 막았다. |
| https://github.com/facebook/lexical/pull/5848 | selectionchange listener 제거 조건 오류를 고쳤다. Listener cleanup은 race surface다. |
| https://github.com/facebook/lexical/pull/4162 | table plugin mouseDown logic이 selectionchange를 과하게 훔치는 문제를 고쳤다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| blur release boundary | 실행 테스트 확정 | blur-flush, undo unit, composition blur replay가 있다. |
| focus restore | 실행 테스트 확정 | autofocus, history undo native caret restore, focus scroll preserve tests가 있다. |
| guarded selectionchange | source/test 확정 | active/touches guard와 single listener fixture가 있다. |
| native range/custom overlay 배타성 | 실행 테스트 확정 | native range visible state에서 overlay가 숨겨진다. |
| atom selection vs stale native range | 실행 테스트 확정 | atom selection copy/replacement tests가 stale native text range를 이긴다. |
| real browser event order | 미정 | jsdom unit/React tests는 browser별 focus/selectionchange ordering을 대체하지 않는다. |
| nested iframe/mobile/AT matrix | 미정 | 현재 범위를 넘는 platform QA다. |

## 현재 결론

#13의 핵심 결론은 selectionchange를 넓게 믿지 않는 것이다. Editor가 active이거나
native selection이 editor를 touch하는 경우에만 관찰하고, 관찰된 DOM selection도
canonical selection을 덮는 truth가 아니라 command/input source와 visual channel
signal로만 사용한다.

중복 document-level selectionchange listener는 제거했다. 남은 browser event-order
matrix는 별도 trace 이슈로 분리해 실제 Chrome/Safari/Firefox에서 event order,
activeElement, DOM selection, canonical selection, overlay state를 기록해야 한다.
