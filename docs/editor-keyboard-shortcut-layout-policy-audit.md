# Editor Keyboard Shortcut Layout Policy Audit

작성일: 2026-06-22

범위: keyboard shortcut 판별 기준, modifier exact match, Dvorak/AltGraph/Option,
macOS Ctrl navigation, IME active 상태에서 command가 잘못 발동하는 실패 모드를
정리한다. `beforeinput`의 edit intent 정책은
`docs/editor-beforeinput-policy-audit.md`를, keyboard ownership gate는
`docs/editor-keyboard-input-policy-audit.md`를 기준으로 삼는다.

## 판정

shortcut 판별은 "물리 키"가 아니라 "사용자가 입력한 semantic key"를 기본으로 한다.

- 문자 shortcut은 `KeyboardEvent.key`를 기준으로 matching한다. `KeyboardEvent.code`는
  physical key 위치라서 Dvorak 같은 layout에서 command를 오발동시킬 수 있으므로
  runtime authority가 아니라 trace/debug evidence다.
- editor-owned shortcut은 exact modifier matching만 허용한다. 필요한 modifier가
  빠지거나, `Shift`/`Alt`/반대 platform modifier가 추가되면 같은 command로 보지 않는다.
- `beforeinput.inputType`은 shortcut matcher가 아니다. `historyUndo`,
  `insertParagraph`, `insertCompositionText` 같은 semantic edit intent를 분류하는 보조
  signal이다.
- IME composition을 내부 phase가 소유하는 동안 formatting, markdown, mention, history,
  clipboard keymap mutation은 command로 실행하지 않는다. Plain Enter는 composition
  confirmation signal로 저장하고 final commit 뒤 paragraph split으로 지연 실행한다.
- macOS의 `Ctrl+B/F/P/N`은 formatting shortcut이 아니라 text navigation shortcut으로
  본다.

## 현재 코드 판정

| 경로 | 현재 동작 | 판정 |
| --- | --- | --- |
| `src/editor/internal/model/platformModifier.ts` | macOS `Meta`, non-mac `Control`, exact `Shift`, `AltGraph`, macOS Ctrl navigation modifier를 한 helper에서 판정한다. | platform primary와 exact modifier 기준을 runtime 공통 정책으로 닫았다. |
| `src/editor/internal/view/editorKeymap.ts` | copy/cut/paste/undo/redo는 `event.key.toLowerCase()`와 platform-aware exact primary modifier로 matching한다. `code`는 받되 command authority로 쓰지 않는다. | Dvorak/extra modifier/opposite-primary 기준이 맞다. |
| `src/editor/internal/view/editorKeyboardPolicy.ts` | movement/editing key, platform primary command, macOS `Ctrl+B/F/P/N`, Alt-only movement/editing만 headless-owned로 잡고 unsupported shortcut은 pass-through한다. | browser/system shortcut을 전부 빼앗지 않으면서 native editing mutation은 차단한다. |
| `src/editor/internal/model/input-adapter/inputAdapter.ts` | select-all, mark, link, line/document movement가 platform-aware primary modifier를 사용한다. macOS `Ctrl+B/F/P/N`은 navigation으로 분리한다. | Windows/Linux Ctrl과 macOS Meta를 한 bucket으로 보던 drift를 해소했다. |
| `src/editor/internal/react/block-editor/useBlockEditorController.tsx` | internal composition phase가 keydown을 소유하면 keymap보다 먼저 prevent하고 return한다. | IME active shortcut suppression은 맞다. |
| debug trace | `key`, `code`, `keyCode`, modifier, `isComposing`, `inputType`을 남긴다. | `code`와 legacy signal은 evidence로만 남기는 방향이 맞다. |

## Shortcut Matching Rules

| 항목 | 규칙 | 이유 |
| --- | --- | --- |
| 문자 command key | `event.key`를 case-insensitive로 비교한다. | layout 사용자의 의도를 따른다. Dvorak에서 physical QWERTY 위치를 command로 오인하지 않는다. |
| physical key | `event.code`는 debug trace와 future non-ASCII fallback evidence로만 쓴다. | `code`는 physical key 위치이므로 command authority가 되면 layout별 오발동이 생긴다. |
| primary modifier | macOS는 `Meta`, Windows/Linux는 `Control`을 command primary로 본다. | macOS `Control`은 text navigation/OS convention과 충돌한다. |
| exact modifier | command별 허용 modifier set이 정확히 같아야 한다. | `Shift+Cmd+B`가 `Cmd+B`로 실행되는 식의 overmatching을 막는다. |
| Alt/Option | formatting/history/clipboard command와 함께 있으면 command가 아니다. Arrow/Delete 계열의 word/block movement만 별도 command로 인정한다. | Option dead key, word navigation, browser/system shortcut과 충돌하지 않게 한다. |
| AltGraph | `AltGraph` 또는 `Ctrl+Alt` printable path는 text input/OS-owned로 둔다. | 국제 keyboard layout의 문자 입력을 Ctrl shortcut으로 오인하지 않는다. |
| Shift | selection extension, redo, uppercase text처럼 command가 명시한 경우에만 의미를 둔다. | inexact matching을 금지한다. |
| `beforeinput.inputType` | shortcut matching에 쓰지 않고 edit intent routing에만 쓴다. | keyboard layout과 beforeinput은 책임이 다르다. |

