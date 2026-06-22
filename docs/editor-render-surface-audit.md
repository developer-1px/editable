# Editor render surface audit

작성일: 2026-06-22

범위: 현재 dirty workspace 기준. `DocumentRenderer`가 canonical `NoteDocument`와
selection snapshot을 어떤 DOM/class/data surface로 투영하는지, 그리고 어디부터
제품 HTML semantics, 접근성 QA, media trust, virtualization 결정인지 분리한다.

## 목적

Renderer는 editor model의 public truth가 아니다. 하지만 contenteditable selection
mapping, cursor geometry, overlay, tests, debug/replay가 stable DOM path와 class를
읽기 때문에 단순한 시각 구현도 아니다.

이 문서는 `DocumentRenderer`를 state owner나 command owner로 키우지 않고,
canonical document-to-DOM adapter로 유지해야 하는 범위만 확정한다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/react/DocumentRenderer.tsx` | `NoteDocument` block/inline/mark를 DOM element, class, `data-path`, selection data attributes로 렌더링한다. |
| `src/editor/internal/react/DocumentRenderer.test.tsx` | rich marks, safe/unsafe links, duplicate block id key stability, empty text run, mention/figure atoms, block variants, selection reflection을 검증한다. |
| `src/editor/internal/react/BlockEditor.tsx` | renderer output을 contenteditable surface, geometry, selection overlay, debug recorder, event handlers와 조합한다. |
| `src/editor/internal/view/contentEditableViewEngine.test.ts` | rendered text/mark/code/empty text DOM과 canonical cursor point 사이의 selection mapping을 검증한다. |
| `src/editor/internal/view/cursorGeometry.test.ts` | rendered DOM class/path surface가 caret, range, atom rect와 hit testing에 쓰이는 것을 검증한다. |
| `src/editor/internal/react/SelectionOverlay.test.tsx`, `src/editor/internal/react/CursorOverlay.test.tsx` | geometry overlay는 renderer DOM을 mutation 없이 읽어 caret/range/atom affordance를 만든다. |
| `docs/editor-style-surface-audit.md` | class/data surface와 visual style decision을 나눈다. |
| `docs/editor-visual-selection-audit.md` | overlay mechanism은 확정이고 final visual style은 별도 제품 결정이라고 정리한다. |
| `docs/editor-link-mark-audit.md` | renderer가 unsafe link href를 clickable `href`로 노출하지 않는 safety layer를 정리한다. |

## 확정 render behavior

| 항목 | 확정 내용 |
| --- | --- |
| root surface | root는 `.document-view`와 `role="document"`, `aria-label="Document"`를 가진다. |
| selection reflection | root는 focus/anchor/focus path, offset, edge, range count, selected pointer data attributes를 inspection/debug surface로 노출한다. |
| stable cursor paths | block, inline text, inline atom, code text는 canonical JSON pointer에 맞춘 `data-path`를 가진다. |
| duplicate block ids | duplicate block ids가 있어도 React duplicate-key warning이 나지 않도록 render key를 occurrence로 보강한다. |
| text block mapping | paragraph는 `p`, heading은 `h2` with `data-heading-level`, quote는 `blockquote`, listItem은 `div` with list depth/ordered data, codeBlock은 `pre > code`로 렌더링된다. |
| text run mapping | inline text는 `.text-run`으로 렌더링되고, empty text run은 `data-empty-text="true"`로 measurable caret target을 유지한다. Raw empty inline block도 synthetic empty text run을 렌더링한다. |
| structured marks | bold/italic/code/link marks는 delimiter text가 아니라 `strong`, `em`, `code`, `a` affordance로 렌더링된다. |
| link href safety | renderer는 safe href만 clickable `href`로 내보내고 unsafe href는 anchor content를 유지하되 executable href를 노출하지 않는다. |
| inline atom mapping | mention은 non-editable `.mention-chip` with `data-mention-id`와 stable `data-path`를 가진다. |
| block atom mapping | figure는 non-editable `figure > img` with stable block `data-path`로 렌더링된다. |
| cursor focus attributes | focus point와 일치하는 rendered node는 `data-cursor`, `data-cursor-offset` 또는 `data-cursor-edge`를 가진다. |
| no model mutation | renderer는 props를 DOM으로 투영할 뿐 document mutation, command dispatch, history, selection restore를 소유하지 않는다. |

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| root inspection surface | 실행 테스트로 확정 | `DocumentRenderer.test.tsx`가 `.document-view`, `role="document"`, `aria-label`, selection anchor/focus/range-count/selected-pointer data attributes를 server-rendered markup에서 고정한다. |
| stable `data-path` cursor surface | 실행 테스트로 확정 | text run, mention atom, figure atom, code text, block variant paths는 renderer tests와 contenteditable/cursor geometry tests가 canonical JSON pointer와 DOM을 연결하는 surface로 검증한다. |
| block variant DOM mapping | 실행 테스트로 확정 | paragraph, heading `data-heading-level`, quote, list item `data-list-depth`/`data-list-ordered`, codeBlock `pre > code` mapping은 renderer tests가 고정한다. |
| empty text measurable target | 실행 테스트로 확정 | empty text leaf와 raw empty inline block이 `data-empty-text="true"`와 stable text path를 렌더링하는 것을 `DocumentRenderer.test.tsx`, contenteditable, cursor geometry tests가 덮는다. |
| structured mark rendering | 실행 테스트로 확정 | bold/italic/code/link marks는 delimiter text가 아니라 `strong`/`em`/`code`/`a` affordance로 렌더링되고, Markdown delimiters가 DOM text로 새지 않는 것을 renderer tests가 검증한다. |
| renderer link href safety | 실행 테스트로 확정 | unsafe legacy link href는 clickable DOM `href`로 나가지 않고, safe http/mail/tel/relative href만 `href`로 렌더링된다. |
| atom DOM mapping | 실행 테스트로 확정 | mention and figure atoms are non-editable, keep stable paths, and expose the minimal data needed by pointer selection and overlays. |
| selection overlay projection | 실행 테스트로 확정 | `SelectionOverlay.test.tsx`가 range overlay와 mention/figure atom overlay가 geometry를 읽어 `aria-hidden` visual affordance로만 투영되는 것을 고정한다. |
| renderer state ownership absence | 소스 구조와 integration tests로 확정 | `DocumentRenderer`는 props-only projection이고 command dispatch/history/selection restore/native edit buffer는 `BlockEditor`, model, view adapters에 남아 있다. |
| final semantic HTML policy | 미정 | current DOM은 editor geometry/selection mapping용 internal render surface이며 published/read-only/export HTML semantics로 닫은 것이 아니다. |
| accessibility announcement matrix | 미정 | role/aria and overlay `aria-hidden` exist, but screen reader별 focus/selection/atom announcement는 검증하지 않았다. |
| media/figure trust policy | 미정 | figure `src` rendering은 확정이지만 media URL allowlist/privacy/broken-media UX는 아직 제품/보안 정책으로 닫지 않았다. |
| custom node renderer/static export/virtualization | 미정 | custom renderer registry, hydration 없는 static export contract, mounted DOM을 벗어난 virtualization/offscreen geometry는 별도 interface가 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `DocumentRenderer` | 유지 확정 | schema-to-DOM projection, stable path surface, mark/atom rendering, selection reflection을 한 adapter에 모은다. 삭제하면 geometry/contenteditable/debug tests에 DOM knowledge가 퍼진다. |
| stable `data-path` surface | 유지 확정 | cursor geometry, contenteditable selection, pointer selection, tests가 canonical cursor coordinate와 DOM을 연결하는 핵심 surface다. |
| empty text run marker | 유지 확정 | 빈 block/empty text leaf도 caret rect와 native selection target을 가져야 한다. |
| non-editable atom DOM | 유지 확정 | mention/figure 내부를 browser editable text로 취급하지 않게 하는 atom contract다. |
| renderer link href safety | 유지 확정 | trusted/legacy input과 무관하게 unsafe scheme을 clickable DOM href로 노출하지 않는다. |
| renderer state owner화 | 보류 | renderer는 projection adapter다. selection restore, command dispatch, native edit buffer를 여기로 옮기면 interface가 커진다. |
| semantic HTML 확장 | 보류 | 현재 listItem은 `div`와 data attributes로 닫혀 있다. `ul/ol/li`, heading level element 선택, figure caption semantics는 제품/접근성 결정이다. |
| virtualized renderer | 보류 | current geometry/contenteditable model은 mounted DOM을 전제로 한다. Virtualization은 geometry source와 selection mapping을 같이 재설계해야 한다. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| final semantic HTML policy | current DOM shape는 editor geometry와 selection mapping에 맞춘 내부 render surface다. Published document HTML이나 SEO/content export semantics로 닫은 것이 아니다. | public read-only/export renderer가 필요하면 `ul/ol/li`, heading level, figure caption, code language class policy를 별도 설계한다. |
| accessibility announcement matrix | role/aria, non-editable atoms, overlay `aria-hidden`은 있지만 screen reader별 focus/selection/atom announcement를 검증하지 않았다. | assistive-tech QA matrix가 필요하면 renderer roles/labels와 selection overlay announcement policy를 같이 확인한다. |
| media/figure trust policy | figure `src`는 rendered `img src`로 나간다. Link href와 같은 allowlist/trust policy는 아직 없다. | external media import나 untrusted document rendering 요구가 생기면 schema/import/renderer media policy를 함께 정한다. |
| custom node renderer | mention/figure 외 custom inline/block node renderer registry는 없다. | custom schema/plugin 요구가 생기면 node descriptor, cursor behavior, renderer, command registry를 함께 설계한다. |
| server/static render contract | `renderToStaticMarkup` tests는 있지만 final public SSR/static HTML export contract가 아니다. | publishing/export가 제품 범위가 되면 hydration 없는 static renderer contract를 별도 문서화한다. |
| virtualized/offscreen rendering | renderer와 geometry는 현재 mounted DOM을 전제로 한다. Offscreen block measurement나 partial DOM rendering은 없다. | 긴 문서/virtualization 요구가 생기면 cursor geometry adapter와 render windowing contract를 같이 설계한다. |

## 현재 결론

뺄 수 없는 확정은 `DocumentRenderer`가 제공하는 canonical document-to-DOM adapter,
stable `data-path` surface, block/inline/mark/atom DOM mapping, empty text measurable
target, selection reflection, renderer-level link href safety다.

아직 확정하면 안 되는 것은 published semantic HTML, assistive-tech announcement
matrix, media/figure trust policy, custom node renderer registry, static export
contract, virtualized/offscreen rendering이다. 현재 올바른 형태는 renderer를 state
owner로 키우지 않고, contenteditable/geometry/debug가 읽을 수 있는 작은 DOM
projection surface로 유지하는 것이다.
