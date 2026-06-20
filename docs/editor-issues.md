# Editor Issues

## Current Baseline

- Lexical/contenteditable donor removed.
- `json-document` remains canonical document state.
- Initial headless cursor model exists for text, inline mention atom, and figure block atom.

## Principles

- Headless owns document rules.
- View owns geometry only.
- Input adapter translates browser events into headless commands.
- Atom nodes are one cursor unit with `before` and `after` edges.
- All mutations commit patches with `selectionAfter`.

## ED-001 - Stabilize Document And Cursor Contracts

What to build:
Lock the document schema and cursor point contract for paragraph text, inline mention atoms, and figure block atoms.

Acceptance criteria:
- [x] Paragraph text has offset-based cursor points.
- [x] Inline mention has only `before` and `after` edge cursor points.
- [x] Figure block has only `before` and `after` edge cursor points.
- [x] Cursor points can be serialized into `json-document` selection state.
- [x] Tests cover offset clamping and atom edge normalization.

Blocked by:
None.

## ED-002 - Implement Horizontal Cursor Commands

What to build:
Add command-level `moveLeft`, `moveRight`, `moveStart`, and `moveEnd` over the headless cursor model.

Acceptance criteria:
- [x] Left/right moves through text by character offset.
- [x] Left/right treats mention as one cursor unit.
- [x] Left/right treats figure as one cursor unit.
- [x] Commands return unchanged selection at document boundaries.
- [x] Commands clear vertical movement context such as `preferredX`.

Blocked by:
ED-001.

## ED-003 - Implement Text Insertion

What to build:
Insert plain text at a collapsed cursor and replace selected text ranges using `json-document` patches.

Acceptance criteria:
- [x] Insert inside text updates only the affected text path.
- [x] Insert before/after an inline atom chooses the neighboring text run or creates one.
- [x] Insert before/after a figure creates or targets a paragraph.
- [x] `selectionAfter` lands after inserted text.
- [x] Undo/redo restores value and selection.

Blocked by:
ED-002.

## ED-004 - Implement Delete Commands

What to build:
Add `deleteBackward` and `deleteForward` for text, inline atoms, figure atoms, and selected ranges.

Acceptance criteria:
- [x] Backspace deletes one text character before the caret.
- [x] Delete deletes one text character after the caret.
- [x] Backspace at mention `after` deletes the whole mention.
- [x] Delete at mention `before` deletes the whole mention.
- [x] Figure delete removes the whole figure block.
- [x] Empty text runs are normalized.
- [x] `selectionAfter` is deterministic for every branch.

Blocked by:
ED-003.

## ED-005 - Implement Paragraph Split And Merge

What to build:
Handle Enter and boundary Backspace/Delete for paragraph split and merge.

Acceptance criteria:
- [x] Enter in text splits one paragraph into two.
- [x] Enter before/after mention keeps the mention on the expected side.
- [x] Enter before/after figure creates a paragraph before or after the figure.
- [x] Backspace at paragraph start merges with the previous paragraph when valid.
- [x] Delete at paragraph end merges with the next paragraph when valid.
- [x] Selection after split/merge is stored with the patch.

Blocked by:
ED-004.

## ED-006 - Implement Atom Insert Commands

What to build:
Add commands for inserting mention chips and figure blocks at the current selection.

Acceptance criteria:
- [x] `insertMention` inserts an inline atom inside a paragraph.
- [x] `insertFigure` inserts a block atom between blocks.
- [x] Inserting over a selected range replaces the selected content.
- [x] Cursor lands after the inserted atom.
- [x] Undo/redo restores the previous selection.

Blocked by:
ED-005.

## ED-007 - Build Minimal Renderer

What to build:
Render paragraphs, text runs, mention chips, and figures from the document model without giving the view mutation ownership.

Acceptance criteria:
- [x] Text renders as text spans with stable `data-path`.
- [x] Mention renders as `contenteditable=false` chip with stable `data-path`.
- [x] Figure renders as non-editable block atom with stable `data-path`.
- [x] View does not mutate document state directly.
- [x] Current headless selection can be reflected in the DOM for inspection.

Blocked by:
ED-006.

## ED-008 - Add Cursor Geometry Adapter

