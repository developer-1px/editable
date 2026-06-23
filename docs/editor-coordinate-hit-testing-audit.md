# Editor coordinate hit testing audit

작성일: 2026-06-22

범위: 현재 커밋 기준. Mouse/touch/drop 좌표를 editor model cursor point로 바꾸는
fallback chain을 정리한다.

## 판정

현재 editor는 `caretPositionFromPoint`, `caretRangeFromPoint`, `elementFromPoint`를
primary authority로 쓰지 않는다.

현재 정석은 renderer가 노출한 `data-path`와 mounted DOM rect를 읽어
`CursorGeometry.pointFromCoordinates(x, y)` 하나로 수렴하는 것이다.

- pointer down, pointer drag, drop target은 모두 `CursorGeometry.pointFromCoordinates`
  를 호출한다.
- coordinate hit test는 browser DOM `Range` position을 그대로 model position으로
  믿지 않는다.
- mounted DOM을 읽을 수 없거나 valid cursor point로 수렴하지 못하면 `null`을
  반환한다.
- drop에서 `null`이면 observed/flush selection으로 fallback한다. Pointer selection은
  `null`이면 no-op이다.
- real browser `caretFromPoint` 계열 API matrix는 future browser QA 영역이다.

## ProseMirror-view 근거

| 근거 | 내용 | 우리 쪽 해석 |
| --- | --- | --- |
| `caretFromPoint` | Firefox throw, Chrome input offset clipping을 방어한다. | native caret API를 쓰면 browser-specific guard가 필요하다. |
| `posAtCoords` | caret API와 `elementFromPoint`를 결합하고, editor 밖 좌표는 editor bbox 내부 scan으로 fallback한다. | 좌표 API chain은 단일 browser primitive로 닫히지 않는다. |
| Safari/Gecko/WebKit 보정 | draggable, input offset, uneditable node click, `<br>` 뒤 위치를 별도 처리한다. | browser API 결과를 model position으로 바로 믿으면 깨진다. |
| `posFromCaret` | block 밖 클릭은 block bbox와 leaf bbox를 다시 검사한다. | native caret point 뒤에도 schema/layout 보정이 필요하다. |

근거:

- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/dom.ts#L145-L158
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domcoords.ts#L274-L329
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domcoords.ts#L289-L323
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domcoords.ts#L223-L253

## Current fallback chain

현재 구현은 native coordinate API chain이 아니라 app-owned geometry chain이다.

| 단계 | source | 결과 |
| --- | --- | --- |
| 1 | React pointer/drop event `clientX/clientY` | view adapter에 좌표 전달 |
| 2 | `CursorGeometry.pointFromCoordinates` | fresh `GeometryMap`을 mounted DOM에서 빌드 |
| 3 | figure rect와 text/block line rect 비교 | 가까운 block atom 또는 visual line 선택 |
| 4 | line fragment rect scan | x가 line 앞이면 first edge, 뒤면 last edge |
| 5 | atom fragment | midpoint 기준 before/after edge |
| 6 | text fragment | x 좌표를 visible text offset으로 변환 |
| 7 | invalid/missing DOM | `null` 반환 |

이 chain은 DOM API 결과가 아니라 renderer contract에 의존한다.

| renderer surface | 쓰임 |
| --- | --- |
| `data-path` | model cursor point path로 역매핑 |
| `.text-run` | text offset hit test와 caret rect source |
| `contenteditable=false` atom DOM | mention/figure before/after edge hit test |
| block rect | line/figure fallback, empty block rect source |
| current `getBoundingClientRect()` | scroll 후 viewport 좌표 재계산 |

## Call site policy

