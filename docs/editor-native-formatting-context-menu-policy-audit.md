# Editor native formatting and context menu policy audit

작성일: 2026-06-22

범위: browser native formatting command, iOS/desktop context menu, Input Events
`format*`/`insertLink`, OS-level rich text operation이 editor mark model을 우회할 수
있는지 조사하고 현재 editor의 차단/흡수 정책을 확정한다.

## 판정

브라우저 native formatting 결과는 document authority가 아니다.

- `bold`, `italic`, `code`, `link` mark 변경은 `toggleMark`/`toggleLink` command만
  document patch를 만들 수 있다.
- `Cmd/Ctrl+B/I/E/K` 같은 keyboard shortcut은 headless input adapter가 소유한다.
- `beforeinput`의 `format*`/`insertLink`는 editing intent signal일 뿐이고, 현재
  editor는 native DOM formatting을 prevent한 뒤 no-op으로 둔다.
- Native context menu가 `beforeinput formatBold` 같은 cancelable event를 내면 같은
  차단 정책을 탄다.
- beforeinput 없이 DOM에 `<b>`, `<i>`, `<a>`, style wrapper가 생겨도 그 DOM을 mark
  truth로 import하지 않는다. Mark DOM drift는 canonical renderer/reset 또는 future
  guardrail의 복구 대상이다.

## 외부 근거

| 근거 | 내용 | 우리 쪽 해석 |
| --- | --- | --- |
| W3C Input Events Level 2, 2026-05-01 WD | contenteditable에서 `formatBold`, `formatItalic`, `formatUnderline`, `formatRemove`, `insertLink`, color/font 계열 inputType이 정의되어 있고 IME composition 내부를 제외한 beforeinput은 cancelable로 정리된다. 동시에 모든 구현이 모든 inputType을 지원한다는 뜻은 아니라고 명시한다. | format 계열은 "사용자 의도"를 알려주는 신호다. Browser DOM 결과를 mark model source로 승격하지 않는다. |
| ProseMirror-view changelog 0.15.0 | iOS context menu의 bold/italic button처럼 DOM에서 직접 mark를 더하거나 빼는 변경을 replace step이 아니라 mark step으로 처리한 이력이 있다. | 성숙한 editor도 native mark DOM mutation을 실제 문제로 다룬다. 다만 ProseMirror는 schema-aware DOM parser/ViewDesc/diff가 있으므로 그대로 복제하지 않는다. |
| Lexical PR #8148, 2026-02-17 merged | IME composition 중 selection이 다른 node로 이동했을 때 이전 selection의 format/style을 새 node에 잘못 상속하는 버그를 고쳤다. | composition 중 format/style state는 selection 이동과 섞이면 쉽게 stale해진다. Active marks는 command-owned transient context로만 다룬다. |
| `docs/editor-beforeinput-policy-audit.md` | `beforeinput`은 primary truth가 아니라 intent signal이고, `format*`/`insertLink`는 현재 explicit command 없음으로 분류되어 DOM 결과를 authority로 채택하지 않는다. | 이 문서는 beforeinput 정책을 mark/context menu 문제에 좁혀 확정한다. |
| `docs/editor-dom-dirty-range-policy-audit.md` | native DOM diff source는 active text leaf `textContent` 하나로 제한한다. Mark wrapper 구조는 parser source가 아니다. | DOM wrapper mutation으로 mark patch를 만들지 않는다. |

## 현재 코드 판정