What to build:
Add a view adapter that maps cursor points to rects and screen coordinates back to cursor points.

Acceptance criteria:
- [x] `rectForPoint(point)` works for text offsets.
- [x] `rectForPoint(point)` works for mention before/after edges.
- [x] `rectForPoint(point)` works for figure before/after edges.
- [x] `pointFromCoordinates(x, y)` resolves to the nearest valid cursor point.
- [x] Adapter returns `null` instead of inventing invalid points.

Blocked by:
ED-007.

## ED-009 - Implement Vertical Cursor Movement

What to build:
Use the geometry adapter for ArrowUp and ArrowDown while keeping final selection normalization in headless code.

Acceptance criteria:
- [x] ArrowUp/Down preserves `preferredX` through `selection.context`.
- [x] Moving across wrapped text lines lands on the nearest valid offset.
- [x] Moving across mention chips treats them as one unit.
- [x] Moving across figures lands before or after the figure.
- [x] Moving beyond document bounds clamps to start or end.

Blocked by:
ED-008.

## ED-010 - Add Input Adapter

What to build:
Translate keyboard, beforeinput, composition, and paste events into headless commands.

Acceptance criteria:
- [x] ArrowLeft/Right call horizontal cursor commands.
- [x] Home/End call document boundary cursor commands.
- [x] Shift+Home/End and Shift+Cmd/Ctrl+Arrow keys extend range selection to document boundaries.
- [x] Ctrl/Cmd+A calls headless select-all.
- [x] ArrowUp/Down call vertical cursor commands.
- [x] Plain text input calls `insertText`.
- [x] Backspace/Delete call delete commands.
- [x] Enter calls split command.
- [x] Plain text paste inserts text through command layer.
- [x] Composition input does not corrupt selection.
- [x] Browser `beforeinput` variants for replacement text, paste, drop, line break, generic delete, and cut map to headless commands.

Blocked by:
ED-009.

## ED-011 - Draw Selection And Caret Overlay

What to build:
Draw caret, selected atom state, and range highlights from canonical selection.

Acceptance criteria:
- [x] Text caret follows `rectForPoint`.
- [x] Mention before/after caret is visible and stable.
- [x] Figure before/after caret is visible and stable.
- [x] Selected mention and selected figure have distinct selected state.
- [x] Overlay never becomes the source of document mutation.

Blocked by:
ED-010.

## ED-012 - Add Markdown Inline Minimum

What to build:
Introduce markdown inline handling without breaking source-offset cursor behavior.

Acceptance criteria:
- [x] Markdown source text remains the cursor offset source.
- [x] Basic marks can render from source without changing cursor coordinates.
- [x] Cursor movement through markdown syntax is deterministic.
- [x] Atom nodes inside marked text are still one cursor unit.
- [x] Tests cover editing around markdown delimiters.

Blocked by:
ED-011.

## ED-013 - Build Regression Scenarios

What to build:
Create focused regression scenarios for cursor and mutation behavior.

Acceptance criteria:
- [x] Scenario covers text around mention.
- [x] Scenario covers text around figure.
- [x] Scenario covers paragraph split/merge.
- [x] Scenario covers vertical movement across wrapped text and atoms.
- [x] Scenario covers undo/redo selection restore.

Blocked by:
ED-012.

## Rich Model Replan

ED-012 proved that markdown source text can be edited deterministically, but it should not be the canonical rich editor model. The next work replaces source-first markdown with structured rich JSON and treats Markdown as import/export.

Design reference:
`docs/rich-model-design.md`

## ED-014 - Extract Document Normalizer

What to build:
Move normal-form rules out of command internals into a shared `normalizeDocument` module.

Acceptance criteria:
- [x] Document always has at least one block.
- [x] Text blocks always have at least one inline child.
- [x] Adjacent text runs with identical formatting merge.
- [x] Empty text runs are removed except required placeholders.
- [x] Inline atoms do not need empty text sentinels before or after them.

Blocked by:
ED-013.

## ED-015 - Add Structured Marks

What to build:
Replace markdown delimiter rendering with structured text marks for bold, italic, inline code, and link.

