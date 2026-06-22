# Editor scroll and focus policy audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. Selection/caret을 보이게 하기 위한 scroll reveal과,
editor focus가 page scroll을 튀게 만드는 문제를 분리한다.

## 판정

현재 editor는 scroll reveal과 focus scroll 보존을 같은 기능으로 합치지 않는다.

- caret/selection visibility는 `scrollContentEditableSelectionIntoView`가 담당한다.
- focus side effect 보존은 `focusElementPreservingScroll`이 담당한다.
- focus helper는 editor 주변 ancestor scroll positions를 저장하고, focus 후 복원한다.
- scroll reveal은 current mounted DOM target에 `scrollIntoView({ block: "nearest", inline:
  "nearest" })`를 호출한다. `visualViewport`가 있으면 caret/target rect bottom이
  `visualViewport.offsetTop + visualViewport.height` 아래로 내려간 경우 page scroll을
  추가 보정한다.
- ProseMirror 수준의 full scroll parent stack, fixed/sticky stop, transform scale 보정,
  mobile virtual keyboard policy는 아직 current contract가 아니다.

## ProseMirror-view 근거

| 근거 | 내용 | 우리 쪽 해석 |
| --- | --- | --- |
| `scrollRectIntoView` | editor부터 상위 scroll parent를 타고 올라가며 fixed/sticky에서 멈추고 absolute는 offsetParent로 이동한다. | nested/fixed/sticky/absolute layout을 직접 계산하려면 DOM stack walker가 필요하다. |
| `storeScrollPos` / `resetScrollPos` | editor 주변 scroll stack과 기준 DOM top을 저장해 layout 변화 뒤 viewport를 복원한다. | focus나 DOM mutation이 scroll을 움직이는 경우 restore가 필요하다. |
| `focusPreventScroll` | `focus({ preventScroll: true })` 지원을 feature-detect하고, 미지원이면 scroll stack을 복원한다. | focus와 caret reveal은 별도 phase여야 한다. |
| focus event delay | focus event 뒤 20ms 지연으로 DOM selection을 다시 맞춘다. | focus 직후 browser가 selection을 덮는 race는 별도 browser matrix가 필요하다. |

근거:

- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domcoords.ts#L32-L67
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domcoords.ts#L69-L120
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domcoords.ts#L122-L140
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/input.ts#L780-L790

## Current policy

| 상황 | 담당 | current behavior |
| --- | --- | --- |
| initial autofocus | focus preserve | `focusElementPreservingScroll(root)`로 editor focus를 잡고 ancestor scroll을 복원한다. |
| toolbar command focus restore | focus preserve | plain `focus()`를 쓰지 않고 같은 helper를 쓴다. |
| atom pointer selection focus restore | focus preserve | atom click 후 native selection을 비우고 helper로 editor focus를 복원한다. |
| keyboard movement reveal | scroll reveal | selection reveal key가 바뀌면 focused selection target에 `scrollIntoView(nearest)`를 호출한다. |
| native caret restore | selection bridge | canonical point를 native collapsed range로 복원한다. |
| nested scroll container | focus preserve는 실행 fixture 있음 | helper test가 nested parent scrollTop/scrollLeft를 focus 후 복원한다. |
| fixed/sticky/absolute parent | 미정 | full scrollRect stack 계산을 current code로 닫지 않는다. |
| transform/zoom scale | 미정 | geometry adapter와 browser QA 영역이다. |
| mobile viewport/virtual keyboard | 부분 확정 | `visualViewport`가 있으면 focused selection rect bottom 기준으로 page scroll을 보정한다. 실기기 키보드 trace는 별도다. |

## Focus preserve와 caret visibility 분리

| Phase | 해야 할 일 | 하지 않는 일 |
| --- | --- | --- |
| focus preserve | editor focus를 얻고 focus 때문에 바뀐 ancestor scroll position을 되돌린다. | caret을 보이게 하려고 scroll하지 않는다. |
| native selection restore | canonical cursor point를 DOM Range로 복원한다. | page/container scroll 정책을 직접 계산하지 않는다. |
| caret reveal | 이미 focused editor에서 selection target을 nearest scroll로 보이게 한다. | focus side effect 보존을 대신하지 않는다. |

