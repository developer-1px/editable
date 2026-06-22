# Editor Required Feature List

Purpose:
This is the wiki checklist for editor behavior that users expect to work by default. It is a product/QA checklist, not an implementation-status document.

Core rule:
Every editor-owned input must translate into canonical document and selection state first. The DOM may provide native text buffering and geometry, but it must not become the source of document truth.

## 증거 강도

| 항목 | 강도 | 이유 |
| --- | --- | --- |
| product/QA checklist role | 확정 | Purpose가 명시하듯 이 문서는 사용자가 기본으로 기대하는 editor behavior checklist다. 구현 상태 문서가 아니다. |
| checklist scope inventory | 확정 현재 상태 | 현재 checklist는 Selection State부터 Platform And Browser Policy까지 15개 섹션이다. `docs/editor-feature-coverage-audit.md`도 같은 15개 섹션을 coverage map으로 대조한다. |
| canonical-state rule | 확정 제품 원칙 | 모든 editor-owned input이 먼저 canonical document/selection state로 들어가야 한다는 기대를 고정한다. 실제 구현 증거는 model/view/react tests와 topic audit에서 확인해야 한다. |
| implementation-complete interpretation | 제거 확정 | 이 문서의 bullet을 체크리스트처럼 읽어 전체 완료로 선언하면 browser/OS/assistive-tech matrix, link UX, rich clipboard graph restore, history grouping 같은 미정 범위를 지운다. 완료/부분확정/미정 분류는 feature coverage audit이 맡는다. |
| executable coverage | 이 파일만으로는 미정 | 이 파일은 test names, ED acceptance, browser smoke 결과를 직접 담지 않는다. 실행 증거는 `docs/editor-issues.md`, `docs/editor-feature-coverage-audit.md`, topic audits, Vitest/verify output을 같이 봐야 한다. |
| future product options | 미정 | `insertLineBreak`, Tab outside list, accessibility announcement, browser-specific behavior처럼 checklist가 열어 둔 옵션은 현재 product/API/QA 결정으로 남을 수 있다. |

## 1. Selection State

- The editor supports collapsed caret selection, range selection, and explicit node selection.
- Selection state is serializable and restorable through document history.
- A collapsed caret never implies selected-node rendering.
- Range selection may span text, inline atoms, block boundaries, and block atoms.
- Node selection is the only state that fills selected node pointers.
- Selection direction is preserved when extending ranges.
- Selection normalization clamps invalid points instead of creating invalid cursors.
- `Cmd/Ctrl+A` selects the whole editable document.
- `Escape` clears transient selection context without mutating document content.
- Focus loss preserves canonical selection unless the editor explicitly clears it.

## 2. Text Input And Replacement

- Printable text at a collapsed caret inserts at the caret.
- Printable text over a non-collapsed selection deletes the selected content and inserts the typed text.
- Printable text over an explicit node selection replaces the selected node with text at a deterministic insertion point.
- `beforeinput insertText` maps to the same insert command as keyboard text input.
- `beforeinput insertReplacementText` replaces the target selection through the command layer.
- Native text buffering is allowed only inside the active text leaf.
- Text input outside the active text leaf is prevented or reconciled into canonical state.
- Inserted text preserves active marks from the selection context.
- Input after an inline atom creates or targets the nearest valid text run.
- Input before or after a block atom creates or targets a valid text block.

## 3. IME And Composition

- Composition text does not commit partial model mutations before composition end.
- Composition keeps one active text target until the session ends or is cancelled.
- `compositionend` flushes the committed text into canonical state.
- Enter during composition confirms composition when the browser uses it for confirmation.
- Navigation, paste, blur, undo, redo, or toolbar commands flush or cancel composition safely before running their own command.
- Selection changes during composition do not corrupt the canonical document.

## 4. Clipboard And Transfer

- `Cmd/Ctrl+C` copies the current selection without mutating document content.
- Copying a collapsed selection is a no-op for document state.
- Copying a range serializes visible text and supported rich structure.
- Copying selected atoms includes deterministic plain-text and structured clipboard data.
- `Cmd/Ctrl+X` copies the selection and deletes it through the command layer.
- `beforeinput deleteByCut` maps to selection deletion.
- `Cmd/Ctrl+V` and paste events insert clipboard text or supported rich content through the command layer.
- `beforeinput insertFromPaste` maps to the same paste command path.
- Drop text and `beforeinput insertFromDrop` insert through the command layer.
- Unsupported clipboard formats fall back to plain text without corrupting selection.

## 5. Horizontal Keyboard Navigation

- `ArrowLeft` moves one cursor unit backward.
- `ArrowRight` moves one cursor unit forward.
- `Shift+ArrowLeft` extends selection one cursor unit backward.
- `Shift+ArrowRight` extends selection one cursor unit forward.
- Inline atoms behave as one cursor unit: `before -> after`.
- Block atoms behave as one cursor unit: `before -> after`.
- Movement at document boundaries is stable and does not wrap unexpectedly.
- Horizontal movement clears vertical `preferredX` context.

## 6. Word Keyboard Navigation

- `Alt/Option+ArrowLeft` moves to the previous word or atom boundary.
- `Alt/Option+ArrowRight` moves to the next word or atom boundary.
- `Shift+Alt/Option+ArrowLeft` extends selection to the previous word or atom boundary.
- `Shift+Alt/Option+ArrowRight` extends selection to the next word or atom boundary.
- Word movement treats inline atoms and block atoms as single units.
- Word movement is deterministic across whitespace, punctuation, marks, and block edges.

## 7. Vertical And Page Keyboard Navigation