| Call site | current behavior |
| --- | --- |
| single pointer down | point가 있으면 normalized caret/range/block/word selection을 만든다. `null`이면 no-op. |
| pointer drag | point가 있으면 drag anchor부터 current focus까지 range를 만든다. `null`이면 no-op. |
| drop | point가 있으면 drop point selection을 만들고, `null`이면 flushed/current selection fallback을 쓴다. |
| context menu | current editor는 context menu coordinate mapping path를 별도로 갖지 않는다. |
| touch selection handles | current editor는 native mobile touch handle coordinate mapping을 닫지 않았다. |

## Browser fixture split

| Fixture class | 현재 위치 | 의미 |
| --- | --- | --- |
| jsdom geometry fixtures | cursorGeometry split tests | data-path/rect 기반 app-owned geometry contract |
| React pointer/drop fixtures | BlockEditor split tests | call site가 같은 geometry adapter를 쓰는지 검증 |
| Playwright browser fixtures | future | actual `caretPositionFromPoint`/`caretRangeFromPoint`/`elementFromPoint` matrix |
| manual device fixtures | future | touch/pen, mobile viewport, virtual keyboard, OS text selection handles |

## Native API 도입 조건

현재는 native coordinate API를 쓰지 않는다. 도입하려면 아래 순서와 guard를 함께
설계해야 한다.

| 순서 | API | guard |
| --- | --- | --- |
| 1 | `document.caretPositionFromPoint` | Firefox throw, offsetNode containment, text/input offset clipping |
| 2 | `document.caretRangeFromPoint` | WebKit/legacy null, collapsed range containment |
| 3 | `document.elementFromPoint` | editor root containment, uneditable atom, shadow/root boundary |
| 4 | app rect scan | model path surface로 nearest valid cursor point 재검증 |

Native API 결과는 최종 답이 아니라 candidate다. Candidate는 반드시 editor root,
renderer `data-path`, model cursor validity를 통과해야 한다.

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| shared coordinate adapter | 확정 | pointer down, drag, drop call sites가 `geometry.pointFromCoordinates`를 쓴다. | context menu/touch native handles는 current path가 없다. |
| app-owned rect scan | 확정 | `createDOMCursorGeometry`는 native caret API를 호출하지 않고 `GeometryMap` rect와 `data-path`를 읽는다. | 실제 browser pixel parity는 아니다. |
| nearest/null behavior | 확정 | cursorGeometry split tests가 nearest valid point, scroll 후 current rect, invalid DOM null을 검증한다. | Safari/Firefox coordinate API matrix는 별도 검증이 필요하다. |
| atom/text/block coordinate mapping | 확정 | mention/figure/text/code/empty block geometry tests와 React pointer tests가 있다. | Table, nested custom node, shadow DOM은 current schema 밖이다. |
| native API fallback chain | 미정 | ProseMirror source는 근거지만 current editor가 쓰는 path가 아니다. | 도입 시 Playwright/device matrix가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `CursorGeometry.pointFromCoordinates` | 유지 확정 | pointer/drag/drop coordinate knowledge를 React handler 밖으로 숨기는 view adapter다. |
| native `caretFromPoint` primary path | 보류 | browser-specific guard가 많고 current renderer path surface만으로 model point를 계산할 수 있다. |
| `elementFromPoint` fallback 선구현 | 보류 | real browser miss case 없이 추가하면 두 번째 authority가 생긴다. |
| pointer/drag/drop별 coordinate logic 복제 | 제거 확정 | 같은 좌표->point 규칙을 써야 selection/drop이 갈라지지 않는다. |
| table/custom node coordinate fixture | 보류 | current schema에 table/custom nested node가 없다. |

## 현재 결론

현재 editor의 coordinate hit testing은 native caret API fallback chain이 아니라
app-owned geometry adapter chain이다. Browser API fallback은 ProseMirror가 보여주듯
필요할 수 있지만, 도입하려면 candidate 검증과 Playwright/device matrix를 같이 가져와야
한다. 지금은 `pointFromCoordinates`를 단일 internal seam으로 유지하고, 실패는
call site별 no-op 또는 selection fallback으로 닫는다.
