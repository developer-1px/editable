# Editor hidden clipboard fallback audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. Clipboard API가 없거나 깨진 환경에서 hidden
textarea/div를 만들고 selection/focus를 옮기는 fallback을 둘지 결정한다.

## 판정

현재 editor는 hidden DOM clipboard fallback을 쓰지 않는다.

- copy/cut/paste event는 `event.clipboardData`가 있는 경우만 처리한다.
- keymap copy/cut은 serializable editor selection이 있으면 hidden DOM 없이
  `navigator.clipboard.writeText`와 in-memory structured fallback을 쓴다.
- keymap paste는 native paste event를 기다리며 hidden textarea를 만들지 않는다.
- debug recorder report 복사도 `navigator.clipboard.writeText`만 시도한다. 실패하면
  `copy-failed` inspector와 in-memory raw report를 남기고 DOM fallback은 만들지
  않는다.

## ProseMirror-view 근거

ProseMirror-view는 오래된/broken clipboard 환경을 지원하기 위해 hidden DOM fallback을
둔다.

| 근거 | 내용 | 우리 쪽 해석 |
| --- | --- | --- |
| copy fallback | hidden fixed wrapper를 붙이고 editor blur 뒤 DOM selection을 wrapper로 옮긴 다음 50ms 후 제거/refocus한다. | copy 성공률은 높지만 selectionchange, focus, recorder DOM noise가 생긴다. |
| broken clipboard API | `event.clipboardData`가 깨진 환경에서 fallback path로 간다. | 지원 브라우저를 넓히는 대신 editor selection authority를 흔든다. |
| paste fallback | hidden textarea/div에 focus를 옮기고 50ms 후 값을 읽어 editor focus를 되돌린다. | paste가 async timeout과 stale selection race를 만든다. |
| composition paste | Android를 제외하고 composition 중 native browser path를 허용한다. | IME 중 hidden fallback을 끼우면 composition owner와 충돌할 수 있다. |

근거:

- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/input.ts#L568-L587
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/input.ts#L589-L610
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/input.ts#L618-L631
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/input.ts#L654-L667

## Clipboard matrix

| 상황 | current behavior | hidden fallback |
| --- | --- | --- |
| copy event + `event.clipboardData` 있음 | selection을 직렬화해 `text/plain`, `text/markdown`, custom MIME을 쓴다. | 없음 |
| copy event + `event.clipboardData` 없음 | no-op. Native/hidden fallback을 만들지 않는다. | 없음 |
| cut event + `event.clipboardData` 있음 | clipboard write 후 command layer에서 `deleteByCut` 처리한다. | 없음 |
| cut event + `event.clipboardData` 없음 | 문서 삭제를 실행하지 않는다. | 없음 |
| keymap copy/cut + serializable editor selection 있음 | plain text를 system clipboard에 쓰고 in-memory structured fallback을 보관한다. cut은 write success 뒤 command layer에서 삭제한다. | 없음 |
| keymap copy/cut + serializable data 없음 | keydown을 prevent하지 않고 native copy/cut event로 넘긴다. | 없음 |
| paste event + `event.clipboardData` 있음 | transfer reader가 text/markdown/custom MIME을 읽어 command layer로 넘긴다. | 없음 |
| paste event + 읽을 수 있는 text 없음 | no-op. hidden paste capture를 만들지 않는다. | 없음 |
| keymap paste | keydown을 prevent하지 않고 native paste event로 넘긴다. | 없음 |
| debug report copy + `writeText` 성공 | report를 clipboard에 쓴다. | 없음 |
| debug report copy + Clipboard API 없음/reject | `FAIL` inspector, warning, `window.__editableDebugRecordings` raw retention. | 없음 |

## Blur/refocus stale selection 재현 정책

hidden textarea fallback의 핵심 위험은 fallback 자체가 editor focus와 DOM selection을
빼앗는다는 점이다. 현재 repo에서는 그 path를 제거해 아래 negative contract로 고정한다.

