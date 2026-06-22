# Editor pointer selection audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. Pointer/mouse input이 browser native selection,
DOM hit target, `CursorGeometry`, canonical `SelectionSnap` 사이에서 어디까지
확정인지와 어디부터 실제 브라우저 좌표/selection matrix인지 분리한다.

## 목적

Pointer selection은 model selection도 아니고 geometry 자체도 아니다. React boundary가
DOM event를 받아 canonical selection으로 변환하는 view adapter policy다. 이 문서는
pointer behavior를 `RichSelection` public model이나 final browser QA로 과하게
확장하지 않고, 현재 닫힌 adapter contract만 기록한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/react/BlockEditor.tsx` | pointer down/move/up/cancel event를 canonical selection restore로 연결한다. |
| `src/editor/internal/view/blockEditorSelection.ts` | atom target detection, pointer anchor, word/block selection, render selection projection helper를 제공한다. |
| `src/editor/internal/react/BlockEditor.test.tsx` | atom click/copy, stale native range보다 atom 우선, text replacement over atom, Shift atom extension, triple block selection, single text caret click, double word selection, drag range selection을 검증한다. |
| `src/editor/internal/view/blockEditorSelection.test.ts` | wrapped line boundary cursor affinity가 selection snapshot point로 보존되는 것을 검증한다. |
| `src/editor/internal/view/cursorGeometry.test.ts` | coordinate hit testing과 atom/text cursor rect가 pointer selection의 geometry source임을 검증한다. |
| `docs/editor-selection-model-audit.md` | canonical selection normal form과 render atom derivation을 정리한다. |
| `docs/editor-cursor-geometry-audit.md` | pointer hit testing은 `CursorGeometry` view adapter가 담당한다고 정리한다. |
| `docs/editor-feature-coverage-audit.md` | Pointer And Mouse Selection은 local/jsdom gate로 부분확정이고 browser matrix는 별도라고 정리한다. |

## 확정 pointer selection behavior

| 항목 | 확정 내용 |
| --- | --- |
| primary button only | pointer selection handler는 left/main button이 아니면 selection을 바꾸지 않는다. |
| atom DOM hit | `.mention-chip[data-path]`와 `.figure-block[data-path]`는 selectable atom target이다. Atom hit는 geometry 없이 DOM target path로 selection을 만든다. |
| atom single click | mention/figure atom click은 explicit node selection으로 들어가며 source `selectedPointers`를 가진다. |
| stale native range priority | atom pointer selection은 stale native text range보다 우선한다. Atom 선택 뒤 browser native ranges를 지운다. |
| typed replacement over atom | explicit atom selection 뒤 text input은 atom을 canonical text replacement로 대체하고 selected pointer를 비운다. |
| shift atom extension | Shift+pointer on atom은 기존 anchor에서 atom after edge까지 canonical range를 만든다. Render 단계에서 covered atom pointer가 파생된다. |
| triple atom/block selection | triple pointer down on atom은 current block before/after range를 만든다. Figure block이면 node selection으로 수렴한다. |
| text coordinate hit | text/body pointer hit는 `CursorGeometry.pointFromCoordinates`가 반환한 point를 `normalizeCursorPoint`로 정규화한 뒤 caret selection으로 만든다. |
| double text selection | double pointer down은 hit point 주변 word range를 만든다. Atom point라면 node selection, non-text block edge라면 current block selection으로 수렴한다. |
| shift text extension | Shift+pointer on text는 existing selection anchor에서 normalized hit point까지 range를 만든다. |
| drag range selection | single pointer down starts drag anchor, pointer move with same pointer id creates canonical range, pointer up/cancel clears drag state. |
| pointer capture | single non-shift, non-double pointer drag attempts pointer capture/release so drag selection keeps receiving move/up events. |
| native cursor preview | single text pointer down also syncs contenteditable native selection/cursor preview to the normalized point. Drag and atom selection clear native cursor preview. |
| no source atom list for range | range selection does not store atom pointers in source selection. Covered atoms are derived for render/copy from document+range. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| pointer-to-selection React wiring | 확정 | `BlockEditor.tsx`가 pointer down/move/up/cancel을 canonical selection restore로 수렴시키고, `BlockEditor.test.tsx`가 caret, word, atom, block, drag selection 경로를 실행한다. | Public headless pointer API라는 뜻은 아니다. |
| primary pointer gate | 확정 | `BlockEditor.test.tsx`가 non-primary pointer button으로 selection이 바뀌지 않는 것을 고정한다. | Touch/pen button semantics 전체를 닫은 것은 아니다. |
| atom DOM target selection | 확정 | `.mention-chip[data-path]`/`.figure-block[data-path]` target은 geometry 없이 node selection으로 들어가며 atom copy/replacement/shift/triple tests가 이를 검증한다. | Custom atom renderer/plugin target policy는 별도 확장 요구다. |
| stale native range priority | 확정 | Atom pointer selection 뒤 stale native range copy가 우선하지 않는 React test가 있다. | Native `selectionchange` ordering 전체 matrix는 미정이다. |
| geometry-backed text hit testing | 확정 | Text/body pointer는 `CursorGeometry.pointFromCoordinates`를 통해 canonical point가 되고 single pointer caret, double word, drag range tests가 이를 검증한다. | Real browser coordinate, zoom, font, device pixel ratio matrix는 닫지 않는다. |
| shift/double/triple policies | 확정 | Shift atom extension, double word selection, triple block selection tests가 canonical range/node selection 결과를 고정한다. | Platform-specific multi-click timing이나 OS word selection convention은 별도 QA다. |
| drag selection lifecycle | 확정 | Pointer down starts a primary drag anchor, same pointer move creates canonical range, pointer up/cancel clears drag state. Capture/release and cancel-after-move no-op tests가 있다. | Auto-scroll near viewport edge와 multi-pointer gesture는 아직 없다. |
| range source atom policy | 확정 | Range source selection은 `selectedPointers`를 저장하지 않고 render 단계에서 covered atoms를 파생한다는 test가 있다. | Multi-range/multi-cursor selection model은 public selection 확장이 필요하다. |
| native cursor preview | 확정 | Single text pointer down은 native caret/preview를 normalized point에 맞추고, atom/drag path는 stale preview를 지운다. 관련 React tests와 visual pointer caret smoke가 있다. | Assistive-tech announcement는 별도 접근성 QA다. |
| public pointer selection API | 미정 | Pointer behavior는 React view adapter behavior이고 public surface는 selection/command model이다. | External embedding이 pointer policy를 직접 제어해야 하면 별도 interface를 설계한다. |
| browser/touch/accessibility matrix | 미정 | jsdom integration과 단일 Chrome smoke 근거는 있으나 cross-browser coordinate, touch/pen, AT announcement를 닫지 않는다. | Release support matrix가 생기면 Playwright/device/AT gate가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| pointer-to-selection React wiring | 유지 확정 | DOM event, native selection cleanup, geometry hit testing, canonical selection restore가 한 boundary에 모여야 한다. |
| `blockEditorSelection.ts` helper | 유지 확정 | atom path detection, selection anchor, word/block selection policy를 React event handler에서 분리한다. |
| `CursorGeometry.pointFromCoordinates` dependency | 유지 확정 | text/drag selection은 DOM coordinates를 canonical cursor point로 바꿔야 한다. React handler가 layout parsing을 알면 얕아진다. |
| atom DOM `data-path` target | 유지 확정 | atom hit는 geometry보다 DOM target identity가 더 직접적이다. mention/figure selection/copy tests가 이 path를 기대한다. |
| browser native selection을 source of truth로 승격 | 제거 확정 | stale native range보다 atom selection이 우선해야 하고, canonical document selection이 copy/replacement source다. |
| separate public pointer selection API | 보류 | pointer selection은 React view behavior다. Public headless API는 `setSelection`/`moveSelection` 같은 command surface로 충분하다. |
| multi-pointer/gesture abstraction | 보류 | current tests와 code는 single primary pointer drag selection을 닫는다. Touch gestures, pen pressure, multi-touch는 요구가 없다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| real browser coordinate matrix | jsdom geometry fixture와 단일 Chrome smoke는 있지만 Safari/Firefox/Windows font/text measurement, zoom, scroll, device pixel ratio 전체를 닫은 것은 아니다. | Playwright pointer matrix를 별도 browser QA gate로 둔다. |
| native selection event ordering | stale native range 방지와 native range overlay coherence는 테스트가 있지만 pointer drag, selectionchange, blur/focus, composition이 섞인 모든 순서는 닫지 않았다. | browser `selectionchange` event-ordering matrix가 필요하면 contenteditable buffer audit과 같이 설계한다. |
| touch/pen gesture policy | current contract는 primary pointer click/drag 중심이다. Long press, touch selection handles, pen barrel button, context menu selection은 없다. | mobile/touch editing 범위가 생기면 native gesture와 canonical selection 우선순위를 별도 정의한다. |
| auto-scroll during drag | selection reveal은 별도 scrolling path가 있지만 pointer drag near viewport edge auto-scroll policy는 닫지 않았다. | long document drag selection 요구가 생기면 scroll container와 geometry update policy를 같이 설계한다. |
| multi-range/multi-cursor selection | public selection은 single caret/range/node다. Pointer-driven multi-range selection semantics는 없다. | multi-selection 요구가 생기면 public selection model과 command semantics부터 확장한다. |
| accessibility announcement | pointer selection changes visual/canonical state를 만들지만 assistive-tech announcement가 충분한지는 확인하지 않았다. | selection announcement QA를 visual/render accessibility policy와 함께 확인한다. |

## 현재 결론

뺄 수 없는 확정은 React pointer event가 canonical selection으로 수렴하는 adapter,
atom DOM target selection, geometry-backed text hit testing, shift extension,
double word selection, triple block selection, drag range selection, stale native range
우선순위 정리다.

아직 확정하면 안 되는 것은 real browser coordinate matrix, full native
selectionchange ordering, touch/pen gestures, drag auto-scroll, multi-range pointer
selection, assistive-tech announcement다. 현재 올바른 형태는 pointer behavior를 public
headless API로 키우지 않고 React view adapter와 `CursorGeometry` 뒤에 유지하는 것이다.