## IME Active Shortcut Rules

| 상태 | 허용 | 금지 |
| --- | --- | --- |
| internal composition phase active | composition text update, final commit normalize, recorded plain Enter split intent | bold/italic/code/link, markdown shortcut, mention shortcut, undo/redo, copy/cut mutation |
| `KeyboardEvent.isComposing === true` | runtime phase 보조 신호와 trace evidence | 이 값 하나만으로 command success/failure를 결정 |
| `keyCode === 229` | Safari/WebKit류 Enter confirmation trace marker | primary command suppression 조건으로 단독 사용 |
| `beforeinput insertCompositionText` | native active text leaf buffer/reconcile | preventDefault 기반 command mutation |
| final `insertText`/`insertFromComposition` | composition commit candidate | standalone text insert로 즉시 확정 |

## Trace Scenarios

| scenario | event shape | 기대 |
| --- | --- | --- |
| QWERTY primary bold | `key="b"`, platform primary modifier only | mark command 실행. `Shift`/`Alt`/반대 primary modifier가 추가되면 실행하지 않는다. |
| Dvorak paste/formatting | `key`는 사용자 layout의 문자, `code`는 physical QWERTY 위치 | command는 `key`를 따른다. `code=KeyV`만 보고 paste/formatting을 실행하지 않는다. |
| Korean IME composition | `compositionstart`, `insertCompositionText`, `isComposing`, optional `keyCode=229` | normal shortcut command는 억제하고 active leaf flush/commit으로만 model update한다. |
| Korean IME Enter confirmation | `compositionend` 뒤 `keydown Enter keyCode=229`와 final `insertText` | Enter가 즉시 split되지 않고 final commit 뒤 지연 split된다. |
| macOS Ctrl navigation | `ctrlKey=true`, `key=b/f/p/n`, `metaKey=false` | ArrowLeft/Right/Up/Down에 준하는 navigation으로 처리한다. |
| AltGraph printable | `ctrlKey=true`, `altKey=true`, printable `key` 또는 `AltGraph` modifier | editor shortcut이 아니라 text/OS-owned input으로 둔다. |
| Option word movement | `altKey=true`, `key=ArrowLeft/ArrowRight` | word movement command. `altKey=true` + printable/dead key는 command가 아니다. |

## Conflict Cases

| 사례 | 충돌 | 정책 |
| --- | --- | --- |
| Dvorak `Ctrl+V` | physical `code` 기준이면 paste 대신 punctuation shortcut이 실행될 수 있다. | 문자 shortcut은 `key` 기준. |
| `Shift+Cmd+B` | inexact matching이면 bold가 실행된다. | exact modifier matching. |
| macOS `Ctrl+B/F/P/N` | text navigation convention과 formatting shortcut이 충돌한다. | macOS Ctrl 계열은 navigation으로 분리. |
| AltGraph text input | `Ctrl+Alt`가 Ctrl shortcut으로 오인될 수 있다. | Alt/AltGraph가 있으면 formatting/history/clipboard command 금지. |
| Option dead key | accent/dead-key 입력이 Alt shortcut으로 오인될 수 있다. | printable/dead/process key는 native text input path. |
| IME active history | composing 중 undo/redo가 preedit text와 document history를 동시에 건드릴 수 있다. | internal composition phase에서 history shortcut과 `historyUndo/Redo`를 ignore. |
| browser native clipboard | keydown paste와 paste event를 둘 다 삽입 authority로 쓰면 중복 삽입된다. | paste keymap은 pass-through하고 paste/beforeinput transfer reader가 처리. |
| compositionend 직후 keydown | `isComposing=false`만 보고 Enter/shortcut을 실행하면 final commit 전에 command가 먹는다. | internal phase와 awaiting commit을 우선한다. |

## 외부 근거

