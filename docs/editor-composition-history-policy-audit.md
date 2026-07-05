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

## Issue #84 Live Markdown Shortcut History Contract

Live markdown shortcuts are not part of the current editor product surface. The editor should not add a markdown transform registry until a producer needs it.

If live markdown shortcuts are added later, transform success must be exposed as an explicit history origin, for example `markdownShortcutTransform`, rather than being hidden inside the native text input commit.

History grouping policy:

1. The trigger text input is committed as the normal text input history unit.
2. A successful markdown transform is committed as a separate history unit with transform origin metadata.
3. Undo once reverts only the transform, restoring the literal trigger text and original block/mark structure.
4. Undo twice removes the trigger text input.
5. Redo first reapplies the trigger input, then reapplies the transform.

This keeps accidental markdown transforms recoverable with one undo while preserving the typed input as a separate user action. Failed transforms do not create a transform history unit.

Required fixtures when implemented:

- Typing `# ` at paragraph start transforms to heading; undo once restores literal `# ` in a paragraph; undo twice removes `# `.
- Typing `- ` at paragraph start transforms to a bullet/list item with the same two-step undo behavior.
- Typing a bold/italic inline shortcut transforms marks with delimiter restoration on first undo.
- Transform inside active composition is deferred until composition commit; no transform history unit is created during preedit.
- Pasting markdown-like text does not run live shortcut transforms unless the producer explicitly opts into paste transforms with a separate origin.
