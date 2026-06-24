# Editor cursor navigation model audit

작성일: 2026-06-22
갱신일: 2026-06-23

범위: 현재 dirty workspace 기준. Cursor stream, character/word/block/document/line/page
movement, atom movement, geometry dependency가 어디까지 확정인지와 어디부터
브라우저/locale/product 정책인지 분리한다.

## 목적

Cursor navigation은 selection, text command, geometry adapter, keyboard input을
연결하는 중심 seam이다. 이 문서는 logical cursor model이 뺄 수 없는 확정인지,
또는 더 많은 public movement methods/geometry concepts를 노출해야 하는지 판정한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/cursor.ts` and cursor helpers | cursor public type/facade를 유지하고, stream movement는 `cursorMovement.ts`, point normalization은 `cursorNormalization.ts`, word movement는 `cursorWordMovement.ts`, index/query는 `cursorDocumentIndex.ts`, endpoint projection은 `cursorEndpoints.ts`가 정의한다. |
| `src/editor/internal/model/cursorCommands.ts` | selection-aware movement commands, range collapse/extension, preferredX context, geometry-backed line/page movement를 구현한다. |
| `cursor model split tests` | visible character movement, emoji/decomposed grapheme, marked text-run shared boundaries, atom units, rich text block stream, normalization을 검증한다. |
| `cursor command split tests` | horizontal/word/block/document/vertical/page movement, range collapse/extension, atom coverage, preferredX behavior를 검증한다. |
| inputAdapter split tests | keyboard events가 movement commands로 번역되는 것을 검증한다. |
| `cursorGeometry split tests` | line/page/vertical movement에 필요한 DOM geometry adapter behavior를 검증한다. |
| `docs/editor-selection-model-audit.md` | `RichSelection`과 `SelectionSnap` 관계, render atom derivation, selection-only no-history behavior를 정리한다. |
| `docs/editor-cursor-geometry-audit.md` | DOM geometry는 model cursor point와 viewport rect를 연결하는 view adapter라고 정리한다. |

## 확정 cursor navigation behavior

| 항목 | 확정 내용 |
| --- | --- |
| cursor coordinate | Cursor point는 text path+offset 또는 node path+before/after edge다. Atom 내부 cursor는 없다. |
| logical stream | paragraph/heading/quote/listItem/codeBlock/figure가 하나의 model cursor stream에 들어간다. Text block 사이에는 불필요한 structural stop을 만들지 않는다. |
| visible character movement | marked text는 delimiter가 아니라 visible text offset 기준으로 이동한다. |
| grapheme boundary | emoji와 decomposed letter는 grapheme boundary 기준으로 이동/normalize된다. |
| adjacent text-run boundary | 서로 다른 marks를 가진 adjacent text run의 맞닿은 offset은 같은 cursor index로 취급된다. |
| inline atom unit | mention은 before/after edge를 가진 one cursor unit이다. |
| block atom unit | figure block은 before/after edge를 가진 one cursor unit이다. |
| word movement | word movement는 text word boundary를 쓰고, mention/figure atom을 one word unit으로 취급한다. Punctuation과 marked text-run boundary 회귀가 있다. |
| block/document boundary movement | block boundary movement는 current block before/after edge로 가고, document movement는 first/last cursor point로 간다. |
| open range collapse | plain horizontal/word/vertical movement는 open range를 direction edge로 collapse하고, movement affinity를 보존한다. |
| range extension | Shift movement는 anchor를 유지하고 focus를 next cursor point로 이동한다. Atom coverage는 source `selectedPointers`가 아니라 render 단계에서 파생된다. |
| preferredX context | vertical/page movement는 `preferredX` selection context를 유지하고, horizontal movement는 vertical context를 지운다. |
| geometry seam | ArrowUp/Down/PageUp/PageDown, visual line Home/End는 `CursorGeometryAdapter`가 있을 때 DOM geometry를 사용한다. Geometry가 없으면 일부 command는 document/block fallback 또는 capability failure로 처리된다. |
| keyboard mapping | ArrowLeft/Right, Alt/Option word, Alt/Option block, Home/End, Cmd/Ctrl line/document, PageUp/PageDown mapping은 current input adapter 기준으로 닫혀 있다. |
| selection-only history | movement command는 document patch 없이 selection만 바꾸며 document undo entry를 만들지 않는다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| cursor logical stream helpers | 유지 확정 | document schema를 visible cursor coordinates로 바꾸는 core model implementation이다. `cursor.ts`는 facade이고, movement/normalization/index/endpoint helper를 삭제하면 movement/delete/selection logic이 여러 command에 퍼진다. |
| `cursorCommands.ts` selection-aware movement seam | 유지 확정 | plain movement, shift extension, range collapse, preferredX context를 한 곳에서 다룬다. |
| `CursorGeometryAdapter` for line/page movement | 유지 확정 | model이 DOM을 직접 알지 않으면서 visual movement를 지원하는 작은 adapter seam이다. |
| public per-key movement methods | 보류 | current public command는 `dispatch({ type: "moveSelection", unit, direction, extend })`로 충분하다. Per-key methods를 늘릴 근거가 없다. |
| atom 내부 cursor | 제거 확정 | mention/figure는 atom이다. 내부 cursor를 만들면 schema/render/selection contract가 달라진다. |
| source `selectedPointers` for range movement | 제거 확정 | render atom coverage는 document+range에서 파생된다. Source selection에 저장하지 않는다. |
| browser pixel parity를 model contract로 승격 | 보류 | cursor stream은 model contract지만 exact pixel layout은 geometry/browser QA 영역이다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| cursor coordinate contract | 확정 | `cursor.ts`, `cursorMovement.ts`, `cursorNormalization.ts`, `cursorDocumentIndex.ts`와 cursor model split tests가 text path+offset, node path+before/after edge, cursor index resolution, atom pointer coverage를 직접 검증한다. | Public DOM Range API나 browser selection DTO를 의미하지 않는다. |
| logical cursor stream | 확정 | cursor model split tests가 paragraph/heading/quote/listItem/codeBlock/figure를 같은 stream으로 다루고, text block 사이 structural stop을 만들지 않는다고 고정한다. | Future custom block/inline node의 cursor descriptor는 아직 없다. |
| grapheme and visible character movement | 확정 | marked text visible offset, emoji one grapheme boundary, decomposed letter word character, adjacent marked text-run shared boundary가 model tests로 닫혀 있다. | Locale-wide segmentation matrix와 complex script policy는 별도 검증이 필요하다. |
| atom unit movement and coverage | 확정 | mention/figure before/after edge 이동, word movement에서 atom one unit 처리, range render 단계의 selected atom derivation이 cursor model split tests와 cursor command split tests에 있다. | Atom 내부 editing이나 caption/media metadata cursor semantics는 current contract가 아니다. |
| horizontal/word/block/document movement | 확정 | range collapse, movement affinity, punctuation/marked-run word boundary, block boundary, document start/end movement가 cursor command split tests로 고정되어 있다. | Customizable movement policy나 product-specific word rules는 없다. |
| range extension behavior | 확정 | Shift movement가 anchor를 유지하고 focus만 이동하며, source `selectedPointers`를 비우고 render 단계에서 atom coverage를 파생하는 테스트가 있다. | Multi-range/multi-cursor extension semantics는 정의하지 않는다. |
| preferredX and geometry-backed movement | 확정 | vertical/page movement의 `preferredX`, horizontal command의 context clear, line/page/vertical geometry adapter path가 cursor command split tests, inputAdapter split tests, `editorCore split tests`, cursorGeometry split tests에 걸쳐 검증된다. | Cross-browser visual parity, BiDi/RTL, vertical writing mode는 아직 model contract로 닫지 않았다. |
| keyboard mapping to movement commands | 확정 | ArrowLeft/Right, Alt/Option word/block, Home/End line geometry, Cmd/Ctrl line/document, ArrowUp/Down, PageUp/PageDown mapping이 inputAdapter split tests에 있다. | OS/browser shortcut matrix와 user-customizable hotkey config는 별도 제품/API 결정이다. |
| selection-only history | 확정 | `editorCore split tests`와 selection audit이 movement dispatch가 document patch 없이 selection만 바꾸고 undo history를 오염시키지 않는다고 검증한다. | Persisted/session selection restore나 collaboration presence history는 포함하지 않는다. |
| public per-key movement methods | 미정 | 현재 public seam은 `dispatch({ type: "moveSelection", unit, direction, extend })` 하나로 충분하고 per-key method가 필요한 caller 근거가 없다. | External SDK ergonomics 요구가 생기면 command facade 이름과 capability shape를 다시 봐야 한다. |
| locale-specific word segmentation | 미정 | representative punctuation, decomposed letter, Korean text, atom unit은 닫혔지만 locale/browser 전체 word break 표는 없다. | Locale 요구가 생기면 segmentation source와 fixture matrix를 별도 설계해야 한다. |
| BiDi/RTL/vertical writing | 미정 | 현재 cursor stream과 geometry tests는 LTR horizontal editing 중심이다. | 해당 writing mode가 제품 범위가 되면 logical order, visual order, hit testing contract를 같이 확장해야 한다. |
| cross-browser visual movement parity | 미정 | model/adapter tests와 제한된 Chrome smoke 근거는 있지만 Safari/Firefox/Windows font/layout 차이는 닫지 않았다. | Release-level browser QA가 필요하면 geometry matrix를 별도 gate로 둔다. |
| multi-cursor, virtualization, custom nodes | 미정 | current selection은 single caret/range/node이고 geometry는 mounted DOM과 fixed schema node semantics를 전제로 한다. | Multi-range, offscreen layout, plugin schema가 실제 요구가 될 때 별도 seam을 설계한다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| locale-specific word segmentation | 현재 word tests는 punctuation, decomposed letter, Korean text, atom units의 representative behavior를 닫는다. 모든 locale/browser word segmentation matrix는 아니다. | locale 요구가 생기면 segmentation source와 fixture matrix를 별도 설계해야 한다. |
| BiDi/RTL/vertical writing | current cursor stream과 geometry tests는 LTR horizontal editing 중심이다. BiDi/RTL/vertical writing mode contract는 없다. | 해당 writing mode가 제품 범위가 되면 cursor order, visual order, geometry hit testing을 함께 설계해야 한다. |
| cross-browser visual movement parity | geometry adapter tests와 단일 browser smoke는 있지만 Safari/Firefox/Windows font/layout 차이를 닫은 것은 아니다. | release-level browser QA가 필요하면 geometry matrix를 별도 gate로 둔다. |
| multi-cursor/multi-range movement | public selection은 single caret/range/node다. Multi-cursor movement semantics는 없다. | multi-range selection 요구가 생기면 movement command result와 history behavior를 새로 정해야 한다. |
| virtualized/offscreen layout | visual movement는 mounted DOM geometry를 전제로 한다. Virtualized/offscreen document measurement contract는 없다. | virtualization 요구가 생기면 geometry source를 별도 adapter로 설계해야 한다. |
| custom node cursor semantics | current atom semantics는 mention/figure에 맞춰 닫혀 있다. Future custom inline/block node가 어떤 cursor unit인지 정해져 있지 않다. | custom schema/plugin이 생기면 node descriptor에 cursor behavior를 포함할지 결정해야 한다. |
| platform shortcut variants | current key mapping은 supported shortcut set 기준이다. OS/browser-specific variants나 user-customizable hotkeys는 없다. | product shortcut customization이 필요하면 input adapter policy와 별도 config seam을 설계해야 한다. |

## 현재 결론

뺄 수 없는 확정은 document 위의 logical cursor stream과 `moveSelection` command seam,
atom one-unit behavior, range collapse/extension, preferredX context, geometry-backed
line/page movement다. 이 복잡성은 per-key public methods가 아니라 command
implementation과 geometry adapter 뒤에 숨기는 것이 맞다.

아직 확정하면 안 되는 것은 locale/browser-wide word segmentation, BiDi/RTL/vertical
writing, cross-browser pixel parity, multi-cursor movement, virtualized layout,
custom node cursor descriptors, platform shortcut customization이다.
