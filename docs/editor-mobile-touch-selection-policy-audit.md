# Editor Mobile Touch Selection Policy Audit

작성일: 2026-06-22

범위: mobile touch tap, long press, selection handle drag, touch scroll, native
selection menu가 DOM selection과 editor canonical selection에 미치는 영향을 조사한다.
Desktop pointer/mouse selection adapter는 `docs/editor-pointer-selection-audit.md`를
기준으로 삼고, native DOM selection bridge는
`docs/editor-native-selection-bridge-audit.md`를 기준으로 삼는다.

## 판정

mobile touch selection은 desktop mouse drag selection과 같은 owner가 아니다.

- Touch tap caret placement는 가능하지만, long press와 selection handle drag는 browser
  native selection gesture가 우선이다.
- Touch `pointermove`를 곧바로 editor-owned drag selection으로 해석하면 scroll과 handle
  drag를 깨뜨릴 수 있다.
- Native touch text range는 즉시 canonical model selection으로 저장하지 않는다.
  `selectionchange`로 관찰하고, copy/cut/paste/replacement 같은 command가 실행되는
  순간의 observed command selection으로 사용한다.
- Mobile native menu가 열린 동안 custom toolbar/popup은 selection owner가 아니다.
  Native menu가 선택한 DOM range와 active text leaf flush가 우선한다.
- iOS Safari/Android Chrome의 실제 long press/handle behavior는 jsdom 또는 desktop
  Playwright touch emulation으로 닫을 수 없다. 실기기 trace gate가 필요하다.

## 현재 코드 판정

| 경로 | 현재 동작 | 판정 |
| --- | --- | --- |
| `useBlockEditorController.handlePointerDown` | primary `button === 0`이어도 `pointerType === "touch"`는 editor-owned atom/text hit, `preventDefault`, pointer capture를 시작하지 않는다. Mouse primary down만 desktop adapter를 탄다. | Mouse adapter와 touch browser-owner path가 분리됐다. |
| `useBlockEditorController.handlePointerMove` | mouse-owned pointer id의 move만 drag range selection으로 만들고 `preventDefault`한다. Touch move는 browser owner로 둔다. | Mouse drag selection은 유지하고 touch scroll/handle drag over-capture를 제거했다. |
| `selectionchange` listener | editor 내부 native range를 읽어 overlay visibility와 collapsed preview를 갱신한다. | Native touch range를 관찰할 수 있는 bridge는 있다. |
| `selectionForInput` / observed command selection | visible native non-collapsed range가 있으면 input/copy/cut/paste command source로 사용한다. | Long press range는 command 시점에 반영하는 방향이 맞다. |
| debug recorder | pointer id/type, mouse/pointer move, selection summary를 기록한다. | Touch handle drag는 pointer event를 안 줄 수 있으므로 `selectionchange`/contextmenu 중심 trace가 추가로 필요하다. |

## Native Touch Selection Adoption

| 상황 | canonical model selection으로 즉시 저장? | command source로 사용? | 이유 |
| --- | --- | --- | --- |
| single tap collapsed caret | 예, native caret이 editor text point로 읽히고 active edit이 없을 때 | 예 | cursor placement intent가 명확하다. |
| long press text range | 아니오 | 예 | browser native menu/handles가 range를 소유한다. Model range overlay를 동시에 그리면 stale visual이 된다. |
| handle drag 중 range 변경 | 아니오 | 예, command 실행 시점의 latest native range | handle drag는 중간 frame ordering이 browser별로 다르다. |
| native menu copy | 아니오 | 예 | copy는 document mutation이 없고 observed native range가 source다. |
| native menu cut/delete/replace | command 시점에만 반영 | 예 | command layer가 range delete/replace를 canonical patch로 만든다. |
| atom long press | 미정 | 미정 | native menu와 atom selection helper가 실제 device trace 없이는 닫히지 않는다. |
| touch scroll | 아니오 | 아니오 | scroll은 selection intent가 아니다. |

## Scroll vs Selection Drag Rule

| 입력 | owner | 규칙 |
| --- | --- | --- |
| `pointerType === "mouse"` primary drag | editor | current pointer drag adapter가 canonical range를 만든다. |
| `pointerType === "touch"` down/move | browser first | touch move는 scroll 후보이므로 immediate `preventDefault`와 pointer capture를 하지 않는다. |
| touch long press | browser native selection | `selectionchange`에서 native range를 관찰하고 custom overlay를 숨긴다. |
| touch handle drag | browser native selection | range 변화는 `selectionchange`/`select`를 통해 관찰한다. Pointer move만으로 model range를 만들지 않는다. |
| explicit touch table/cell/atom handle | editor, 별도 UI가 있을 때만 | target-specific handle이 있어야 custom selection을 시작한다. 일반 surface drag와 섞지 않는다. |
| touch scroll 중 accidental selection | browser scroll | move distance/scrolling state가 있으면 custom selection을 시작하지 않는다. |

## Toolbar / Popup / Native Menu Policy

| 대상 | 정책 |
| --- | --- |
| native selection menu | mobile long press 후 최우선 UI owner다. Editor toolbar/popup이 focus를 훔치면 안 된다. |
| editor toolbar | native range가 visible일 때는 command 실행 직전 active native edit을 flush하고 latest native range를 command source로 읽는다. |
| mention/typeahead popup | composition active 또는 native touch range visible 중에는 자동 open/selection hijack을 하지 않는다. |
| debug inspector | native menu 중에도 recording 상태를 방해하지 않아야 하며, pointer/touch/contextmenu/selectionchange evidence를 남긴다. |
| active text leaf buffer | native menu command 전 flush한다. DOM range와 text buffer가 갈라진 상태로 command를 실행하지 않는다. |

## Trace Matrix

