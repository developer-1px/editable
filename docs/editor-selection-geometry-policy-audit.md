# Editor Selection Geometry Policy Audit

## Issue #4 Scope

This audit consolidates the browser/API evidence collected by the existing
fixtures:

- `tests/browser/fixtures/crossRootFixture.ts`
- `tests/browser/fixtures/bidiRtlFixture.ts`
- `tests/browser/fixtures/focusSelectionTrace.ts`
- `tests/browser/fixtures/dragDropFixture.ts`
- `tests/browser/fixtures/strayBreakFixture.ts`

The goal is to define which browser selection and geometry APIs are trusted for
which editor jobs. It does not expose a public `coordsAtPos`/`posAtCoords`
adapter yet.

## Browser And API Matrix

| Surface | Chromium | WebKit | Firefox | Policy |
| --- | --- | --- | --- | --- |
| Selection read in main document | Supported by current fixtures. | Supported by current fixtures. | Supported by current fixtures. | Read only from the editor root owner document/window. |
| Selection write in main document | Supported for text paths and atom edges. | Supported for text paths and atom edges. | Supported for text paths and atom edges. | Write after render only when canonical selection changed. |
| Same-origin iframe root | Selection, clipboard, paste/drop, composition, and geometry pass. | Same fixture passes. | Not part of #90 minimum trace. | Supported when mounted against the iframe document root. |
| Shadow root | Chromium exposes native shadow selection to the adapter. | WebKit focus/geometry are visible, but native shadow selection remains a fixture gap. | Not part of #90 minimum trace. | Supported only where root selection is exposed; otherwise keep as known gap. |
| Portal document via iframe | Parent selection stays separate; owner document clipboard source passes. | Same fixture passes. | Not part of #90 minimum trace. | Clipboard/selection source must come from portal owner document. |
| Click/drop point mapping | `caretPositionFromPoint` resolves traced drop point. | `caretPositionFromPoint` resolves traced drop point. | `caretPositionFromPoint` resolves traced drop point. | Use as trace evidence, then normalize through model cursor stream. |
| Rect mapping | DOMRect visual layout and BiDi caret traces exist. | DOMRect visual layout and BiDi caret traces exist. | DOMRect visual layout and BiDi caret traces exist. | Internal best-effort geometry only; no public exact coordinate guarantee. |
| Empty line geometry | Visual layout tests model empty lines after `\n`. | Same browser suite passes. | Same browser suite passes. | Empty lines are model text `\n`, not raw `<br>` geometry. |
| BiDi/RTL movement | Logical model movement and native visual movement are separated. | Same. | Same. | Model commands use logical `forward/backward`; native left/right remains view sync only. |
| Multi-range selection | Collapses to first range in drag fixture. | Collapses to first range in drag fixture. | Preserves multiple DOM ranges in drag fixture. | Editor chooses one primary model range; do not mirror DOM multi-range as canonical selection. |

## Model-First Versus View-Geometry Split

Model-first operations:

- Logical character movement: `forward` and `backward`.
- Selection serialization and restore by document path/offset.
- Atom edge movement and deletion.
- Block boundary movement.
- Enter, Backspace, Delete, paste, drop, undo, redo.
- BiDi logical movement.
- Empty-line existence.

View-geometry queries:

- Vertical movement needs measured visual lines.
- Click-to-cursor and drop-to-cursor need browser point mapping plus model
  normalization.
- Overlay drawing needs DOMRect snapshots for text lines, atom edges, and
  selection handles.
- BiDi/RTL visual left/right inspection may use native selection as a trace, but
  not as model command vocabulary.

## Required Trace Scenarios

| id | Scenario | Existing evidence | Required policy |
| --- | --- | --- | --- |
| SG-01 | Atom boundary click. | Atom selection/copy/cut tests plus BiDi atom-edge geometry trace. | Click maps to before/after atom edge; selected atom is explicit node selection, not collapsed caret. |
| SG-02 | Empty paragraph/empty line click. | Visual layout tests for blank lines and stray break fixture. | Click resolves to model `\n` line offset; placeholder `<br>` is ignored. |
| SG-03 | Vertical movement across blocks. | Visual layout and arrow up/down browser tests. | Query measured visual lines, then normalize result through model cursor frame. |
| SG-04 | Line wrap movement. | Command-arrow measured line-boundary tests and BiDi geometry trace. | Use visual layout snapshot; block stale layout commands until fresh geometry exists. |
| SG-05 | Shadow root selection. | Cross-root shadow fixture. | Use root/shadow selection when exposed; keep WebKit native shadow selection gap explicit. |
| SG-06 | Iframe/portal selection source. | Cross-root iframe/portal fixtures. | Never fall back to parent document selection while child root owns focus. |
| SG-07 | Drop point mapping. | Drag/drop fixture. | Drop coordinates select insertion target; dragstart selection is only source slice evidence. |
| SG-08 | BiDi visual movement. | BiDi/RTL fixture. | Keep native visual left/right as view sync; model commands stay logical. |

## APIs And Fallbacks To Avoid Before Verification

Avoid:

- Using `document.getSelection()` when the editor root belongs to another
  document, shadow root, iframe, or portal.
- Treating `Selection.getRangeAt(0)` as the whole selection in Firefox
  multi-range situations.
- Using DOM `left`/`right` terminology for logical model movement.
- Treating `Range.getClientRects()` as an exact public coordinate contract for
  BiDi, atom, empty-line, or shadow-root positions.
- Reading raw placeholder `<br>` geometry as document text or line existence.
- Trusting browser DOM selection inside `contenteditable=false`, widget chrome,
  nested editor islands, or iframes as outer canonical selection.
- Using parent-window `Element`, `HTMLElement`, or `Text` constructors for
  cross-root DOM checks.
- Updating selection on every render with `removeAllRanges()`/`addRange()`.

Allowed after normalization:

- `root.getSelection()` or owner-document selection for selection reads.
- `Selection.setBaseAndExtent`/Range restore for known text paths and atom edges.
- `document.caretPositionFromPoint`/legacy fallback for click/drop point tracing.
- `Range.getClientRects()` and measured visual layout for internal vertical
  movement and overlays.

## Decision

Selection identity is model-owned. Browser selection and geometry APIs are
adapters that provide root-local DOM evidence. Every browser-derived point must
be normalized through the model cursor stream before it can become canonical
selection or an edit command target.
