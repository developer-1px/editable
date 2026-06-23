# Editor native selection bridge audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `contentEditableSelection` utilities와
`BlockEditor` native selection wiring이 어디까지 확정 view adapter인지, 그리고
어디부터 browser QA/public selection policy인지 분리한다.

## 목적

Native DOM selection은 canonical document state가 아니다. 하지만 React editor는
browser selection을 읽어 paste/copy/cut/input 위치를 정하고, canonical cursor를
다시 native caret으로 복원해야 한다.

이 문서는 DOM selection bridge를 public selection model로 키우지 않고, current
contenteditable view seam 뒤에 둬야 하는 확정 behavior만 기록한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/view/contenteditable/contentEditableSelection.ts` | DOM `Selection` anchor/focus를 text point로 읽고, canonical cursor point를 native collapsed range로 복원하는 native selection bridge다. |
| `src/editor/internal/view/contenteditable/contentEditableTextPoint.ts` | `.text-run[data-path]` DOM position, canonical cursor point, code block backing leaf, text-node offset을 `ContentEditableTextPoint`로 투영한다. |
| `src/editor/internal/view/contenteditable/contentEditableViewEngine.ts` | native edit/composition tracking이 DOM selection point와 canonical selection fallback을 같이 사용한다. |
| `contentEditable view split tests` | grapheme snapping, mark element boundary, code block backing text leaf, scroll into view, empty text run caret placement를 검증한다. |
| `src/editor/internal/react/block-editor/BlockEditor.tsx` | selectionchange/select/input/paste/copy/cut/toolbar 경로에서 native selection을 observed command selection 또는 cursor preview로 반영한다. |
| BlockEditor split tests | pasted text at observed native caret, native range replacement/copy/cut, range overlay hiding, focus loss preservation, read-only selection preservation을 검증한다. |
| `docs/editor-contenteditable-buffer-audit.md` | native text buffer와 selection utilities는 internal view adapter라고 정리한다. |
| `docs/editor-selection-model-audit.md` | public/canonical selection model과 browser native selection policy를 분리한다. |
| `docs/editor-pointer-selection-audit.md` | pointer selection은 browser native selection보다 canonical selection을 우선한다고 정리한다. |

## 확정 native selection bridge behavior

| 항목 | 확정 내용 |
| --- | --- |
| internal view seam | Native selection bridge는 `src/editor/internal/view`의 adapter다. `src/editor/public`이나 `src/editor/react` facade의 public contract가 아니다. |
| root containment guard | `readContentEditableSelection`은 anchor/focus가 editor root 안에 없으면 `null`을 반환한다. 외부 page selection을 editor command source로 쓰지 않는다. |
| text-run target | DOM position은 가장 가까운 `.text-run[data-path]` 안에서만 canonical text point로 변환된다. Atom DOM target selection은 pointer/canonical selection path가 담당한다. |
| exact data-path lookup | `findElementByDataPath`는 `[data-path]` 후보를 순회해 exact attribute match를 찾는다. Selection bridge는 renderer의 stable path surface에 의존한다. |
| anchor/focus range read | anchor와 focus를 모두 text point로 읽을 수 있으면 collapsed selection은 caret으로, non-collapsed selection은 `selectionFromCursorRange`로 수렴한다. |
| grapheme snapping | DOM offset은 document text 기준 `snapTextOffset`으로 canonical grapheme boundary에 맞춘다. Surrogate pair 중간 caret을 그대로 신뢰하지 않는다. |
| mark element boundary | browser selection이 `strong` 같은 mark element boundary에 걸려도 range text length 계산으로 text-run offset을 만든다. |
| invalid browser offset fallback | Range 기반 offset 계산이 실패하면 text-node tree walk와 clamp로 유효한 text offset에 수렴한다. |
| canonical to native caret | `setContentEditableSelection`은 canonical cursor point를 collapsed DOM range로 복원한다. Text offset은 text node 위치로, block edge는 editable backing text leaf로 mapping한다. |
| empty text run caret | 빈 text run에 native caret을 놓아야 하면 empty `Text` node를 만들어 selection target을 확보한다. |
| code block backing leaf | code block block-edge caret은 `/root/children/{index}/text` backing leaf offset 0 또는 text length로 mapping된다. |
| scroll reveal | `scrollContentEditableSelectionIntoView`는 canonical focused point를 editable DOM target으로 바꿔 `scrollIntoView({ block: "nearest", inline: "nearest" })`를 호출한다. |
| observed command selection | `BlockEditor`는 paste/copy/cut/native text replacement에서 observed native range나 caret을 command selection으로 반영한다. |
| overlay coherence | native DOM range가 보이면 custom caret/range overlays를 숨겨 stale overlay와 browser selection이 동시에 보이지 않게 한다. |
| read-only preservation | read-only 전환과 cut/copy 경로는 native range를 selection source로 읽되 document mutation은 막고 DOM view를 canonical state로 복원한다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| internal view seam | 확정 | `contentEditableSelection.ts`와 `contentEditableTextPoint.ts`는 `src/editor/internal/view`에 있고 `BlockEditor.tsx`만 view lifecycle 안에서 read/set/scroll helpers를 사용한다. | `src/editor/public` 또는 `src/editor/react` facade contract는 아니다. |
| root containment guard | 확정 | contentEditable view split tests가 editor root 밖 native selection을 command selection으로 읽지 않는 것을 고정한다. | Full browser `selectionchange` event-ordering까지 닫은 것은 아니다. |
| text-run `data-path` translation | 확정 | DOM position은 `.text-run[data-path]`로 제한되고, exact `data-path` lookup과 renderer surface는 `DocumentRenderer`/geometry tests와 같이 고정되어 있다. | Renderer path surface가 바뀌면 이 adapter와 renderer를 함께 바꿔야 한다. |
| collapsed/range selection read | 확정 | Engine tests가 collapsed grapheme snap과 non-collapsed native text range to canonical range 변환을 직접 검증한다. React tests는 paste/copy/cut/replacement가 observed native caret/range를 쓰는 것을 검증한다. | Multi-range native selection은 지원 contract가 아니다. |
| grapheme and mark boundary mapping | 확정 | DOM offset은 document text 기준 `snapTextOffset`으로 snap되고, mark element boundary selection도 text-run offset으로 수렴한다. | Safari/Firefox/Chrome 실제 Range boundary 차이 전체를 보장하지 않는다. |
| canonical to native caret restore | 확정 | `setContentEditableSelection`은 text offset, empty text run, code block backing leaf를 collapsed DOM range로 복원한다. Engine tests가 empty text run caret과 code block edge mapping을 고정한다. | Persisted/session cursor restore DTO라는 뜻은 아니다. |
| scroll reveal | 확정 | `scrollContentEditableSelectionIntoView`는 focused canonical point를 editable target으로 바꿔 `scrollIntoView({ block: "nearest", inline: "nearest" })`를 호출한다는 단위 테스트가 있다. | Long-document virtualization/offscreen reveal policy는 별도 renderer/geometry 결정이다. |
| observed command selection | 확정 | BlockEditor split tests가 observed native caret paste, native range replacement/copy/cut, active native edit flush 후 copy/cut/paste, history undo caret restore를 검증한다. | DOM selection을 canonical document truth로 승격하지는 않는다. |
| overlay/read-only coherence | 확정 | Native range가 보일 때 custom overlays를 숨기고, focus loss/read-only 전환/copy 경로에서 selection과 mutation policy가 유지되는 React tests가 있다. | Assistive-tech announcement와 mobile touch handles는 QA 미정이다. |
| public native selection API | 미정 | 현재 external caller가 DOM `Selection` bridge를 직접 사용할 근거가 없고 public surface는 `RichSelection`/commands다. | External embedding 요구가 생기면 public selection model과 별도로 설계해야 한다. |
| generic selection backend | 미정 | 실제 backend는 contenteditable DOM selection 하나뿐이다. | EditContext/native mobile backend 같은 두 번째 source가 생기기 전에는 얕은 abstraction이다. |
| browser/mobile/accessibility matrix | 미정 | jsdom/React tests는 core bridge behavior를 닫지만 browser별 Range boundary, touch handles, AT announcement를 닫지 않는다. | Release support matrix가 생기면 Playwright/device/AT QA gate가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `contentEditableSelection` bridge | 유지 확정 | DOM `Selection` read/write와 root-local selection lookup은 native selection API 변경 이유를 함께 가진다. |
| `contentEditableTextPoint` projection | 유지 확정 | renderer `data-path`, canonical cursor point, DOM text-node offset 사이의 translation knowledge를 한 view adapter helper에 모은다. |
| exact `data-path` lookup helper | 유지 확정 | CSS selector escaping 문제를 caller에게 넘기지 않고 renderer path identity를 text point projection 안에서 다룬다. |
| empty text node insertion | 유지 확정 | 빈 text run도 native caret target이 필요하다. 이 처리를 React handler마다 반복하면 selection restore가 깨지기 쉽다. |
| code block backing leaf mapping | 유지 확정 | code block은 block node와 editable text leaf path가 다르다. mapping을 숨겨야 caller가 schema detail을 덜 배운다. |
| observed native range command source | 유지 확정 | 사용자가 실제로 선택한 browser range를 copy/cut/replacement에 반영해야 stale canonical caret이 우선하지 않는다. |
| native selection을 document truth로 승격 | 제거 확정 | DOM selection은 command/input observation source일 뿐이다. Canonical selection과 document state는 model layer가 소유한다. |
| public native selection API | 보류 | 현재 external caller가 DOM selection bridge를 직접 쓸 근거가 없다. Public surface는 `RichSelection`과 editor commands로 충분하다. |
| generic selection backend abstraction | 보류 | 현재 실제 backend는 contenteditable DOM selection 하나다. 두 번째 backend 없이 abstraction을 만들면 얕은 pass-through가 된다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| full selectionchange ordering | focus/blur, pointer drag, composition, beforeinput, selectionchange 전체 순서 matrix는 닫지 않았다. | Playwright/browser matrix를 별도 QA gate로 둘지 결정한다. |
| cross-browser DOM boundary behavior | jsdom/unit coverage는 mark boundary, empty run, grapheme, code leaf를 닫지만 Safari/Firefox/Chrome 실제 Range boundary 차이를 전부 보장하지 않는다. | release browser support 기준이 생기면 native range fixture를 브라우저별로 수집한다. |
| multi-range native selection | public selection은 single caret/range/node이고 bridge도 primary native range 기준이다. Browser multi-range나 table-like selection은 없다. | multi-range 요구가 생기면 public selection model부터 확장한다. |
| touch selection handles | long-press handles, mobile selection menu, virtual keyboard interaction은 current desktop/jsdom path로 닫지 않았다. | mobile editing 범위를 정한 뒤 pointer/touch/native selection priority를 같이 설계한다. |
| assistive-tech announcement | native selection과 custom overlay state가 보조 기술에서 어떻게 announce되는지는 확인하지 않았다. | accessibility QA matrix가 필요하면 render/visual selection audit과 함께 확인한다. |
| persisted/session selection restore | DOM selection restore는 current live editor surface용이다. 문서별 persisted cursor/session restore DTO는 아니다. | session restore가 필요하면 document schema와 분리한 selection persistence contract를 설계한다. |

## 현재 결론

뺄 수 없는 확정은 `contentEditableSelection`을 internal view adapter로 유지하는
것이다. DOM root containment, text-run `data-path` translation, grapheme snapping,
mark element boundary handling, empty text run native caret, code block backing leaf,
scroll reveal, observed native range command source, overlay coherence는 테스트와
구현 근거가 있다.

아직 확정하면 안 되는 것은 public native selection API, generic selection backend,
full browser selectionchange ordering, cross-browser DOM Range matrix, multi-range,
touch handles, assistive-tech announcement, persisted/session selection restore다.
현재 올바른 형태는 native selection을 document truth로 승격하지 않고, React/view
내부 command observation bridge로 유지하는 것이다.
