# Editor Paste HTML Security Policy Audit

작성일: 2026-06-22

범위: pasted HTML, Trusted Types, URL allowlist, style/class stripping,
source-app clipboard sample, 그리고 현재 editor가 실제로 HTML을 읽는지 여부를
분리한다.

## 판정

현재 editor는 `text/html` rich paste importer가 없다. 따라서 현재 보안 정책은
HTML을 sanitize해서 일부만 받는 것이 아니라, HTML clipboard payload를 paste input으로
채택하지 않는 것이다.

- 확정: paste/drop은 custom MIME, `text/plain`, `text/markdown`, `text/uri-list`
  문자열만 읽는다.
- 확정: `text/html` only payload는 current paste input이 아니다.
- 확정: `data-pm-slice` 같은 HTML slice context도 현재 무시한다.
- 확정: link href는 markdown import, command write, persisted parse, renderer에서
  같은 allowlist를 통과한다.
- 확정: figure/image `src`는 markdown import, command write, persisted parse,
  renderer에서 media source allowlist를 통과한다.
- 미정/future: HTML importer를 도입하려면 tag/attr/style/URL allowlist, detached
  parse, Trusted Types, source-app sample corpus를 함께 설계해야 한다.

## Current Transfer Policy

| MIME / source | 현재 처리 | 보안 의미 |
| --- | --- | --- |
| `application/x-editable-selection+json` | `schema: editable-clipboard@1`이면 `markdown` 우선, 없으면 `plainText`를 읽는다. | same-app도 node graph가 아니라 text/markdown envelope만 신뢰한다. |
| `text/plain` | external fallback 중 가장 먼저 읽는다. | HTML/DOM metadata를 버리고 plain text만 삽입한다. |
| `text/markdown` | `text/plain`이 없을 때 markdown format으로 읽는다. | supported markdown fragment만 model로 복원한다. |
| `text/html` | 읽지 않는다. | 현재 XSS/script/style/class 폭주는 import surface가 아니다. |
| `text/uri-list` | comment/blank line을 제거해 plain text URL list로 읽는다. | URL을 link/media로 trust하지 않고 텍스트 삽입으로만 처리한다. |
| `data-pm-slice` HTML | 읽지 않는다. | ProseMirror slice context와 wrapper metadata는 current importer가 아니다. |

## Future HTML Allowlist Draft

현재 구현은 이 표를 실행하지 않는다. HTML importer를 도입할 때의 최소 초안이다.

| Category | 허용 후보 | drop 후보 | model mapping |
| --- | --- | --- | --- |
| block | `p`, `h1`-`h6`, `blockquote`, `ul`, `ol`, `li`, `pre`, `code` | `script`, `style`, `iframe`, `object`, `embed`, `form`, `input`, unknown interactive node | paragraph, heading, quote, flat listItem, codeBlock |
| inline | `strong`, `b`, `em`, `i`, `code`, `a`, `br`, text | `span` style blob, event handler node, unknown inline widget | bold, italic, code, link, text/newline policy |
| media | `img` only if media policy exists | external SVG/data/blob by default, `srcset`, event handlers | figure with sanitized `src`/`alt` |
| attributes | `href`, `title`, `src`, `alt`, limited code language hint | `style`, `class` except explicit parser hints, `id`, `data-*`, `on*`, `srcdoc`, `target` from source | canonical typed fields only |
| style | none by default | all inline CSS and CSS classes | no style attrs in canonical model |
| source metadata | app-owned slice marker only if designed | Google/Notion/Slack/GitHub private wrapper metadata | no arbitrary `attrs` import |

## URL Policy

| URL field | 현재 상태 | 정책 |
| --- | --- | --- |
| link `href` | 확정 | `http:`, `https:`, `mailto:`, `tel:`, relative URL만 허용한다. unsafe markdown link는 label text만 남긴다. |
| renderer link `href` | 확정 | legacy unsafe href가 있어도 clickable DOM `href`로 내보내지 않는다. |
| figure `src` | 확정 | relative URL과 `http:`/`https:`만 허용한다. protocol-relative, `javascript:`, `data:`, `blob:`, external SVG는 거절한다. |
| renderer figure `src` | 확정 | legacy unsafe source가 있어도 fetchable DOM `<img src>`로 내보내지 않는다. |
| image data URL | 금지 | current media source allowlist에서 허용하지 않는다. |
| `javascript:` / active content URL | 금지 | link와 media 모두 write-time/import/render boundary에서 막는다. |
| remote image privacy | 미정 | proxy/referrer/CSP/upload 정책이 필요하다. URL sanitizer만으로 닫히지 않는다. |