| 근거 | 관찰 | 적용 |
| --- | --- | --- |
| Lexical changelog: https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | Dvorak shortcut compatibility, exact modifier matching, number key fallback, Enter command matching, composition shortcut 관련 수정이 반복된다. | shortcut matcher는 layout, modifier, composition을 한 함수에서 엄격히 다뤄야 한다. |
| Lexical PR #8260: https://github.com/facebook/lexical/pull/8260 | `event.code` 기반 playground shortcut이 Dvorak에서 physical key를 잘못 command로 해석했다. | `event.key`를 primary로 쓴다. |
| Lexical PR #7443: https://github.com/facebook/lexical/pull/7443 | built-in shortcut이 extra modifier를 허용해 `Shift+Cmd+B`가 bold로 오발동했다. | exact modifier matching을 정책으로 둔다. |
| ProseMirror-view changelog: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | macOS `ctrl-b/f/p/n`을 arrow key press처럼 처리하고, compositionend 직후 keydown 및 composition Enter 오판을 반복 수정했다. | macOS Ctrl navigation과 IME awaiting commit은 별도 branch여야 한다. |
| UI Events: https://www.w3.org/TR/uievents/ | `key`는 key value, `code`는 physical key code이고 `isComposing`, `getModifierState`, legacy `keyCode`가 별도 signal로 존재한다. | runtime authority와 debug evidence를 분리한다. |
| Input Events Level 2: https://www.w3.org/TR/input-events-2/ | `beforeinput`은 inputType별 edit intent를 제공하고 composition 중 `insertCompositionText`는 별도 ordering/cancelability를 가진다. | shortcut matching은 keydown, edit intent는 beforeinput으로 분리한다. |

## 현재 Drift

| drift | 영향 | 처리 |
| --- | --- | --- |
| platform primary modifier 미분리 | macOS에서 `Ctrl+B/I/E/K`가 formatting command로 실행될 수 있고, Windows/Linux에서 `Meta` shortcut을 editor command로 오인할 수 있었다. | #68에서 해소. `platformModifier` helper, keymap, ownership gate, input adapter가 같은 기준을 사용한다. |
| macOS `Ctrl+B/F/P/N` 미구현 | ProseMirror가 arrow-equivalent로 다루는 navigation shortcut이 editor movement로 흡수되지 않았다. | #68에서 해소. macOS Ctrl navigation은 formatting보다 먼저 navigation으로 처리한다. |
| `getModifierState("AltGraph")` 미노출 | `altKey`로 대부분 차단되지만 browser/layout별 AltGraph path를 직접 판정하지 못했다. | #68에서 keydown adapter/keymap/policy 입력으로 노출하고 command 오발동 방지 테스트를 추가했다. |
| non-ASCII shortcut fallback 없음 | 현재 editor에는 heading 숫자/locale punctuation shortcut이 없어 당장 필요하지 않다. | future shortcut helper에서만 추가한다. |

## 증거 강도

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| `event.key` primary policy | 외부 사례와 local source로 확정 | Lexical #8260, UI Events key/code 정의, current `editorKeymap.ts` |
| exact modifier matching | 외부 사례와 local source로 확정 | Lexical #7443, `platformModifier.ts`, `editorKeymap.test.ts`, inputAdapter split tests |
| IME active shortcut suppression | 실행 테스트로 확정 | `useBlockEditorController.handleKeyDown`, BlockEditor split tests, `editor-ime-signal-policy-audit.md` |
| paste keymap pass-through | 실행 테스트로 확정 | BlockEditor split tests의 paste keymap test와 clipboard transfer policy |
| macOS Ctrl navigation | 외부 근거와 local 실행 테스트로 확정 | ProseMirror changelog, inputAdapter split tests, `editorKeyboardPolicy.test.ts` |
| AltGraph/Option printable policy | 정책 확정 / real-browser layout matrix 미정 | helper와 local tests로 command 오발동은 차단. AltGraph real-browser matrix는 manual/browser trace 필요 |
| QWERTY/Dvorak/Korean IME/macOS Ctrl scenario | 조사 fixture spec 확정 | 이 문서의 trace scenarios. Dvorak/macOS Ctrl은 real OS/browser trace가 아직 없다 |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| physical `event.code` shortcut registry | 제거/금지 | layout 사용자의 의도와 분리되어 Dvorak류 오발동을 만든다. |
| `beforeinput` shortcut matcher | 제거/금지 | beforeinput은 edit intent signal이지 keyboard shortcut identity가 아니다. |
| exact shortcut helper | 유지/도입 후보 | key, modifier, platform, AltGraph를 한 곳에서 닫아야 drifting if문이 생기지 않는다. |
| global hotkey registry | 보류 | 현재 문제는 editor correctness다. app shell command가 생기기 전에는 과잉 구조다. |
| platform-aware primary modifier | 도입 필요 | macOS Ctrl navigation과 Windows/Linux Ctrl command를 같은 bool로 합치면 장기적으로 유지할 수 없다. |

## 결론

2026년 기준 정석은 `event.key` semantic matching, exact modifier matching, platform-aware
primary modifier, IME internal phase 우선, `beforeinput` edit intent 분리다. 현재 editor는
`event.key`, exact modifier, platform-aware primary modifier, macOS Ctrl navigation,
AltGraph command 차단, composition guard, paste pass-through를 같은 정책 축으로 맞췄다.
