# Editor Composition Render Update Policy Audit

작성일: 2026-06-22

범위: IME composition 중 toolbar state, decorations, async React render, remote patch,
collaborative update가 active composition DOM을 깨지 않게 하는 update 정책을 정한다.
현재 구현에는 collaboration/remote patch queue와 decoration engine이 없다.

## 판정

composition 중 active text leaf DOM은 browser IME가 소유한다. React/model update가 그
text node나 그 wrapper를 재생성하면 composition target이 사라져 입력이 깨질 수 있다.

따라서 update는 세 등급으로 나눈다.

- 허용: active text leaf DOM과 path mapping을 건드리지 않는 passive UI/model update.
- 지연: active text leaf, 그 조상 block, mark wrapper, decoration split, path index를
  바꿀 수 있는 update.
- 금지: composition 중 active DOM을 즉시 overwrite하거나 remote patch로 같은 text
  leaf를 덮어쓰는 update.

현재 코드에서 확정된 release boundary는 blur, toolbar command, undo/redo, paste/drop,
copy/cut, read-only 전환, composition final commit이다. 이 boundary 전까지 active
native text buffer를 per-input model sync로 바꾸지 않는다.

## 현재 구현 사실

| 항목 | 현재 상태 | 근거 |
| --- | --- | --- |
| active native buffer | `contentEditableViewEngine`이 active text leaf 안 native mutation을 보류하고 release 시 one-patch flush한다. | `docs/editor-contenteditable-buffer-audit.md`, `contentEditableViewEngine.ts` |
| composition state | React surface는 `data-ime-composing`을 내보내고 IME 중 custom caret overlay를 숨긴다. | `BlockEditor.tsx`, BlockEditor split tests |
| command boundary | toolbar/undo/redo/keymap/paste/drop/copy/cut 전 active buffer를 flush한다. | `useBlockEditorController.tsx` |
| render selection sync guard | active edit 중에는 layout effect가 DOM selection sync를 건너뛴다. | `contentEditableEngine.hasActiveEdit()` guard |
| remote/collab patch | 구현 없음. 외부 patch queue, rebase, conflict resolver가 없다. | source audit |
| decoration engine | 구현 없음. active text node를 split하는 decoration renderer가 없다. | source audit |
| typeahead/floating menu | 구현 없음. popup 정책은 별도 감사 문서에 남겼다. | `docs/editor-popup-ime-selection-policy-audit.md` |

## Update 분류표

| Update 종류 | composition 중 정책 | 이유 |
| --- | --- | --- |
| toolbar enabled/disabled/active UI state | 허용, 단 editor DOM 밖 passive render만 | button state가 active text leaf DOM을 재생성하면 안 된다. |
| debug recorder/inspector state | 허용 | editor document DOM을 mutate하지 않는 진단 UI다. |
| title input state | 허용 | body active leaf와 별도 DOM이다. 단 history command는 release boundary다. |
| unrelated block after active block append | 조건부 허용 | active block path와 DOM node identity를 유지할 수 있을 때만 즉시 반영한다. |
| active block 앞 구조 삽입/삭제 | 지연 | path index가 바뀌면 active leaf path와 selection mapping이 흔들린다. |
| active block 내부 remote patch | 지연 후 rebase 또는 conflict | browser IME가 가진 DOM text와 remote model patch가 같은 위치를 두고 경쟁한다. |
| active text leaf text replace | 금지 | composition target text node를 덮어쓰면 조합이 깨진다. |
| active leaf mark/style/class 변경 | 지연 | wrapper DOM 교체나 mark boundary 변경이 composition target을 깨뜨릴 수 있다. |
| decoration이 active leaf를 split/wrap | 지연 | highlighted span/widget 삽입이 focused text node를 바꾼다. |
| decoration이 다른 block만 변경 | 조건부 허용 | active leaf DOM과 path mapping을 건드리지 않으면 안전하다. |
| read-only 전환 | release boundary | 현재 구현은 reset/flush로 contenteditable DOM을 canonical view로 되돌린다. |
| toolbar command/mention/figure insertion | release boundary | command 전 flush 후 canonical selection에 적용한다. |

## Active Text Leaf Touch 감지 기준

아래 중 하나라도 참이면 active text leaf를 건드리는 update로 본다.

| 기준 | 지연 이유 |
| --- | --- |
| patch path가 active text leaf path와 같거나 descendant다. | 같은 text content를 직접 바꾼다. |
| patch path가 active text leaf의 ancestor block/inline run이다. | text node나 wrapper가 재생성될 수 있다. |
| patch가 active block 앞 sibling을 삽입/삭제한다. | index 기반 path가 바뀐다. path rebase 없이는 selection이 틀린다. |
| mark/decorator update가 active leaf를 span으로 split하거나 wrapper class를 바꾼다. | browser composition target node identity가 바뀐다. |
| renderer key/class/data-path가 active leaf 주변에서 바뀐다. | React reconciliation이 text node를 교체할 수 있다. |
| selection sync가 active edit 중 DOM selection을 강제로 다시 쓴다. | IME 후보/조합 caret이 깨질 수 있다. |

