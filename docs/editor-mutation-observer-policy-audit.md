# Editor MutationObserver policy audit

작성일: 2026-06-22

범위: `MutationObserver`/DOMObserver를 editor reconciliation source로 쓸지,
guardrail/debug로만 둘지 정한다. Composition, React render, observer
pause/resume, stale record, ignored mutation이 엇갈릴 때의 model/DOM divergence 위험을
다룬다.

## 판정

현재 editor는 `MutationObserver`를 runtime reconciliation source로 쓰지 않는다.

- source of truth는 canonical JSON document와 명시적 editor command 결과다.
- browser native edit은 `contentEditableViewEngine`의 active text leaf buffer로만
  허용하고, release boundary에서 canonical patch로 flush한다.
- React render mutation은 renderer-owned DOM update다. Observer record를 model patch로
  역변환하지 않는다.
- future `MutationObserver`는 guardrail/debug 용도만 허용한다. 즉, "어떤 known
  recovery path를 실행할지"를 고르는 신호이지 document mutation 자체가 아니다.

따라서 raw `MutationRecord`를 JSON Patch로 바꾸는 설계는 금지한다.

## 목적 분리

| 목적 | 현재 판정 | 의미 |
| --- | --- | --- |
| source of truth | 금지 | record 순서, stale delivery, browser-specific DOM shape 때문에 model patch authority로 쓰지 않는다. |
| guardrail | 조건부 허용 | unexpected DOM drift를 발견하면 active buffer flush, canonical reset, surface integrity failure 같은 known recovery path로 보낸다. |
| debug/trace | 허용 | record type, target path, connected 여부, observer epoch, composition phase를 진단 로그로 남긴다. |
| performance dirty range | 보류 | current renderer는 full React render와 view engine reset/flush로 충분하다. dirty range reparse가 필요해질 때 별도 설계한다. |

## Current implementation 사실

| 항목 | 현재 상태 |
| --- | --- |
| runtime `MutationObserver` | 없음. source search 기준 production view/react/model path에서 observer를 만들지 않는다. |
| active native edit | `contentEditableViewEngine`이 active text leaf 안 native mutation만 허용한다. |
| composition | browser IME가 active text leaf DOM을 소유하고, final commit/release에서 model로 flush한다. |
| React render mutation | `DocumentRenderer`가 canonical document를 DOM으로 투영한다. |
| custom view mutation hook | 현재 registry 없음. future hook은 `ignoreViewMutation`과 `ownsViewSelection`으로 분리한다. |
| read-only/foreign DOM drift | input/read-only recovery path가 canonical view reset으로 되돌린다. |

## Pause/resume stale record policy

Future observer를 도입하면 pause/resume은 반드시 epoch 기반이어야 한다.

| 상황 | 정책 |
| --- | --- |
| observer pause 전 | `takeRecords()`로 현재 queue를 비우고 `observerEpoch`를 증가시킨다. |
| pause 중 React render/reset | renderer-owned epoch로 분류한다. record가 나중에 오더라도 model patch로 쓰지 않는다. |
| pause 중 browser/native edit | active text leaf phase 안이면 engine flush가 authority다. observer record는 diagnostic이다. |
| resume 직후 | 즉시 `takeRecords()`를 호출해 stale queue를 분리한다. target이 `isConnected === false`이거나 epoch가 맞지 않으면 stale로 분류한다. |
| stale record 발견 | document patch 금지. debug trace에 남기고, 필요하면 canonical reset 또는 surface integrity check만 실행한다. |
| Safari delayed record | "observer가 관찰 중이 아니던 때의 record도 나중에 올 수 있다"를 전제로 설계한다. disconnect가 delivery guarantee라고 믿지 않는다. |

이 정책은 ProseMirror changelog의 Safari stale mutation record workaround를 그대로
경계로 삼는다.

## React render mutation vs native edit mutation

| 구분 | 분류 기준 | 처리 |
| --- | --- | --- |
| React render mutation | render/reset epoch 안에서 발생하고 renderer-owned `data-path` topology가 canonical document와 일치한다. | ignore for model. 필요 시 surface integrity만 확인한다. |
| active native text mutation | beforeinput/input/composition phase가 있고 target이 active text leaf path 안이다. | `contentEditableViewEngine`이 release 시 one-patch flush한다. observer는 patch를 만들지 않는다. |
| composition preedit mutation | composition active/awaiting commit phase의 active leaf textContent 변화다. | immediate model patch 금지. final commit, blur, command boundary에서 flush한다. |
| native mutation outside active leaf | active edit phase가 없거나 target path가 active text leaf 밖이다. | suspicious drift. command path, canonical reset, debug trace 중 하나로 처리한다. |
| custom chrome mutation | toolbar/overlay/debug/nested owner처럼 document surface 밖 DOM이다. | observer 대상에서 제외하거나 `ignoreViewMutation` guard가 소유를 증명해야 한다. |
| selection change | native `MutationRecord`가 아니라 selection bridge 영역이다. | mutation ignore hook으로 삼키지 않는다. future hook은 `ownsViewSelection`으로 분리한다. |

## Composition 중 observer record

Composition 중 DOM text는 browser preedit buffer다. Observer가 record를 보더라도
그 자체를 document text로 확정하지 않는다.

