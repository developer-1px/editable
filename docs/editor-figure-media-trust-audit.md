# Editor figure media trust audit

작성일: 2026-06-22

범위: `figure` block의 `src`/`alt`, Markdown image adapter, renderer, toolbar
fixture가 보장하는 범위와 아직 보장하지 않는 media product policy를 분리한다.

## 목적

`figure.src`는 문서 schema와 renderer에 존재한다. 이제 최소 URL allowlist는
닫혔지만, 이것만으로 upload, proxy, remote image privacy, CSP 정책이 닫혔다고 볼
수 없다.

이 문서는 현재 확정된 figure block contract와 아직 제품 결정으로 남은 media lifecycle
policy를 나눈다.

## 근거

| 근거 | 내용 |
| --- | --- |
| `src/editor/internal/model/mediaSrc.ts` | figure media source allowlist의 단일 helper다. relative URL과 `http:`/`https:`를 허용하고, protocol-relative, `javascript:`, `data:`, `blob:`, external SVG를 거절한다. |
| `src/editor/internal/model/noteDocument.ts` | `FigureBlockSchema`는 block atom이고 `src`는 non-empty이면서 `normalizeFigureSrc`를 통과해야 한다. `figureBlock()` helper는 canonical `src`를 attrs에도 복제한다. |
| `src/editor/internal/model/textCommands.ts` | `insertFigure`는 `src`를 normalize한 뒤 selected text/range/atom/edge 위치에 block atom으로 삽입한다. unsafe `src`는 mutation 전에 거절한다. |
| `src/editor/internal/model/editorCommandStrategies.ts` | public headless `insertNode` command의 insertable node 중 하나가 `figure`다. Public type name은 `InsertableEditorNode` 하나로 숨긴다. |
| `src/editor/internal/react/DocumentRenderer.tsx` | renderer는 figure를 non-editable `<figure>`로 렌더하고, legacy unsafe `src`는 DOM `<img src>`로 내보내지 않는다. |
| `src/editor/internal/model/markdown.ts` | Markdown image line `![alt](src)`는 safe `src`일 때만 figure block으로 import된다. unsafe image line은 `alt` text만 paragraph로 보존하거나, alt가 없으면 drop한다. |
| `src/editor/internal/react/BlockEditor.tsx` | toolbar "Insert figure"는 deterministic `/sample-figure.svg` fixture와 `alt: "Figure"`를 삽입한다. Picker/upload flow가 아니다. |
| `public/sample-figure.svg` | current sample figure fixture다. Product media asset policy와 분리된다. |
| `src/editor/internal/model/mediaSrc.test.ts` | safe relative/http source와 unsafe source fixture를 검증한다. |
| `src/editor/internal/model/noteDocument.test.ts` | empty/unsafe figure `src`는 schema 밖이고 safe source는 schema-valid임을 검증한다. |
| `src/editor/internal/model/markdown.test.ts` | figure alt text와 escaped image source의 deterministic Markdown round-trip, unsafe image import drop policy를 검증한다. |
| `src/editor/internal/model/textCommands.test.ts` | command-created figure가 unsafe `src`를 거절하고 safe `src`를 normalize한다고 검증한다. |
| `src/editor/internal/react/DocumentRenderer.test.tsx` | figure block atom rendering, stable path, non-editable behavior, missing alt fallback, legacy unsafe `src` 방어를 검증한다. |

## 확정 figure/media behavior

| 항목 | 확정 내용 |
| --- | --- |
| figure node shape | Figure is a block atom with `kind: "atom"`, `type: "figure"`, `flow: "block"`. |
| required source | `src` is required, non-empty, and must pass the figure media source allowlist. |
| source allowlist | Relative URL and `http:`/`https:` image sources are accepted. Protocol-relative, active/opaque schemes, and external SVG are rejected. |
| optional alt | `alt` is optional. Renderer emits empty alt text when absent. |
| block atom behavior | Figure is rendered as a non-editable block atom with stable block `data-path`. |
| insertion command | `insertFigure` inserts or replaces as a block atom only after write-time `src` normalization. |
| toolbar fixture | Current toolbar insertion uses `/sample-figure.svg` and `alt: "Figure"` as deterministic sample data. |
| Markdown adapter | Supported Markdown image line imports/exports safe figure `src` and `alt`; unsafe imported image lines preserve non-empty alt text as plain paragraph text. |
| URL syntax escaping | Markdown export encodes `)` and escapes alt syntax characters so the local parser can round-trip supported image syntax. |
| text extraction | `readBlockText(figure)` returns empty string; figure text is not paragraph text. |

## 증거 강도

