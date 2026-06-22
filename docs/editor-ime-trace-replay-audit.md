# Editor IME Trace Replay Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `src/editor/internal/testing/editorTraceReplay.ts`와
IME fixture가 빼면 안 되는 테스트 surface인지, 아니면 제품/브라우저 호환성을
증명하는 넓은 contract인지 구분한다.

## 판정

`editorTraceReplay`는 public editor API가 아니라 **internal React regression replay
adapter**다. 현재 확정으로 말할 수 있는 범위는 jsdom 테스트에서 브라우저가 발생시킨
IME event order와 DOM preedit text mutation을 재현하는 것이다. 삭제하면 Korean
composition 회귀를 사람이 다시 수작업 이벤트로 풀어써야 하므로 테스트 locality가
나빠진다.

다만 이 helper와 prevented-event audit은 실제 OS/browser IME matrix나 debug
recorder report replay compatibility를 증명하지 않는다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| internal 위치 | replay helper와 fixture는 `src/editor/internal/testing`, `src/editor/internal/fixtures/ime`, `src/editor/internal/fixtures/input` 아래에 있고 public/react facade export가 아니다. | `editorTraceReplay.ts`, fixture files, `scripts/verify-editor-boundaries.mjs` |
| trace schema | fixture shape는 `schema: "editable-trace-replay@1"` literal type으로 고정되어 있다. | `editorTraceReplay.ts`, IME fixture files |
| source inventory | current trace surface는 replay helper, prevented-event audit helper, IME fixture file 6개, P0 input fixture file 1개다. Adjacent stale composition도 fixture corpus로 승격했다. | `rg --files src/editor/internal/fixtures src/editor/internal/testing`, `BlockEditor.imeTrace.test.tsx`, `BlockEditor.inputTrace.test.tsx` |
| replay interface | `replayEditorTrace(root, trace)`는 replayed events의 `defaultPrevented`, event 전후 document-view text/selection snapshot, DOM selection snapshot, stateChanged 결과 배열을 반환하고, `findReplayedEvent`는 type/inputType으로 그 결과를 찾는다. | `editorTraceReplay.ts`, `BlockEditor.imeTrace.test.tsx` |
| replay expectation | event step은 `expect.before`/`expect.after`로 canonical renderer text, path text, selection, DOM selection 기대값을 표현할 수 있다. mismatch는 event index, event name, phase, field를 포함해 실패한다. | `editorTraceReplay.ts`, `BlockEditor.imeTrace.test.tsx` |
| replay invariant | replay는 시작 시점과 각 step 이후 rendered `data-path`, selection path/offset, DOM selection, selected pointer, caret/atom overlay target이 존재하고 일관되는지 기본 검사한다. | `editorTraceReplay.ts`, `editorTraceReplay.test.ts` |
| replay steps | 지원 step은 `event`, `selection`, `text`, `timers`다. selection step은 collapsed text caret과 text range를 만들고 `selectionchange`를 dispatch한다. text step은 `data-path` text run을 직접 조작한다. event step은 keyboard/composition/input/paste/drop/cut/focus/blur/pointerdown event를 dispatch한다. | `editorTraceReplay.ts` |
| P0 input corpus | IME 외 selection movement/collapse/extension, range replacement, range Backspace/Delete, empty block Backspace, atom replacement, plain paste, markdown drop, cut을 fixture corpus로 검증한다. | `p0SelectionDeletionClipboardTrace.ts`, `BlockEditor.inputTrace.test.tsx` |
| prevented-event audit | prevented editing event는 즉시 state change, deferred command, explicit no-op 중 하나로 설명되어야 한다. Pass-through로 선언된 event가 prevent되면 실패한다. | `preventedEventAudit.ts`, `preventedEventAudit.test.ts`, `BlockEditor.imeTrace.test.tsx` |
| Korean basic trace | Hangul starter key가 두 번 commit되지 않고 final text와 selection offset이 canonical state로 남는 것을 검증한다. | `koreanHangulBasicTrace.ts`, `BlockEditor.imeTrace.test.tsx` |
| stale composition end | 첫 Hangul composition이 끝나자마자 다음 composition이 시작될 때 stale timer가 새 preedit을 release하지 않는 것을 fixture corpus로 검증한다. | `koreanHangulAdjacentStaleTrace.ts`, `BlockEditor.imeTrace.test.tsx`, `contentEditableViewEngine.test.ts` |
| Enter confirmation | IME confirmation Enter가 final composition commit 뒤 paragraph split으로 이어지는 것을 검증한다. Prevented Enter keydown은 deferred command로 감사된다. | `koreanHangulEnterConfirmTrace.ts`, `BlockEditor.imeTrace.test.tsx`, `preventedEventAudit.ts` |
| active mark composition | active bold mark 상태에서 composition commit이 marked text path로 들어가는 것을 검증한다. | `koreanHangulActiveMarkTrace.ts`, `BlockEditor.imeTrace.test.tsx` |
| history during composition | composition 중 `historyUndo` beforeinput은 explicit no-op으로 막히고 document text를 오염시키지 않는다. | `koreanHangulCompositionHistoryTrace.ts`, `BlockEditor.imeTrace.test.tsx` |
| blur during composition | composition 중 blur는 active native composition text를 canonical document로 flush한다. | `koreanHangulCompositionBlurTrace.ts`, `BlockEditor.imeTrace.test.tsx` |
| toolbar during composition | toolbar command 전 composition UI state를 끝내는 정책은 trace corpus가 아니라 React toolbar interaction test로 고정한다. | `BlockEditor.test.tsx` |
| engine-level complement | final composition commit once, no observed DOM text fallback, duplicate final removal, differing final commit, repeated-text preedit, history ignore, retargeted composition은 lower-level view engine tests가 덮는다. | `contentEditableViewEngine.test.ts` |
| test-only boundary | runtime implementation이 `testing`/`fixtures`를 import하면 boundary violation이고, test file import만 허용된다. Test helper가 product implementation을 import하거나 fixture가 non-testing segment를 import하는 것도 막는다. | `scripts/verify-editor-boundaries.test.mjs`, `docs/editor-internal-module-surface-audit.md` |

