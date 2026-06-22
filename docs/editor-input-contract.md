# Editor Input Contract

Purpose:
브라우저 입력 이벤트를 editor intent, model mutation, selectionAfter, render 상태로
연결하는 P0 계약이다. 구현자는 이 문서에 없는 입력을 "자연스러워 보인다"는
이유만으로 막거나 변형하지 않는다.

Core rule:
모든 editor-owned input은 canonical document와 canonical selection으로 먼저
해석된다. DOM은 native text buffering, composition, geometry, clipboard
transport를 제공할 수 있지만 document truth가 아니다.

## 판정 순서

1. 이 문서의 P0 계약.
2. `docs/editor-required-feature-list.md`의 제품/QA 기대.
3. Input Events, UI Events, Selection API, HTML, Clipboard API, WPT 같은 공개
   브라우저 근거.
4. 실제 브라우저 trace와 replay fixture.
5. ProseMirror, Lexical 같은 성숙한 editor의 관찰 증거.
6. 제품 정책. 위 근거가 충돌하거나 비어 있을 때만 명시한다.

ProseMirror/Lexical 증거는 authority가 아니다. 같은 문제가 반복된다는 증거로만
쓴다.

## 행 스키마

| 필드 | 의미 |
| --- | --- |
| ID | 안정적인 계약 식별자 |
| P0 영역 | IME, selection, deletion, clipboard/drop, history, read-only |
| browser event sequence | 브라우저가 보낼 수 있는 대표 이벤트 순서 |
| expected editor intent | editor가 실행해야 하는 단일 의도 |
| expected model result | canonical document 결과 |
| expected selectionAfter | command/replay 이후 canonical selection |
| expected render state | DOM/native buffer/overlay가 따라야 하는 상태 |
| evidence | 현재 근거. 없으면 `evidence needed` |
| fixture | 고정해야 할 replay/test 이름 |

## P0 계약 매트릭스

