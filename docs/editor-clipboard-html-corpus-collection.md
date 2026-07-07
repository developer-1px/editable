# Editor Clipboard HTML Corpus Collection

## Issue #74 Contract

The current editor intentionally has no rich `text/html` paste importer. Issue
#74 is the evidence collection step before designing that importer.

The corpus lives at:

```txt
tests/fixtures/clipboard-html-corpus/
```

`manifest.json` tracks the required source applications and sample shapes. A
sample is complete only when it contains the raw clipboard MIME payloads and
both current-reader and future-importer expectations.

## Required Sources

| Source | Required shapes |
| --- | --- |
| Google Docs | Heading with bold/italic/link, list, table-ish content |
| Notion | Paragraph/heading, callout/code/list, link |
| Slack | Message with mention-like text/link/emoji, inline code/code block |
| GitHub rendered page | Markdown-rendered heading/list/code/link/table |
| Generic webpage/article | Paragraph/link/image, unsafe style/script wrapper |

## Required MIME Payloads

Each sample must store:

- `text/html`
- `text/plain`

Store these when present:

- `text/markdown`
- `text/uri-list`

## Expectations

Current reader expectation:

- Rich HTML is ignored.
- Plain text or markdown fallback is the only accepted path.

Future HTML importer expectation:

- List allowed model nodes and marks.
- List dropped attributes and nodes.
- Include at least one unsafe URL/style/class/event-handler/script fixture.

## Collection Boundary

Synthetic HTML fixtures are not enough for #74. The sample must come from the
real browser or OS clipboard after copying from the source application.

This means Google Docs, Notion, and Slack samples depend on logged-in source app
state and cannot be generated from this repository alone.
