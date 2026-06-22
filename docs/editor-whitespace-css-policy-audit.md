# Editor whitespace CSS policy audit

작성일: 2026-06-22

범위: 현재 커밋 기준. Contenteditable text layout에서 `white-space` CSS가 입력,
selection, geometry에 주는 영향을 정리한다.

## 판정

현재 editor의 text block 필수 whitespace policy는 `white-space: pre-wrap`이다.

- `.text-block`은 `white-space: pre-wrap`을 가져야 한다.
- paragraph, heading, quote, list item, code block은 모두 `.text-block` class를
  공유한다.
- code block은 `<pre><code class="text-run">` 구조지만, current wrapping/geometry
  contract는 `.text-block`의 `pre-wrap`에 묶인다.
- empty text leaf는 `data-empty-text="true"` + inline-block measurable target으로
  caret target을 유지한다.
- Firefox 전용 hack node는 지금 추가하지 않는다.
- `normal`, `nowrap`, `pre-line`은 editor text block에 허용하지 않는다.
- `break-spaces`는 future/browser matrix 없이는 current policy로 승격하지 않는다.

## ProseMirror-view 근거

| 근거 | 내용 | 우리 쪽 해석 |
| --- | --- | --- |
| `checkCSS` | editor root `white-space`가 `normal`, `nowrap`, `pre-line`이면 warning하고 Gecko hack flag를 켠다. | contenteditable root whitespace는 selection/parser/geometry 전제다. |
| DOM reparse whitespace | parent whitespace가 `pre`일 때만 full preserve를 쓰고, 아니면 normalized whitespace parsing을 쓴다. | DOM을 parser truth로 쓰면 CSS whitespace와 model parsing이 연결된다. |
| caret geometry | line-broken whitespace와 browser rect 결과에 의존한다. | CSS whitespace 변경은 cursor geometry fixture를 같이 바꿔야 한다. |

근거:

- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domobserver.ts#L305-L317
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domchange.ts#L39-L48
- https://github.com/ProseMirror/prosemirror-view/blob/ca4c78e9b56f1b164c0b3758b59d8748f11b7534/src/domcoords.ts#L351-L360

## Required editable CSS

| Selector | 필수 값 | 이유 |
| --- | --- | --- |
| `.text-block` | `white-space: pre-wrap` | newline과 연속 whitespace를 DOM layout에서 보존하면서 줄 wrap을 허용한다. |
| `.text-block` | `min-height: 1lh` | empty paragraph가 visible/clickable line box를 갖는다. |
| `.text-run[data-empty-text="true"]` | `display: inline-block` | empty text leaf가 native caret/geometry target을 갖는다. |
| `.text-run[data-empty-text="true"]` | `min-width: 1px`, `min-height: 1em` | zero-size target으로 selection/geometry가 사라지지 않게 한다. |
| `.editor-surface` | `caret-color: transparent` 기본, IME 중 auto | custom caret과 native IME caret 표시를 분리한다. |
| `.document-view` | `word-break: break-word` | 긴 token이 editor surface를 깨지 않게 한다. Geometry parity는 별도 QA다. |

## White-space mode matrix

| Mode | current status | 이유 |
| --- | --- | --- |
| `normal` | 금지 | 연속 spaces/newlines가 collapse되어 model text offset과 visual caret offset이 갈라진다. |
| `nowrap` | 금지 | line wrapping이 사라져 visual line movement와 viewport behavior가 달라진다. |
| `pre-line` | 금지 | newline은 보존하지만 spaces가 collapse되어 text offset mapping이 깨질 수 있다. |
| `pre-wrap` | 유지 확정 | spaces/newlines를 보존하고 wrapping을 허용한다. 현재 text/code/geometry contract다. |
| `pre` | 보류 | preserve는 강하지만 wrap을 막는다. Code-only UX로도 geometry/scroll policy를 다시 봐야 한다. |
| `break-spaces` | 보류 | trailing spaces와 wrap opportunity가 `pre-wrap`과 달라 browser geometry matrix가 필요하다. |

## Gecko hack node 정책

현재는 Firefox 전용 hack node를 추가하지 않는다.

