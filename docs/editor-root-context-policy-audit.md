# Editor root context policy audit

작성일: 2026-06-22

범위: editor가 top-level document, ShadowRoot, iframe, popup/new-window,
다른 document/window에 들어갈 때 selection, focus, clipboard, geometry, overlay,
observer/listener를 어느 root 기준으로 다룰지 정한다.

## 판정

현재 editor의 제품 지원 범위는 same-document editor root다. ShadowRoot와 iframe은 일부
adapter가 이미 root-local API를 쓰지만, real browser trace와 root migration contract가
없어서 broad support로 선언하지 않는다.

다만 이번 조사에서 드러난 확정 원칙은 적용했다. Custom caret/range overlay는 전역
`document.body`가 아니라 editor root의 `ownerDocument.body`에 붙인다. 이로써 iframe
document에 렌더된 editor의 overlay가 parent document에 새는 drift를 막는다.

## 외부 근거

| 근거 | 원문 | 해석 |
| --- | --- | --- |
| ProseMirror reference는 view가 다른 document나 shadow tree로 이동하면 `updateRoot()`를 호출해 root를 다시 계산해야 한다고 둔다. | https://prosemirror.net/docs/ref/#view.EditorView.updateRoot | root는 고정 전역이 아니라 editor instance state다. root 이동은 listener/observer 재초기화 경계다. |
| ProseMirror changelog에는 Shadow DOM Safari selection, `Selection.getComposedRanges`, `posAtCoords`, focus/selection/clipboard 수정이 반복된다. | https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | broad cross-root support는 selection만의 문제가 아니라 geometry, focus, clipboard까지 묶인 장기 호환성 표면이다. |
| Lexical changelog에는 shadow root direction, iframe MutationObserver/input ordering, iframe clipboard, different window/document clipboard, owner document selection listener cleanup이 있다. | https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | multi-realm 지원은 `document` 전역 제거만으로 끝나지 않는다. event order, realm class identity, listener cleanup이 같이 필요하다. |
| Lexical PR #7822는 editor가 다른 window/document에 있을 때 parent window selection을 복사하던 문제를 고쳤다. | https://github.com/facebook/lexical/pull/7822 | clipboard source는 top window가 아니라 editor owner window/document여야 한다. |
| Lexical PR #4649는 contenteditable이 iframe 안에 있을 때 clipboard export가 깨지는 문제를 고쳤고, 원인으로 multi-realm `instanceof` 차이를 명시했다. | https://github.com/facebook/lexical/pull/4649 | iframe 지원은 clipboard data뿐 아니라 realm-local constructors까지 고려해야 한다. |
| Selection API와 Shadow DOM 관련 현 정책은 별도 audit에 정리했다. | `docs/editor-shadow-selection-fallback-audit.md` | `getComposedRanges`, `getTargetRanges`, `execCommand` fallback은 지금 제품 범위로 올리지 않는다. |

## Root context support matrix

| context | 현재 판정 | selection/focus | clipboard | geometry/overlay |
| --- | --- | --- | --- | --- |
| top-level same document | 지원 | `ownerDocument.getSelection()`, owner-document `selectionchange`, root focus | event `clipboardData`, root owner window `navigator.clipboard.writeText` | DOM rect + ownerDocument viewport, overlay는 ownerDocument body |
| same-document ShadowRoot | 부분 지원 | ShadowRoot가 `getSelection()`을 제공하면 우선 사용. Safari broad fallback은 미지원 | event/keymap path는 ownerDocument 기준 | overlay는 ownerDocument body. shadow style isolation까지 보장하지 않음 |
| same-origin iframe document | 부분 구현, 제품 미선언 | root `ownerDocument` listener와 focus path는 동작하도록 좁힘 | keymap은 root owner window clipboard 우선, event path는 event transfer 사용 | overlay ownerDocument drift는 수정. browser trace 없음 |
| React portal/new window | 미지원 | root ref가 새 document를 가리킬 때만 일부 동작. DOM node adoption root move는 미지원 | owner window clipboard 우선이지만 popup permission/browser UX 미검증 | root migration/reconcile trace 없음 |
| cross-origin iframe | 미지원 | 내부 DOM selection 접근 불가 | 내부 clipboard 접근 불가 | iframe atom 또는 external owner로만 취급 |
| nested editable/inner editor | 미지원 | inner owner가 별도 selection을 소유해야 함 | outer가 inner clipboard를 처리하지 않아야 함 | #75, #76 후속 범위 |

