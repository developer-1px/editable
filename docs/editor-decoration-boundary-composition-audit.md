# Editor decoration boundary composition audit

작성일: 2026-06-22

범위: inline decoration, widget, mark boundary, non-inclusive mark, inline atom
경계가 composition target과 cursor placement를 깨는지 조사한다. 현재 구현에는
ProseMirror식 decoration registry, zero-width widget, placeholder, typeahead가 없다.

## 판정

현재 editor에서 안전한 정석은 decoration/widget을 document cursor stream 안에
끼워 넣지 않는 것이다. Browser IME가 소유하는 것은 active text leaf DOM 하나이고,
mark wrapper는 그 text leaf의 시각 wrapper일 뿐 별도 cursor unit이 아니다.

따라서 지금 확정할 정책은 아래다.

- mark wrapper는 composition owner가 아니다. DOM selection이 `strong`, `em`,
  `code`, `a` boundary에 걸려도 canonical text path/offset으로 수렴한다.
- mention/figure는 widget이 아니라 schema atom이다. `contentEditable=false`라도
  document node이므로 pointer/atom selection과 before/after cursor point로 다룬다.
- selection/cursor overlay, toolbar, debug inspector는 widget-like DOM이지만
  `editor-surface` 밖에 두고 native selection source가 되지 않는다.
- composition 중 active text leaf를 split/wrap/replace하는 decoration update는
  지연하거나 command boundary로 승격한다.
- future zero-width widget, placeholder, comment marker는 `side`, event ownership,
  selection ownership, destroy cleanup 계약 없이는 추가하지 않는다.

## 현재 구현 사실

| 항목 | 현재 상태 | 근거 |
| --- | --- | --- |
| decoration registry | 없음 | `DocumentRenderer`가 schema document를 직접 렌더한다. |
| inline widget | 없음 | mention은 schema atom이고 overlay는 surface 밖이다. |
| mark wrapper | text-run 내부 React wrapper | `renderMarkedText`가 text leaf 안에서 mark DOM을 만든다. |
| active composition owner | active text leaf 하나 | `contentEditableViewEngine`의 active path gate와 one-patch flush |
| atom boundary | text point로 crossing 금지 | DOM selection bridge가 `contenteditable=false` 내부를 `null`로 둔다. |
| overlay boundary | cursor stream 밖 | selection/cursor overlay는 sibling visual projection이다. |
| popup/typeahead | 없음 | fixed toolbar만 있고 command 전 native buffer를 release한다. |

## Boundary 정책

| Boundary | 현재 정책 | 이유 |
| --- | --- | --- |
| text-run 내부 mark 시작/끝 | 같은 text path의 offset으로 수렴 | mark DOM은 model cursor unit이 아니다. |
| mark element DOM boundary | range text length로 text-run offset 계산 | browser가 element boundary를 selection으로 줄 수 있다. |
| active mark + plain `insertText` | native DOM edit 금지, headless command 사용 | 삽입 text에 canonical mark를 붙여야 한다. |
| active mark + composition | composition release 후 marked text path로 commit | IME 중 wrapper를 바꾸지 않고 canonical mark를 보존한다. |
| mention atom 내부 | text selection으로 읽지 않음 | atom 내부 DOM은 text input target이 아니다. |
| mention atom 앞/뒤 | immediate adjacent text-run 또는 atom pointer edge | atom을 건너 text point를 합치지 않는다. |
| figure block | block atom before/after cursor point | text backing leaf가 없으므로 native text edit target이 아니다. |
| overlay DOM | selection/caret source 아님 | overlay는 model 없는 visual projection이다. |
| future widget DOM | 기본 금지 | side, key, stopEvent, ignoreSelection, destroy 없이 넣으면 cursor가 흔들린다. |

## Composition 중 render/update 정책

| Update | 정책 |
| --- | --- |
| active text leaf text node 유지 | 필수 |
| active text leaf wrapper class/style 변경 | 지연 |
| active text leaf를 inline decoration으로 split | 지연 |
| active text leaf 앞뒤 zero-width widget 삽입/삭제 | 지연 또는 command boundary |
| unrelated block의 passive overlay render | 허용 |
| toolbar active state render | editor DOM 밖 passive render만 허용 |
| toolbar/atom insertion command | composition/native buffer release 후 적용 |
| remote patch가 active leaf를 바꿈 | queue 후 composition commit 뒤 rebase/conflict |

핵심은 "composition 중 문서를 절대 바꾸지 않는다"가 아니라 "focused text node identity와
canonical path mapping을 바꾸지 않는다"이다. Active leaf와 무관한 passive UI는 가능하지만
active leaf 주변 DOM topology를 바꾸는 decoration은 늦춘다.

## 현재 테스트로 닫힌 것

| 항목 | 테스트 근거 |
| --- | --- |
| mark 뒤, link 뒤, mention 뒤, block start에서 native insert 시작 | `contentEditableViewEngine.test.ts`의 native dirty range 시작 case |
| active mark text insertion은 native DOM이 아니라 command path | `contentEditableViewEngine.test.ts`, `BlockEditor.test.tsx` |
| open range 일반 text insertion은 headless replacement | `contentEditableViewEngine.test.ts`, `BlockEditor.test.tsx` |
| same text leaf composition range는 native caret 허용 | `contentEditableViewEngine.test.ts` |
| multi text leaf/block range composition은 native defer 금지 | `contentEditableViewEngine.test.ts`, `BlockEditor.test.tsx` |
| mark element DOM boundary mapping | `contentEditableViewEngine.test.ts` |
| atom 내부 DOM position은 text point 아님 | `contentEditableViewEngine.test.ts` |
| atom pointer selection이 stale native range보다 우선 | `BlockEditor.test.tsx` |
| composition 중 custom cursor overlay 숨김 | `BlockEditor.test.tsx` |
| toolbar command 전 composition/native buffer release | `BlockEditor.test.tsx` |