## 증거 강도

| 강도 | 해당 항목 | 현재 의미 |
| --- | --- | --- |
| test interface 확정 | `EditorTraceReplay` schema, `event`/`selection`/`text`/`timers` step union, event `expect.before`/`expect.after`, `replayEditorTrace` return shape, prevented-event audit helper, IME fixture file 6개, input fixture file 1개 | jsdom React regression test가 배워야 하는 replay interface다. Public editor caller가 배워야 하는 interface는 아니다. |
| 실행 테스트로 닫힘 | Korean starter key duplicate commit 방지, adjacent composition stale timer 방지, active mark commit, composition 중 history no-op, blur flush, Enter confirmation commit-then-split, final commit `defaultPrevented` assertion, prevented Enter deferred command audit, trace expectation failure message, replay invariant failure | 현재 regression gate가 직접 잡는 IME trace replay 기준선이다. |
| P0 input corpus로 닫힘 | horizontal selection 이동/collapse/extension, range replacement, range Backspace/Delete, empty block Backspace, atom replacement, plain paste, markdown drop, cut | 현재 regression gate가 직접 잡는 IME 외 P0 replay 기준선이다. |
| engine-level complement | final commit once, no observed DOM text fallback, duplicate final removal, differing final commit, repeated-text preedit, history ignore, retargeted composition | trace replay가 모든 composition logic을 직접 증명하지 않고, lower-level view adapter tests가 보완한다. |
| boundary verifier로 닫힘 | runtime implementation의 testing/fixture import 금지, test file import 허용, testing helper implementation import 금지, fixture non-testing import 금지 | replay helper와 fixture가 test-only surface로 남아야 한다는 module direction이다. |