Acceptance criteria:
- [x] Text nodes can carry canonical mark metadata.
- [x] Mark order is normalized.
- [x] Text insertion preserves active marks.
- [x] Adjacent text nodes merge only when marks match.
- [x] Cursor offsets are over visible text, not markdown delimiters.
- [x] Adjacent differently marked text runs share one collapsed cursor boundary.

Blocked by:
ED-014.

## ED-016 - Add Markdown Import/Export

What to build:
Move Markdown handling to adapter functions that convert between Markdown text and the rich JSON model.

Acceptance criteria:
- [x] Markdown import creates paragraph, heading, list item, code block, link, and basic mark nodes.
- [x] Markdown export round-trips supported model shapes.
- [x] Mention and figure have deterministic fallback Markdown syntax.
- [x] Editor commands do not depend on Markdown delimiter offsets.

Blocked by:
ED-015.

## ED-017 - Introduce Explicit Rich Selection

What to build:
Add internal `caret`, `range`, and `node` selection variants, then serialize them to `json-document` selection state.

Acceptance criteria:
- [x] Collapsed caret selection has no `selectedPointers`.
- [x] Node selection is the only path that fills `selectedPointers`.
- [x] Range selection can span text and atom edge points.
- [x] Undo/redo restores the internal selection shape.

Blocked by:
ED-014.

## ED-018 - Generalize Cursor Edge Semantics

What to build:
Rename and test edge cursor points as a generic block/inline edge concept rather than atom-only terminology.

Acceptance criteria:
- [x] Paragraph before/after edges remain valid cursor points.
- [x] Mention before/after edges remain one cursor unit.
- [x] Figure before/after edges remain one cursor unit.
- [x] Moving across an atom is still `before -> after`.
- [x] A caret at an atom edge never implies selected atom rendering.

Blocked by:
ED-017.

## ED-019 - Extend Rich Block Schema

What to build:
Add heading, quote, list item, and code block nodes without changing the cursor stream contract.

Acceptance criteria:
- [x] Heading and quote behave like text blocks with block before/after edges.
- [x] List item stores ordered/depth metadata and behaves like a text block.
- [x] Code block stores plain code text and has deterministic offsets.
- [x] Block atom figure still has only before/after edges.

Blocked by:
ED-018.

## ED-020 - Extract Native Text Buffer

What to build:
Move contenteditable native text buffering out of `BlockEditor` into an adapter module.

Acceptance criteria:
- [x] Native DOM input is allowed only inside the active text leaf.
- [x] IME and ordinary typing are flushed on composition end, blur, paste, toolbar command, undo/redo, or headless command.
- [x] No per-keystroke model sync happens during active native text editing.
- [x] DOM mutations outside the active text leaf are prevented or reconciled.

Blocked by:
ED-018.

## ED-021 - Normalize Browser Beforeinput Variants

What to build:
Map browser-specific `beforeinput` variants into the same headless command surface used by keyboard and paste events.

Acceptance criteria:
- [x] `insertReplacementText`, `insertFromPaste`, and `insertFromDrop` call the text insertion command when text data is available.
- [x] `insertLineBreak` uses the same split command as paragraph insertion until a separate soft-break model exists.
- [x] `deleteContent` and `deleteByCut` delete selected ranges without allowing DOM-owned mutation.
- [x] `historyUndo` and `historyRedo` are intercepted in `BlockEditor` and routed to `json-document` history.
- [x] Replacement text is allowed through the native text buffer only inside the active text leaf.

Blocked by:
ED-020.

## ED-022 - Add Keyboard Mark Commands

What to build:
Route basic formatting keyboard shortcuts through headless mark commands and render the resulting structured marks.

Acceptance criteria:
- [x] `Ctrl/Cmd+B` toggles the bold mark on selected inline text.
- [x] `Ctrl/Cmd+I` toggles the italic mark on selected inline text.
- [x] Collapsed mark toggles are stored in selection context as active marks.
- [x] Active-mark text insertion creates structured marked text instead of plain native DOM text.
- [x] `BlockEditor` maps formatting shortcuts through the input adapter and renders marked output.

Blocked by:
ED-020.

## ED-023 - Route Tab Through Headless Commands

What to build:
Prevent browser-owned Tab focus movement inside the editor and map list indentation through the command layer.

