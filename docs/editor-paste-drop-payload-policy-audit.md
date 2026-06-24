# Editor paste/drop payload policy audit

작성일: 2026-06-22

범위: paste/drop/beforeinput transfer가 `text/html`, `text/plain`,
`text/markdown`, `text/uri-list`, file, empty clipboard, app-owned custom MIME을
섞어 줄 때 current editor가 무엇을 읽고 무엇을 버리는지 정한다.

## 판정

현재 editor의 paste/drop contract는 HTML importer가 아니라 **string transfer reader**다.

- custom MIME은 same-app `markdown`/`plainText` envelope만 읽는다.
- external `text/plain`은 plain paste로 읽는다.
- external `text/markdown`은 markdown paste로 읽는다.
- external `text/uri-list`는 comments/blank lines를 제거한 URL list를 plain text로 읽는다.
- `text/html`과 files는 현재 import source가 아니다. `text/plain`, `text/markdown`,
  `text/uri-list` 같은 textual fallback이 있으면 그 fallback만 쓴다.

## MIME policy table

| Priority | MIME/source | current behavior | format | 이유 |
| --- | --- | --- | --- | --- |
| 1 | `application/x-editable-selection+json` | `schema: editable-clipboard@1`이면 `markdown` 우선, 없으면 `plainText` | markdown/plain | same-app도 node graph가 아니라 text envelope만 신뢰한다. |
| 2 | `text/plain` | 그대로 읽는다 | plain | source HTML/style/metadata를 버리는 가장 안정적인 fallback이다. |
| 3 | `text/markdown` | plain이 없을 때 읽는다 | markdown | 명시적 markdown MIME일 때만 rich-ish fragment restore를 허용한다. |
| 4 | `text/uri-list` | comment/blank line을 제거하고 URI line을 newline으로 합친다 | plain | Safari/iOS share/copy URL interop를 텍스트 삽입으로 닫는다. |
| drop | `text/html` | 읽지 않는다 | none | sanitizer, Trusted Types, source-app matrix 없이 DOM import를 열지 않는다. |
| drop | files / `image/png` only | 읽지 않는다 | none | figure/embed import, media sanitizer, upload/proxy policy가 없다. |
| drop | empty clipboard | no-op | none | hidden textarea fallback을 만들지 않는다. |

## Source app/browser payload samples

이 표의 payload는 source app/browser별 current reader contract를 고정하는 대표
fixture다. Google Docs/Notion 같은 전체 raw HTML corpus는 #74에서 별도 수집한다.

| source | transfer payload | current expected |
| --- | --- | --- |
| ProseMirror-like slice copy | `text/html='<ul data-pm-slice="1 1 []"><li><p>Nested</p></li></ul>'`, `text/plain='Nested'` | `Nested` plain paste. `data-pm-slice`는 무시 |
| Google Docs/Notion-like rich copy | `text/html='<span style="font-weight:700" data-docs-id="x">Title</span>'`, `text/plain='Title'` | `Title` plain paste. style/data attrs 무시 |
| Safari/iOS URL share | `text/uri-list='# copied\\nhttps://example.com/\\nhttps://example.com/next'` | URL lines를 plain text로 paste |
| Markdown-capable source | `text/markdown='@[Ada](mention:user-ada)'` | markdown format paste로 mention atom restore |
| Browser file drop with text fallback | `files=[image/png]`, `text/plain='Image caption'` | file은 무시하고 plain text fallback만 paste |
| Code HTML source with nested breaks | `text/html='<code><span>1<br>2</span></code>'` | no-op. HTML code parser 없음 |

## Plain, rich, code policy

| mode/source | current policy | tests |
| --- | --- | --- |
| plain transfer | markdown처럼 보여도 text insertion이다. | inputAdapter split tests plain/markdown-looking paste |
| markdown transfer | supported markdown fragment만 marks/link/mention/figure/multi-block/codeBlock으로 복원한다. | inputAdapter split tests, `clipboard split tests` |
| code block target | `text/plain`/`text/uri-list`는 active code text에 plain insertion으로 들어간다. HTML `<pre><code>`/nested `<br>`는 읽지 않는다. | plain paste tests, HTML-only null tests |
| rich HTML | current product scope 밖이다. Future importer는 sanitizer, Trusted Types, source corpus가 필요하다. | `editor-paste-html-security-policy-audit.md` |

