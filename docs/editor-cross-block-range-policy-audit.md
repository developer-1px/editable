# Editor Cross-Block Range Policy Audit

작성일: 2026-06-22

범위: cross-block range, atom 포함 range, code block 포함 range, Firefox multi-range
DOM selection, 그리고 composition/delete/paste가 이 selection을 만났을 때의 정책을
정한다.

## 판정

현재 editor의 정석은 single primary range다. Multi-range DOM selection은 public/model
기능으로 승격하지 않는다.

확정 정책:

- public `RichSelection`은 caret/range/node 세 variant만 가진다.
- range는 single primary range이고 source `selectedPointers`는 비워 둔다.
- range가 atom을 덮는지는 render/copy 단계에서 document+range로 파생한다.
- explicit node selection만 source `selectedPointers`를 가진다.
- delete/cut/paste/text input/Enter는 range를 먼저 command로 삭제 또는 대체한 뒤
  selectionAfter를 range start 쪽으로 둔다.
- cross-block composition은 browser native edit에 맡기지 않고 range를 먼저 command로
  삭제한 뒤 collapsed insertion point에서 composition을 시작해야 한다.
- Firefox multi-range DOM selection은 첫 range를 feature로 지원하지 않는다. Anchor/focus
  primary observation으로 normalize할 수 없으면 무시하고 canonical selection을 유지한다.

## Fixture 정의

| Fixture | Document | Selection | 닫아야 할 기대 |
| --- | --- | --- | --- |
| `range-single-text` | paragraph `ABCD` | `B..C` | delete/cut/text input/paste가 같은 text leaf 안에서 range replacement가 된다. |
| `range-inline-atom` | paragraph `AB` + mention + `CD` | `B`부터 `C`까지 | mention을 하나의 cursor unit으로 포함해 삭제/대체한다. Source `selectedPointers`는 비고 render 단계에서 mention pointer가 파생된다. |
| `range-block-atom` | paragraph `AB`, figure, paragraph `CD` | 첫 paragraph 중간부터 다음 paragraph before edge | figure block만 삭제하고 뒤 paragraph는 보존한다. SelectionAfter는 range start다. |
| `range-code-cross-block` | code block `abc`, paragraph `def` | code offset 1부터 paragraph offset 1 | code text와 paragraph text를 각각 잘라내고 focus-only edit로 떨어지지 않는다. |
| `range-enter` | inline atom 포함 paragraph | range 위 Enter | range를 삭제한 뒤 range start에서 paragraph split을 수행한다. |
| `range-paste` | inline atom 포함 paragraph | range 위 paste | range를 transfer text/markdown fragment로 대체한다. |
| `dom-multi-range-firefox` | Firefox drag selection으로 distinct ranges 발생 | `Selection.rangeCount > 1` | public multi-range로 승격하지 않는다. Primary anchor/focus를 정상 text point로 읽을 수 없으면 null/ignore다. |
| `range-composition-cross-block` | 두 block 이상을 덮는 range | compositionstart + insertCompositionText | browser native composition에 range 삭제를 맡기지 않는다. Command로 range 삭제 후 collapsed point에서 조합을 시작해야 한다. |

## 현재 실행 근거

