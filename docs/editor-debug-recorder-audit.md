# Editor Debug Recorder Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `DebugRecordingInspector`와
`src/editor/internal/debug` recorder가 빼면 안 되는 현재 진단 도구인지, 아니면
제품/배포 결정이 필요한 노출인지 구분한다.

## 판정

debug recorder는 editor model 기능이나 public embedding API가 아니다. 현재 확정으로
말할 수 있는 범위는 **React editor runtime에 붙은 내부 진단 tool surface**다.
삭제하면 interaction trace 회귀 테스트와 README의 internal debug 구조 설명이 깨진다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| React wiring | `BlockEditor`가 `useDebugInteractionRecorder` 결과를 `DebugRecordingInspector`로 렌더링한다. Inspector는 idle에는 렌더링되지 않고, recording/done/copy-failed 상태에서 `role="status"`와 `aria-label="Debug recorder"`를 가진다. | `BlockEditor.tsx`, `DebugRecordingInspector.tsx`, `BlockEditor.test.tsx` |
| hotkey | `Cmd+Shift+Backslash`가 recording start/stop을 토글하고, recorder input event에는 자기 hotkey를 중복 기록하지 않는다. | `useDebugInteractionRecorder.ts`, `debugInteractionEvents.ts`, `BlockEditor.test.tsx` |
| report schema | clipboard/console report는 `EDITABLE DEBUG TRACE`, `schema: editable-debug-trace@3`, hotkey, counts, diagnostics, final document, timeline을 포함한다. | `debugInteractionReport.ts`, `BlockEditor.test.tsx` |
| raw data handling | clipboard report에는 full JSON/DOM과 `rawEntries`를 넣지 않고, raw report는 현재 page의 `window.__editableDebugRecordings.at(-1)`에서 확인하게 한다. | `debugInteractionReport.ts`, `BlockEditor.test.tsx` |
| internal interface | recorder hook input은 `LatestSnapshot`의 `note`, `rootElement`, `selection`이고, React inspector가 받는 output은 `phase`, `elapsedMs`, `entryCount`뿐이다. | `debugInteractionTypes.ts`, `useDebugInteractionRecorder.ts`, `DebugRecordingInspector.tsx` |
| source inventory | current debug implementation은 `src/editor/internal/debug` 아래 8개 파일이고, React facade/public facade/route source는 recorder를 export하지 않는다. | `rg --files src/editor/internal/debug`, `src/editor/public/index.ts`, `src/editor/react/index.ts`, `src/routes/index.tsx` |
| event capture scope | recorder가 window에 붙이는 input event list는 beforeinput, key/mouse/pointer/composition/clipboard/wheel 중심의 23종이다. Console capture는 `console.warn`/`console.error`만 patch한다. | `debugInteractionTypes.ts`, `debugInteractionEvents.ts`, `useDebugInteractionRecorder.ts`, `BlockEditor.test.tsx` |
| state noise filter | inspector DOM 변화만으로 editor state entry를 늘리지 않는다. start/stop만 한 recording의 state reason은 `recording-started`, `recording-stopped`로 남는다. | `BlockEditor.test.tsx` |
| clipboard event summary | recorder는 paste/copy 이벤트에서 실제 transfer reader가 선택한 clipboard text를 timeline에 기록한다. custom MIME이 plain text보다 우선하면 report도 structured text를 쓴다. | `debugInteractionEvents.ts`, `BlockEditor.test.tsx` |
| selection summary | open range와 selected atom pointers를 focus point 하나로 축소하지 않고 요약한다. | `debugInteractionSnapshot.test.ts` |
| timeline formatting | newline clipboard text는 timeline에서 escaped text로 남고, pointer/mouse move는 압축된다. | `debugInteractionSnapshot.test.ts`, `debugInteractionTimeline.ts` |
| duplicate-id diagnostics | final document에 duplicate block id가 있으면 diagnostic을 만든다. | `debugInteractionReport.ts` |
| idle visibility | Idle debug recorder status는 첫 렌더와 SSR/Chrome headless DOM에 나타나지 않는다. Hotkey로 recording을 시작한 뒤에만 compact status output이 나타난다. | `DebugRecordingInspector.tsx`, `BlockEditor.test.tsx`, `curl http://localhost:4173/`, Chrome headless DOM dump |

## 증거 강도