| 항목 | current decision | 이유 |
| --- | --- | --- |
| ProseMirror Gecko hack flag 복제 | 보류 | current editor는 DOMObserver reparse를 document truth로 쓰지 않는다. |
| invisible hack node 삽입 | 보류 | renderer DOM identity와 selection geometry에 새 noise를 만든다. |
| empty text measurable target | 유지 | 이것은 hack node가 아니라 actual empty text leaf의 caret target이다. |
| Firefox-specific fixture | future | real Firefox trace가 selection/caret failure를 보여줄 때 추가한다. |

## Parser / geometry 영향

| 영역 | current policy |
| --- | --- |
| DOM parser | browser-mutated DOM을 일반 parser source of truth로 쓰지 않는다. Native text buffer는 active text leaf 범위에서만 flush한다. |
| model text | whitespace는 model text 자체가 보존한다. CSS는 model truth가 아니라 layout projection이다. |
| cursor geometry | `cursorGeometry.test.ts`가 hard newline, empty visual line, code block, wrap fixture를 고정한다. |
| native selection bridge | text-run `data-path`와 DOM Range offset을 canonical grapheme boundary로 snap한다. |
| Markdown/clipboard | whitespace serialization은 model/markdown/clipboard layer가 담당한다. CSS를 serialization source로 쓰지 않는다. |

## Fixture policy

| Fixture class | 상태 | 의미 |
| --- | --- | --- |
| jsdom render fixture | 실행 테스트 있음 | text block/code block/empty text run DOM surface를 고정한다. |
| jsdom geometry fixture | 실행 테스트 있음 | hard newline, empty line, wrap, code padding geometry를 고정한다. |
| CSS inventory | 문서로 고정 | 필수 selector/value는 이 문서와 style surface audit에 남긴다. |
| computed style browser fixture | future | 실제 Chromium/Firefox/WebKit의 `white-space` computed value와 caret rect를 확인한다. |
| Gecko hack node fixture | future | Firefox trace가 없으면 만들지 않는다. |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| `.text-block pre-wrap` current CSS | source 확정 | `src/styles.css`가 `.text-block { white-space: pre-wrap; }`를 가진다. | CSS computed style browser matrix는 아니다. |
| block types sharing text-block | source/test 확정 | `DocumentRenderer.tsx`, `DocumentRenderer.test.tsx`가 paragraph/heading/quote/list/code block class surface를 고정한다. | Future custom block은 별도 descriptor가 필요하다. |
| empty text measurable target | 실행 테스트로 확정 | renderer, contenteditable selection, cursor geometry tests가 `data-empty-text` target을 사용한다. | Firefox-specific hack node와 다르다. |
| geometry dependency | 실행 테스트로 확정 | cursor geometry tests가 hard newline, empty visual line, wrap, code block behavior를 닫는다. | 실제 browser pixel parity는 별도 QA다. |
| Gecko hack node 필요성 | 미정/보류 | ProseMirror source는 근거지만 current repo에 Firefox failure trace가 없다. | Firefox real browser trace가 필요하다. |
| `break-spaces` 도입 | 미정/보류 | trailing spaces semantics가 달라질 수 있다. | Browser matrix와 product text layout 결정이 필요하다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `.text-block { white-space: pre-wrap; }` | 유지 확정 | selection, model offset, geometry fixture의 기본 전제다. |
| `normal`/`nowrap`/`pre-line` 허용 | 제거 확정 | whitespace collapse 또는 wrapping 차이로 model offset과 visual position이 갈라진다. |
| Firefox hack node 선구현 | 보류 | real failure trace 없이 invisible DOM을 추가하면 renderer/selection noise가 늘어난다. |
| `break-spaces` 전환 | 보류 | 더 강한 preserve semantics는 매력적이지만 browser geometry matrix 없이 바꾸면 위험하다. |
| CSS를 parser truth로 사용 | 제거 확정 | current authority는 model text와 active text leaf flush다. |

## 현재 결론

현재 editor는 `pre-wrap`을 text block의 필수 CSS로 유지한다. 이 값은 미관이 아니라
selection, input buffer, cursor geometry의 전제다. Firefox hack node, `break-spaces`,
code-only `pre` 전환은 실제 browser trace와 geometry fixture가 생길 때만 도입한다.