## API policy

| 영역 | 정책 | 현재 근거 |
| --- | --- | --- |
| selection read/write | root-local selection API를 우선한다. ShadowRoot `getSelection()`이 있으면 쓰고, 없으면 root `ownerDocument.getSelection()`으로 fallback한다. | `contentEditableSelection.ts`, ShadowRoot fake selection test |
| focus/selectionchange | document 전역이 아니라 root `ownerDocument`에 listener를 붙이고, active root 또는 root-contained native selection만 관찰한다. | `useBlockEditorController.tsx`, single listener test |
| clipboard event | copy/cut/paste/drop event의 `clipboardData`/`dataTransfer`만 읽고 쓴다. | `BlockEditor.test.tsx`, clipboard tests |
| clipboard keymap | root owner window의 `navigator.clipboard.writeText`를 우선한다. 실패하거나 없으면 hidden DOM fallback 없이 실패로 닫는다. | `useBlockEditorController.tsx`, hidden fallback audit |
| geometry | DOM rect, style, viewport는 가능한 root owner document/window를 따른다. coordinate는 viewport coordinate로만 해석한다. | `cursorGeometryDom.ts`, cursor geometry tests |
| overlay | fixed viewport overlay는 editor root owner document body에 붙인다. 전역 top document body는 쓰지 않는다. | 이번 변경, iframe owner-document overlay test |
| deprecated probe | `document.execCommand`, hidden textarea/div, Safari `indent` probe를 도입하지 않는다. | hidden clipboard/shadow selection audits |

## Root 변경 시 재초기화 목록

root가 새 document/shadow tree로 바뀌면 아래 리소스는 기존 root 기준 값을 버리고 다시
잡아야 한다.

| 리소스 | 현재 처리 | root 변경 요구 |
| --- | --- | --- |
| editor surface ref | React ref state인 `editorSurfaceElement`로 추적 | ref가 새 node를 받는 remount/portal은 처리. 같은 DOM node가 adopt되는 root move는 미지원 |
| `beforeinput` listener | root element에 add/remove | root element 변경 시 cleanup/re-add |
| `select` listener | root element에 add/remove | root element 변경 시 cleanup/re-add |
| `selectionchange` listener | root ownerDocument에 add/remove | ownerDocument 변경 시 cleanup/re-add |
| native selection read/write | 호출 시 root에서 selection source를 계산 | root의 current document/shadow selection 사용 |
| geometry adapter | render마다 current root로 생성 | root 변경 시 새 geometry instance |
| overlay portal host | root ownerDocument body | ownerDocument 변경 시 새 portal host |
| debug recorder input listeners | 현재 global `window` 중심 | multi-document 제품 지원 전에는 debug recorder owner window 전환 필요 |
| debug recorder MutationObserver | current root를 observe | multi-realm 지원 시 root owner window의 constructor 사용 여부 확인 필요 |

## 완료 기준 매핑

| #12 완료 기준 | 처리 |
| --- | --- |
| root context별 selection/clipboard/geometry API 사용 정책 | 위 support matrix와 API policy로 정리 |
| shadow DOM과 iframe 지원/비지원/나중 분류 | ShadowRoot/iframe은 부분 구현, 제품 미선언으로 분류 |
| root 변경 시 재초기화해야 하는 observer/listener 목록 | `Root 변경 시 재초기화 목록`에 정리 |
| 최소 하나의 shadow root 또는 iframe 수동 trace scenario 정의 | 아래 trace scenarios에 정의 |

## Trace scenarios