Acceptance criteria:
- [x] `Tab` indents selected list items by increasing `depth`.
- [x] `Shift+Tab` outdents selected list items without going below depth `0`.
- [x] Multi-block selections adjust every touched list item and preserve the selection.
- [x] `Tab` outside lists is handled by the adapter instead of mutating DOM selection.
- [x] The rendered list item reflects the canonical `depth` after the keyboard command.

Blocked by:
ED-019.

## ED-024 - Route Page Navigation Through Headless Selection

What to build:
Map `PageUp` and `PageDown` through the same view-geometry to headless-selection pipeline as vertical arrows.

Acceptance criteria:
- [x] `PageUp` and `PageDown` use geometry-provided page step values.
- [x] `Shift+PageUp` and `Shift+PageDown` extend range selection.
- [x] Page navigation preserves `preferredX` in selection context.
- [x] Page navigation falls back to document boundaries when geometry is unavailable.
- [x] The demo renders the resulting canonical selection instead of letting the browser mutate selection.

Blocked by:
ED-009.

## ED-025 - Route Word Navigation Through Headless Selection

What to build:
Map `Alt/Option+ArrowLeft` and `Alt/Option+ArrowRight` through headless word boundary movement.

Acceptance criteria:
- [x] `Alt/Option+ArrowLeft` moves to the previous word or atom boundary.
- [x] `Alt/Option+ArrowRight` moves to the next word or atom boundary.
- [x] `Shift+Alt/Option+ArrowLeft` and `Shift+Alt/Option+ArrowRight` extend range selection.
- [x] Mention and figure atoms behave as one word-sized cursor unit.
- [x] The demo renders the resulting canonical selection instead of letting the browser mutate selection.

Blocked by:
ED-018.

## ED-026 - Route Word Deletion Through Headless Commands

What to build:
Map word-sized deletion keys and browser word-delete beforeinput variants through headless commands.

Acceptance criteria:
- [x] `Alt/Option+Backspace` deletes the previous word or atom unit.
- [x] `Alt/Option+Delete` deletes the next word or atom unit.
- [x] `beforeinput deleteWordBackward` and `deleteWordForward` use the same command path.
- [x] Mention and figure atoms delete as one unit.
- [x] Modifier deletion does not fall through to native contenteditable mutation while a text leaf is active.

Blocked by:
ED-025.

## ED-027 - Route Block Boundary Navigation Through Headless Selection

What to build:
Map `Alt/Option+ArrowUp` and `Alt/Option+ArrowDown` to deterministic block boundary movement without view geometry.

Acceptance criteria:
- [x] `Alt/Option+ArrowUp` moves to the current block `before` edge.
- [x] `Alt/Option+ArrowDown` moves to the current block `after` edge.
- [x] Repeating the command from an existing boundary advances to the adjacent block boundary in the same direction.
- [x] `Shift+Alt/Option+ArrowUp` and `Shift+Alt/Option+ArrowDown` extend range selection.
- [x] Figure block atoms render as selected when a block-boundary range fully covers them.

Blocked by:
ED-018.

## ED-028 - Route Link And Inline Code Shortcuts Through Headless Marks

What to build:
Map the remaining mark shortcuts through canonical rich mark commands.

Acceptance criteria:
- [x] `Cmd/Ctrl+E` toggles the inline code mark on selected inline text.
- [x] Collapsed `Cmd/Ctrl+E` stores `code` in selection context active marks.
- [x] `Cmd/Ctrl+K` toggles a link mark on selected inline text.
- [x] Link toggle uses `selection.context.pendingLinkHref` when present and `https://example.com` as the no-prompt demo fallback.
- [x] Collapsed `Cmd/Ctrl+K` stores an active link mark for the next text insertion.
- [x] The demo renders the resulting canonical `code` and `link` marks.

Blocked by:
ED-022.

## ED-029 - Lock Non-Mutating Keyboard Policy

What to build:
Make the remaining explicit non-mutating keys deterministic at the input boundary.

Acceptance criteria:
- [x] `Escape` is editor-owned and clears transient selection context without document mutation.
- [x] `F1`-`F12` pass through to browser/system handling.
- [x] Unsupported `Cmd/Ctrl` shortcuts pass through without document or selection mutation.
- [x] The demo keeps canonical render selection stable for pass-through keys.

Blocked by:
ED-010.