| ID | P0 영역 | browser event sequence | expected editor intent | expected model result | expected selectionAfter | expected render state | evidence | fixture |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| IME-01 | IME | `compositionstart` -> `compositionupdate*` -> `beforeinput insertCompositionText*` -> `input insertCompositionText*` -> `compositionend` -> optional `beforeinput insertText` | 하나의 composition session을 commit한다 | 조립 중간 문자열은 model mutation이 아니고 final text만 한 번 삽입된다 | 삽입된 text 끝 collapsed caret | active native buffer reset, 중복 starter text 없음 | Korean trace, IME regression tests | `ime/basic-composition-commit` |
| IME-02 | IME | composition 중 `keydown Enter` 또는 Enter-confirming sequence -> final commit events -> deferred Enter command | IME 확정 뒤 같은 사용자 Enter를 paragraph split으로 실행한다 | final composition text가 먼저 들어가고 현재 text block이 split된다 | 새 paragraph 시작 collapsed caret | native composition 종료 후 renderer-owned DOM | Enter IME fix, line-break policy | `ime/enter-commit-then-split` |
| IME-03 | IME | adjacent composition session 뒤 stale `compositionend` | stale session을 무시한다 | 이미 commit된 새 session text를 되돌리거나 다시 넣지 않는다 | 최신 canonical selection 유지 | stale DOM/native state가 canonical state를 덮지 않음 | stale composition regression | `ime/stale-compositionend` |
| IME-04 | IME | active marks가 있는 collapsed selection에서 composition commit | active mark context로 text insert | inserted text가 active marks를 가진 text run으로 들어간다 | inserted marked text 끝 | mark renderer와 native buffer가 일치 | mark command/input tests | `ime/active-mark-commit` |
| SEL-01 | selection | collapsed selection + `keydown ArrowLeft/ArrowRight` | 한 cursor unit 이동 | document mutation 없음 | 이전/다음 valid cursor point | caret overlay만 이동 | cursor command tests, P0 trace corpus | `p0-horizontal-selection` |
| SEL-02 | selection | non-collapsed range + plain `ArrowLeft/ArrowRight` | range collapse | document mutation 없음 | ArrowLeft는 range start, ArrowRight는 range end로 collapse. 추가 이동 없음 | range overlay 제거, caret 표시 | editor native expectation, P0 trace corpus | `p0-horizontal-selection` |
| SEL-03 | selection | collapsed/range + `Shift+ArrowLeft/ArrowRight` | anchor를 유지하고 focus를 한 unit 확장/축소 | document mutation 없음 | direction 포함 range selection | range overlay가 canonical range만 표시 | cursor command tests, P0 trace corpus | `p0-horizontal-selection` |
| SEL-04 | selection | atom 전후에서 Arrow/Shift+Arrow | atom을 하나의 cursor unit으로 취급 | document mutation 없음 | atom `before` <-> `after`, range는 atom unit 포함 | node/atom selection affordance와 range affordance 분리 | atom cursor tests | `selection/atom-unit` |
| MUT-01 | text replacement | non-collapsed range + printable key or `beforeinput insertText` | selected content replace | 선택 범위를 삭제하고 입력 text 삽입 | inserted text 끝 collapsed caret | range overlay 제거, native text leaf reset | text command tests, P0 trace corpus | `p0-range-replacement` |
| MUT-02 | atom replacement | explicit atom/node selection + `beforeinput insertText` | selected atom replace | atom node를 삭제하고 입력 text 삽입 | inserted text 끝 collapsed caret | atom affordance 제거, text render | atom replacement tests, P0 trace corpus | `p0-atom-replacement` |
| DEL-01 | deletion | collapsed selection + `beforeinput deleteContentBackward/Forward` or Backspace/Delete | 한 cursor unit 삭제 | backward/forward unit 삭제, block/inline atom은 한 단위 | 삭제 지점의 deterministic caret | DOM text reconciled from model | deletion command tests | `deletion/collapsed-unit` |
| DEL-02 | deletion | non-collapsed range + Backspace/Delete or `beforeinput deleteContent` | selected content delete | range content 삭제 | range start collapsed caret | range overlay 제거 | deletion command tests, P0 trace corpus | `p0-range-backspace`, `p0-range-delete-forward` |
| DEL-03 | deletion | empty block boundary + Backspace/Delete | boundary merge/delete policy | 허용된 경우 paragraph merge 또는 empty block 제거, 아니면 no-op | merge/delete 후 deterministic caret | 빈 block caret rect 유지 | paragraph merge tests, cursor geometry tests, P0 trace corpus | `p0-empty-block-backspace` |
| CLIP-01 | clipboard/drop | paste event or `beforeinput insertFromPaste` with plain text | plain text paste | selection replace 또는 caret insert | pasted text 끝 | native DOM paste prevented or reconciled | clipboard/input adapter tests, P0 trace corpus | `p0-plain-paste` |
| CLIP-02 | clipboard/drop | custom MIME markdown or external `text/markdown` paste/drop | supported rich fragment paste | marks/link/mention/figure/multi-block 중 지원 범위 복원 | inserted fragment 끝 또는 deterministic block point | renderer-owned DOM only | clipboard markdown tests, P0 trace corpus | `p0-markdown-drop` |
| CLIP-03 | clipboard/drop | `Cmd/Ctrl+X` or `beforeinput deleteByCut` | copy selection then delete through command | selection serialized, selected content deleted | deletion selectionAfter | clipboard side effect와 model mutation 순서 고정 | cut tests, P0 trace corpus | `p0-cut` |
| HIST-01 | history | `Cmd/Ctrl+Z`, redo shortcut | undo/redo history entry | document와 selection이 같은 entry에서 복원 | entry가 저장한 selection | overlay/render는 restored selection 반영 | history tests | `history/restore-selection` |
| HIST-02 | history | `beforeinput historyUndo/historyRedo` | native history를 editor history로 route | native DOM undo가 canonical state를 직접 바꾸지 않음 | editor history selection | native buffer flush 뒤 restore | input adapter history tests | `history/beforeinput-route` |
| RO-01 | read-only | mutating key/beforeinput/paste/drop | explicit no-op | document mutation 없음 | 기존 canonical selection 보존 | native DOM mutation rollback, focus affordance 유지 | read-only tests | `readonly/block-mutating-input` |
| RO-02 | read-only/platform | unsupported shortcuts, function keys | pass-through 또는 명시적 no-op | document mutation 없음 | selection mutation 없음. editor-owned no-op만 기록 가능 | browser/system 동작 방해 금지 | keyboard policy audit | `readonly/unsupported-keys` |

