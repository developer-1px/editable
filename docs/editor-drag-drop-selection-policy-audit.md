# Editor Drag/Drop Selection Policy Audit

## Issue #9 Trace Summary

The browser fixture is `tests/browser/fixtures/dragDropFixture.ts` and is
exercised in Chromium, WebKit, and Firefox by `tests/browser/editable.spec.ts`.

The fixture records:

- Text range drag source.
- Inline atom-like mention drag source.
- Block atom-like figure drag source.
- Block-boundary drop point.
- `DataTransfer` MIME types.
- Browser caret mapping at the drop point.
- Multi-range DOM selection behavior.
- Whether synthetic drag/drop mutates fixture DOM before a model command.

The fixture intentionally uses a small isolated DOM surface instead of the app
renderer. Current editor nodes are not public draggable model nodes yet, so this
trace defines the browser contract that a future drag/drop command layer must
satisfy.

## Browser Findings

| Browser family | Finding | Policy consequence |
| --- | --- | --- |
| Chromium | Synthetic text, atom, figure, and boundary drag/drop events bubble with `DataTransfer` payloads. Multi-range selection collapses to the first range. Drop point maps back to the text node through `caretPositionFromPoint`. | The editor can use event order as trace evidence, but still must convert drop to a model command instead of trusting DOM mutation. |
| WebKit | Matches Chromium for the fixture: full synthetic event order, first-range-only selection, and drop point mapping through `caretPositionFromPoint`. | Treat WebKit like Chromium for this minimal desktop trace, while keeping future native pointer traces before enabling product drag image behavior. |
| Firefox | Preserves two DOM ranges when two ranges are added to `Selection`. Synthetic drag event order is more restrictive in this fixture, but `dragover` and drop point mapping remain observable. | Never assume a single DOM range during drag selection. Normalize to the editor's primary model range before command execution. |

Drag image pixels are not inspectable through the DOM API in this headless
fixture. `DataTransfer.setDragImage` is callable, but visual drag image parity
needs a future pointer-driven screenshot trace before product UI depends on it.

## Failure Mode Matrix

| Source | Drop target | Failure mode | Required guard |
| --- | --- | --- | --- |
| Text range | Same block text | Browser may move DOM text before the model sees the drop. | Prevent or ignore native mutation, then apply one model move/copy command from source range to resolved drop point. |
| Text range | Different block boundary | Dragstart selection can become stale by dragover/drop. | Resolve the final drop point from geometry at `drop`, not from dragstart selection. |
| Text range | Outside editor | Clipboard `text/plain` may exist without internal rich fragment. | Export plain text and internal fragment separately; external drop is copy-only unless the editor owns the source. |
| Inline atom | Text position | Atom DOM can be removed or duplicated by native movement. | Treat atom move as a model fragment move. DOM atom identity is evidence only, not the mutation source. |
| Inline atom | Atom edge | Native selection may land before/after atom inconsistently. | Normalize to explicit atom edge affinity before applying the command. |
| Figure/block atom | Text position | Block atom can become a partial DOM selection or lose node identity. | Require explicit node selection or internal block fragment data. |
| Figure/block atom | Block boundary | Drop point may be between visual blocks, not inside text. | Resolve to before/after block edge in the model cursor stream. |
| External HTML/file | Any editor point | Browser payload can contain unsafe HTML, files, or app-specific MIME. | Sanitize HTML, validate files, and keep unsupported MIME as plain fallback only. |
| Firefox multi-range selection | Any target | `Selection.rangeCount` can be greater than one. | Pick a primary model range explicitly; do not iterate DOM ranges as independent editor selections. |

## Selection And Drop Point Policy

The source selection and the drop location are separate facts:

- `dragstart` captures the candidate source range or selected atom/node.
- `dragover` and `drop` capture the current target point.
- The final command resolves the drop point from event coordinates and editor
  geometry at `drop`.
- If source selection and target point conflict, the drop point wins for
  insertion location and the source range remains only the moved/copied slice.
- DOM selection after `dragstart` is not trusted as canonical editor selection.

For Firefox multi-range DOM selections, the editor must choose a primary model
range before drag execution. Current policy is to use the active editor
selection range and ignore additional DOM ranges unless a future multi-cursor
feature explicitly owns them.

## DataTransfer Policy

The editor should write and read drag payloads in priority order:

1. Internal rich block fragment for editor-owned text, atom, and block moves.
2. Internal rich text fragment for inline-only drops.
3. Safe `text/html` for external interoperability.
4. `text/plain` fallback.
5. Files and URIs only through explicit import handlers.

`effectAllowed` and `dropEffect` are hints, not authority. Whether a drag is a
move or copy is decided by:

- whether the source is editor-owned,
- whether the platform modifier requests copy,
- whether the target accepts the fragment,
- and whether the command can preserve normal form.

## History Policy

In-editor drag/drop must commit as one undoable model command:

```txt
capture source -> resolve drop point -> validate fragment -> apply move/copy -> set selectionAfter
```

Rules:

- Do not store separate native delete and native insert history entries.
- For move, remove the source and insert at the normalized target in one patch
  plan.
- For copy, insert at the normalized target without deleting the source.
- If the source and target are equivalent, return no-op.
- If the source is dropped inside itself, normalize to no-op or to the nearest
  legal edge before command execution.
- Selection after a successful drop is the inserted fragment range or selected
  moved atom/node, not the browser's post-drop DOM selection.

## Trace Scenarios

| id | Scenario | Expected evidence |
| --- | --- | --- |
| DD-01 | Drag text range inside the same block. | `text/plain` and `text/html` payloads exist; DOM text is unchanged until a model command. |
| DD-02 | Drop text range at another block boundary. | Drop point resolves from caret geometry, not stale source selection. |
| DD-03 | Drag inline mention atom into text. | Internal atom MIME exists; atom move is represented as a model fragment. |
| DD-04 | Drag figure/block atom to block boundary. | Internal block MIME exists; target resolves to a block edge. |
| DD-05 | Firefox selection contains two ranges before drag. | Trace records `rangeCount >= 2`; editor policy still chooses one primary model range. |
| DD-06 | Chromium/WebKit selection is asked to hold two ranges. | Trace records only the first range; command layer must not depend on browser multi-range support. |
| DD-07 | Drag image customization is requested. | `setDragImage` is callable, but visual parity remains a future screenshot trace requirement. |
| DD-08 | Unsafe external HTML/file drop. | Sanitizer/importer owns acceptance; unsupported data falls back to plain text or no-op. |

## Decision

Do not let native drag/drop mutate canonical editor state directly. Drag/drop is
a command boundary: browser events provide source evidence, `DataTransfer`
payloads, modifier hints, and final coordinates; the model command owns the
move/copy patch, normalization, undo history, and selection after the drop.