| 재현 조건 | 기대 |
| --- | --- |
| debug report 복사에서 `navigator.clipboard.writeText` reject | `document.execCommand` 미호출, `textarea` 미생성, editor focus 유지 |
| serializable editor selection keymap copy/cut | hidden textarea 없이 plain system clipboard write와 in-memory structured fallback만 사용 |
| no-data keymap copy/cut/paste | keydown은 prevent하지 않고 `textarea` 미생성 |

## Cleanup / timeout policy

현재는 hidden DOM을 만들지 않으므로 cleanup timeout도 없다. 50ms fallback timeout은
ProseMirror compatibility technique이지 current editor contract가 아니다.

미래에 hidden fallback을 다시 도입하려면 아래 조건을 동시에 만족해야 한다.

| 조건 | 이유 |
| --- | --- |
| fallback DOM에 명시적인 owner marker를 붙인다. | debug recorder와 mutation observer가 temporary DOM을 editor state로 기록하지 않게 한다. |
| selection/focus restore를 finally에서 보장한다. | blur/refocus race를 최소화한다. |
| composition 중에는 fallback을 실행하지 않는다. | IME owner와 clipboard owner가 충돌하지 않게 한다. |
| timeout 값과 cleanup 실패 telemetry를 테스트로 고정한다. | hidden DOM 누수를 회귀로 잡는다. |
| cut은 clipboard write success 뒤에만 삭제한다. | clipboard 실패가 data loss로 이어지지 않게 한다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| editor copy/cut/paste event path | 실행 테스트로 확정 | BlockEditor split tests, `clipboard split tests`, contentEditable view split tests | 모든 legacy browser MIME 조합은 아니다. |
| keymap native event pass-through | 실행 테스트로 확정 | collapsed/no-data clipboard shortcut pass-through test | 실제 browser permission prompt UX는 별도 QA가 필요하다. |
| editor-owned keymap fallback | 실행 테스트로 확정 | keymap range copy/cut/paste structured fallback test, browser keyboard cut/paste round-trip | Plain text가 같은 외부 clipboard와 stale in-memory fallback이 충돌하는 경우는 product policy로 더 좁힐 수 있다. |
| hidden textarea fallback absence | 실행 테스트로 확정 | debug copy failure, keymap pass-through test | 코드 전체의 미래 추가를 막으려면 lint/AST guard가 더 강하다. |
| debug recorder copy failure | 실행 테스트로 확정 | `copy-failed` inspector와 raw report retention | 사용자 안내 UX는 제품 결정으로 남아 있다. |
| ProseMirror fallback side effect | source 근거 | linked source의 blur/refocus/timeout path | current editor에 같은 fallback을 복제하지 않는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| hidden textarea/div clipboard fallback | 제거 확정 | selection/focus authority를 흔들고 debug trace에 temporary DOM noise를 만든다. |
| `document.execCommand("copy")` debug fallback | 제거 확정 | deprecated path이고 hidden textarea를 필요로 한다. 실패는 `copy-failed`로 충분하다. |
| keymap-owned copy/cut bridge for serializable editor selection | 유지 확정 | Browser default cut/copy가 editor selection과 structured fallback을 안정적으로 동시에 보존하지 못한다. |
| event `clipboardData` path | 유지 확정 | normal copy/cut/paste event의 narrow transfer seam이다. |
| timeout cleanup policy 선구현 | 보류 | hidden DOM을 만들지 않으므로 죽은 정책이다. |

## 현재 결론

현재 editor의 정석은 fallback DOM을 영리하게 숨기는 것이 아니라 clipboard authority를
좁히는 것이다. Event path는 clipboard event의 `DataTransfer`로 들어오고 나간다.
Keyboard copy/cut은 serializable editor selection이 있으면 hidden DOM 없이 keymap
bridge와 in-memory structured fallback으로 보완한다. focus/selection/model을 hidden
fallback으로 건드리지 않는다.