## Evidence Cards

| ID | 종류 | 근거 | 이 계약에서 쓰는 방식 |
| --- | --- | --- | --- |
| SPEC-INPUT | spec | W3C Input Events Level 2: `beforeinput`/`input`은 contenteditable editing host에 dispatch되고, `inputType`, `dataTransfer`, `getTargetRanges()`, cancelability, paste order를 정의한다. Source: https://www.w3.org/TR/input-events-2/ | 입력을 DOM mutation이 아니라 editor intent로 분류하는 1차 oracle. |
| SPEC-IME-DIVERGENCE | spec + browser trace 필요 | Input Events Level 2는 `compositionupdate` 뒤 `beforeinput`/`input` pair를 설명하지만, UI Events는 composition 중 `beforeinput` -> `compositionupdate` -> `input` 순서를 설명한다. Input Events Level 2의 cancelability table도 IME composition 관련 `beforeinput`은 취소 가능하지 않은 경로를 포함한다. Source: https://www.w3.org/TR/input-events-2/#input-event-order-during-composition, https://www.w3.org/TR/input-events-2/#interface-InputEvent-Attributes, https://www.w3.org/TR/uievents/#events-composition-input-events | IME event order와 `beforeinput` cancelability는 spec만으로 닫지 않고 recorded browser trace fixture를 같이 요구한다. |
| SPEC-UI-KEY | spec | UI Events는 `keydown`이 같은 key의 `beforeinput`/`input`/`keyup`보다 먼저 오고, 취소되면 관련 event/action이 dispatch되지 않는다고 정의한다. Source: https://www.w3.org/TR/uievents/#event-type-keydown | keyboard route와 pass-through/no-op 정책의 상위 oracle. |
| SPEC-SELECTION | spec | Selection API는 anchor/focus node/offset, `isCollapsed`, `rangeCount`, type/direction을 정의한다. Source: https://www.w3.org/TR/selection-api/ | canonical selection이 anchor/focus/collapsed를 명시해야 하는 근거. |
| SPEC-HTML-EDITING-HOST | spec | WHATWG HTML은 `contenteditable=true/false/plaintext-only`와 editing host를 정의한다. Source: https://html.spec.whatwg.org/multipage/interaction.html#contenteditable | `plaintext-only` editing host는 native text buffer일 뿐 document authority가 아니라는 근거. |
| WPT-INPUT | WPT | WPT live input-events directory contains typing, cut/paste, delete-selection, getTargetRanges tests. Source: https://wpt.live/input-events/ | browser gate에서 selection/deletion/clipboard smoke를 고를 후보 suite. |
| WPT-SELECTION | WPT | WPT live selection directory contains collapse, extend, isCollapsed, contenteditable, selectionchange tests. Source: https://wpt.live/selection/ | browser gate에서 selection/caret smoke를 고를 후보 suite. |
| TRACE-IME-KO | browser trace fixture | Korean Hangul basic, stale composition, active mark, history, blur, Enter confirmation fixture corpus. | spec divergence와 OS/IME 차이를 닫는 repo-local 실행 근거. |
| TRACE-P0 | browser-like replay fixture | P0 input fixture corpus: horizontal selection, range replacement/deletion, empty block Backspace, atom replacement, paste/drop/cut. | P0 user-visible contract를 jsdom replay로 고정하는 실행 근거. |
| REF-PM-POLICY | reference editor | ProseMirror Guide/Reference: document state is a schema-controlled data structure, updates go through transactions, leaf/atom nodes and sorted mark sets are explicit concepts. Source: https://prosemirror.net/docs/guide/, https://prosemirror.net/docs/ref/ | 구현 복사가 아니라 canonical model, atom unit, mark normalization policy의 참고 카드. |
| REF-LEXICAL-POLICY | reference editor | Lexical docs: source of truth is not DOM; editor state contains node tree and selection; selection has Range/Node variants; line breaks are explicit nodes for cross-browser consistency. Source: https://lexical.dev/docs/concepts/editor-state, https://lexical.dev/docs/concepts/selection, https://lexical.dev/docs/concepts/nodes | DOM을 truth로 삼지 않는 정책과 range/node selection 분리의 참고 카드. |
| PRODUCT-POLICY | product policy | 이 문서의 P0 행, required feature list, local regression tests. | spec/WPT/reference가 애매하거나 제품 선택이 필요한 영역을 닫는 명시 정책. |

