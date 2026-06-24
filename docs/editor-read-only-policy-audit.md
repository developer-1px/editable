# Editor Read-Only Policy Audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `BlockEditor readOnly`가 빼면 안 되는 React
surface 정책인지, 아니면 아직 제품 UX 결정인지 구분한다.

## 판정

`readOnly`는 headless `createEditor()` option이 아니라 React `BlockEditor`의 public
prop이다. 내부 input adapter에는 `readOnly` option이 있지만, 이것은 React boundary가
browser input을 command/selection result로 번역할 때 쓰는 hidden implementation detail이다.
현재 확정으로 말할 수 있는 정책은 "cursor/selection/copy는 유지하되 document mutation은
막는다"까지다.

## 확정 근거

| 경로 | 확정 동작 | 근거 |
| --- | --- | --- |
| React facade | `src/editor/react`가 `BlockEditor`와 `BlockEditorProps`를 public React surface로 노출한다. | `src/editor/react/index.ts` |
| public headless option surface | `CreateEditorOptions`는 `initial`, `history`, `selection`, `view`만 받는다. `readOnly`는 public headless option이 아니다. | `editorCore.ts`, `src/editor/public/index.ts` |
| internal input adapter guard | `translateEditorInput(..., { readOnly: true })`는 beforeinput/paste/delete/printable/mark/Tab mutation을 patch 없이 막고, Arrow movement와 Shift range extension은 selection result로 유지한다. | `inputAdapter.ts`, inputAdapter split tests |
| title input | `readOnly`일 때 title input은 `readOnly` 속성을 갖고 change handler도 document title을 바꾸지 않는다. | BlockEditor split tests read-only title/toolbar test |
| document surface | body는 `aria-readonly="true"`를 노출하되 focusable textbox surface는 유지한다. | `BlockEditor.tsx`, BlockEditor split tests |
| React-to-adapter wiring | `BlockEditor`는 `readOnly` prop을 `translateEditorInput` option으로 넘긴다. React title/body/DOM/paste/cut/toolbar guard와 내부 input adapter guard가 같은 policy를 구현한다. | `BlockEditor.tsx`, `inputAdapter.ts`, BlockEditor split tests |
| DOM/native edit recovery | read-only mode의 DOM input은 canonical document로 즉시 reset되고, editable 상태에서 read-only로 전환할 때 active native edit도 버린다. | BlockEditor split tests |
| copy/cut | copy는 선택 내용을 직렬화하고, cut은 clipboard data를 쓰되 document를 delete하지 않는다. | BlockEditor split tests |
| native range transition | read-only 전환 시 보이는 native range를 canonical copy selection으로 보존한다. | BlockEditor split tests |
| toolbar handlers | read-only 상태에서 Undo, Redo, Insert mention, Insert figure는 document를 mutate하지 않는다. | BlockEditor split tests read-only title/toolbar test |
| drop/history shortcuts | read-only 상태에서 drop payload와 keyboard/beforeinput history Undo/Redo는 document를 mutate하지 않는다. | BlockEditor split tests |
| composition reset | read-only 상태에서 composition start/end/input은 document를 mutate하지 않고 canonical view로 복구하거나 beforeinput을 막는다. | BlockEditor split tests |

이 범위는 삭제하면 현재 React integration 기준선이 깨진다.

## 증거 강도

| 강도 | 해당 항목 | 현재 의미 |
| --- | --- | --- |
| public interface 확정 | `BlockEditorProps.readOnly`, React facade export, headless `CreateEditorOptions`의 `readOnly` 부재 | caller가 실제로 배워야 하는 interface는 React prop 하나이고, headless editor option이 아니라는 점은 source export로 닫힌다. |
| 실행 테스트로 닫힘 | input adapter read-only translation, title/body aria-readonly, keyboard typing, beforeinput, DOM reset, paste, cut, drop, read-only 전환, native range copy, toolbar no-op, keyboard/beforeinput history Undo/Redo no-op, composition start/end/input reset | 현재 regression gate가 깨지면 바로 드러나는 mutation safety 기준선이다. |
| 제품/플랫폼 QA 미정 | real browser/OS IME matrix, assistive-tech announcement | jsdom integration은 React policy regression을 닫지만 실제 IME/AT 조합별 release QA까지 대체하지는 않는다. |

## 아직 애매한 것

| 주제 | 왜 애매한가 | 다음 결정 |
| --- | --- | --- |
| toolbar disabled affordance | 현재 toolbar button은 disabled로 렌더링되지 않고 click handler가 no-op이다. mutation safety는 확정이지만, 사용자가 disabled 상태를 시각적으로 보아야 하는지는 닫히지 않았다. | read-only UX를 disabled controls로 표현할지, 현재 focus-retaining no-op toolbar로 둘지 결정해야 한다. |
| headless read-only option | `createEditor()`에는 `readOnly` option이 없다. 현재 read-only는 React input boundary 정책이고, 내부 input adapter option은 public editor state owner가 아니다. | headless embedding caller도 read-only policy가 필요하면 `createEditor` option이나 command guard interface를 별도 설계해야 한다. |
| accessibility announcement | body는 `aria-readonly`를 노출하지만, 보조 기술별 announcement가 충분한지는 아직 실제 AT QA가 아니다. | visual/accessibility QA 범위와 같이 닫아야 한다. |
| real browser/OS IME matrix | read-only composition event path는 jsdom integration으로 닫혔지만, OS/browser IME별 event ordering은 실제 브라우저 matrix가 아니다. | release-critical mode로 승격하면 real-browser IME QA와 accessibility announcement QA를 추가한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `BlockEditorProps.readOnly` | 유지 확정 | React editor를 cursor-only/read-only로 쓰는 public prop이고, keyboard/DOM/paste/cut/toolbar 경로가 테스트로 닫혀 있다. |
| read-only toolbar handler guard | 유지 확정 | 버튼이 disabled가 아니어도 mutation safety를 보장하는 마지막 방어선이다. |
| toolbar disabled styling/API | 보류 | 현재 결함을 고치는 축소가 아니라 UX 표현 결정이다. |
| `createEditor({ readOnly })` | 보류 | headless interface에 아직 필요한 근거가 없다. 현재 요구는 React prop과 내부 input adapter option으로 해결되고 있다. |

## 현재 결론

read-only는 "없는 기능"이 아니다. React `BlockEditor` surface에서는 title, body,
keyboard, beforeinput, DOM recovery, paste, cut, drop, native range, toolbar,
history shortcut, composition event mutation 방지가 실행 테스트로 닫혀 있다. 내부
`translateEditorInput(..., { readOnly: true })`도 이 boundary를 받치는 확정
implementation이다. 다만 public headless `createEditor()` read-only option, toolbar
disabled affordance, 보조 기술별 announcement, real browser/OS IME matrix는 아직
제품/API/QA 결정으로 둔다.
