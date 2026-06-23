# Editor Unicode grapheme RTL offset policy audit

작성일: 2026-06-22

범위: JavaScript string offset, DOM text offset, Unicode grapheme cluster, emoji,
combining mark, Hangul jamo, RTL/BiDi text가 cursor movement, deletion,
selection bridge, clipboard serialization에 주는 영향을 정리한다.

## 판정

현재 editor의 text offset은 JSON string 안의 UTF-16 index다. 하지만 legal cursor stop,
collapsed Backspace/Delete, DOM selection bridge는 사용자 단위인 grapheme boundary로
snap해야 한다. 즉 저장 좌표와 편집 단위는 같지 않다.

DOM `Selection.anchorOffset`, DOM `Range`, `beforeinput.getTargetRanges()`는
canonical model offset이 아니다. Editor는 DOM/native offset을 읽은 뒤 document text
기준 `snapTextOffset`으로 legal boundary에 수렴시킨다.

현재 ArrowLeft/Right는 logical document order의 backward/forward movement로만 확정한다.
RTL/BiDi visual movement와 browser geometry parity는 아직 지원 contract가 아니다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/textBoundaries.ts` | `Intl.Segmenter(..., { granularity: "grapheme" })`로 text boundary를 만들고, offset을 nearest/forward/backward boundary로 snap한다. |
| `src/editor/internal/model/cursor.ts` | cursor point normalize와 movement가 text offset을 grapheme boundary로 보정한다. |
| `src/editor/internal/model/text-command/textCommands.ts` | collapsed text deletion은 previous/next grapheme boundary를 기준으로 range를 삭제한다. |
| `src/editor/internal/view/contenteditable/contentEditableTextPoint.ts` | DOM selection offset을 text-run `data-path`와 document text 기준 grapheme boundary로 변환한다. |
| `src/editor/internal/view/contenteditable/contentEditableViewEngine.ts` | native edit flush 후 caret offset을 `snapTextOffset`으로 보정한다. |
| `src/editor/internal/fixtures/unicodeGraphemeCorpus.ts` | variation selector, keycap, ZWJ emoji, combining mark, committed Hangul jamo corpus를 공유한다. |
| `src/editor/internal/model/textBoundaries.test.ts` | `Intl.Segmenter` grapheme boundary와 `Intl.Segmenter` 미지원 code point fallback을 고정한다. |
| `cursor model split tests` | emoji surrogate pair, decomposed letter, Unicode corpus movement를 고정한다. |
| text command split tests | grapheme cluster Backspace/Delete와 Unicode corpus deletion을 고정한다. |
| `contentEditable view split tests` | DOM selection과 native flush caret이 grapheme boundary로 snap되는 것을 Unicode corpus로 고정한다. |
| `clipboard split tests` | multi-code-unit grapheme range serialization이 text를 누락하지 않는 것을 Unicode corpus로 고정한다. |
| Lexical PR #7175 | BMP code point + variation selector emoji인 `❤️` deletion이 surrogate-pair workaround만으로는 부족하다고 설명한다. |
| Lexical changelog | emoji, Japanese/Korean IME, RTL selection/direction, composition 관련 수정이 반복된다. |
| ProseMirror view changelog | RTL `coordsAtPos`, line wrap coordinates, right-to-left arrow, `inclusiveStart`/`inclusiveEnd` 명명 변경, composition/cursor 수정이 반복된다. |
| W3C Input Events Level 2 | `getTargetRanges()`는 browser가 바꿀 `StaticRange`를 주지만, 반환 range가 grapheme cluster 전체가 아니라 code point 일부일 수 있다고 명시한다. |

## Current model rule

| 항목 | policy |
| --- | --- |
| stored text offset | UTF-16 string index를 저장한다. JSON string과 DOM text node offset을 왕복할 수 있는 최소 좌표다. |
| legal cursor offset | `textBoundaryOffsets(text)`가 반환하는 grapheme boundary index만 legal cursor stop이다. |
| collapsed deletion unit | composition이 active가 아니면 one grapheme cluster를 삭제한다. Code unit이나 code point 하나를 직접 삭제하지 않는다. |
| range selection | anchor/focus는 UTF-16 index이지만 boundary snap 이후의 legal cursor point여야 한다. |
| DOM selection input | DOM offset은 raw observation이다. `readContentEditableSelection`이 document text 기준으로 snap한다. |
| beforeinput target range | intent/evidence로만 사용한다. Grapheme 일부를 가리킬 수 있으므로 command policy가 최종 단위다. |
| composition/preedit | IME composition 중 내부 jamo/partial character deletion은 native composition owner가 우선한다. Composition이 끝난 canonical text는 grapheme boundary contract를 따른다. |
| fallback segmentation | `Intl.Segmenter`가 없으면 `Array.from(text)` code point fallback이다. ZWJ/combining/keycap 같은 full grapheme 보장은 하지 않으며 실행 테스트로 명시한다. |

## DOM offset to model offset rule

| 단계 | 규칙 |
| --- | --- |
| 1. root containment | DOM anchor/focus가 editor root 밖이면 editor selection source가 아니다. |
| 2. text-run mapping | closest `.text-run[data-path]` 또는 equivalent boundary에서 canonical text path를 찾는다. Atom DOM 안 offset은 text point로 만들지 않는다. |
| 3. raw offset read | DOM text/range offset을 해당 text node의 raw string offset으로 환산한다. |
| 4. snap | `snapTextOffset(readDocumentText(document, path), rawOffset, affinity)`로 legal boundary를 만든다. |
| 5. command use | paste/cut/delete/input command는 snapped selection만 사용한다. |

이 규칙 때문에 DOM `Selection.anchorOffset`을 model offset으로 직접 저장하면 안 된다.
Surrogate pair 중간, variation selector 사이, mark element boundary, contenteditable=false
atom boundary에서 stale 또는 illegal cursor가 생긴다.

## Deletion and movement policy

| 입력 | current policy |
| --- | --- |
| Backspace at collapsed text caret | previous grapheme boundary부터 current boundary까지 삭제한다. |
| Delete at collapsed text caret | current boundary부터 next grapheme boundary까지 삭제한다. |
| Backspace/Delete during IME composition | composition buffer/native event policy가 우선한다. Browser DOM effect를 바로 canonical delete로 믿지 않는다. |
| Arrow backward/forward | logical cursor stream에서 previous/next legal cursor point로 이동한다. |
| Shift+Arrow | anchor를 유지하고 focus를 logical stream상 previous/next point로 이동한다. |
| Word movement | current representative word segmentation과 atom one-unit policy만 확정한다. Locale-wide word break matrix는 보류다. |
| Line/page/vertical movement | geometry adapter가 있는 LTR horizontal layout 중심으로만 확정한다. |
| RTL/BiDi visual ArrowLeft/Right | 아직 지원 contract가 아니다. #80에서 browser matrix와 제품 정책을 정한다. |

## Fixture matrix

| fixture | 예 | 현재 상태 | 기대 |
| --- | --- | --- | --- |
| surrogate-pair emoji | `A😀B` | 실행 테스트 있음 | cursor length는 visible 3 units, emoji 중간 offset은 boundary로 snap, delete once. |
| decomposed letter | `e\u0301 y` | 실행 테스트 있음 | decomposed grapheme을 word character로 본다. |
| DOM mid-grapheme selection | offset inside `😀` | 실행 테스트 있음 | DOM offset 2는 legal boundary offset 3으로 snap한다. |
| grapheme clipboard range | `A😀B` | 실행 테스트 있음 | `[0,4)` slice를 그대로 serialize하고 emoji를 누락하지 않는다. |
| BMP + variation selector emoji | `❤️` | 실행 테스트 있음 | delete once, intermediate `❤` state를 만들지 않는다. |
| keycap sequence | `#️⃣` | 실행 테스트 있음 | delete/move가 sequence를 한 grapheme으로 다룬다. |
| ZWJ emoji sequence | `👨‍👩‍👧‍👦` | 실행 테스트 있음 | `Intl.Segmenter`가 있으면 one grapheme movement/delete로 다룬다. |
| combining mark sequence | `a\u0301`, multiple combining marks | 실행 테스트 있음 | delete/move boundary corpus가 multiple combining marks를 포함한다. |
| Hangul jamo sequence | `한` | 실행 테스트 있음 | composition 중은 native owner, committed jamo는 grapheme policy를 따른다. |
| RTL plain text | Hebrew/Arabic word | missing | logical movement와 visual movement를 분리한다. #80. |
| mixed BiDi text | `abc שלום def` | missing | ArrowLeft/Right, Home/End, geometry rect policy를 별도 matrix로 정한다. #80. |
| RTL + atom/mark boundary | RTL text + mention/link/code | missing | atom edge와 mark boundary가 visual cursor를 깨는지 browser fixture가 필요하다. #80. |