| 판정 대상 | 강도 | 근거 |
| --- | --- | --- |
| figure block schema shape | source/schema 확정 | `FigureBlockSchema`는 block atom이고 `src`는 media source allowlist를 통과해야 하며, `alt`는 optional field다. |
| required safe source | 실행 테스트로 확정 | `noteDocument.test.ts`와 `mediaSrc.test.ts`가 empty/unsafe `src`를 schema-invalid로 검증한다. |
| optional alt renderer fallback | 실행 테스트로 확정 | `DocumentRenderer.test.tsx`가 missing `alt` figure를 `<img alt="">`로 렌더한다고 검증한다. |
| figure text extraction | 실행 테스트로 확정 | `noteDocument.test.ts`가 `readBlockText(figure)`가 empty string을 반환한다고 검증한다. |
| non-editable block atom rendering | 실행 테스트로 확정 | `DocumentRenderer.test.tsx`가 stable block `data-path`, `contentEditable="false"`, safe image `src`/`alt` projection과 unsafe legacy `src` drop을 검증한다. |
| insertFigure block atom insertion | 실행 테스트로 확정 | `textCommands.test.ts`가 selected text replacement, figure-edge insertion, unsafe `src` rejection을 검증한다. |
| toolbar fixture insertion | 실행 테스트로 확정 | `BlockEditor.test.tsx`가 toolbar figure command가 `alt: "Figure"` accessible image와 `/sample-figure.svg` source를 추가한다고 검증한다. |
| Markdown image syntax round-trip | 실행 테스트로 확정 | `markdown.test.ts`가 Markdown image import/export, unsafe image import drop, escaped source/alt round-trip을 검증한다. |
| minimal media URL allowlist | 실행 테스트로 확정 | `mediaSrc.test.ts`가 relative/http safe source와 `javascript:`/`data:`/`blob:`/protocol-relative/external SVG rejection을 검증한다. |
| upload/picker/caption/media metadata model | 미정 | current schema는 `src`/`alt`/attrs 최소 surface다. upload id, dimensions, captions, credit, lifecycle은 별도 product scope다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| `FigureBlockSchema` | 유지 확정 | Figure block atom behavior is exercised by cursor, command, renderer, Markdown, clipboard, and toolbar paths. |
| Required non-empty `src` | 유지 확정 | Empty figure source cannot render meaningful media and is already schema-invalid. |
| Optional `alt` with empty fallback | 유지 확정 | Renderer has a deterministic fallback and tests cover it. |
| `/sample-figure.svg` fixture | 유지 확정 | It replaced starter assets and supports deterministic demo/toolbar insertion without product upload scope. |
| Media URL sanitizer/allowlist | 유지 확정 | URL safety는 write-time/import/render boundary에서 닫는다. Relative URL과 `http:`/`https:`만 허용하고 active/opaque/protocol-relative/external SVG source는 canonical write와 DOM projection에서 제거한다. |
| Upload/picker/proxy flow | 보류 | Current toolbar inserts a fixture. Picker/upload would introduce storage, trust, preview, and lifecycle decisions. |
| Public `FigureBlockInput` export | 제거 확정 | Public payload concept is `InsertableEditorNode`; exporting internal figure input type would widen the interface. |
| Markdown image as full media import contract | 보류 | Current adapter supports deterministic image syntax, not CommonMark/GFM/media trust compatibility. |

## 아직 애매하거나 결정이 필요한 것

| 주제 | 왜 애매한가 | 다음 확인 |
| --- | --- | --- |
| remote image privacy | `http:`/`https:` source는 허용되지만 browser fetch/referrer/proxy 정책은 아직 별도다. | public deployment/privacy 요구가 생기면 `referrerPolicy`, proxy, CSP, remote allowlist를 함께 설계한다. |
| SVG trust | `/sample-figure.svg` 같은 relative repo-owned fixture는 허용한다. External SVG는 deny한다. User upload SVG policy는 아직 없다. | upload/import가 생기면 SVG sanitize, rasterization, or deny policy를 정한다. |
| broken media UX | Missing or failed images currently have only browser default behavior. | product UX가 필요하면 placeholder, retry, error reporting, captions을 설계한다. |
| captions and metadata | Figure schema has `src`/`alt`/attrs but no caption, dimensions, credit, upload id. | richer media product scope가 생기면 schema migration과 renderer/Markdown policy를 함께 정한다. |
| Markdown media compatibility | Current parser only accepts one-line image syntax as a figure block. Titles, reference images, nested syntax, HTML image tags are not supported. | external Markdown import/export 요구가 커지면 supported media matrix를 별도 정의한다. |

## 현재 결론

뺄 수 없는 확정은 figure가 non-editable block atom이고, `src`는 비어 있으면 안 되는
canonical media reference이며, `alt`는 optional field라는 점이다. Toolbar fixture와
Markdown image adapter도 현재 deterministic behavior로 확정되어 있다.

이번에 확정한 것은 최소 URL safety다. schema, command write, Markdown import,
renderer projection은 같은 figure source allowlist를 공유한다. unsafe source는 canonical
figure로 쓰지 않고, legacy unsafe source도 DOM `src`로 내보내지 않는다.

아직 확정하면 안 되는 것은 media product policy다. remote image privacy, upload,
proxy, CSP, caption/metadata lifecycle은 URL sanitizer만으로 닫히지 않는다. 이 범위는
external media, upload, deployment privacy 요구가 생길 때 schema, renderer, Markdown,
asset policy를 함께 정해야 한다.
