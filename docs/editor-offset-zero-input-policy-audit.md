# Editor offset zero input policy audit

작성일: 2026-06-22

범위: text node 시작 위치, mark/link 뒤의 다음 text node 시작, mention 뒤, block 시작
위치에서 `beforeinput`/`input`과 native contenteditable buffer를 어떻게 다룰지 정리한다.

## 목적

`offset === 0`은 편집 정책이 아니다. 같은 숫자 0이라도 다음 중 하나일 수 있다.

- paragraph 첫 text leaf의 시작
- bold/link 같은 inline mark 뒤에 놓인 다음 text leaf의 시작
- `contenteditable=false` mention 뒤에 놓인 다음 text leaf의 시작
- block element child boundary가 다음 text leaf 시작으로 수렴된 위치
- atom 내부 또는 atom/block edge처럼 text leaf가 아닌 위치

정책은 offset 값이 아니라 DOM position이 canonical text leaf로 수렴되는지로 결정한다.

## 외부 근거

| 근거 | 내용 | 결론 |
| --- | --- | --- |
| Slate #5603: https://github.com/ianstormtaylor/slate/issues/5603 | contenteditable 시작 offset 0에서 typing할 때 `onInput`이 발생하지 않았고, 원인은 native `insertText` 판별에서 offset 0을 제외해 `preventDefault()`가 호출된 흐름이었다. | offset 0을 native insertText 제외 조건으로 쓰면 browser `input` event를 죽일 수 있다. |
| Slate #5603 inline/link 조건 | issue는 inline element/link 뒤 다음 node 시작 위치를 재현 조건으로 설명한다. | mark/link boundary 뒤 text leaf 시작은 별도 fixture로 고정해야 한다. |
| ProseMirror-view changelog: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | widget 앞 Backspace, link/non-inclusive mark 주변 composition, line start/end cursor wrapper, mark boundary composition 수정이 반복된다. | mature editor도 DOM boundary와 composition/start 위치를 계속 bug surface로 본다. |

## 현재 정책

| 상황 | DOM -> model 수렴 | native `insertText` | preventDefault 정책 |
| --- | --- | --- | --- |
| paragraph 첫 text node offset 0 | text path offset 0 | 허용 | 하지 않음. browser mutation 후 leaf flush |
| mark wrapper 내부 offset 0 | wrapper의 text-run path offset 0 | 허용 | 하지 않음 |
| bold/link 뒤 다음 text leaf offset 0 | 다음 text path offset 0 | 허용 | 하지 않음 |
| mention 뒤 다음 text leaf offset 0 | 다음 text path offset 0 | 허용 | 하지 않음 |
| block element child boundary before first text | 첫 text path offset 0 | 허용 | 하지 않음 |
| `contenteditable=false` atom 내부 | text point 없음 | 차단 | command/headless path |
| atom 앞뒤 edge selection | text leaf가 아니면 edge cursor | 차단 | command/headless path |
| active marks가 selection state에 있음 | text leaf여도 mark 생성은 command 소유 | 차단 | command/headless path |
| non-collapsed text range | replacement command가 범위 소유 | 차단 | command/headless path |

핵심 규칙: `planBeforeInput`은 `textPointFromDOMSelection` 또는 canonical selection에서
text leaf point를 얻었을 때만 native text mutation을 허용한다. Offset 0 자체는
허용/차단 조건이 아니다.

## DOM selection 변환 규칙

| DOM 입력 | canonical cursor |
| --- | --- |
| text node start | 같은 `.text-run[data-path]` offset 0 |
| mark/link element child boundary | mark/link를 감싼 text-run의 start/end |
| parent block child boundary before first text-run | 다음 text-run offset 0 |
| parent block child boundary after text-run | 이전 text-run end |
| parent block child boundary after atom and before text-run | 다음 text-run offset 0 |
| `contenteditable=false` 내부 | `null` |

이 규칙은 `docs/editor-dom-position-equivalence-audit.md`의 immediate sibling equivalence와
같다. Atom을 건너 반대편 text로 임의 수렴하지 않고, 실제 next sibling text-run이 있을
때만 text leaf 시작으로 본다.