| 경로 | 현재 동작 |
| --- | --- |
| `src/editor/internal/react/useBlockEditorController.tsx` `handleBeforeInput` | native leaf/history/composition이 아니면 `event.preventDefault()` 후 `runInput`으로 보낸다. |
| `src/editor/internal/model/inputAdapter.ts` `translateBeforeInput` | text insertion, delete, cut, Enter 계열만 command로 번역한다. `format*`/`insertLink`는 처리하지 않는다. |
| `src/editor/internal/model/inputAdapter.ts` `translateKeyDown` | `Cmd/Ctrl+B`, `Cmd/Ctrl+I`, `Cmd/Ctrl+E`, `Cmd/Ctrl+K`를 `toggleMark`/`toggleLink` command로 번역한다. |
| `src/editor/internal/model/markCommands.ts` | range mark split/merge, collapsed active marks, safe link href를 command 결과로만 만든다. |
| `src/editor/internal/view/contentEditableViewEngine.ts` `flush` | active text path의 `textContent`만 읽어 text patch를 만든다. `<b>`/`<i>` 같은 DOM 구조를 mark로 reparse하지 않는다. |
| `src/editor/internal/view/contentEditableViewEngine.ts` `reset` | canonical document text를 DOM text node로 복구한다. |

결론: 현재 cancellable `beforeinput format*`는 prevent되고 no-op이다. Keyboard shortcut은
별도 command path로 동작한다. 남은 위험은 browser/OS가 cancelable beforeinput 없이
same-text wrapper DOM mutation을 만들 때이고, 이는 mark import가 아니라 drift 복구
문제로 분리해야 한다.

## 처리 정책표

| 입력 경로 | 정책 | 이유 |
| --- | --- | --- |
| `Cmd/Ctrl+B` | preventDefault 후 `toggleMark("bold")` | keyboard shortcut은 command-owned mutation이다. |
| `Cmd/Ctrl+I` | preventDefault 후 `toggleMark("italic")` | native `execCommand`/browser bolding으로 보내지 않는다. |
| `Cmd/Ctrl+E` | preventDefault 후 `toggleMark("code")` | code mark는 browser native format concept가 아니므로 model command만 허용한다. |
| `Cmd/Ctrl+K` | preventDefault 후 `toggleLink`; pending href 없으면 실패/no-op | link href는 allowlist를 통과한 command context만 쓴다. |
| `beforeinput formatBold`/`formatItalic` | preventDefault 후 no-op 현재 유지 | 같은 shortcut은 이미 keydown command가 소유한다. Native context menu mapping은 real trace와 explicit tests 전까지 열지 않는다. |
| `beforeinput formatUnderline`/`formatStrikeThrough`/color/font | preventDefault 후 no-op | schema에 없는 mark/style을 DOM에서 만들게 두지 않는다. |
| `beforeinput insertLink` | preventDefault 후 no-op | event `data` URL을 곧바로 link mark로 쓰면 href UI/safety seam을 우회한다. |
| iOS/desktop context menu rich formatting | beforeinput이 있으면 같은 차단 정책. 없으면 canonical reset/guardrail 대상 | OS menu가 DOM을 직접 바꿔도 model patch authority가 아니다. |
| browser paste rich HTML | 이 문서 범위 밖. clipboard/import policy로만 처리 | paste는 transfer adapter/sanitizer 문제이고 native formatting command가 아니다. |
| composition 중 format/style 이동 | command 지연 또는 no-op. native style inheritance 금지 | Lexical PR #8148 같은 stale format inheritance 위험이 있다. |

## 최소 재현 정의

| fixture | 절차 | 기대 |
| --- | --- | --- |
| `native-format-beforeinput-bold` | contenteditable text range를 선택하고 OS/browser native Bold action을 실행한다. Desktop은 browser menu/shortcut 후보, iOS는 BIU context menu 후보다. | `beforeinput.inputType === "formatBold"`가 오면 preventDefault되고 document patch는 없다. DOM에 `<b>` wrapper가 남지 않는다. |
| `native-insert-link-beforeinput` | text range 선택 후 native link insertion 또는 OS rich text link action을 실행한다. | `insertLink`는 preventDefault되고 pending href 없는 `toggleLink`를 우회하지 않는다. |
| `native-format-dom-drift-same-text` | text run DOM 안에 같은 `textContent`를 유지한 채 `<b>BC</b>` 같은 wrapper를 주입한다. | model mark patch는 생성하지 않는다. 다음 reset/render/guardrail에서 canonical text DOM으로 복구한다. |
| `composition-format-stale-selection` | IME composition 중 selection을 다른 text node로 이동시키고 native/toolbar format state가 따라오는지 확인한다. | stale active mark/style을 새 node에 상속하지 않는다. Composition commit은 selection context 기준 command 또는 active leaf flush로만 처리한다. |