## Trusted Types Policy

Trusted Types는 sanitizer가 아니다. HTML string을 injection sink에 넣을 때 어떤
policy가 만든 `TrustedHTML`인지 강제하는 브라우저 보안 경계다.

| 상황 | 현재 필요 여부 | 이유 |
| --- | --- | --- |
| current paste/drop | 불필요 | `text/html`을 DOMParser/innerHTML/Range sink에 넣지 않는다. |
| future DOMParser HTML import | 필요 | Trusted Types WPT/spec에는 `DOMParser.parseFromString` 관련 sink tests가 있다. |
| future `innerHTML`/`createContextualFragment` import | 필요 | 둘 다 Trusted Types sink로 다뤄진다. |
| per-paste policy creation | 금지 | ProseMirror도 paste마다 `TrustedTypePolicy`를 재생성하지 않도록 수정했다. |
| default policy blindly trust | 금지 | Lexical #6755처럼 post-process가 충분하다는 판단이 있을 때만 제한적으로 가능하다. 우리는 아직 HTML post-process importer가 없다. |

Future importer 순서는 다음이어야 한다.

1. Clipboard MIME과 payload size를 먼저 제한한다.
2. HTML string은 detached/inert parse path로만 넣는다.
3. TrustedHTML을 만들기 전 sanitizer 또는 default policy의 역할을 명확히 둔다.
4. parsed DOM node를 그대로 document에 adopt하지 않는다.
5. parsed DOM을 canonical model allowlist로 변환하면서 tag/attr/style/URL을 다시
   검증한다.

## Source Sample Corpus

현재는 raw clipboard HTML sample을 저장하지 않았다. HTML importer가 없으므로 실행
fixture가 아니라 수집 대상과 기대 drop policy를 먼저 정의한다.

| Sample | 수집할 raw MIME | 위험 요소 | current expected |
| --- | --- | --- | --- |
| Google Docs | `text/html`, `text/plain` | verbose spans/styles, heading/list/table wrappers, copied comments | plain fallback만 사용 |
| Notion | `text/html`, `text/plain`, 가능하면 markdown | nested block wrappers, data attributes, callout/code/list metadata | plain or markdown fallback만 사용 |
| Slack | `text/html`, `text/plain` | mention/link wrappers, emoji spans, code formatting | plain fallback만 사용 |
| GitHub rendered page | `text/html`, `text/plain` | code block/table/list/link DOM, classes | plain fallback만 사용 |
| Generic webpage/article | `text/html`, `text/plain` | images, relative links, scripts/styles, layout wrappers | plain fallback만 사용 |

이 다섯 sample은 future HTML importer의 최소 corpus다. current reader는 `text/html`
only를 null로 두고 plain fallback이 있으면 plain을 읽는 테스트가 이미 있다.

## External Evidence

| Source | 증거 | 결론 |
| --- | --- | --- |
| ProseMirror changelog | clipboard input에서 `trustedTypes.defaultPolicy` 사용, paste마다 TrustedTypePolicy 재생성 방지, HTML clipboard parser bug, separate document parse for XSS protection이 반복된다. | HTML paste는 parser/sanitizer/CSP까지 view layer의 큰 책임이다. |
| ProseMirror docs | `transformPastedHTML`, `clipboardParser`, `transformPasted`, `handlePaste`를 제공한다. | HTML cleanup은 parse 전/후 extension point가 필요하다. |
| Lexical changelog | HTML conversion, Google Docs paste, style import/export, link URL sanitize, script node ignore, table paste 등이 반복된다. | rich HTML paste는 단순 DOMParser가 아니라 source-app compatibility matrix다. |
| Lexical PR #6755 | rich text clipboard HTML을 TrustedHTML로 trust하는 변경이다. 전제는 HTML을 후처리한다는 판단이다. | 우리 current path는 후처리 importer가 없으므로 같은 결론을 적용하면 안 된다. |
| Trusted Types spec/WPT | `DOMParser.parseFromString`, `innerHTML`, `Range.createContextualFragment` 관련 Trusted Types sink tests가 있다. | future HTML importer는 CSP 환경에서 TrustedHTML 경계를 설계해야 한다. |