| id | scenario | 기대 |
| --- | --- | --- |
| XR-01 | same-origin iframe document에 editor를 렌더하고 focus, ArrowRight, Shift+ArrowRight, copy keymap을 수행 | activeElement, DOM selection, overlay DOM, clipboard source가 iframe owner document/window에 머문다 |
| XR-02 | ShadowRoot 안 editor에서 한글 IME 조합, range selection, copy/cut을 수행 | ShadowRoot selection source를 우선하고 top document selection 오판이 없어야 한다 |
| XR-03 | editor를 remount 없이 다른 document로 이동/adopt하는 prototype을 실행 | 현재는 미지원으로 실패해야 한다. 지원하려면 ProseMirror `updateRoot`와 같은 explicit root update가 필요하다 |
| XR-04 | iframe 안 selection과 parent document selection을 동시에 만든 뒤 copy/cut을 수행 | parent selection이 clipboard source로 쓰이면 실패다 |
| XR-05 | hidden clipboard fallback이 필요한 browser profile에서 keymap cut을 수행 | write failure면 문서 삭제가 없어야 하고 hidden DOM/focus 이동은 없어야 한다 |

## 이번 코드 변경

| 변경 | 이유 | 테스트 |
| --- | --- | --- |
| `FixedViewportOverlay`가 `ownerDocument`를 받아 해당 body에 portal | overlay가 top document에 붙으면 iframe/new-window editor에서 caret/selection visual owner가 틀어진다 | `BlockEditor.test.tsx` iframe owner-document overlay test |
| `CursorOverlay`/`SelectionOverlay`가 editor owner document를 전달 | visual layer도 editor root context를 따른다 | 기존 overlay tests + 새 iframe test |

## 아직 닫지 않은 것

| 항목 | 이유 | 후속 |
| --- | --- | --- |
| real Chrome/Safari/Firefox ShadowRoot trace | jsdom fake ShadowRoot selection은 browser event order/selection API 차이를 대체하지 않는다 | #90 |
| same-origin iframe clipboard/selection/browser trace | unit test는 overlay ownerDocument만 검증한다. 실제 clipboard permission/context menu path는 미검증이다 | #90 |
| root adoption/updateRoot API | current React app에는 producer가 없다. 죽은 abstraction으로 선구현하지 않는다 | 제품에서 portal/root move 요구가 생길 때 |
| debug recorder owner window | current demo debug용 global window listener다. multi-document 제품 지원 전까지는 제한으로 둔다 | #90 |
| cross-origin iframe | DOM 접근이 불가능하다. editor 내부 root가 아니라 atom/external owner다 | 별도 embed product scope |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| top-level same document | 실행 테스트 확정 | current BlockEditor, selection, clipboard, geometry tests | 실제 browser matrix는 별도 |
| ShadowRoot selection adapter | unit test 확정 | fake ShadowRoot `getSelection()` read/write test | Safari/WebKit native behavior는 미검증 |
| iframe overlay ownerDocument | unit test 확정 | iframe document render test | clipboard/context menu/focus browser behavior는 미검증 |
| ownerDocument selectionchange | source/test 확정 | owner document listener + cleanup test | root adoption without ref change는 미지원 |
| hidden clipboard fallback 없음 | source/test 확정 | no `execCommand`, no textarea tests | legacy browser copy success율은 포기 |
| cross-root product support | 미정 | upstream 이슈와 local gaps | browser trace 전에는 선언하지 않음 |

## 현재 결론

정석은 `document` 전역을 없애는 것이 아니라 root context를 editor instance의 일부로
취급하는 것이다. Selection, focus listener, clipboard keymap, geometry, overlay는 모두
editor root의 owner document/window를 기준으로 읽고 쓴다.

현재 repo는 이 방향의 핵심 adapter를 일부 갖췄지만 ShadowRoot/iframe/new-window를 제품
지원으로 선언할 단계는 아니다. 이번에는 명백한 drift인 overlay host만 ownerDocument로
수정했고, 나머지는 browser trace를 먼저 만든 뒤 지원 범위를 올린다.