## P0 Evidence Map

| P0 ID | oracle cards | 판정 |
| --- | --- | --- |
| IME-01 | SPEC-INPUT, SPEC-IME-DIVERGENCE, TRACE-IME-KO, REF-LEXICAL-POLICY | composition order는 spec 차이가 있어 Korean trace를 최종 실행 근거로 둔다. |
| IME-02 | SPEC-UI-KEY, TRACE-IME-KO, PRODUCT-POLICY | Enter는 IME commit 뒤 paragraph split까지 수행하는 제품 계약이다. |
| IME-03 | SPEC-IME-DIVERGENCE, TRACE-IME-KO | stale compositionend는 spec만으로 닫지 않고 recorded trace로 고정한다. |
| IME-04 | SPEC-INPUT, TRACE-IME-KO, REF-PM-POLICY, REF-LEXICAL-POLICY | active mark composition은 canonical model mark 정책과 trace fixture가 함께 닫는다. |
| SEL-01 | SPEC-SELECTION, WPT-SELECTION, TRACE-P0 | collapsed 좌우 이동은 anchor/focus/collapsed state와 replay corpus로 고정한다. |
| SEL-02 | SPEC-SELECTION, WPT-SELECTION, TRACE-P0, PRODUCT-POLICY | range에서 plain 좌우 Arrow는 collapse만 하고 추가 이동하지 않는 제품 계약이다. |
| SEL-03 | SPEC-SELECTION, WPT-SELECTION, TRACE-P0 | Shift+Arrow는 anchor 유지, focus 이동으로 표현한다. |
| SEL-04 | SPEC-SELECTION, REF-PM-POLICY, REF-LEXICAL-POLICY, TRACE-P0 | atom은 cursor stream의 한 unit이고 range/node affordance는 분리한다. |
| MUT-01 | SPEC-INPUT, SPEC-SELECTION, TRACE-P0 | non-collapsed range replacement는 input intent와 selection range 근거가 있다. |
| MUT-02 | SPEC-SELECTION, REF-PM-POLICY, REF-LEXICAL-POLICY, TRACE-P0 | atom replacement는 node selection/atom policy와 replay가 닫는다. |
| DEL-01 | SPEC-INPUT, WPT-INPUT, TRACE-P0, PRODUCT-POLICY | collapsed deletion은 inputType 근거가 있으나 grapheme/atom/block 단위는 제품 정책으로 명시한다. |
| DEL-02 | SPEC-INPUT, SPEC-SELECTION, WPT-INPUT, TRACE-P0 | range deletion은 `deleteContent*` inputType과 range selection으로 닫는다. |
| DEL-03 | SPEC-INPUT, WPT-INPUT, TRACE-P0, PRODUCT-POLICY | empty block boundary merge/delete는 browser intent 위에 제품 정책이 필요하다. |
| CLIP-01 | SPEC-INPUT, WPT-INPUT, TRACE-P0 | paste event와 `insertFromPaste` order/dataTransfer 근거가 있다. |
| CLIP-02 | SPEC-INPUT, WPT-INPUT, TRACE-P0, PRODUCT-POLICY | markdown/rich fragment restore는 transfer 근거 위에 제품 포맷 정책으로 닫는다. |
| CLIP-03 | SPEC-INPUT, WPT-INPUT, TRACE-P0 | cut은 `deleteByCut`, clipboard event, replay corpus가 함께 닫는다. |
| HIST-01 | SPEC-INPUT, REF-PM-POLICY, PRODUCT-POLICY | undo/redo는 transaction/history-style policy와 local tests로 닫는다. |
| HIST-02 | SPEC-INPUT, TRACE-IME-KO, PRODUCT-POLICY | native `historyUndo/historyRedo`는 editor history route로 흡수한다. |
| RO-01 | SPEC-INPUT, SPEC-HTML-EDITING-HOST, PRODUCT-POLICY | mutating input을 explicit no-op으로 만드는 read-only 제품 정책이다. |
| RO-02 | SPEC-UI-KEY, PRODUCT-POLICY | browser/system shortcut은 pass-through를 기본으로 하고 editor-owned no-op만 명시한다. |

