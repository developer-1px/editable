# Editor Read-Only Selection Clipboard Policy Audit

작성일: 2026-06-22

범위: read-only editor와 `contentEditable={false}` atom node에서 selection, copy,
cut, paste/drop, overlay ownership가 어떻게 동작해야 하는지 닫는다. 기준은 현재
React editor, clipboard serializer, native selection bridge다.

## 판정

read-only는 selection을 죽이는 모드가 아니다. Read-only의 핵심은 document mutation
금지이고, selection 추적과 copy는 유지한다.

따라서 현재 정책은 다음이다.

- read-only editor도 DOM selectionchange와 keyboard selection movement를 canonical
  selection으로 반영한다.
- read-only copy는 editable copy와 같은 clipboard payload를 쓴다.
- read-only cut은 copy-only로 처리하고 document delete는 하지 않는다.
- read-only paste/drop/typing/delete/history/toolbar/composition mutation은 막고
  DOM은 canonical document로 복구한다.
- noneditable atom은 browser native selection을 신뢰하지 않고 editor-owned
  canonical atom/range selection과 serializer를 source로 쓴다.

## 상태별 정책표

| 상태 | selection 추적 | copy | cut | paste/drop | 키보드 navigation | mutation |
| --- | --- | --- | --- | --- | --- | --- |
| editable text/range | canonical selection과 observed native range를 동기화한다. | 허용. editor serializer가 `text/plain`, `text/markdown`, custom MIME을 쓴다. | 허용. clipboard write 후 `deleteByCut` command로 삭제한다. | 허용. transfer reader가 plain/markdown command로 넘긴다. | Arrow, Shift+Arrow, line/document movement를 command selection으로 처리한다. | 허용된 input만 command patch로 반영한다. |
| read-only editor | 유지. focusable textbox와 `aria-readonly`를 유지하고 selection movement를 반영한다. | 허용. 같은 serializer와 같은 payload를 쓴다. | copy-only. payload를 쓰지만 delete는 하지 않고 DOM을 canonical view로 되돌린다. | 차단. transfer는 읽을 수 있어도 command insertion을 실행하지 않는다. | 허용. selection만 바뀌고 document는 유지된다. | 차단. typing, delete, paste, drop, toolbar, history, composition은 no-op/reset이다. |
| noneditable atom | atom before/after 또는 atom-selected canonical selection으로 표현한다. | 허용. browser가 atom을 빠뜨려도 editor serializer가 atom text/markdown fallback을 만든다. | editable이면 serializer 후 atom/range 삭제, read-only면 copy-only다. | atom edge나 현재 selection 기준 command로만 처리한다. | atom boundary를 legal cursor stop으로 취급한다. | atom 내부 DOM은 직접 mutate하지 않는다. |

## Read-Only Copy Payload

Read-only copy는 별도 payload 형식을 만들지 않는다. 같은 selection에서 editable
copy와 read-only copy가 다른 데이터를 내보내면 clipboard contract가 mode-dependent가
되고, 사용자는 "읽기만 가능하지만 복사는 된다"는 기대를 잃는다.

확정 payload:

| MIME | 값 |
| --- | --- |
| `text/plain` | 선택 범위의 plain text fallback |
| `text/markdown` | marks, mention, figure, multi-block을 표현할 수 있는 markdown fallback |
| `application/x-editable-selection+json` | `{ schema: "editable-clipboard@1", plainText, markdown }` |

Collapsed selection이나 빈 selection은 clipboard write 대상이 아니다. Custom MIME은
selection topology, selected pointers, node graph를 담지 않는다. Atom/node selection도
plain/markdown fallback으로만 나가며, paste reader는 custom MIME의 `markdown` 또는
`plainText` 문자열만 읽는다.

현재 atom serialization 기준:

| Atom | plain text | markdown |
| --- | --- | --- |
| mention | `@label` | mention markdown fallback |
| figure | `alt` | `![alt](src)` |

## Browser Risk

Browser native selection/copy/cut은 noneditable node 주변에서 editor model과 자주
어긋난다. 그래서 atom copy/cut은 DOM selection 자체를 payload source로 삼지 않는다.

| 위험 | 근거 | 현재 대응 |
| --- | --- | --- |
| Chrome에서 uneditable node 주변 cursor/copy/cut이 깨질 수 있다. | ProseMirror changelog는 uneditable node 주변 cursor, selection, clipboard 관련 회귀를 여러 번 수정했다. https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | atom target은 `data-path`와 canonical selection으로 잡고, serializer가 document에서 payload를 만든다. |
| Firefox가 leaf/noneditable media에 stray cursor나 image resize controls를 만들 수 있다. | ProseMirror changelog는 leaf document node를 non-editable로 둬 stray cursor와 Firefox image resize controls를 막은 변경을 기록한다. https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | figure/mention은 `contentEditable={false}`이고 내부 editable descendant를 두지 않는다. |
| read-only/noneditable 상태에서도 copy와 selectionchange가 필요하다. | Lexical changelog는 `isEditable`이 false여도 DOM `selectionchange`에 따라 selection을 추적해야 한다고 기록한다. https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | read-only도 selection movement와 observed native selection을 command source로 유지한다. |
| noneditable copy event를 듣지 않으면 programmatic copy가 실패한다. | Lexical PR #6232는 non-editable 상태의 programmatic clipboard copy를 고친다. https://github.com/facebook/lexical/pull/6232 | read-only copy/cut handler는 mutation과 별개로 serializer를 호출한다. |
| Native range가 atom selection 뒤 stale source로 남을 수 있다. | pointer selection audit와 native selection bridge audit의 stale native range 위험. | atom selection이 이기고 native ranges를 제거한다. |