## iOS와 desktop 차이

| 축 | desktop | iOS/mobile |
| --- | --- | --- |
| shortcut | `Cmd/Ctrl+B/I` keydown을 잡아 command path로 보낼 수 있다. | hardware keyboard가 아니면 shortcut 대신 selection handle/context menu가 중심이다. |
| context menu | browser별 context menu action이 `beforeinput format*`를 낼 수 있다. | BIU/context menu가 DOM을 직접 바꾸거나 selection/focus timing과 섞일 수 있다. |
| detection | beforeinput/input/selectionchange ordering을 devtools와 Playwright로 어느 정도 볼 수 있다. | 실기기 trace가 필요하다. jsdom으로 닫으면 안 된다. |
| policy | format intent는 prevent/no-op 또는 explicit command mapping만 허용한다. | 동일. 단, focus/selection handoff와 virtual keyboard trace를 별도 증거로 남긴다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| native formatting DOM authority 금지 | 실행 테스트로 확정 | beforeinput audit, DOM dirty range audit, mark command audit와 `contentEditableViewEngine.test.ts` same-text wrapper drift fixture가 canonical command/render authority를 지지한다. | 실제 OS menu event order는 실기기 trace가 필요하다. |
| `format*`/`insertLink` inputType 존재와 cancelability | 스펙 근거 확정 | W3C Input Events Level 2 table | browser별 event support/order는 실기기 trace가 필요하다. |
| iOS context menu mark mutation class | 외부 구현 근거 확정 | ProseMirror-view changelog 0.15.0 | current editor에서 직접 재현한 trace는 아직 없다. |
| keyboard mark command ownership | 실행 테스트로 확정 | `inputAdapter.test.ts`, `markCommands.test.ts` | context menu native action test와는 별개다. |
| link href safety seam | 실행 테스트로 확정 | `markCommands.test.ts`, `docs/editor-link-mark-audit.md` | native `insertLink.data`를 safe UI로 받을 제품 결정은 없다. |
| active text leaf only DOM flush | 실행 테스트로 확정 | `contentEditableViewEngine.test.ts`, DOM dirty range audit | rich HTML/mark wrapper를 model patch로 import하지 않는다. |
| IME format/style stale inheritance 위험 | 외부 최신 근거 | Lexical PR #8148 | current editor의 IME + native format menu real trace는 없다. |

## 후속 이슈화 대상

| 항목 | 왜 별도인가 |
| --- | --- |
| `format*`/`insertLink` beforeinput 차단 regression test | 완료. Controller fixture가 prevent/no-op과 keyboard shortcut command path 분리를 고정한다. |
| native formatting same-text DOM drift guardrail | 완료. `flush` changed=false path가 document patch 없이 canonical text DOM으로 복구한다. |
| iOS BIU/context menu 실기기 trace | 실제 event order, cancelability, focus/selection 변화는 desktop/jsdom으로 닫을 수 없다. |

## 현재 결론

2026년 기준 정석은 browser rich text DOM mutation을 좇아 model mark로 import하는 것이
아니다. Current editor의 좁은 설계에서는 native text input만 active text leaf buffer로
허용하고, mark는 command-owned structured model로만 변경한다. ProseMirror처럼 DOM mark
mutation을 mark step으로 변환하려면 schema-aware DOM parser, dirty range, selection
mapping, mutation observer epoch가 한 세트로 필요하다. 지금 editor에는 그 복잡성을
들이지 않고, native formatting은 prevent/no-op과 canonical reset guardrail로 다루는
쪽이 맞다.
