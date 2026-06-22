# Editor DOM dirty range policy audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. Browser native DOM mutation을 editor model로
복원할 때 dirty DOM range를 얼마나 믿을지, 그리고 full DOM reparse/diff를 만들지
여부를 정리한다.

## 목적

Browser가 이미 contenteditable DOM을 바꾼 뒤 model을 복원하는 경로는 위험하다.
DOM은 renderer output이고, canonical truth는 `NoteDocument`와 command result다.

따라서 현재 editor의 정석은 ProseMirror식 general DOM dirty range parser를 작게
복제하는 것이 아니라, native mutation을 허용하는 범위를 active text leaf 하나로
제한하는 것이다. Leaf 밖 DOM mutation은 model diff source가 아니라 renderer restore
대상이다.

## ProseMirror-view 근거

| 근거 | 원문 | 의미 |
| --- | --- | --- |
| DOM change 해석은 start-of-operation selection/document 기준으로 하고 중간 변경은 mapping된다고 주석화되어 있다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domchange.ts#L9-L13 | DOM change를 읽어도 기준 document/selection과 mapping discipline이 필요하다. |
| `parseBetween`은 dirty DOM range를 DOMParser로 다시 파싱하고 selection anchor/head도 같이 찾는다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domchange.ts#L15-L56 | General DOM reparse는 parser, selection mapping, diff를 한 세트로 요구한다. |
| `ViewDesc.parseRange`는 변경 범위를 sibling boundary까지 확장하고 mark view 내부 과소파싱 한계를 주석으로 남긴다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/viewdesc.ts#L341-L386 | Dirty range는 mark/widget/block boundary에서 과확장과 과소확장 위험이 있다. |
| `readDOMChange`는 parsed doc과 기존 slice의 diff, type-over, selection-only, no-change를 분기한다. | https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domchange.ts#L81-L145 | DOM reparse를 허용하면 diff policy와 special case가 같이 필요하다. |

## 현재 구조

```text
beforeinput/input
  -> contentEditableViewEngine.planBeforeInput
    -> native 허용: collapsed plain text leaf, activePath와 같은 leaf, IME composition leaf
      -> browser mutates that text-run DOM
      -> trackInput remembers activePath and composition text
      -> flush reads one text element textContent
      -> one JSON Patch replace at the text path
      -> selectionAfter from DOM caret snapped to grapheme boundary
    -> native 불허: range text insert, active marks, atom/widget, block boundary, structural input
      -> runHeadless
      -> model command/input adapter owns patch and selectionAfter
      -> renderer reprojects canonical document
```

현재 dirty range 단위는 DOM `Range`가 아니라 canonical text path 하나다. 이 path는
`.text-run[data-path]` 또는 code text path여야 한다.

## Dirty range fixture table

| 경계 | fixture | 기대 |
| --- | --- | --- |
| mark boundary | `span.text-run > strong` 내부 text node가 바뀜 | mark wrapper는 parser 대상이 아니고, 같은 text leaf의 `textContent`만 patch로 읽는다. |
| widget boundary | `contenteditable=false` mention 내부에 selection/input이 들어옴 | native dirty range를 시작하지 않고 headless path로 되돌린다. |
| block boundary | active text leaf가 바뀌는 동안 sibling block DOM도 오염됨 | flush patch는 active text path 하나만 만들고 sibling block DOM은 model diff에 넣지 않는다. reset/render가 canonical text로 복원한다. |

## DOM reparse 허용/금지 정책