## 아직 닫히지 않은 것

| 항목 | 상태 | 다음 처리 |
| --- | --- | --- |
| Chrome/Safari/Firefox 실제 mark boundary composition trace | 미수집 | 후속 이슈로 분리 |
| inline atom 앞뒤 실제 IME composition/deletion trace | 미수집 | 후속 이슈로 분리 |
| zero-width widget/placeholder producer | 없음 | producer가 생길 때 contract 먼저 작성 |
| typeahead/floating menu | 없음 | popup IME selection policy를 먼저 만족 |
| `beforeinput.getTargetRanges()` 기반 iOS Korean 10-key 처리 | 미구현 | real device trace 후 별도 설계 |
| browser별 shift-selection around atom/widget | jsdom 중심 | Playwright/device matrix 필요 |

## Future widget contract

Future widget을 document surface 근처에 추가하려면 최소 계약은 아래다.

| 계약 | 내용 |
| --- | --- |
| identity | role + anchor position + stable widget id를 key로 사용 |
| cursor side | before/after side를 명시하고 collapsed/shift selection 동작을 fixture로 고정 |
| event ownership | text input/composition은 editor root가 소유한다. widget이 자체 input이면 nested owner로 분리 |
| selection ownership | widget 내부 selection을 outer canonical selection으로 읽을지 명시 |
| mutation ownership | document content mutation과 widget chrome mutation을 분리 |
| destroy cleanup | listener, observer, timer, subscription을 destroy에서 해제 |
| composition guard | active text leaf를 split/wrap/replace하는 render는 composition release까지 지연 |

이 계약 없이 widget DOM을 `.text-block` child list 안에 넣는 것은 금지한다.

## 외부 근거

| 출처 | 이 문서에서 쓰는 의미 |
| --- | --- |
| https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | ProseMirror는 mark boundary composition selection 삭제, cursor wrapper, stored/non-inclusive mark, widget insertion/removal concurrent composition, widget side/selection 이동 문제를 반복적으로 수정했다. |
| https://prosemirror.net/docs/ref/#view.Decoration%5Ewidget | widget은 `side`, `relaxedSide`, `stopEvent`, `ignoreSelection`, `key`, `destroy` 같은 cursor/selection/lifecycle 계약을 가진다. |
| https://github.com/facebook/lexical/pull/8558 | Lexical는 leading inline `DecoratorNode` 앞에서 native caret이 stuck 되는 문제를 command-level cursor 이동으로 고쳤다. |
| https://github.com/facebook/lexical/pull/7987 | Lexical는 IME composition 중 transient range selection 때문에 typeahead가 닫히는 문제를 `isComposing` gate로 막았다. |
| https://github.com/facebook/lexical/pull/8148 | Lexical는 composition target이 다른 node로 이동할 때 이전 format/style을 잘못 상속하지 않게 고쳤다. |
| https://github.com/facebook/lexical/pull/8162 | Lexical는 formatted text를 composition text로 대체할 때 multi-format 보존 회귀를 고쳤다. |
| https://github.com/facebook/lexical/pull/8475 | iOS Korean 10-key IME는 composition event 없이 non-collapsed targetRange delete + insertText를 보낼 수 있다. |
| https://github.com/facebook/lexical/pull/8503 | compositionend에서 한 번에 들어오는 trigger character는 일반 typing heuristic과 다르게 처리해야 한다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| current decoration registry 부재 | source audit 확정 | decoration producer가 없다. |
| mark boundary DOM to text point mapping | 실행 테스트 확정 | mark element boundary test가 있다. |
| atom 내부 text mapping 금지 | 실행 테스트 확정 | contenteditable=false atom 내부 selection은 `null`이다. |
| active text leaf gate | 실행 테스트 확정 | native/composition/input tests가 active path를 고정한다. |
| overlay separation | source/test 확정 | overlay는 surface sibling이고 stale overlay hiding tests가 있다. |
| real browser mark/atom IME trace | 미정 | jsdom/unit test만으로 browser IME matrix를 닫을 수 없다. |
| future widget contract | 설계 절차 확정 | producer가 없으므로 runtime 구현 완료가 아니다. |

## 현재 결론

#11의 현재 결론은 "decoration/widget 기능을 추가해도 된다"가 아니다. 반대로 editor의
핵심 view engine은 mark wrapper와 atom boundary를 canonical cursor stream으로 수렴시키되,
model에 없는 widget DOM은 contenteditable surface 밖에 두는 쪽이 정석이다.

Composition 중 active text leaf를 건드리는 decoration은 delay 대상이다. Widget이 필요한
순간에는 ProseMirror처럼 side, selection, event, mutation, destroy contract를 먼저
public/internal boundary로 설계하고, Chrome/Safari/Firefox와 Korean/Japanese/Chinese IME
trace를 fixture로 남긴 뒤 도입한다.