- `ArrowUp` moves to the nearest valid cursor point on the visual line above.
- `ArrowDown` moves to the nearest valid cursor point on the visual line below.
- `Shift+ArrowUp` extends selection to the visual line above.
- `Shift+ArrowDown` extends selection to the visual line below.
- Vertical movement preserves `preferredX` while continuing vertical navigation.
- Vertical movement clamps to document start or end when no line exists above or below.
- `PageUp` moves by a page-sized geometry step with boundary fallback.
- `PageDown` moves by a page-sized geometry step with boundary fallback.
- `Shift+PageUp` and `Shift+PageDown` extend selection by page-sized steps.
- Page navigation preserves `preferredX` like vertical arrows.

## 8. Line, Block, And Document Boundary Navigation

- `Home` moves to document start.
- `End` moves to document end.
- `Shift+Home` and `Shift+End` extend selection to document start or end.
- `Cmd/Ctrl+ArrowLeft` moves to the current visual line start.
- `Cmd/Ctrl+ArrowRight` moves to the current visual line end.
- `Shift+Cmd/Ctrl+ArrowLeft` extends to the current visual line start.
- `Shift+Cmd/Ctrl+ArrowRight` extends to the current visual line end.
- `Cmd/Ctrl+ArrowUp` moves to document start.
- `Cmd/Ctrl+ArrowDown` moves to document end.
- `Shift+Cmd/Ctrl+ArrowUp` extends to document start.
- `Shift+Cmd/Ctrl+ArrowDown` extends to document end.
- `Alt/Option+ArrowUp` moves to the current or previous block boundary.
- `Alt/Option+ArrowDown` moves to the current or next block boundary.
- `Shift+Alt/Option+ArrowUp` and `Shift+Alt/Option+ArrowDown` extend block-boundary selection.

## 9. Deletion

- `Backspace` deletes one cursor unit backward when selection is collapsed.
- `Delete` deletes one cursor unit forward when selection is collapsed.
- `Backspace` or `Delete` over a non-collapsed selection deletes the selected content.
- `Backspace` or `Delete` over an explicit node selection deletes the selected node.
- `beforeinput deleteContentBackward` maps to backward deletion.
- `beforeinput deleteContentForward` maps to forward deletion.
- `beforeinput deleteContent` maps to selected-content deletion.
- `Alt/Option+Backspace` deletes the previous word or atom unit.
- `Alt/Option+Delete` deletes the next word or atom unit.
- `beforeinput deleteWordBackward` and `beforeinput deleteWordForward` map to word deletion.
- Deleting around inline atoms and block atoms removes the atom as one unit.
- Deleting at paragraph boundaries merges blocks only when the model allows it.
- Deletion always returns deterministic `selectionAfter`.

## 10. Block Editing

- `Enter` splits the current text block at the caret.
- `beforeinput insertParagraph` maps to the same split command.
- `beforeinput insertLineBreak` uses the configured soft-break or block-split policy.
- Enter over a non-collapsed selection deletes the selection before splitting or inserting the configured block.
- Enter before or after atoms creates a valid neighboring block or cursor position.
- `Tab` in a list selection indents selected list items.
- `Shift+Tab` in a list selection outdents selected list items.
- `Tab` outside lists follows the configured editor policy: insert tab text, move focus, or reject.
- Multi-block list indentation preserves selection.

## 11. Marks And Rich Text

- `Cmd/Ctrl+B` toggles bold on the current selection or active mark context.
- `Cmd/Ctrl+I` toggles italic on the current selection or active mark context.
- `Cmd/Ctrl+E` toggles inline code on the current selection or active mark context.
- `Cmd/Ctrl+K` toggles or sets link marks through the command layer.
- Mark commands over a range affect exactly the selected inline text.
- Mark commands at a collapsed caret update active marks for future text input.
- Adjacent text runs merge only when marks match canonically.
- Marks do not change visible-text cursor offsets.

## 12. History

- `Cmd/Ctrl+Z` undoes the previous document mutation and restores selection.
- `Shift+Cmd/Ctrl+Z` redoes the next document mutation and restores selection.
- `Cmd/Ctrl+Y` redoes on platforms that use it.
- `beforeinput historyUndo` and `beforeinput historyRedo` route through editor history.
- Typing history is grouped into predictable undo units.
- Selection-only transient changes do not create unexpected document undo entries.
- Undo and redo flush active native text or composition sessions before applying history.

## 13. Pointer And Mouse Selection

- Single click places the caret at the nearest valid cursor point.
- Click on a selectable atom can create explicit node selection when policy says so.
- Double click selects the nearest word or atom unit.
- Triple click selects the current block.
- Drag selection creates a canonical range selection.
- Shift-click extends from the existing anchor to the clicked point.
- Pointer selection across atoms and block boundaries resolves to valid canonical points.
- Pointer selection does not allow browser-only DOM selection to diverge from editor state.

## 14. Rendering And Scrolling

- Caret rendering reads from canonical selection.
- Range highlights read from canonical selection.
- Selected atom rendering reads from explicit node selection or covered range selection.
- Overlay rendering never mutates document state.
- Selection remains visible after keyboard navigation and text input when scrolling is needed.
- Empty text blocks still provide a stable caret rect.
- Wrapped lines, inline atoms, and block atoms provide geometry for vertical navigation.

## 15. Platform And Browser Policy

- `Cmd` on macOS and `Ctrl` on Windows/Linux map to the same editor command intent.
- Unsupported editor shortcuts pass through without document or selection mutation.
- Function keys follow browser/system policy unless explicitly owned by the editor.
- Browser-specific `beforeinput` variants normalize into the same command surface.
- Prevented native events must have an equivalent editor command or an explicit no-op policy.
- Accessibility-visible focus and selection state remain coherent with the canonical editor state.
