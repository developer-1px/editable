# Editor Test Environment Policy Audit

작성일: 2026-06-22

범위: contenteditable 입력 결함을 pure model test, jsdom component/replay,
Playwright browser gate, 실제 기기 수동 trace 중 어디에서 검증할지 분류한다.

## 판정

jsdom은 editor model, React wiring, deterministic event replay를 빠르게 고정하는
환경이다. 실제 contenteditable 구현체가 아니므로 browser native selection,
layout geometry, clipboard `DataTransfer`, OS IME, mobile virtual keyboard를
증명하지 않는다.

`verify:internal`은 model/jsdom/replay regression gate로 유지한다. 실제
browser DOM API는 `verify:browser`로 분리하고, OS/keyboard/IME/기기 조합은 수동
debug trace로 증거를 남긴 뒤 필요한 경우에만 `editable-trace-replay@1` fixture로
축약한다.

## Failure Mode 분류

| Failure mode | 1차 검증 레벨 | 이유 | 승격 기준 |
| --- | --- | --- | --- |
| document normalization, schema, command result | pure model test | DOM 없이 canonical JSON과 selection만으로 기대값이 닫힌다. | browser trace가 model 정책 자체를 바꾸는 증거일 때 contract를 먼저 갱신한다. |
| cursor stream, collapsed/range Arrow policy, Backspace/Delete command | pure model test + jsdom replay | 논리 이동은 headless command가 authority이고 React event wiring은 replay로 확인한다. | browser native selection이 다른 DOM anchor/focus를 만들면 Playwright smoke를 추가한다. |
| React root event ownership, `beforeinput` prevent/no-op/deferred command audit | jsdom component/replay | event cancelability, command dispatch, rendered snapshot은 deterministic하게 재현된다. | 실제 browser event order가 다르면 debug trace를 fixture로 축약한다. |
| Korean IME duplicate commit, stale composition, Enter confirmation | recorded trace replay | browser에서 관측한 event order와 DOM preedit mutation을 jsdom에서 반복한다. | OS/browser IME 조합별 event order가 다르면 실기기 trace를 별도 이슈 증거로 남긴다. |
| native `Selection`/`Range`, `selectionchange`, range collapse/extension | Playwright browser gate | jsdom selection은 native browser selection affordance와 geometry를 증명하지 못한다. | mobile handle, shadow DOM, iframe, Safari-only divergence는 실기기 또는 targeted browser issue로 승격한다. |
| paste/drop `DataTransfer`, clipboard item type order | Playwright browser gate | browser-created `DataTransfer`와 event dispatch를 확인해야 한다. | OS clipboard permission, app-to-app rich paste는 수동 trace로 남긴다. |
| caret/selection overlay geometry, line wrap, transform, zoom | Playwright browser gate | `getClientRects`, layout, font metrics, transform은 jsdom에서 없다. | touch selection handle, virtual keyboard viewport resize는 실기기 trace가 필요하다. |
| Android/iOS virtual keyboard, autocorrect, long press, selection handles | 실제 기기 수동 trace | Playwright desktop matrix와 jsdom은 OS keyboard가 만든 composition/mutation 순서를 만들지 않는다. | 반복 가능한 event sequence만 fixture로 축약하고 기기 의존 affordance는 수동 템플릿으로 남긴다. |

## jsdom API 한계

| API/동작 | jsdom 상태 | mock 가능 여부 | 닫을 수 있는 것 | 닫으면 안 되는 것 |
| --- | --- | --- | --- | --- |
| `InputEvent.getTargetRanges()` | 기본 contenteditable 흐름에서 신뢰할 수 없다. | 좁은 fake range는 가능하다. | handler가 target range를 해석하는 분기. | browser가 어느 range를 줄지. |
| `DataTransfer` constructor/items | browser 수준 clipboard/drop 구현이 아니다. | text/html, text/plain fixture stub은 가능하다. | parser와 command routing. | 실제 paste/drop event의 item order, files, permission. |
| `window.getSelection()` / `Range` | DOM node anchor/focus는 흉내낼 수 있지만 layout이 없다. | path 기반 selection adapter test 가능. | canonical selection bridge와 replay snapshot. | native selection painting, browser boundary normalization. |
| `Range.getClientRects()` / `getBoundingClientRect()` | layout rect가 없다. | deterministic layout adapter fake만 가능하다. | geometry algorithm의 fallback과 rounding policy. | 실제 line wrap, zoom, transform, font metric. |
| `caretPositionFromPoint()` / `caretRangeFromPoint()` | browser hit-testing이 없다. | coordinate adapter stub은 가능하다. | fallback ordering. | 실제 좌표 hit-test 결과. |
| `CompositionEvent` / `InputEvent.isComposing` / `keyCode 229` | event 객체는 만들 수 있지만 OS IME가 아니다. | recorded sequence replay 가능. | 우리 state machine이 관측 trace를 처리하는지. | 실제 IME event order와 cancelability. |
| `MutationObserver` order | callback plumbing은 가능하지만 browser editing mutation과 다르다. | stale record 처리 unit test 가능. | observer pause/resume 정책. | native editing mutation 순서. |
| Shadow DOM selection / `Selection.getComposedRanges()` | 구현 차이가 크다. | fallback branch unit test만 가능하다. | 없는 API에서 fallback을 타는지. | Safari/WebKit composed selection behavior. |
| virtual keyboard, touch handles, viewport resize | 의미 있는 jsdom 대체가 없다. | 거의 불가하다. | 없음. | mobile editing UX 전체. |