| 영역 | native DOM을 diff source로 허용? | 이유 |
| --- | --- | --- |
| active plain text leaf | 허용 | browser IME와 simple text insertion/deletion은 text leaf `textContent`가 가장 작은 native buffer다. |
| active code text leaf | 허용 | code block도 text path 하나로 환원된다. Structural block split은 command path가 맡는다. |
| marked text leaf 내부 | 허용하되 leaf text만 | mark DOM wrapper는 format structure이고, diff source는 text-run 전체 `textContent`다. |
| non-collapsed range insert | 금지 | selection replacement는 command가 범위와 atom coverage를 알고 처리해야 한다. |
| active marks insert | 금지 | browser DOM insert는 새 mark structure를 만들지 못하므로 headless command가 처리한다. |
| `contenteditable=false` atom/widget 내부 | 금지 | atom 내부 DOM은 model text가 아니다. |
| atom 앞뒤 boundary | 금지 | atom edge selection/replacement는 cursor stream과 model command가 소유한다. |
| sibling text leaf/block | 금지 | active leaf 밖 DOM mutation을 diff하면 browser side effect가 model transaction으로 승격된다. |
| arbitrary HTML subtree | 금지 | sanitizer/parser/schema migration/diff policy가 없는 DOM은 canonical model source가 아니다. |

## Fallback policy

| 상황 | 처리 |
| --- | --- |
| active leaf를 찾을 수 없음 | flush 실패로 반환하고 renderer/model path가 DOM을 다시 그리게 한다. |
| active leaf text가 model과 같음 | document patch 없이 selectionAfter만 갱신한다. Foreign child DOM은 reset에서 canonical text node로 정리한다. |
| active leaf text가 model과 다름 | `{ op: "replace", path, value: nextText }` 한 개만 반환한다. |
| leaf 밖 DOM이 오염됨 | flush가 patch로 읽지 않는다. `reset(root, document)` 또는 React render가 canonical model에서 복원한다. |
| composition final commit 중복 | leaf text normalization만 수행한다. Mark/widget/block reparse로 확장하지 않는다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| leaf-only native flush | 실행 테스트로 확정 | `contentEditableViewEngine.test.ts`가 native text mutation을 one text-path replace patch로 검증한다. | jsdom text mutation fixture이며 real IME event ordering은 trace tests가 보강한다. |
| mark boundary fixture | 실행 테스트로 확정 | mark wrapper 내부 text mutation도 text-run `textContent`만 patch로 읽고 wrapper DOM을 parser source로 삼지 않는 test가 있다. | mark split/merge DOM structural mutation은 headless command 범위다. |
| widget boundary fixture | 실행 테스트로 확정 | `contenteditable=false` mention 내부 selection에서 native dirty edit을 시작하지 않는 test가 있다. | pointer/node selection UX는 별도 selection tests가 담당한다. |
| block boundary fixture | 실행 테스트로 확정 | active leaf flush가 sibling block DOM 오염을 patch에 넣지 않고 reset이 canonical text로 복원하는 test가 있다. | React reconciliation 전체 restore는 integration tests와 renderer contract에 의존한다. |
| no general DOM parser | source 구조로 확정 | view engine에는 DOMParser/sanitizer/full subtree diff가 없고, model mutation은 command patch와 leaf text patch로 들어간다. | rich paste/HTML import 요구가 생기면 별도 sanitized import path가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| ProseMirror식 general dirty DOM reparse 복제 | 제거/보류 | 현재 schema와 renderer는 plugin DOMParser/ViewDesc 계층이 없다. 작은 복제는 mark/widget/block boundary에서 더 위험하다. |
| active text leaf native buffer | 유지 확정 | IME와 browser text input을 수용하기 위한 가장 작은 DOM trust boundary다. |
| full subtree diff로 model 복원 | 제거 확정 | renderer-owned DOM side effect를 model transaction으로 승격시키는 경로다. |
| reset/render canonical restore | 유지 확정 | leaf 밖 DOM 오염은 diff source가 아니라 canonical render projection으로 복원해야 한다. |
| future sanitized HTML reparse | 보류 | paste/import 제품 요구가 있으면 clipboard/import adapter에서 schema-aware sanitizer로 설계한다. contenteditable flush에 섞지 않는다. |

## 현재 결론

현재 2026년 기준 이 editor에 맞는 세련된 방식은 DOM dirty range parser를 일반화하지
않는 것이다. Native DOM은 active text leaf의 temporary buffer로만 허용하고, 그 밖의
selection/range/atom/block/HTML 구조 변화는 headless model command와 canonical renderer
restore가 소유한다.