| 항목 | 현재 상태 | 근거 |
| --- | --- | --- |
| public selection single range | 확정 | `RichSelection`은 caret/range/node만 정의하고 multi-range variant가 없다. |
| source range selectedPointers empty | 확정 | `selectionFromCursorRange`는 `selectedPointers: []`로 직렬화한다. |
| render atom derivation | 확정 | `selectionForRender`가 non-collapsed range에서 covered atom pointers를 파생한다. |
| inline atom range replacement | 확정 | inputAdapter split tests, text command split tests가 multi-node selection insert/delete를 검증한다. |
| block atom range delete | 확정 | selected block range delete가 figure를 제거하되 following paragraph를 보존하는 테스트가 있다. |
| code block cross range | 확정 | code block interior에서 시작하거나 끝나는 range delete/insert tests가 focus-only fallback을 막는다. |
| Enter over range | 확정 | `insertParagraph` over selected ranges는 delete 후 split으로 검증되어 있다. |
| paste over range | 확정 | `translateEditorInput(..., { type: "paste" })` range replacement 테스트가 있다. |
| DOM selection bridge | 부분확정 | `readContentEditableSelection`은 DOM `Selection.anchor/focus`를 text points로 읽어 single range로 만든다. |
| multi-range DOM selection | 미지원으로 확정 | public model/bridge는 `selectionRanges[primaryIndex]`와 anchor/focus만 쓴다. `rangeCount > 1`을 model feature로 보존하지 않는다. |
| cross-block composition range delete first | 실행 테스트로 확정 | composition start에서 cross-block/atom/code 포함 range를 먼저 command delete로 collapse하고, 같은 text leaf 내부 range만 native composition defer를 허용한다. |

## Composition/Delete/Paste 정책

| Input | Collapsed selection | Single-block range | Cross-block range |
| --- | --- | --- | --- |
| `insertText` | text leaf면 native buffer 또는 command insert | range replacement | command range replacement |
| `insertCompositionText` | active text leaf DOM을 IME에 맡김 | text leaf 내부 range만 제한적으로 native 가능 | command로 range 삭제 후 collapsed point에서 composition 시작. native DOM range delete에 맡기지 않음 |
| `compositionstart` | composition phase 시작 | range가 같은 text leaf면 browser preedit 가능 여부를 trace로 검증 | cross-block이면 먼저 command selection을 collapse/delete할 준비가 필요 |
| `deleteContentBackward/Forward` | cursor unit delete | range delete | range delete. 방향보다 range가 우선 |
| `deleteContent/deleteByCut` | collapsed면 no-op 또는 copy-only cut | range delete | range delete |
| `insertParagraph` | paragraph split/code newline | delete then split | delete then split at range start |
| paste/drop | transfer insert | transfer replacement | transfer replacement |
| copy | serializer | range serializer | ordered cursor range serializer |

Composition에서 가장 중요한 금지는 이것이다: browser가 cross-block DOM range를 어떻게
삭제하는지 관찰해서 model patch로 역산하지 않는다. Cross-block selection deletion은
model command가 먼저 소유해야 한다.

## Firefox Multi-Range 결정

Firefox drag selection은 multiple distinct ranges를 만들 수 있다. 하지만 current
editor는 table/grid/rectangular selection도, multi-cursor도 없다. 따라서 multi-range를
받아들이면 public model, command semantics, clipboard payload, overlay, history까지
한꺼번에 넓어진다.

현재 결정:

| 선택지 | 판정 | 이유 |
| --- | --- | --- |
| 모든 DOM ranges를 model `selectionRanges`로 보존 | 제거 | public `RichSelection`에 multi-range variant가 없고 command/delete/paste semantics가 없다. |
| DOM 첫 range만 사용 | 보류 | Firefox anchor/focus와 `getRangeAt(0)`의 시각 순서가 사용자 의도와 다를 수 있다. Browser matrix 없이 product behavior로 닫지 않는다. |
| anchor/focus primary observation으로 single range normalize | 제한 허용 | 현재 bridge가 하는 동작이다. 둘 다 editor text point로 읽히면 single range command source가 된다. |
| normalize 실패 시 무시 | 확정 | 잘못된 partial range를 delete/paste source로 쓰는 것보다 canonical selection 유지가 안전하다. |

## Range와 selectedPointers 관계

| 상태 | Source `selectedPointers` | Render/overlay `selectedPointers` | 의미 |
| --- | --- | --- | --- |
| caret | empty | empty | atom edge caret은 selected atom이 아니다. |
| text range | empty | covered atom 없음 | 일반 range다. |
| atom 포함 range | empty | covered mention/figure 파생 | range source가 atom list를 중복 저장하지 않는다. |
| explicit node selection | `[target]` | `[target]` | node selection만 source pointer를 가진다. |
| Firefox multi-range | unsupported | unsupported | multi selection overlay를 만들지 않는다. |