반대로 document title, debug inspector, editor 밖 toolbar button state, active block 뒤쪽의
path-stable append처럼 active leaf DOM identity와 path mapping을 보존하는 update는
즉시 허용할 수 있다.

## Remote/Async 충돌 정책

현재 remote update 구현은 없지만, 추가 전 정책은 아래로 둔다.

| 충돌 | 정책 |
| --- | --- |
| remote patch가 active leaf 밖 path-stable 영역을 바꿈 | 즉시 적용 가능. debug trace에 composition active와 patch 범위를 남긴다. |
| remote patch가 active block 앞 구조를 바꿈 | composition release까지 queue한다. 적용 전 active selection을 새 path로 rebase할 수 없으면 conflict로 남긴다. |
| remote patch가 active text leaf를 바꿈 | local composition이 끝날 때까지 queue한다. composition commit 후 remote patch를 rebase한다. |
| remote patch가 active block을 삭제함 | 즉시 DOM 삭제 금지. 제품 정책으로 remote delete 우선이면 explicit cancel/release event를 만들고 trace를 남긴다. 기본은 queue 후 conflict다. |
| async local decoration이 active leaf를 split함 | compositionend까지 지연한다. |
| toolbar/typeahead state가 active leaf mark/style을 바꿈 | command boundary로 승격해 먼저 flush한다. passive state만이면 허용한다. |

## Trace Scenario

새 기능을 추가하면 최소 trace는 아래를 포함한다.

| Scenario | 기대 결과 |
| --- | --- |
| composition 중 toolbar active state rerender | editor body focus 유지, active text node identity 유지, document text 미커밋 상태 유지 |
| composition 중 active leaf spelling/search decoration 추가 | decoration 적용 지연, composition commit 뒤 render 반영 |
| composition 중 다른 block decoration 추가 | active leaf DOM identity 유지, composition 지속 |
| composition 중 typeahead selectionchange/range 발생 | popup은 닫힘/command target 변경 없이 passive 상태 유지 |
| composition 중 remote patch가 active leaf를 replace | remote patch queue, local composition commit 후 rebase/conflict 처리 |
| composition 중 remote patch가 active block 앞에 block 삽입 | active path rebase 불가 시 queue, release 후 path remap 또는 conflict |
| composition 중 toolbar mention insert click | composition/native buffer release 후 mention insertion command 적용 |

Trace에는 active path, patch path, patch kind, DOM text node identity 유지 여부,
composition event order, final document/selection을 남긴다.

## 외부 근거

| 출처 | 이 문서에서 쓰는 의미 |
| --- | --- |
| https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | ProseMirror는 composition 중 document/decorations 변경을 표시하되 focused text node에 영향을 주는 decorations는 지연한다고 정리했고, composition과 같은 위치 삽입이 invalid change position을 만든 사례도 있었다. |
| https://github.com/facebook/lexical/pull/8148 | Lexical PR #8148은 composition 중 selection이 다른 node로 이동했을 때 이전 selection의 format/style을 그대로 상속하지 않도록 고쳤다. |
| https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | Lexical changelog에는 WebKit/Firefox/Android/iOS IME, format/style, typeahead/toolbar/selection 관련 회귀가 반복된다. |
| `docs/editor-contenteditable-buffer-audit.md` | 이 repo의 현재 확정은 active text leaf gate, composition phase handling, one-patch flush다. |
| `docs/editor-popup-ime-selection-policy-audit.md` | popup/typeahead/toolbar UI는 composition 중 keyboard/focus/selection ownership을 침범하지 않아야 한다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| current active native buffer policy | 실행 테스트로 확정 | contenteditable engine과 React tests가 one-patch flush, composition phase, toolbar/blur/history release를 고정한다. |
| current remote/collab 부재 | source audit로 확정 | 외부 patch queue/rebase/conflict resolver가 없다. |
| active text leaf touch 감지 기준 | 설계 절차 확정 | future decoration/render/remote patch가 지켜야 할 DOM identity guard다. |
| update 허용/지연/금지 분류 | 설계 절차 확정 | composition 중 즉시 반영해도 되는 update와 release까지 미뤄야 하는 update를 분리했다. |
| remote patch 충돌 처리 | future policy | 구현이 없으므로 제품/collab 요구가 생기기 전까지 실행 보장은 아니다. |
| ProseMirror/Lexical 근거 | 외부 사례 근거 | reference editor의 반복 회귀는 위험 신호다. 이 editor의 authority는 local tests와 policy docs다. |

## 현재 결론

현재 구현에서 뺄 수 없는 원칙은 active text leaf DOM을 composition 중 browser IME에
맡기고, release boundary에서만 canonical document로 flush하는 것이다. Toolbar command
같은 명시적 command는 release boundary가 될 수 있지만, passive UI state나 decoration
rerender가 active leaf DOM을 바꾸면 안 된다.

remote/collaboration이 추가되기 전까지는 active composition target을 건드리는 외부
patch를 즉시 적용하는 기능을 만들지 않는다. 필요한 경우 queue, rebase, conflict
정책을 먼저 세우고 debug trace로 active path와 patch path를 남긴다.
