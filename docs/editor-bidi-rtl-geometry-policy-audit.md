# Editor BiDi RTL Geometry Policy Audit

## Issue #80 Policy

The editor separates logical document movement from browser visual movement:

- Model commands use `backward` and `forward` in document order.
- API and docs must avoid using `left` and `right` when the behavior is logical.
- Browser ArrowLeft/ArrowRight remains native visual movement for now; the editor syncs the resulting DOM selection after the browser moves it.
- `start` and `end` mean line/block/document logical boundaries, not physical left/right screen edges.

## Browser Fixture

The browser fixture is `tests/browser/fixtures/bidiRtlFixture.ts` and is exercised in Chromium, WebKit, and Firefox by `tests/browser/editable.spec.ts`.

Fixture content:

- Hebrew RTL text.
- Arabic RTL text.
- Mixed LTR text inside RTL content.
- Inline mark wrapper around the LTR run.
- Inline atom/chip between RTL runs.

The fixture records:

- Logical forward/backward character offsets.
- Native visual left/right movement when `Selection.modify()` is available.
- DOMRect caret geometry at line start, mark boundary, atom edge, and document end.

## Geometry Decision

The current geometry adapter supports DOMRect trace collection for BiDi content, but it does not yet expose a product guarantee equivalent to `coordsAtPos` for BiDi visual cursor placement.

Policy for now:

- Keep the internal visual layout measurement as best-effort DOMRect data.
- Treat exact BiDi visual cursor geometry as unsupported product API.
- Do not implement custom RTL visual ArrowLeft/ArrowRight movement until a product workflow requires it.
- Add per-browser expected rect snapshots before exposing a public coordinate adapter for RTL/BiDi editing.

## Regression List

Upstream cases to keep on the regression list:

- ProseMirror renamed inline decoration edge options from `inclusiveLeft`/`inclusiveRight` to `inclusiveStart`/`inclusiveEnd` so the terms work for RTL text.
- ProseMirror has had RTL-related `coordsAtPos` and right-to-left arrow handling fixes; any future coordinate API should compare side handling against those cases.
- Lexical has fixed backward selection inversion for RTL and decorator-node exit direction in RTL.
- Lexical has direction override support for element nodes; block direction should remain explicit rather than inferred from physical key names.

References:

- ProseMirror changelog: https://prosemirror.net/docs/changelog/
- ProseMirror view `coordsAtPos` reference: https://github.com/ProseMirror/prosemirror-view/blob/master/src/index.ts
- Lexical changelog: https://github.com/facebook/lexical/blob/main/CHANGELOG.md