## Trace fixture matrix

현재 자동화 가능한 증거는 real browser recording이 아니라 view adapter classification
fixture다. Browser별 `beforeinput`/`input` event order는 debug recorder나 device trace로
별도 수집한다.

| fixture | 자동화 | 기대 |
| --- | --- | --- |
| paragraph start | contentEditable view split tests | offset 0 `insertText`는 `deferToContentEditable` |
| mark boundary | contentEditable view split tests | bold 뒤 다음 text leaf offset 0은 native 허용 |
| link 뒤 | contentEditable view split tests | link 뒤 다음 text leaf offset 0은 native 허용 |
| mention 뒤 | contentEditable view split tests | mention 뒤 다음 text leaf offset 0은 native 허용 |
| mention 내부 | contentEditable view split tests | `contenteditable=false` 내부는 `runHeadless` |
| block start | contentEditable view split tests | block child boundary before first text는 native 허용 |
| real browser event trace | manual/debug recorder | `beforeinput insertText`를 막지 않아 뒤따르는 `input`/DOM mutation을 관찰해야 함 |

## Slate #5603 회귀 fixture

Fixture id: `offset-zero-insert-after-inline-boundary`

```text
Plain [bold Bold] AfterBold [link Link] AfterLink [mention Ada] AfterMention
```

검증:

1. caret을 `AfterBold`, `AfterLink`, `AfterMention` text leaf의 offset 0에 둔다.
2. `beforeinput insertText data="x"`를 분류한다.
3. 기대값은 `deferToContentEditable`이다.
4. `preventDefault()`를 호출하는 command/headless path로 떨어지면 실패다.

반대로 caret이 mention chip 내부에 있으면 text leaf가 아니므로 `runHeadless`가 맞다.

## 추가 브라우저 trace 기준

Real browser trace를 수집할 때 기록할 필드는 아래로 제한한다.

| 필드 | 이유 |
| --- | --- |
| `beforeinput.inputType`, `data`, `cancelable`, `isComposing` | intent와 cancelability 확인 |
| `input.inputType`, `data`, `isComposing` | Slate #5603과 같은 input 누락 확인 |
| native selection anchor/focus node label과 offset | offset 0이 실제 어떤 DOM surface였는지 확인 |
| canonical selection path/offset | DOM -> model 변환 일치 확인 |
| text-run `textContent` before/after | native leaf buffer flush 가능 여부 확인 |

Full DOM JSON은 필요 없다. 이 이슈의 핵심은 event 존재, leaf identity, canonical point다.

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| offset 0 native 허용 정책 | 확정 | `contentEditableViewEngine.planBeforeInput`과 offset-zero boundary fixture | real browser event order는 debug trace가 보강해야 한다. |
| mark/link 뒤 text 시작 수렴 | 실행 테스트로 확정 | bold/link 뒤 다음 text-run offset 0 fixture | browser가 DOM selection을 다른 equivalent position으로 둘 수 있어 equivalence table 유지가 필요하다. |
| mention 뒤 text 시작 수렴 | 실행 테스트로 확정 | mention 뒤 다음 text-run offset 0 fixture | mention 내부나 atom-only boundary는 text leaf가 아니므로 별도 command path다. |
| block start 수렴 | 실행 테스트로 확정 | block child boundary before first text fixture | empty block/void block UX는 cursor geometry와 block command fixture가 따로 맡는다. |
| Slate #5603 유사 회귀 방지 | fixture spec 확정 | offset 0을 native 제외 조건으로 쓰지 않는 테스트 | Slate issue의 browser event 누락 자체는 local jsdom으로 재현하지 않는다. |

## 현재 결론

Offset 0은 위험 신호지만 금지 조건이 아니다. 정석은 DOM position을 renderer-owned
text-run surface로 먼저 canonicalize하고, 그 결과가 editable text leaf이면 native
contenteditable buffer를 허용하는 것이다. `preventDefault()`는 text leaf가 아닌
selection/range/atom/block command ownership에서만 호출해야 한다.
