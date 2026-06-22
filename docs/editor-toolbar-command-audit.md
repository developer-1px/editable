# Editor toolbar command audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `EditorToolbar`와 `BlockEditor` toolbar handlers가
어디까지 확정 command bridge인지, 그리고 어디부터 toolbar UX/API 확장 결정인지
분리한다.

## 목적

Toolbar는 editor model command surface가 아니다. 하지만 React editor 안에서는
contenteditable native edit, IME composition, read-only guard, history, insertion command가
만나는 command bridge다.

이 문서는 toolbar를 public headless API나 full formatting toolbar로 키우지 않고,
현재 테스트로 닫힌 React toolbar behavior만 확정한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/react/EditorToolbar.tsx` | Undo, Redo, Insert mention, Insert figure 네 개 icon button과 accessible labels를 렌더링하고 mouse down focus steal을 막는다. |
| `src/editor/internal/react/BlockEditor.tsx` | toolbar handlers가 read-only guard, contenteditable flush, undo/redo, mention/figure insertion, focus restore를 담당한다. |
| `src/editor/internal/react/EditorToolbar.test.tsx` | fixed button set, accessible labels, hidden icons, callback wiring, mouse down focus-steal prevention을 검증한다. |
| `src/editor/internal/react/BlockEditor.test.tsx` | read-only toolbar no-op, composition UI state before toolbar command, native text flush before toolbar insertion, undo/redo through toolbar, mention/figure insertion을 검증한다. |
| `docs/editor-read-only-policy-audit.md` | read-only toolbar mutation guard는 확정이고 disabled affordance는 제품 UX 결정이라고 정리한다. |
| `docs/editor-history-grouping-audit.md` | undo/redo는 native edit flush 뒤 history operation으로 들어가며 grouping policy는 별도 확정/미정으로 나뉜다. |
| `docs/editor-style-surface-audit.md` | toolbar icon buttons, labels, focus-steal prevention은 확정이고 disabled styling은 보류라고 정리한다. |
| `docs/editor-static-assets-audit.md` | toolbar figure insert가 쓰는 `/sample-figure.svg`는 deterministic fixture asset이라고 정리한다. |

## 확정 toolbar behavior

| 항목 | 확정 내용 |
| --- | --- |
| toolbar role | toolbar root는 `role="toolbar"`와 `aria-label="Editor tools"`를 가진다. |
| button set | 현재 toolbar button은 Undo, Redo, Insert mention, Insert figure 네 개다. |
| accessible names | 각 button은 visible text 대신 `aria-label`로 command name을 제공하고 icon은 `aria-hidden`이다. |
| focus steal guard | toolbar button `onMouseDown`은 `preventDefault()`로 editor focus/selection을 뺏지 않게 한다. |
| insert mention | Insert mention은 active native edit을 flush한 뒤 `insertMention` command를 적용하고 label `Ada` mention fixture를 만든다. |
| insert figure | Insert figure는 active native edit을 flush한 뒤 `insertFigure` command를 적용하고 `/sample-figure.svg` figure fixture를 만든다. |
| native edit flush | toolbar insertion은 DOM text mutation을 먼저 canonical document로 flush한 뒤 삽입 위치를 계산한다. |
| composition transition | toolbar command는 IME composing UI state를 끝내고 custom caret overlay를 되살린 뒤 command를 적용한다. |
| undo/redo bridge | Undo/Redo handlers는 active native edit을 flush한 뒤 JSON document history undo/redo를 실행하고 editor focus를 복원한다. |
| read-only guard | read-only 상태에서 Undo, Redo, Insert mention, Insert figure는 document를 mutate하지 않는다. Undo/Redo는 focus만 되돌린다. |
| no headless toolbar API | toolbar는 React surface implementation이다. `createEditor()` public interface에는 toolbar concept이 없다. |

## 증거 강도

| 범위 | 판정 | 근거 |
| --- | --- | --- |
| toolbar component interface | 실행 테스트로 확정 | `EditorToolbar`의 interface는 네 callback `onUndo`, `onRedo`, `onInsertMention`, `onInsertFigure`뿐이다. 별도 document state나 command registry를 받지 않는다. |
| button set and accessible names | 실행 테스트로 확정 | `EditorToolbar.test.tsx`가 `role="toolbar"`, `aria-label="Editor tools"`, Undo/Redo/Insert mention/Insert figure button set, icon `aria-hidden`을 고정한다. |
| focus steal prevention | 실행 테스트로 확정 | `EditorToolbar.test.tsx`가 toolbar button `mouseDown`에서 `defaultPrevented`가 true임을 확인한다. |
| callback dispatch | 실행 테스트로 확정 | `EditorToolbar.test.tsx`가 네 button click이 각 callback을 한 번씩 호출함을 확인한다. |
| before-command native/composition flush | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 toolbar insertion 전에 active DOM text edit을 flush하고, IME composing UI state를 끝낸 뒤 command를 적용함을 확인한다. |
| insertion fixtures | 실행 테스트로 확정 | `BlockEditor` handlers는 mention label `Ada`와 `/sample-figure.svg` figure를 삽입하고, tests가 toolbar control로 mention/figure가 document에 들어감을 확인한다. 이것은 fixture insert contract이지 product picker contract가 아니다. |
| read-only mutation guard | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 read-only 상태에서 Undo/Redo/Insert mention/Insert figure를 눌러도 title/body/figure count가 mutate되지 않음을 확인한다. |
| undo/redo toolbar bridge | 실행 테스트로 확정 | title history와 blur-flushed native edit undo/redo tests가 toolbar Undo/Redo button path로 document history를 복원한다. |
| no public toolbar surface | facade/verifier로 확정 | React facade runtime export는 `BlockEditor`만이고, boundary verifier는 `EditorToolbar` 같은 internal React helper re-export를 violation으로 보고한다. Headless `createEditor()`에도 toolbar concept은 없다. |
| button enabled/disabled state | source behavior 확정, UX policy 미정 | 현재 button은 always clickable이고 handlers가 read-only에서 no-op 처리한다. `disabled`, `aria-disabled`, `canUndo`/`canRedo`, tooltip policy는 구현/테스트되어 있지 않다. |
| toolbar expansion | 미정 | link input, broad mark/list toolbar, mention/media picker, plugin/customization, assistive-tech state-change announcement는 현재 네 callback interface 밖의 제품/API/QA 결정이다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `EditorToolbar` component | 유지 확정 | icon-only command buttons and labels를 한 React component에 모아 `BlockEditor` wiring을 단순하게 유지한다. |
| toolbar handler read-only guard | 유지 확정 | disabled UI가 없어도 mutation safety를 보장하는 마지막 방어선이다. |
| toolbar before-command flush | 유지 확정 | native DOM edit이나 IME state 위에 toolbar command를 적용하면 canonical insertion position이 틀어진다. |
| focus steal prevention | 유지 확정 | toolbar click이 editor selection/focus를 잃게 만들면 command 대상 selection이 불안정해진다. |
| hardcoded mention/figure fixture insert | 유지 확정 | 현재 demo/editor surface에서 deterministic mention/figure insertion을 검증하는 fixture다. Product picker가 아니다. |
| public toolbar API | 보류 | toolbar는 React implementation detail이다. Headless caller는 `dispatch`/commands를 쓰면 된다. |
| link prompt button 추가 | 보류 | link command seam은 `pendingLinkHref`로 닫혔지만 URL 입력 UX와 legacy migration policy가 아직 없다. |
| mark/list formatting toolbar 확장 | 보류 | bold/italic/code/list/block type controls는 schema/command로 일부 가능하지만 toolbar UX, active state, shortcut parity가 아직 제품 결정이다. |
| disabled/enabled visual state | 보류 | read-only mutation safety는 확정이지만 disabled styling, `canUndo`/`canRedo` 기반 enablement, tooltips는 UX/accessibility 결정이다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| link input toolbar | `toggleLink` command는 pending href가 필요하지만 toolbar에는 href input/prompt가 없다. | URL 입력 UI를 만들지, host app이 `pendingLinkHref`를 넣게 둘지 mark/link policy와 함께 결정한다. |
| formatting toolbar scope | 현재 toolbar는 marks/list/block conversion controls를 제공하지 않는다. Command layer 일부는 있지만 active state, ordering, labels, shortcut parity UX는 없다. | rich formatting toolbar가 제품 범위가 되면 command, active query, layout, keyboard help를 함께 설계한다. |
| enabled/disabled state | buttons are always rendered clickable and handlers no-op when read-only. Undo/Redo availability or read-only disabled affordance is not visualized. | `canUndo`/`canRedo`, read-only disabled controls, tooltip/help policy를 UX/accessibility 기준으로 정한다. |
| fixture vs product insertion | mention label `Ada` and sample figure are deterministic fixtures, not a picker/upload flow. | product mention picker, asset upload, media trust policy가 필요하면 insertion payload and asset policy를 별도 설계한다. |
| toolbar customization/plugin | external toolbar slot or plugin command registration is absent. | custom editor embedding 요구가 생기면 React toolbar composition or command registry extension을 따로 설계한다. |
| assistive-tech command announcement | buttons have accessible names, but screen reader announcement of editor state changes after toolbar commands is not verified. | AT QA matrix가 필요하면 toolbar focus/selection announcement를 별도 확인한다. |

## 현재 결론

뺄 수 없는 확정은 toolbar의 네 callback interface, accessible icon buttons, focus
steal prevention, before-command native/composition flush, read-only mutation guard,
undo/redo focus restore다. 이 확정은 `EditorToolbar.test.tsx`의 button/interface
테스트와 `BlockEditor.test.tsx`의 command integration tests로 나뉘어 닫힌다.

아직 확정하면 안 되는 것은 link input toolbar, broad formatting toolbar, button
enabled/disabled state, mention/media picker, toolbar customization/plugin surface,
assistive-tech command announcement다. 현재 올바른 형태는 toolbar를 public headless
API로 키우지 않고 React `BlockEditor`의 command bridge로 유지하는 것이다.
