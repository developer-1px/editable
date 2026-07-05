# Editor Decoration Boundary Composition Audit

## Issue #88 Zero-Width Widget Contract

The current editor should not expose a ProseMirror-style public decoration or widget registry yet. Zero-width widgets such as placeholders, comment anchors, and inline menu anchors are view chrome, not document content. The contract belongs behind an internal DOM adapter surface until at least one real producer proves the API shape.

## Surface Decision

- Public surface: no new public widget API for this issue.
- Internal surface: future widget support should live under `packages/editable/internal/dom` beside selection, visual layout, and DOM text mapping.
- Model surface: widgets must not be represented as rich inline atoms unless they are actual document content that should copy, paste, undo, redo, and serialize with the document.

## Widget Identity

A zero-width widget identity is the tuple:

- `role`: placeholder, comment-anchor, inline-menu-anchor, remote-caret, or another explicit chrome role.
- `anchor`: text path plus document offset.
- `side`: `before` or `after` at the anchor offset.
- `id`: stable producer-owned id that survives render passes.

`role + anchor + id` identifies the widget instance. `side` controls cursor affinity and may change without changing widget identity.

## Cursor Side Contract

- `before`: a collapsed caret at the anchor is visually before the widget.
- `after`: a collapsed caret at the anchor is visually after the widget.
- Character movement across the anchor must produce deterministic positions: text before -> `before` side -> `after` side -> text after.
- Shift-selection extends through widget sides without selecting widget chrome as document content.
- Selection serialization stores document text points only. Widget side is visual affinity metadata, not a separate canonical selection endpoint.

## Event Ownership

Widget chrome owns UI events only when the widget declares them:

- Pointer/click/menu events may use a `stopEvent`-equivalent handler when the widget action should not move editor selection.
- Text input, beforeinput, composition, paste, cut, copy, and history remain editor-owned unless the widget mounts a separate non-editor control outside the editable text surface.
- A widget with an input, textarea, or contenteditable child must be outside the editor text surface or mounted in an isolated popover. Its internal selection is not editor canonical selection.

## Selection Ownership

- Selection inside widget chrome is not read as outer canonical selection.
- If a widget action should restore editor selection, it must restore the anchor text point plus side explicitly.
- Browser selection that lands on widget DOM is mapped to the nearest anchor side only when the widget is declared editor-owned and selection-transparent.
- Opaque widgets must block editor selection reads while their own controls are active.

## Mutation Ownership

Document content mutation and widget chrome mutation are separate:

- Document mutations go through model commands, DOM-to-model text commits, paste/drop, or history.
- Widget chrome mutations are producer-owned and must not be interpreted as document text changes.
- A future implementation must mark widget DOM with an internal attribute and make DOM text extraction, selection mapping, and visual layout ignore widget chrome.
- Mutation observers, resize observers, timers, subscriptions, and portal roots created by a widget must be destroyed when the widget instance is removed or re-anchored.

## Text Surface Child List Policy

Putting widget DOM inside a `.text-block` or `[data-editable-text]` child list is forbidden today unless all of these are true:

- The widget has no user-visible `textContent` that DOM-to-model text extraction can read.
- The widget is not focusable and cannot host native text input or composition.
- The widget cannot become the browser selection anchor/focus except as a transparent zero-width boundary.
- The adapter has an explicit ignore/mapping rule for the widget attribute in DOM text, selection, clipboard, and visual layout code.

Until that ignore/mapping rule exists, placeholders and menu anchors should be rendered as overlay siblings or outside the editable text surface. Actual content-like chips should continue to use rich inline atoms.

## Minimal Fixture List

Future widget producer work should start with these fixtures:

- Collapsed ArrowLeft/ArrowRight movement across a `before` and `after` zero-width widget at the same offset.
- Shift+Arrow selection extension through both widget sides without copying widget chrome text.
- Click on widget chrome that stops editor selection movement, followed by a toolbar command that restores the anchor selection.
- Composition started next to a widget, then committed without inserting text into widget DOM.
- Paste/drop at a widget anchor with widget DOM ignored by DOM-to-model text extraction.
- Widget with internal button/input rendered outside the text surface, verifying outer canonical selection is not overwritten.
- Widget destroy cleanup for listeners, observers, timers, subscriptions, and portal roots after re-render and removal.

## Issue #87 Mark Boundary Composition Trace

The browser trace fixture is `tests/browser/fixtures/markBoundaryCompositionTrace.ts` and is exercised in Chromium, WebKit, and Firefox by `tests/browser/editable.spec.ts`.

Covered mark-boundary scenarios:

- Korean composition at bold start and end boundaries.
- Chinese composition at italic start boundary.
- Korean composition at code end boundary.
- Japanese composition at link start boundary.
- Korean composition inside an active bold range at a collapsed caret.
- Korean composition replacing a range selection that crosses a bold boundary.
- Korean composition whose committed text includes a trailing space.
- Korean composition at an italic end boundary followed by Enter.

Each trace compares event order, native DOM selection ownership, canonical selection, and final document text. The observed desktop browser set keeps the composition event order compatible with the current DOM-to-model flow: `compositionstart`, composing `input`, `compositionend`, and commit `input` are sufficient for one-patch flush at the active text leaf.

Current guard decision:

- Mark wrappers remain visual text-run wrappers, not cursor units.
- Composition at mark starts, ends, and active-mark collapsed carets should continue to resolve through the active text leaf.
- Range composition across a mark boundary should be committed as one text replacement, then range metadata is rebased by the existing text/range sync path.
- Space and Enter adjacent to composition do not require a separate mark-boundary guard in the traced desktop browsers.

No additional browser-specific mark boundary guard is required for the #87 desktop traces. Mobile IME boundary behavior remains covered by the separate mobile composition issues.