## 아직 애매하거나 보장하지 않는 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| browser/OS IME matrix | replay는 jsdom에서 event order와 DOM text mutation을 재현한다. 실제 macOS/Windows/Linux, Chrome/Safari/Firefox IME 조합을 실행하지 않는다. | real-browser trace 수집과 Playwright/browser matrix gate를 둘지 결정해야 한다. |
| trace capture pipeline | fixture는 repo 안에 수동으로 보존된 event sequence다. 브라우저에서 recorder output을 자동 변환하는 capture/import pipeline은 없다. | 새 IME 이슈가 생기면 어떤 형식으로 trace를 수집하고 fixture화할지 정해야 한다. |
| debug recorder compatibility | debug recorder schema는 `editable-debug-trace@3`이고 replay fixture schema는 `editable-trace-replay@1`이다. 서로 직접 호환된다는 근거가 없다. | debug report를 replay input으로 삼을지, 사람이 읽는 진단 report로만 둘지 결정해야 한다. |
| runtime schema validation | `replayEditorTrace`는 TS fixture type을 전제로 하며 external JSON을 runtime-validate하지 않는다. | 외부 trace 파일 import가 필요해질 때 좁은 parser를 추가한다. 지금은 public import surface로 만들지 않는다. |
| composition 중 selection 이동 전체 행렬 | retargeting과 stale composition 회귀는 있지만 모든 selectionchange/focus/blur event ordering을 닫지는 않는다. | 실제 결함이 재현될 때 fixture를 추가하거나 browser QA matrix로 분리한다. |
| browser pointer/selection ordering matrix | replay는 pointerdown과 selectionchange를 좁은 fixture event로 재현하지만 실제 브라우저의 pointer capture, drag selection, touch/pen, multi-range ordering을 닫지는 않는다. | 실제 회귀가 생기면 기존 helper에 좁게 추가할지, 별도 browser trace format으로 분리할지 먼저 결정한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `editorTraceReplay` helper | 유지 확정 | IME event, DOM preedit text, timers, default-prevented/state snapshot assertion을 하나의 internal replay interface로 묶는다. 삭제하면 같은 회귀를 테스트마다 장황하게 다시 작성해야 한다. |
| `preventedEventAudit` helper | 유지 확정 | `preventDefault()`가 command 없이 사라지는 경로를 test failure로 만든다. Deferred command와 explicit no-op은 좁은 matcher로 선언해야 한다. |
| Korean Hangul fixtures | 유지 확정 | starter key duplicate commit, adjacent stale composition, active mark commit, composition 중 history no-op, blur flush, Enter confirmation은 jsdom 단위 이벤트보다 실제 browser event order에 가까운 회귀 근거다. |
| public facade export | 제거 확정 | replay helper는 test adapter다. 외부 embedding interface로 노출하면 fixture schema와 DOM `data-path` detail을 public contract로 오해하게 한다. |
| debug recorder와 자동 통합 | 보류 | 두 schema의 목적이 다르다. 지금 합치면 internal diagnostic report와 deterministic test fixture가 서로를 과하게 제약한다. |
| browser matrix를 `verify:internal`에 합치기 | 보류 | internal gate가 과하게 커진다. 실제 browser/OS IME QA는 별도 release/browser gate가 맞다. |

## 현재 결론

IME trace replay는 빼면 안 되는 내부 회귀 재현 surface다. 확정 범위는
`editable-trace-replay@1` fixture, `event`/`selection`/`text`/`timers` replay,
keyboard/composition/input/paste/drop/cut/focus/blur/pointerdown event 재생,
selectionchange replay, event 전후 canonical/DOM selection snapshot, event expectation
검증, prevented-event audit, Korean composition
duplicate commit 방지, stale composition end 방지, active mark commit, composition 중
history no-op, blur flush, Enter confirmation commit-then-split 처리, IME 외 P0
selection/deletion/clipboard replay corpus, test-only boundary다. 반대로 실제
browser/OS IME matrix, trace capture/import pipeline, debug recorder 호환성,
browser pointer/selection ordering matrix, external JSON validation은 아직 제품/운영/QA
결정으로 남긴다.