실기기 trace는 아직 수집하지 않았다. 아래 matrix는 자동 desktop test로 대체하면 안 된다.

| device/browser | scenario | 기록해야 할 evidence |
| --- | --- | --- |
| iOS Safari | tap text caret | pointer/touch event, focus, native selection, model selection, visual viewport |
| iOS Safari | long press word selection | pointer/touch/contextmenu/selectionchange ordering, native range anchor/focus, custom overlay visibility |
| iOS Safari | selection handle drag | handle drag 중 pointer event 유무, repeated selectionchange, final command source |
| iOS Safari | native menu copy/cut/paste | menu action 전후 clipboard/input/beforeinput/cut/copy, active buffer flush |
| iOS Safari | touch scroll over editor | pointer/touch move, scroll, selectionchange absence, model selection stability |
| Android Chrome + Gboard | tap text caret with keyboard | focus, virtual keyboard, visual viewport, native selection, composition state |
| Android Chrome + Gboard | long press and handle drag | composition/input/selectionchange mix, native range stability |
| Android Chrome + Gboard | touch scroll in editor | unintended selectionchange/table/atom selection 여부 |
| Android Chrome + Gboard | atom/figure adjacent long press | keyboard dismissal, native selection range, atom deletion/replacement side effects |

## 외부 근거

| 근거 | 관찰 | 적용 |
| --- | --- | --- |
| Lexical changelog: https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | touch table selection, unintended touch selection while scrolling, mobile tap, Android/iOS editing fixes가 반복된다. | mobile/touch를 desktop mouse와 같은 path로 닫으면 안 된다. |
| Lexical PR #7297: https://github.com/facebook/lexical/pull/7297 | touch device table cell selection handler가 별도로 추가됐다. | touch-specific selection path가 필요할 수 있다. |
| Lexical PR #7309: https://github.com/facebook/lexical/pull/7309 | pointer type을 추적하고 selection creation을 selectionchange까지 미뤄 scroll 중 accidental selection을 막았다. | touch scroll과 selection drag를 pointermove만으로 구분하지 않는다. |
| Lexical PR #4395: https://github.com/facebook/lexical/pull/4395 | touch device text click selection 문제를 core event layer에서 수정했다. | text tap selection도 browser/device 별도 취급이 필요하다. |
| ProseMirror Android write-up: https://discuss.prosemirror.net/t/contenteditable-on-android-is-the-absolute-worst/3810 | Android on-screen keyboard는 composition, selectionchange, beforeinput, keyboard visibility가 desktop과 다르게 얽힌다. | 실기기 trace 없이는 mobile selection policy를 완료했다고 보면 안 된다. |

## 현재 Drift

| drift | 영향 | 처리 |
| --- | --- | --- |
| touch pointerdown에서 immediate `preventDefault` | long press native selection, context menu, scroll 시작을 막을 수 있었다. | `#69`에서 touch pointerdown을 browser-owned path로 분리했다. |
| touch pointermove를 mouse drag selection처럼 처리 | touch scroll이나 selection handle drag가 custom range selection으로 오인될 수 있었다. | `#69`에서 touch pointermove가 model range selection을 만들지 않도록 분리했다. |
| touch/contextmenu event가 debug recorder 핵심 trace에 없음 | native menu와 long press evidence가 부족할 수 있다. | 실기기 trace gate에서 recorder 필드를 확장한다. |
| 실기기 iOS/Android trace 부재 | 완료 기준의 첫 항목을 자동 검증으로 대체할 수 없다. | 별도 manual/device trace 이슈로 분리한다. |

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| desktop pointer selection adapter | 실행 테스트로 확정 | `docs/editor-pointer-selection-audit.md`, BlockEditor split tests |
| native range command source | 실행 테스트로 확정 | `docs/editor-native-selection-bridge-audit.md`, copy/cut/paste/native range tests |
| mobile touch long press/handle policy | 외부 근거 기반 정책 | Lexical PRs, ProseMirror Android write-up |
| touch scroll vs selection drag | local branch 분기 테스트로 over-capture 제거 확인 / 실제 scroll은 실기기 미검증 | Lexical #7309, BlockEditor split tests touch pointer branch |
| toolbar/popup/native menu conflict | 정책 확정 / 실기기 미검증 | current native range visibility/toolbar flush docs, mobile menu trace 부재 |
| iOS Safari / Android Chrome trace | 미완료 | 로컬에는 실제 device trace가 없다 |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| mouse pointer adapter를 touch에 그대로 적용 | 제거 필요 | touch scroll, long press, handle drag의 browser owner를 침범한다. |
| native touch range 즉시 model selection 저장 | 제거 | handle drag 중간 상태와 custom overlay stale 위험이 크다. |
| command 시점 observed native range | 유지 | 사용자가 native menu/handles로 만든 최신 range를 copy/cut/replacement에 써야 한다. |
| desktop Playwright mobile emulation으로 완료 선언 | 제거 | native selection handles와 mobile context menu를 증명하지 못한다. |
| 실기기 trace gate | 유지 필요 | iOS Safari/Android Chrome/Gboard 조합은 자동 desktop test로 대체할 수 없다. |

## 결론

현재 editor의 desktop pointer selection adapter는 확정됐고, runtime pointer branch는
touch down/move를 browser owner로 두도록 분리됐다. 정석은 touch long press/handle drag를 browser native owner로 두고,
`selectionchange`로 native range를 관찰한 뒤 command 시점에만 canonical command source로
사용하는 것이다. Touch scroll은 selection intent가 아니므로 `pointermove`만으로 custom
range를 만들면 안 된다.

남은 일은 iOS Safari와 Android Chrome 실기기 trace를 수집해 long press, handle drag,
native menu, scroll, atom adjacent selection을 증거로 닫는 것이다.
