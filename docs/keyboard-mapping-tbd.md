# Keyboard Mapping TBD

Rule:
Every editor-owned key maps browser input to a headless command first, then render reads canonical selection/document state.

## Text Input

- TBD-KEY-001 [done] Printable character on collapsed native text leaf -> native text buffer, flush to `insertText` on release.
- TBD-KEY-002 [done] Printable character over open selection -> `insertText`.
- TBD-KEY-003 [done] Paste / `Cmd+V` / `Ctrl+V` -> paste event or `beforeinput insertFromPaste` -> `insertText`.
- TBD-KEY-004 [done] Drop text -> `beforeinput insertFromDrop` -> `insertText`.
- TBD-KEY-005 [done] Replacement text -> `beforeinput insertReplacementText` -> `insertText`.
- TBD-KEY-006 [done] IME composition -> no headless mutation while composing, flush on composition end.

## Character Navigation

- TBD-KEY-010 [done] `ArrowLeft` -> move one cursor unit backward.
- TBD-KEY-011 [done] `Shift+ArrowLeft` -> extend one cursor unit backward.
- TBD-KEY-012 [done] `ArrowRight` -> move one cursor unit forward.
- TBD-KEY-013 [done] `Shift+ArrowRight` -> extend one cursor unit forward.
- TBD-KEY-014 [done] `Alt/Option+ArrowLeft` -> move one word/atom unit backward.
- TBD-KEY-015 [done] `Shift+Alt/Option+ArrowLeft` -> extend one word/atom unit backward.
- TBD-KEY-016 [done] `Alt/Option+ArrowRight` -> move one word/atom unit forward.
- TBD-KEY-017 [done] `Shift+Alt/Option+ArrowRight` -> extend one word/atom unit forward.

## Vertical And Page Navigation

- TBD-KEY-020 [done] `ArrowUp` -> geometry vertical move.
- TBD-KEY-021 [done] `Shift+ArrowUp` -> geometry vertical extend.
- TBD-KEY-022 [done] `ArrowDown` -> geometry vertical move.
- TBD-KEY-023 [done] `Shift+ArrowDown` -> geometry vertical extend.
- TBD-KEY-024 [done] `PageUp` -> geometry page move, boundary fallback.
- TBD-KEY-025 [done] `Shift+PageUp` -> geometry page extend, boundary fallback.
- TBD-KEY-026 [done] `PageDown` -> geometry page move, boundary fallback.
- TBD-KEY-027 [done] `Shift+PageDown` -> geometry page extend, boundary fallback.
- TBD-KEY-028 [done] `Alt/Option+ArrowUp` -> move to current block `before`; from an existing `before` edge, move to previous block `before`.
- TBD-KEY-029 [done] `Shift+Alt/Option+ArrowUp` -> extend to current/previous block `before`.
- TBD-KEY-030 [done] `Alt/Option+ArrowDown` -> move to current block `after`; from an existing `after` edge, move to next block `after`.
- TBD-KEY-031 [done] `Shift+Alt/Option+ArrowDown` -> extend to current/next block `after`.

## Document Boundary Navigation

- TBD-KEY-040 [done] `Home` -> document start.
- TBD-KEY-041 [done] `Shift+Home` -> extend to document start.
- TBD-KEY-042 [done] `End` -> document end.
- TBD-KEY-043 [done] `Shift+End` -> extend to document end.
- TBD-KEY-044 [done] `Cmd/Ctrl+ArrowLeft` -> current visual line start.
- TBD-KEY-045 [done] `Shift+Cmd/Ctrl+ArrowLeft` -> extend to current visual line start.
- TBD-KEY-046 [done] `Cmd/Ctrl+ArrowRight` -> current visual line end.
- TBD-KEY-047 [done] `Shift+Cmd/Ctrl+ArrowRight` -> extend to current visual line end.
- TBD-KEY-048 [done] `Cmd/Ctrl+ArrowUp` -> document start.
- TBD-KEY-049 [done] `Shift+Cmd/Ctrl+ArrowUp` -> extend to document start.
- TBD-KEY-050 [done] `Cmd/Ctrl+ArrowDown` -> document end.
- TBD-KEY-051 [done] `Shift+Cmd/Ctrl+ArrowDown` -> extend to document end.

## Selection

- TBD-KEY-060 [done] `Cmd/Ctrl+A` -> select all.
- TBD-KEY-061 [done] Range selection renders selected atom pointers from canonical range.
- TBD-KEY-062 [done] Collapsed caret renders no selected atom pointers.

## Deletion

- TBD-KEY-070 [done] `Backspace` -> delete backward.
- TBD-KEY-071 [done] `Delete` -> delete forward.
- TBD-KEY-072 [done] `beforeinput deleteContentBackward` -> delete backward.
- TBD-KEY-073 [done] `beforeinput deleteContentForward` -> delete forward.
- TBD-KEY-074 [done] `beforeinput deleteContent` -> delete selected range.
- TBD-KEY-075 [done] `beforeinput deleteByCut` -> delete selected range.
- TBD-KEY-076 [done] `Alt/Option+Backspace` -> delete word/atom unit backward.
- TBD-KEY-077 [done] `Alt/Option+Delete` -> delete word/atom unit forward.
- TBD-KEY-078 [done] `beforeinput deleteWordBackward` -> delete word/atom unit backward.
- TBD-KEY-079 [done] `beforeinput deleteWordForward` -> delete word/atom unit forward.

## Block Editing

- TBD-KEY-080 [done] `Enter` -> split paragraph/block text.
- TBD-KEY-081 [done] `beforeinput insertParagraph` -> split paragraph/block text.
- TBD-KEY-082 [done] `beforeinput insertLineBreak` -> split paragraph until soft break model exists.
- TBD-KEY-083 [done] `Tab` in list selection -> indent selected list items.
- TBD-KEY-084 [done] `Shift+Tab` in list selection -> outdent selected list items.
- TBD-KEY-085 [done] `Tab` outside list selection -> insert tab text through headless command.

## Marks

- TBD-KEY-090 [done] `Cmd/Ctrl+B` -> toggle bold.
- TBD-KEY-091 [done] `Cmd/Ctrl+I` -> toggle italic.
- TBD-KEY-092 [done] `Cmd/Ctrl+K` -> toggle link mark through headless command; use `selection.context.pendingLinkHref` or `https://example.com` fallback.
- TBD-KEY-093 [done] `Cmd/Ctrl+E` -> toggle inline code mark through headless command.

## History

- TBD-KEY-100 [done] `Cmd/Ctrl+Z` -> undo.
- TBD-KEY-101 [done] `Shift+Cmd/Ctrl+Z` -> redo.
- TBD-KEY-102 [done] `Cmd/Ctrl+Y` -> redo.
- TBD-KEY-103 [done] `beforeinput historyUndo` -> undo.
- TBD-KEY-104 [done] `beforeinput historyRedo` -> redo.

## Clipboard

- TBD-KEY-110 [done] Copy uses native clipboard selection; no document mutation.
- TBD-KEY-111 [done] Cut mutation is handled by `beforeinput deleteByCut`.
- TBD-KEY-112 [done] Paste mutation is handled by paste / `beforeinput insertFromPaste`.

## Explicitly Non-Mutating Keys

- TBD-KEY-120 [done] `Escape` -> clear transient selection context without document mutation.
- TBD-KEY-121 [done] `F1`-`F12` -> pass through to browser/system policy.
- TBD-KEY-122 [done] unsupported `Cmd/Ctrl` shortcuts -> pass through without document or selection mutation.
