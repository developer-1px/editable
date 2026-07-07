# Clipboard HTML Corpus

This directory stores real raw clipboard payloads for issue #74.

## Status

`manifest.json` is a collection contract, not completed evidence. The issue can
only close when raw samples from all required sources are added and connected to
the future HTML importer fixture set.

## Sample File Convention

Each collected sample should be committed as:

```txt
tests/fixtures/clipboard-html-corpus/<source>/<shape>.json
```

Example:

```txt
tests/fixtures/clipboard-html-corpus/google-docs/heading-marks-link.json
```

Each sample JSON must include:

```json
{
  "schema": "interactive-os.clipboard-html-sample@1",
  "source": {
    "app": "Google Docs",
    "browser": "Chrome",
    "os": "macOS",
    "url": "https://docs.google.com/..."
  },
  "selectionShape": "multi-block",
  "mime": {
    "text/html": "<p>raw clipboard html</p>",
    "text/plain": "raw clipboard plain text"
  },
  "currentReaderExpectation": {
    "html": "ignored",
    "fallback": "text/plain"
  },
  "futureHtmlImporterExpectation": {
    "allowed": ["paragraph", "bold", "italic", "link"],
    "dropped": ["style", "class", "event-handler", "script"]
  },
  "notes": []
}
```

Keep raw payload strings intact. Do not prettify, sanitize, or normalize the
captured `text/html`; sanitizer expectations belong in the expectation fields.

When a single copied selection intentionally covers more than one required
shape, list the file once in `manifest.json` with `shapes` instead of duplicating
the raw payload.

`tools/evidence/clipboard-capture.html` can generate this sample shape from a
real browser clipboard payload.