| record | 처리 |
| --- | --- |
| active text leaf `characterData` | diagnostic. `compositionupdate`/`beforeinput insertCompositionText`/`input`과 함께 trace에 남긴다. |
| active leaf wrapper `childList` | 위험. React render/decorator가 active target을 갈아끼웠을 가능성이 있으므로 reset/flush boundary를 검토한다. |
| sibling/block structure mutation | active path index가 바뀔 수 있으므로 immediate model patch 금지. future remote/render queue 정책과 연결한다. |
| stale `compositionend` 이후 record | composition epoch가 다르면 stale로 분류한다. 새 composition을 release하지 않는다. |

## Safari/WebKit manual fixture

현재 runtime observer가 없으므로 Safari stale record를 자동 재현하지 않는다. Observer
guardrail을 추가하는 순간 최소 browser fixture는 아래다.

| fixture | 절차 | 기대 |
| --- | --- | --- |
| paused observer stale delivery | WebKit에서 root observer를 시작하고 pause/disconnect한 뒤 DOM을 mutate하고 resume한다. | pause 중 mutation record가 나중에 와도 stale epoch로 분류되어 model patch가 생기지 않는다. |
| orphaned backing DOM after input | WebKit/Playwright fill 또는 equivalent input으로 backing DOM과 live DOM이 갈라지는 상황을 만든다. | observer가 아니라 input/selection bridge가 recovery source다. orphan record는 debug evidence다. |
| composition active leaf mutation | Korean/Japanese composition 중 active text leaf `characterData`를 관찰한다. | record는 diagnostic이고 final commit/release 전 model text를 확정하지 않는다. |
| React reset during observer pause | canonical reset 중 observer를 pause하고 resume한다. | renderer-owned records are ignored for model and do not trigger dirty reparse loop. |

## 외부 근거

| 출처 | 내용 | 우리 쪽 해석 |
| --- | --- | --- |
| ProseMirror view changelog | Safari가 observer가 관찰 중이 아니었을 때의 mutation record를 나중에 전달하는 문제를 workaround했다. node view, mark/widget, composition, DOM sync 관련 수정도 반복된다. | observer queue는 delivery timing을 신뢰하면 안 된다. pause/resume에는 stale epoch가 필요하다. |
| Lexical issue #3460 | WebKit/Playwright에서 beforeinput/input, live DOM, backing element가 갈라져 text가 갱신되지 않는 사례가 보고됐다. | DOM이 이미 바뀌었는지, backing element가 orphaned인지가 browser/tooling별로 달라진다. raw DOM observation은 authority가 아니다. |
| W3C Input Events Level 2 | beforeinput은 attempted input이고 DOM update를 보장하지 않는다. input은 browser-handled DOM update 뒤 dispatch되며, composition 중 beforeinput/input order는 별도로 정의된다. | event와 DOM mutation 사이에도 phase가 있다. observer record만으로 user intention과 model patch를 확정하지 않는다. |

근거 링크:

- https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md
- https://github.com/facebook/lexical/issues/3460
- https://www.w3.org/TR/input-events-2/

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current runtime observer 부재 | source 확정 | code search상 production editor path에서 `MutationObserver`를 생성하지 않는다. | future guardrail 추가 시 새 runtime tests가 필요하다. |
| observer를 source of truth로 쓰지 않음 | 정책 확정 | contenteditable buffer, composition render update, custom view mutation policy와 일치한다. | dirty range reparse engine이 생기면 보류 항목을 다시 설계해야 한다. |
| active native edit authority | 실행 테스트로 확정 | `contentEditableViewEngine`/React tests가 active leaf flush, composition phase, read-only recovery를 고정한다. | 모든 browser/OS IME matrix는 닫지 않는다. |
| pause/resume stale policy | 정책 확정 | ProseMirror Safari stale record 근거와 observer epoch 설계 기준. | 현재 runtime observer가 없으므로 실행 fixture는 future다. |
| React vs native mutation 분류 | 정책 확정 | renderer-owned DOM과 active native buffer의 authority를 분리한다. | 실제 observer implementation에는 epoch tagging/test가 필요하다. |
| Safari stale record 재현 | manual/future | 이슈 완료 기준상 수동 검증 항목으로 정의했다. | 자동 Playwright fixture는 observer runtime이 생길 때 추가한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| 지금 `MutationObserver` reconciliation 추가 | 보류/금지 | 현재 known bug를 줄이는 확정 변경이 아니고 source-of-truth가 둘로 늘어난다. |
| raw record를 JSON Patch로 변환 | 제거 확정 | stale record, render-owned mutation, composition preedit이 모두 model patch로 오인될 수 있다. |
| guardrail/debug observer | 조건부 허용 | record를 recovery trigger/evidence로만 쓰면 기존 authority를 깨지 않는다. |
| pause/resume without epoch | 제거 확정 | Safari delayed record 근거상 disconnect/pause만으로 stale을 막을 수 없다. |
| single `ignoreMutation` hook | 제거 확정 | selection ownership과 DOM mutation ignore가 섞여 stale selection을 만든다. |

## 현재 결론

현재 editor는 MutationObserver를 도입하지 않는 것이 맞다. 도입하더라도 document mutation
authority가 아니라 guardrail/debug layer로 제한한다. Pause/resume은 epoch와
`takeRecords()`를 포함해야 하며, composition/native edit은 observer record가 아니라
contenteditable engine의 active leaf flush가 authority다.