이 분리는 중요하다. focus가 page를 움직였는지와 caret이 화면 밖에 있는지는 다른 문제다.
둘을 한 함수로 합치면 toolbar/atom click처럼 focus만 복원해야 하는 경로에서 불필요한
scroll reveal이 발생한다.

## Fixture policy

| fixture | 상태 | 기대 |
| --- | --- | --- |
| nested focus scroll restore | 실행 테스트 있음 | focus가 outer/inner scrollTop/scrollLeft를 바꿔도 helper가 원래 값을 복원한다. |
| unsupported focus options | 실행 테스트 있음 | `focus({ preventScroll: true })`가 throw하면 plain focus로 fallback한다. |
| selection scroll reveal | 실행 테스트 있음 | focused selection target에 `scrollIntoView({ block: "nearest", inline: "nearest" })`를 호출한다. |
| route autofocus | React 테스트 있음 | 첫 render에서 editor가 focus되고 caret overlay가 보인다. |
| mobile keyboard occlusion | 실행 테스트 있음 / 실기기 미검증 | `visualViewport` stub으로 occluded focused selection rect 보정을 검증한다. 실제 keyboard resize trace는 별도다. |
| fixed/sticky scroll stack | future/browser | real layout engine과 `getComputedStyle`/rect fixture가 필요하다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| focus scroll preservation | 실행 테스트로 확정 | `focusScroll.test.ts`가 nested scroll restore와 focus options fallback을 고정한다. | jsdom fixture라 실제 browser scroll anchoring/viewport behavior 전체는 아니다. |
| autofocus/focus restore helper 사용 | source와 React tests로 확인 | `useBlockEditorController`가 autofocus, toolbar command focus, atom pointer focus에서 helper를 쓴다. | 모든 future focus caller를 막으려면 lint/AST guard가 더 강하다. |
| selection scroll reveal | 실행 테스트로 확정 | `contentEditableViewEngine.test.ts`와 `BlockEditor.test.tsx`가 `scrollIntoView(nearest)` 호출을 고정한다. | nested/fixed/sticky scrollRect 계산은 아니다. |
| desktop nested scroll container | 부분 확정 | focus restore fixture는 nested scroll container를 닫는다. | caret reveal의 nested parent stack은 browser native `scrollIntoView`에 맡긴다. |
| mobile viewport/keyboard | 부분 확정 | visualViewport stub fixture가 focused selection rect bottom 보정을 고정한다. | 실제 iOS/Android virtual keyboard resize와 scroll anchoring은 별도 device trace가 필요하다. |
| transform/zoom/fixed/sticky | 미정 | current geometry docs/tests가 일부 layout rect를 다루지만 scroll parent stack policy는 아니다. | #24와 함께 browser layout fixture가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `focusElementPreservingScroll` | 유지 확정 | focus side effect 보존을 React handler마다 반복하지 않고 한 view helper로 숨긴다. |
| plain `focus()` in editor handlers | 제거 확정 | page/container scroll jump를 만들 수 있다. |
| `scrollIntoView(nearest)` reveal | 유지 확정 | current mounted DOM에서 selection target visibility를 browser primitive에 맡기는 작은 contract다. |
| ProseMirror full `scrollRectIntoView` clone | 보류 | fixed/sticky/absolute/transform/mobile layout matrix 없이 구현하면 추측성 코드가 된다. |
| mobile keyboard compensation | 부분 구현 | visualViewport bottom 아래 caret/target rect만 page scroll로 보정한다. safe-area, keyboard inset, scroll anchoring trace는 별도다. |
| timed focus reselection delay | 보류 | 현재 React/native selection tests가 요구하지 않는다. 실제 focus race trace가 있을 때 추가한다. |

## 현재 결론

현재 정석은 focus와 reveal을 분리하는 것이다. Focus는 scroll을 보존하고, reveal은
selection target을 보이게 한다. Current reveal은 native `scrollIntoView(nearest)`를
유지하면서 `visualViewport`가 있을 때 keyboard occlusion으로 보이는 viewport 아래에
있는 focused selection rect만 page scroll로 보정한다. Full scroll parent stack 계산,
safe-area/keyboard inset, fixed/sticky/transform layout 대응은 실제 browser trace와
제품 지원 matrix가 생길 때 별도 adapter로 확장한다.