## Current Drift

| Drift | 영향 | 후속 처리 |
| --- | --- | --- |
| figure `src` sanitizer 적용됨 | markdown paste/import나 command-created figure는 unsafe media URL을 canonical figure로 쓰지 않는다. | remote image privacy/proxy/CSP는 별도 제품 정책으로 남긴다. |
| raw external HTML corpus 없음 | future HTML importer를 검증할 실물 clipboard sample이 없다. | #74에서 Google Docs/Notion/Slack/GitHub/webpage sample 수집으로 분리한다. |
| HTML importer 없음 | rich external paste fidelity는 없다. | #10 clipboard parsing 조사와 함께 product scope를 정해야 한다. |

## 증거 강도

| 항목 | 강도 | 근거 |
| --- | --- | --- |
| current `text/html` non-support | 실행 테스트로 확정 | `clipboard split tests`가 `text/html` only `data-pm-slice` transfer를 null로 검증한다. |
| current string transfer contract | 실행 테스트로 확정 | `clipboard split tests`, BlockEditor split tests, inputAdapter split tests가 custom/plain/markdown paste/drop을 닫는다. |
| `text/uri-list` plain fallback | 실행 테스트로 확정 | `clipboard split tests`가 comment/blank line 제거와 HTML 미신뢰를 검증한다. |
| link href allowlist | 실행 테스트로 확정 | `editor-link-mark-audit.md`, markdown split tests, `DocumentRenderer split tests`, public parse tests |
| attrs/source metadata non-import | 실행 테스트로 확정 | `editor-attrs-extension-surface-audit.md`, markdown split tests, renderer attrs sentinel tests |
| figure media URL trust | 실행 테스트로 확정 | `editor-figure-media-trust-audit.md`, `mediaSrc.test.ts`, markdown split tests, text command split tests, `DocumentRenderer split tests` |
| Trusted Types need for future HTML import | 외부 spec/source 근거 | ProseMirror changelog, Lexical #6755, Trusted Types WPT/spec |
| 5-source raw HTML sample corpus | 미수집 | 수집 대상은 정의했지만 실제 raw clipboard payload는 없다. |

## /doubt 판정

| 항목 | 판정 | 이유 |
| --- | --- | --- |
| current `text/html` importer 추가 | 보류 | sanitizer, Trusted Types, schema fit, sample corpus 없이 도입하면 보안/호환 surface가 과하다. |
| current HTML drop policy | 유지 | HTML을 안 읽고 plain/markdown fallback만 쓰는 작고 방어적인 contract다. |
| link href sanitizer | 유지 | 이미 command/import/render/public parse 경로에서 공유된다. |
| figure `src` sanitizer | 유지 확정 | media URL은 최소 write-time/import/render allowlist를 공유한다. remote privacy/proxy/upload는 별도 product policy다. |
| source HTML metadata를 `attrs`로 보존 | 제거 | current attrs는 arbitrary pasted HTML metadata contract가 아니다. |
| Trusted Types 선구현 | 보류 | HTML sink가 없는 current path에는 죽은 정책이다. HTML importer와 함께 설계해야 한다. |

## 현재 결론

#19의 보안 경계는 "HTML sanitizer를 어디에 끼울까"가 아니라 "아직 HTML을 paste input으로
받지 않는다"로 닫힌다. 이 선택은 현재 XSS/style/class 폭주를 가장 작게 막는다.

figure/media `src`도 이제 최소 allowlist를 공유한다. 다만 remote image privacy,
proxy, CSP, upload lifecycle은 URL sanitizer만으로 닫히지 않는다. rich HTML paste를
제품 범위로 올리려면 #74에서 Google Docs, Notion, Slack, GitHub, 일반 웹페이지 raw
clipboard sample을 먼저 모으고, tag/attr/style/URL allowlist와 Trusted Types path를
같이 설계해야 한다.