## Debug trace fields

Clipboard failure를 조사할 때 text가 없으면 기존 `clipboardText`만으로 원인을 알 수 없다.
따라서 recorder input event에는 아래 필드를 남긴다.

| field | 의미 |
| --- | --- |
| `clipboardTypes` | `DataTransfer.types` MIME 목록. HTML-only, uri-list-only, mixed file/text 여부를 본다. |
| `clipboardText` | current reader가 실제 선택한 text. 없으면 payload가 unsupported이거나 비어 있다는 뜻이다. |
| raw recording | full event/session은 clipboard report에 넣지 않고 `window.__editableDebugRecordings.at(-1)`에 둔다. |

## 외부 근거

| 근거 | 원문 | 해석 |
| --- | --- | --- |
| ProseMirror changelog에는 `text/uri-list`, HTML comments, trailing `<br>`, table wrappers, Trusted Types, code block paste, file paste가 반복된다. | https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | paste/drop은 source-app and browser matrix 문제다. 작은 reader contract와 future importer를 분리해야 한다. |
| ProseMirror reference는 `transformPastedHTML`, `clipboardParser`, `transformPastedText`, `clipboardTextParser`, `handlePaste`, `handleDrop`을 둔다. | https://prosemirror.net/docs/ref/#view.EditorProps.transformPasted | HTML/text/slice/drop extension point가 분리되어 있다. |
| Lexical PR #4478은 Safari/iOS share clipboard의 `text/uri-list`를 지원한다. | https://github.com/facebook/lexical/pull/4478 | `text/uri-list`는 current editor에서도 plain text fallback으로 받는 편이 실용적이다. |
| Lexical PR #7822는 editor가 다른 window/document에 있을 때 clipboard selection source를 고쳤다. | https://github.com/facebook/lexical/pull/7822 | clipboard 조사는 payload MIME뿐 아니라 source document/root context도 함께 본다. |
| Lexical PR #8487은 pasted code의 nested `<br>` 감지를 고쳤다. | https://github.com/facebook/lexical/pull/8487 | HTML code paste는 DOM traversal/importer 문제다. current string reader에 끼우지 않는다. |
| Lexical changelog에는 Google Docs paste, table paste, code block paste, image copy/paste, empty selection clipboard, iframe/different-window clipboard가 반복된다. | https://raw.githubusercontent.com/facebook/lexical/main/CHANGELOG.md | rich paste fidelity는 별도 corpus와 browser fixture가 필요하다. |

## 후속 범위

| item | 이유 | issue |
| --- | --- | --- |
| raw external HTML corpus | 이 문서의 source payload는 representative fixture다. 실제 Google Docs/Notion/Slack/GitHub/webpage raw MIME은 별도 수집해야 한다. | #74 |
| media/figure URL sanitizer | file/image/HTML img import를 열기 전에 write-time media URL policy가 필요하다. | #73 |
| rich HTML importer | current reader가 HTML을 읽지 않으므로 Trusted Types/sanitizer/parser가 없다. | future |

## 증거 강도

| 항목 | 판정 | 근거 | 한계 |
| --- | --- | --- | --- |
| current MIME priority | 실행 테스트 확정 | `clipboard split tests` | 외부 앱 raw corpus 전체를 대체하지 않는다. |
| `text/uri-list` fallback | 실행 테스트 확정 | `clipboard split tests` uri-list cases | Safari/iOS real clipboard event는 #74/browser trace가 필요하다. |
| plain vs markdown mode | 실행 테스트 확정 | inputAdapter split tests, BlockEditor split tests | HTML rich import fidelity는 없음 |
| debug MIME type summary | 실행 테스트 확정 | `debug interaction split tests` | raw payload content는 privacy 때문에 report에 넣지 않는다. |
| HTML importer non-support | 실행 테스트/문서 확정 | HTML-only null test, paste HTML security audit | rich external paste UX는 낮다. |

## 현재 결론

#10의 current answer는 HTML을 조금 sanitize해서 받는 것이 아니다. Current editor는 app
custom MIME, plain text, markdown text, uri-list text만 command layer로 넘긴다.
`text/html`, file-only, empty clipboard는 no-op이고, rich HTML paste는 #74 raw corpus와
별도 importer 설계 전까지 열지 않는다.
