# Editor Input Oracle And Triage

작성일: 2026-06-22

범위: P0 입력 기대값을 새로 구현하거나 테스트로 고정할 때, 기대값을 감으로 정하지
않게 하는 oracle 판정 절차와 실패 triage 절차를 정의한다.

## 판정

새 P0 입력 기대값은 `docs/editor-input-contract.md`의 P0 ID와 Evidence Card 중
하나 이상을 가져야 한다. 근거가 없으면 자동 테스트를 추가하지 않고
`Evidence Needed`로 남긴다.

cursor/selection 기대값은 text만 보지 않는다. anchor, focus, collapsed 여부,
selected pointers, canonical selection path/offset/edge, browser DOM selection,
rendered DOM target을 같이 기록해야 한다.

## 새 기대값 등록 절차

1. P0 ID를 고른다. 기존 행이 없으면 먼저 `docs/editor-input-contract.md`에 행을
   추가하거나 `Evidence Needed`에 남긴다.
2. oracle 출처를 최소 하나 명시한다: spec, WPT, browser trace, reference editor,
   product policy.
3. selection 기대값이 있으면 `Selection Oracle Shape`의 필드를 채운다.
4. 검증 레벨을 고른다: jsdom replay, recorded trace, real browser gate,
   evidence needed.
5. 근거가 충분할 때만 fixture/test를 추가한다.
6. test가 새 제품 정책을 만든다면 같은 커밋에서 input contract 또는 이 문서를
   갱신한다.

## Oracle Sources

| Source | 사용 기준 | 예시 |
| --- | --- | --- |
| spec | Input Events, UI Events, Selection API, HTML이 event/input/selection semantics를 정의한다. | `SPEC-INPUT`, `SPEC-SELECTION`, `SPEC-UI-KEY` |
| WPT | 브라우저가 합의한 observable behavior 후보가 필요하다. | `WPT-INPUT`, `WPT-SELECTION` |
| browser trace | spec이 충돌하거나 IME/selectionchange 순서가 브라우저/OS에 의존한다. | `TRACE-IME-KO`, debug recording |
| reference editor | ProseMirror/Lexical 같은 성숙한 editor가 같은 문제를 policy로 분리한 증거가 필요하다. 구현 복사 근거가 아니다. | `REF-PM-POLICY`, `REF-LEXICAL-POLICY` |
| product policy | spec/WPT/reference가 열어 둔 선택지를 이 editor가 닫아야 한다. | range Arrow collapse, empty block merge |

## Selection Oracle Shape

selection 기대값은 아래 필드를 가능한 한 모두 기록한다.

| Field | 기록 기준 |
| --- | --- |
| `anchor` | canonical anchor `path` + `offset` 또는 `edge` |
| `focus` | canonical focus `path` + `offset` 또는 `edge` |
| `collapsed` | anchor/focus가 같은 cursor point인지 |
| `selectedPointers` | atom/node selection이면 selected node path 목록 |
| `selectionAfter` | command/replay 이후 canonical selection snapshot |
| `domSelection` | browser `Selection` anchor/focus path, offset, selected text |
| `renderTarget` | caret/range/atom overlay가 가리키는 `data-path`, `data-offset`, `data-edge` |
| `documentTarget` | rendered text/atom DOM의 `data-path`와 expected text/atom identity |

최소 통과 기준:

- collapsed caret: `focus.path`, `focus.offset|edge`, `collapsed=true`,
  caret overlay `data-path`를 기록한다.
- range selection: anchor/focus 양끝, direction, browser selected text, range overlay
  존재를 기록한다.
- atom selection: `selectedPointers`, atom `before/after` edge, atom overlay
  `data-path`를 기록한다.

## Verification Level

| Level | 선택 기준 | 금지 |
| --- | --- | --- |
| jsdom replay | event sequence가 deterministic이고 React/model/DOM snapshot을 빠르게 고정할 수 있다. selection, deletion, clipboard P0 대부분은 여기서 시작한다. | 실제 browser event order나 native Range 차이를 증명했다고 쓰지 않는다. |
| recorded trace | IME, stale composition, browser가 만든 event order처럼 자동 생성이 어렵지만 deterministic replay가 가능한 경우다. | 사람이 읽는 debug report만 남기고 fixture expectation 없이 완료 처리하지 않는다. |
| real browser gate | browser `Selection`/`Range`, keyboard navigation, paste/drop `DataTransfer`, geometry/DOM affordance처럼 jsdom으로 닫기 어려운 경우다. | slow gate를 `verify:internal`에 섞지 않는다. |
| evidence needed | spec/WPT/trace/reference/product policy가 부족해 기대값을 확정할 수 없다. | 자동 테스트에 기대값을 고정하지 않는다. |

## Failure Triage

실패한 P0 입력 테스트는 아래 네 가지 중 하나로 분류한다.

| 분류 | 판정 기준 | 처리 |
| --- | --- | --- |
| implementation bug | contract와 oracle이 충분하고, 구현만 expected model/selection/render state를 만족하지 않는다. | 구현을 고치고 같은 fixture를 유지한다. |
| contract bug | 테스트 기대값이 spec/WPT/browser trace/product policy와 충돌하거나 P0 행이 잘못됐다. | input contract와 fixture를 같은 커밋에서 고친다. |
| browser divergence | Chromium/Firefox/WebKit 또는 OS/IME 사이 observable behavior가 다르다. | browser trace를 보존하고 제품 policy 또는 per-browser expectation을 명시한다. |
| evidence gap | 근거가 부족해 어떤 결과가 맞는지 결정할 수 없다. | 테스트를 추가하지 않고 `Evidence Needed`와 이슈로 남긴다. |

## Evidence Gap Tracking

근거가 부족한 기대값은 아래 중 하나에 남긴다.

- `docs/editor-input-contract.md`의 `Evidence Needed`
- `docs/editor-feature-coverage-audit.md`의 미정 matrix
- GitHub issue with `스펙`, `테스트`, `contenteditable` label
- recorded debug trace가 있으면 raw report 링크 또는 fixture 후보 이름

evidence gap은 임시 구현이나 “브라우저에서 자연스러워 보임”으로 닫지 않는다.

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| oracle source requirement | 확정 절차 | 새 P0 기대값은 spec/WPT/browser trace/reference editor/product policy 중 하나 이상을 가져야 한다. |
| failure triage taxonomy | 확정 절차 | 실패를 implementation bug, contract bug, browser divergence, evidence gap으로 나누면 테스트 기대값과 구현 결함을 섞지 않는다. |
| selection oracle shape | 확정 절차 | cursor/selection 기대값은 anchor/focus/collapsed/render target 없이는 충분하지 않다. |
| verification level table | 확정 절차 | jsdom replay, recorded trace, real browser gate, evidence needed를 선택하는 기준을 분리한다. |
| evidence gap policy | 확정 절차 | 근거 없는 기대값은 자동 테스트에 고정하지 않고 별도 추적한다. |
| product policy details | 부분근거 | 실제 제품 선택은 `docs/editor-input-contract.md`의 P0 row와 Evidence Map이 authority다. |