## Logical vs visual movement

| 개념 | 의미 | current status |
| --- | --- | --- |
| logical backward/forward | document text order의 previous/next cursor point | 확정 |
| physical ArrowLeft/ArrowRight | keyboard key label | current input adapter는 LTR 중심으로 logical movement에 매핑한다. |
| visual left/right | 화면에서 왼쪽/오른쪽 caret stop | RTL/BiDi에서는 logical order와 다를 수 있다. 미확정. |
| start/end | writing direction aware boundary name | future API/docs에서 left/right보다 우선해야 한다. |
| geometry rect | browser layout이 만든 viewport rect | current LTR tests 중심. BiDi rect는 #80. |

ProseMirror가 `inclusiveLeft`/`inclusiveRight`를 `inclusiveStart`/`inclusiveEnd`로
바꾼 이유와 같은 방향으로, editor 내부 정책도 logical direction과 physical direction을
섞지 않아야 한다.

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| stored offset is UTF-16 index | source 확정 | text node path+offset과 JSON string slice/replace가 UTF-16 index를 사용한다. | Public API 문서로 노출할 때는 grapheme boundary 제약을 같이 적어야 한다. |
| legal cursor boundary is grapheme | 실행 테스트로 확정 | `textBoundaries.ts`, cursor/textCommands/contentEditable tests가 emoji/decomposed/Unicode corpus snap/delete를 고정한다. | RTL/BiDi visual movement는 별도다. |
| DOM offset is not canonical | 실행 테스트로 확정 | native selection bridge tests가 root containment, text-run mapping, grapheme snap, mark boundary mapping을 검증한다. | Real browser DOM Range boundary matrix는 별도다. |
| collapsed text delete is grapheme-owned | 실행 테스트로 확정 | text command split tests가 grapheme cluster backward/forward deletion을 검증한다. | IME preedit 내부 삭제는 native composition owner 영역이다. |
| `getTargetRanges()` can be partial grapheme | spec 확정 | W3C Input Events Level 2가 target ranges may cover only code points even when part of grapheme cluster라고 명시한다. | Browser implementation differences는 separate trace가 필요하다. |
| Unicode upstream risk | 외부 사례 확정 | Lexical #7175, Lexical changelog, ProseMirror changelog가 emoji/IME/RTL/cursor fixes를 반복한다. | 각 upstream fix를 current implementation에 그대로 적용한다는 뜻은 아니다. |
| logical movement current status | 실행 테스트로 확정 | cursor and cursorCommands tests가 logical stream movement/range extension을 고정한다. | RTL/BiDi visual movement는 미확정이다. |
| RTL/BiDi visual movement | 미정 | docs/cursor geometry audits도 LTR horizontal 중심이라고 분리한다. | #80에서 browser matrix가 필요하다. |
| `Intl.Segmenter` fallback | 실행 테스트로 명시 | fallback은 `Array.from(text)` code point segmentation이다. | Full grapheme contract가 필요한 runtime이면 polyfill/guard를 별도 도입해야 한다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| DOM offset을 그대로 canonical offset으로 저장 | 제거 확정 | code unit/code point/grapheme boundary가 다르다. |
| collapsed delete를 code unit 단위로 구현 | 제거 확정 | surrogate pair와 variation selector emoji를 깨뜨린다. |
| grapheme boundary를 persisted offset unit으로 바꾸기 | 제거 | JSON string/DOM Range와의 interop가 어려워진다. UTF-16 index + legal boundary 제약이 더 작은 contract다. |
| browser `getTargetRanges()`를 delete 단위로 신뢰 | 제거 | spec상 grapheme 일부만 가리킬 수 있다. |
| `Intl.Segmenter` 없이 full grapheme 보장 선언 | 제거 | fallback은 code point 수준임을 실행 테스트로 고정했다. |
| RTL/BiDi visual movement 완료 선언 | 제거 | current tests와 geometry는 LTR 중심이다. |
| logical movement contract | 유지 | model command, deletion, selection extension의 안정적 기준이다. |

## 후속 이슈

| issue | 목적 |
| --- | --- |
| #79 | Unicode grapheme fixture matrix와 `Intl.Segmenter` fallback policy를 구현한다. |
| #80 | BiDi/RTL visual cursor movement와 geometry browser matrix를 설계한다. |

## 현재 결론

현재 editor의 정석은 UTF-16 offset을 저장하되, legal cursor/deletion boundary는
grapheme cluster로 제한하는 것이다. DOM selection과 beforeinput target range는
그대로 믿지 않고 document text 기준으로 snap한다.

확정하지 말아야 할 것은 `Intl.Segmenter` 미지원 환경의 full grapheme 보장과 RTL/BiDi
visual movement parity다. Unicode corpus의 model/view/clipboard fixture는 #79 범위에서
닫고, RTL/BiDi visual movement는 #80에서 별도 browser matrix로 닫아야 한다.
