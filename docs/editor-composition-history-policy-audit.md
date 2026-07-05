# Editor Composition History Policy Audit

## Issue #86 Toolbar Command During Active Composition

The browser fixture is in `tests/browser/editable.spec.ts`:

`contenteditable demo flushes active IME preedit before a toolbar command as separate history units`

The fixture starts Korean composition with live preedit DOM text, clicks the `Heading 1` toolbar command while composition is active, then sends the final composition events that a browser may still deliver after focus/tooling interaction.

## Policy

Active preedit text is committed, not discarded, before a toolbar command runs.

The preedit flush and toolbar command stay as separate history units:

1. First undo reverts the toolbar command while preserving committed preedit text.
2. Second undo reverts the preedit text.
3. First redo restores the preedit text.
4. Second redo restores the toolbar command.

This matches the user-visible sequence: text was produced by IME composition, then a toolbar command was applied to the editor state.

## Selection Result

Chromium preserves the committed preedit caret after the final composition input. WebKit and Firefox expose a native final composition selection at the end of the text leaf after the toolbar render. The canonical history behavior still restores the caret to the committed preedit boundary on undo/redo.

The current duplicate final composition input guard is sufficient: the late final `insertFromComposition` does not duplicate preedit text after the toolbar flush has already committed it.