이 규칙 때문에 range delete/copy/paste는 `selectedPointers`가 아니라 ordered cursor
range를 기준으로 동작한다. `selectedPointers`는 explicit node selection 또는 render
affordance다.

## 외부 근거

| 출처 | 이 문서에서 쓰는 의미 |
| --- | --- |
| https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | ProseMirror는 selection이 block boundary를 넘은 상태에서 composition이 시작될 때 먼저 selection을 삭제하는 수정, paragraph를 가로지르는 composition이 Enter처럼 처리되는 문제, Firefox multi-range drag selection 처리 기록을 남겼다. |
| https://github.com/facebook/lexical/pull/7050 | Lexical PR #7050은 Firefox native selection이 element point로 resolve되는 차이를 `applyDOMRange` 후 normalize해야 한다고 설명한다. |
| https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | Lexical은 NodeSelection/GridSelection 같은 별도 selection variant를 도입해 range와 multi-node/table selection을 구분했다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| single primary range model | source/type 확정 | `RichSelection`과 `selectionFromCursorRange`가 multi-range를 public surface로 내보내지 않는다. |
| atom coverage derivation | 실행 테스트로 확정 | range source pointer는 비고 render 단계에서 mention/figure pointer가 파생된다. |
| range delete/replacement | 실행 테스트로 확정 | inline atom, block atom, code block, selected ranges over Enter/paste/delete가 테스트에 있다. |
| DOM anchor/focus bridge | 실행 테스트로 부분확정 | root containment, text-run mapping, grapheme snap, native range copy/cut/paste가 있다. |
| Firefox multi-range | policy 확정 / browser QA 미정 | public model 미지원은 확정이다. 실제 Firefox drag selection의 `rangeCount` ordering은 별도 browser fixture가 필요하다. |
| cross-block composition delete-first | 실행 테스트로 확정 | view engine은 visible cross-block DOM range의 `insertCompositionText` native defer를 막고, React integration은 composition start에서 cross-block range를 먼저 삭제한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| public multi-range selection | 제거 확정 | product feature가 없고 command/clipboard/history/overlay 전체가 커진다. |
| source range `selectedPointers` 저장 | 제거 확정 | render/copy에서 document+range로 파생 가능하며 stale topology를 만들지 않는다. |
| cross-block range command delete | 유지 확정 | browser native edit에 맡기면 IME/delete/paste DOM 차이를 model로 역산해야 한다. |
| cross-block composition native defer | 제거 확정 | range 삭제와 composition target이 browser마다 갈라진다. |
| Firefox multi-range first-range support | 보류 | browser ordering evidence 없이 expected로 박으면 틀린 호환성이 된다. |

## 후속 확인 필요

현재 정책상 추가 browser evidence가 필요한 항목:

1. Firefox multi-range DOM selection fixture를 browser gate 또는 recorded trace로
   추가해 normalize 실패 시 canonical selection 유지가 되는지 확인한다.
2. `readContentEditableSelection`이 `Selection.rangeCount > 1`인 경우의 현재
   anchor/focus normalize 동작을 명시적으로 테스트하거나, 안전하게 null로 돌릴지
   결정한다.

## 결론

Cross-block range는 browser DOM mutation 문제가 아니라 model command 문제다. Delete,
cut, paste, Enter, text input은 ordered cursor range command로 먼저 처리해야 하고,
composition도 cross-block range에서는 delete-first policy를 따라야 한다. Multi-range
DOM selection은 지금 지원하지 않는다. 현재 editor가 지켜야 할 최소 정석은 single
primary range를 canonical source로 유지하고, atom coverage는 render 단계에서 파생하며,
browser-specific multi-range나 composition DOM effect를 document truth로 승격하지 않는
것이다.