## Overlay 결정

Read-only에서도 selection overlay는 필요하다. Read-only editor는 읽기 전용이지만
selection/copy/navigation surface이므로, 사용자가 현재 copy source와 keyboard
navigation 위치를 볼 수 있어야 한다.

표시 정책:

| 상황 | 표시 |
| --- | --- |
| focused collapsed canonical selection | custom caret overlay |
| focused model range or atom selection | custom range/atom overlay |
| visible native DOM range | browser native selection. custom overlay는 숨긴다. |
| IME composing | browser native caret. custom caret은 숨긴다. |
| blur | overlay 숨김. canonical selection은 보존한다. |

이 정책은 read-only에도 그대로 적용한다. 단, read-only에서 browser가 DOM을 바꾸면
mutation을 채택하지 않고 canonical document로 복구한다.

## Noneditable Node Controls

Noneditable atom은 browser control을 갖는 작은 편집 섬이 아니다. 현재 figure와
mention은 다음 기준을 지킨다.

- root atom element는 `contentEditable={false}`다.
- atom 내부에 editable descendant를 두지 않는다.
- resize handle, browser media control, caption editor는 현재 atom contract가 아니다.
- 나중에 figure caption이나 nested editor를 넣으면 `nested editor/focus handoff`
  정책으로 별도 owner를 세워야 한다.
- browser가 만든 resize/cursor UI를 payload나 selection source로 신뢰하지 않는다.

## 증거 강도

| 강도 | 항목 | 현재 의미 | 한계 |
| --- | --- | --- | --- |
| 실행 테스트로 닫힘 | read-only title/body/keyboard/beforeinput/input/paste/cut/drop/history/composition mutation guard, native range copy, atom selection 우선순위 | 현재 React integration은 read-only에서 mutation을 막으면서 selection/copy를 유지한다. | jsdom은 실제 OS clipboard UI와 browser paint timing을 대체하지 않는다. |
| source contract로 닫힘 | `serializeSelectionForClipboard`, `readClipboardTextFromTransfer`, `DocumentRenderer` atom `contentEditable={false}` | clipboard payload와 atom DOM ownership가 좁게 고정되어 있다. | 외부 HTML clipboard, full node graph restore, custom atom renderer는 아직 contract가 아니다. |
| 외부 사례로 확인 | ProseMirror changelog, Lexical changelog, Lexical PR #6232 | mature editor도 read-only/noneditable에서 selection/copy를 계속 다루며 browser fallback을 신뢰하지 않는다. | changelog는 제품별 해결 방식의 근거이지 현재 repo의 실행 증명은 아니다. |
| 제품 QA 미정 | real browser copy/cut menu, mobile selection handle, assistive tech announcement | browser/device matrix가 필요하면 `verify:browser`와 manual capture로 별도 닫아야 한다. | 현재 internal gate의 범위 밖이다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| read-only에서 selection 추적 | 유지 확정 | copy/navigation이 살아 있으려면 selection은 document mutation과 독립적으로 유지되어야 한다. |
| read-only copy | 유지 확정 | 읽기 전용 문서의 기본 기대다. mutation guard와 충돌하지 않는다. |
| read-only cut copy-only | 유지 확정 | cut intent의 clipboard half는 수행하되 delete half는 read-only가 차단한다. |
| read-only paste/drop | mutation 차단 확정 | payload를 읽어도 document insertion으로 이어지면 read-only 의미가 깨진다. |
| atom payload source로 native DOM selection 사용 | 제거 확정 | noneditable atom 주변 browser selection은 빠짐, stale range, controls 위험이 있다. |
| custom MIME node graph | 보류 | 현재 paste contract는 text/markdown envelope다. Node graph restore는 trust/migration/merge policy가 필요하다. |

## 결론

Read-only와 noneditable은 "selection 없음"이 아니라 "mutation 없음"이다. Selection,
copy, keyboard navigation은 계속 editor-owned canonical model을 통해 유지하고,
browser native DOM selection은 관찰 source나 시각 channel일 뿐 payload/source of
truth로 승격하지 않는다. Copy payload는 editable/read-only 공통 문자열 envelope로
고정하고, cut은 editable에서만 delete까지 진행한다.