| 강도 | 해당 항목 | 현재 의미 |
| --- | --- | --- |
| internal interface 확정 | `LatestSnapshot` input, `DebugRecordingInspectorState` output, internal/debug 8-file implementation, facade non-export | caller가 배워야 하는 public interface가 아니라 React 내부 조립 interface다. Public/export route로 올리면 별도 privacy/API 설계가 필요하다. |
| 실행 테스트로 닫힘 | hotkey start/stop, active status, clipboard report copy, copy-failed inspector phase, report header/schema/diagnostics none, warn/error diagnostics, raw omission, raw in-memory storage, raw retention 최근 5개, chosen clipboard payload, inspector DOM noise filter, range/atom selection summary, duplicate id snapshot, newline escaping | 현재 regression gate가 직접 잡는 내부 진단 기준선이다. |
| source guard로 확인 | `INPUT_EVENT_TYPES` 23종 capture list | 구현은 확인되지만 event-list 전체를 별도 named integration test가 닫지는 않는다. 이 값을 제품 contract로 말하려면 추가 test와 운영 결정을 둬야 한다. |
| one-off runtime evidence | SSR/Chrome DOM의 idle debug output 부재 | 현재 레이아웃/첫 화면 노출 결정을 받치는 증거지만 `verify:internal` 자동 gate는 아니다. |

## 아직 애매한 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| production availability policy | 현재 debug recorder는 idle UI를 숨기지만 hotkey는 production route에서도 동작한다. 이것이 운영 환경에 계속 남아야 하는지는 닫지 않았다. | dev-only gate, query flag, keyboard-only hidden surface 유지 중 하나를 정해야 한다. |
| privacy/redaction policy | clipboard report에서는 full JSON/DOM을 빼지만, raw report는 page memory에 남고 timeline에는 clipboard text와 DOM text summary가 들어간다. | 개인정보/민감 텍스트 redaction 기준이 필요한지 결정해야 한다. |
| raw retention policy | raw report가 `window.__editableDebugRecordings`에 최근 5개만 남는 current behavior는 테스트로 닫혔다. 다만 이 숫자가 운영 제품 contract인지 임시 안전장치인지는 닫지 않았다. | retention count와 수동 clear UX/API가 필요한지 결정해야 한다. |
| replay compatibility | debug trace schema는 `editable-debug-trace@3`이고, trace replay helper는 별도 `editable-trace-replay@1` fixture를 쓴다. | debug report를 replay input으로 삼을지, 사람이 읽는 진단 report로 유지할지 결정해야 한다. |
| copy failure UX | copy 실패 시 `copy-failed` phase와 warning이 발생하는 current behavior는 테스트로 닫혔다. 다만 사용자 안내 문구나 복구 UX를 제품 contract로 둘지는 아직 닫지 않았다. | clipboard permission failure를 제품 UX로 다루려면 사용자 안내와 재시도 동선을 별도 결정한다. |
| console capture 범위 | `warn`/`error`가 recorder diagnostics로 들어가는 current behavior는 테스트로 닫혔다. `log/info/debug`까지 수집할지 정한 근거는 없다. | report noise와 privacy 위험을 고려해 현재 좁은 capture를 유지할지 결정한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `src/editor/internal/debug` | 유지 확정 | editor input/state/clipboard 문제를 재현 가능한 report로 압축하는 내부 진단 module이다. 삭제하면 debug recorder tests와 README architecture 설명이 깨진다. |
| `DebugRecordingInspector` | 유지 확정 | active recorder 상태를 접근 가능한 status로 보여주는 React wiring이다. 삭제하면 hotkey recording feedback과 integration tests가 깨진다. |
| full JSON/DOM clipboard dump | 제거 확정 | clipboard report가 너무 무거워지고 민감 정보 노출 위험이 커진다. 현재 report는 raw data 위치만 안내한다. |
| hidden DOM clipboard fallback | 제거 확정 | report copy 실패 시 textarea/execCommand fallback을 만들지 않고 `copy-failed` phase와 raw in-memory report로 닫는다. |
| public facade export | 제거 확정 | debug recorder는 `src/editor/public`이나 `src/editor/react` facade로 export되지 않는다. 외부 API가 아니라 internal diagnostic이다. |
| idle status 상시 노출 | 제거 확정 | 내부 진단 badge를 첫 화면에 항상 보여주면 제품 UI에 진단 장식이 섞인다. Active recording feedback만으로 recorder 사용성은 유지된다. |
| production gating | 보류 | hotkey recorder 자체를 production에서 완전히 끌지는 운영/제품 노출 결정이다. |

## 현재 결론

debug recorder는 빼면 안 되는 내부 진단 surface다. 확정 범위는 hotkey recording,
input/state/clipboard event capture, `warn`/`error` console diagnostics, compact
clipboard report, raw in-page storage, selection/timeline 요약, active recording
status feedback까지다. Idle inspector는 첫 화면에서 숨긴다. 하지만 hotkey recorder
자체를 production에 계속 남길지, privacy/redaction과 raw retention을 어떻게 둘지,
copy failure UX와 replay compatibility를 contract로 만들지는 아직 제품/API/운영
정책으로 남긴다.