## Evidence Needed

아래 항목은 추측으로 닫지 않는다. 구현이 필요하면 먼저 trace와 fixture를 추가한다.

| 항목 | 필요한 근거 |
| --- | --- |
| OS/browser IME ordering matrix | macOS/Windows/Linux, Chrome/Safari/Firefox, Korean/Japanese/Chinese IME trace |
| composition 중 selection retargeting | native selectionchange/event ordering trace와 replay |
| locale word segmentation | locale별 word movement 기대와 browser/native 기준 |
| rich clipboard node graph | markdown으로 표현되지 않는 node identity/topology 제품 요구 |
| paragraph soft-break model | document schema에 soft-break node를 둘지 제품/API 결정 |
| automatic typing history merge | timer, punctuation, composition boundary 기준 undo grouping 정책 |
| assistive-tech announcement | VoiceOver/NVDA/JAWS focus/selection announcement QA |

## 구현 규칙

- `preventDefault()`를 호출한 입력은 대응 editor command 또는 이 문서의 explicit
  no-op에 연결되어야 한다.
- replay fixture는 매 step 뒤 data-path uniqueness, selection target/offset,
  selected pointer, caret/atom overlay target 같은 render invariant를 기본 검사한다.
- command/model 테스트는 document schema, block id uniqueness, normalized marks,
  selection path/offset invariant를 같은 helper로 검사할 수 있어야 한다.
- 이 문서의 P0 행을 바꾸는 구현은 같은 커밋에서 fixture 또는 감사 문서를 갱신한다.
- evidence needed 항목은 임시 구현으로 닫지 않는다.

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| P0 row schema | 확정 계약 | 이 문서의 각 행은 event sequence를 editor intent, model result, selectionAfter, render state로 연결한다. |
| IME Enter policy | 확정 제품 계약 | Enter는 composition commit 뒤 paragraph split까지 실행해야 한다. 이 동작은 IME P0에 포함한다. |
| range Arrow collapse policy | 확정 제품 계약 | non-collapsed selection에서 plain 좌우 Arrow는 range를 edge로 collapse하고 추가 이동하지 않는다. |
| P0 trace corpus | 실행 테스트로 닫힘 | `BlockEditor.inputTrace.test.tsx`가 selection movement/collapse/extension, range replacement, range Backspace/Delete, empty block Backspace, atom replacement, plain paste, markdown drop, cut을 replay fixture로 고정한다. |
| evidence cards/map | 확정 근거 색인 | `Evidence Cards`와 `P0 Evidence Map`은 각 P0 행이 어떤 spec/WPT/trace/reference/product policy로 닫혔는지 추적한다. |
| IME event order/cancelability | trace 필요 | Input Events와 UI Events가 composition 중 event order를 다르게 설명하고, composition `beforeinput` cancelability도 경로별 차이가 있어 recorded browser trace 없이 기대값을 확정하지 않는다. |
| unsupported/evidence-needed cases | 미정 명시 | 브라우저/OS/접근성 matrix가 없는 항목은 `Evidence Needed`로 남긴다. |
| mature editor evidence | 부분근거 | ProseMirror/Lexical은 반복 문제의 증거로 쓰되, 이 프로젝트의 canonical model contract를 대신하지 않는다. |