## Trace Recorder 승격 절차

debug recorder report는 원본 증거이고, replay fixture는 최소 재현 contract다. 둘을
동일한 산출물로 취급하지 않는다.

1. 이슈에 원본 debug report, browser/OS/IME/keyboard, 시작 selection, 최종
   document/selection을 남긴다.
2. timeline에서 결함을 설명하는 최소 event subsequence를 고른다. 주기적인 recorder
   상태 로그, pointer noise, UI hover noise는 제거한다.
3. oracle source를 붙인다: spec, browser trace, reference editor, product policy 중
   최소 하나다.
4. `editable-trace-replay@1` fixture로 변환한다. `event`, `selection`, `text`,
   `timers` step만 사용하고 debug recorder의 full DOM/JSON dump를 그대로 복사하지
   않는다.
5. fixture에 `contractIds`를 적고, 해당 P0 row 또는 이 감사 문서의 failure mode와
   연결한다.
6. `expect.before`/`expect.after`에는 canonical text, path text, selection,
   DOM selection, selected pointer 중 실패를 설명하는 최소 필드만 둔다.
7. prevented editing event는 `preventedEventAudit`에서 immediate state change,
   deferred command, explicit no-op 중 하나로 설명한다.
8. 같은 fixture가 jsdom에서 통과해도 “browser/OS matrix 검증 완료”라고 쓰지 않는다.

## 수동 재현 템플릿

CI에서 닫을 수 없는 항목은 아래 형식으로 이슈에 남긴다.

```markdown
## 환경

- OS:
- Browser/version:
- Device:
- Keyboard/IME:
- Viewport/zoom:

## 시작 상태

- Document outline:
- Selection anchor/focus:
- Focus target:

## 재현 절차

1.
2.
3.

## 기대 결과

- Final document:
- Final selection:
- Native DOM selection:
- Event/order notes:

## 실제 결과

- Final document:
- Final selection:
- Divergence:

## 첨부 증거

- Debug recorder report:
- Screenshot/video:
- Playwright trace, 있으면:

## 자동화 판단

- Level: model / jsdom replay / Playwright / 실기기 수동
- Fixture 후보:
- 자동화 불가 이유:
- 다음 결정:
```

## 외부 근거

| 출처 | 이 문서에서 쓰는 의미 |
| --- | --- |
| https://marcuswood.io/blog/effective-slate-testing-using-react-testing-library/ | Slate 테스트 글은 jsdom이 contenteditable을 충분히 구현하지 않으며 `getTargetRanges`, `DataTransfer` 같은 API를 별도로 보강해야 한다는 한계를 보여준다. |
| https://docs.slatejs.org/general/faq | Slate FAQ는 Android input이 `beforeInput` 차이 때문에 composition/mutation 기반 별도 경로를 탄다고 설명한다. |
| https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | Lexical changelog에는 Safari/WebKit e2e, Firefox composition/clipboard, Japanese IME, Android GBoard 같은 browser/IME별 수정이 반복된다. |
| https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | ProseMirror view changelog에는 Android virtual keyboard, Safari shadow DOM selection, IME composition, `caretPositionFromPoint`, line wrap geometry 관련 수정이 반복된다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| model/jsdom/browser/device 분류 | 확정 절차 | 각 failure mode를 어느 gate에서 닫을지 명시해 jsdom 과신을 막는다. |
| jsdom API 한계표 | 확정 절차 | mock이 가능한 분기와 browser에서만 증명되는 동작을 분리했다. |
| trace recorder fixture 승격 절차 | 확정 절차 | debug report를 사람이 읽는 증거로 두고, deterministic fixture는 최소 event subsequence로만 만든다. |
| 수동 재현 템플릿 | 확정 절차 | CI에서 닫히지 않는 mobile/IME/browser matrix 항목을 이슈 증거로 남길 형식을 정했다. |
| 외부 reference editor 근거 | 부분근거 | Slate/Lexical/ProseMirror 사례는 분류 기준의 위험 신호다. 이 editor의 제품 정책 자체는 repo contract와 fixture가 authority다. |
| 실제 OS/browser matrix 통과 | 미정 | 이 문서는 검증 레벨 정책이며, 특정 기기 조합의 통과 결과를 새로 실행하지 않았다. |
