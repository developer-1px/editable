# Editor Focus And Selectionchange Race Audit

## Issue #89 Browser Trace Summary

The browser trace fixture is `tests/browser/fixtures/focusSelectionTrace.ts`.
It records each event/checkpoint with:

- `activeElement`
- DOM selection anchor/focus ownership and selected text
- canonical JSON selection from the demo state panel
- visual layout and cursor frame line counts as overlay state
- first-block document text

The fixture is exercised by `tests/browser/editable.spec.ts` in Chromium, WebKit, and Firefox.

## Covered Flows

| Flow | Trace result |
| --- | --- |
| Editor focus -> programmatic selection restore -> `selectionchange` | All three browsers emit editor focus and selectionchange before the checkpoint. Canonical selection stays in the editor text surface. |
| Native input -> blur/outside focus | Native text is flushed before the outside input becomes active. The outside focus does not overwrite the canonical editor selection. |
| Toolbar pointer/click command | Toolbar `pointerdown` precedes `click`; the pointerdown guard keeps focus on the editor and the command runs against the command-start selection. |
| Outside input click/focus | `focusout` and outside click are visible in the trace; canonical selection remains the last editor selection instead of following the outside input. |
| Pointer drag selection | Editor `pointerdown` and `pointerup` order is captured with selection state and overlay state at the post-drag checkpoint. |
| History undo/redo | Keyboard history commands restore document text and keep the DOM/canonical caret in the editor after redo. |

## Guard Decision

The current guarded listener policy is sufficient for the traced desktop browser set:

- Do not sync editor selection from outside focus targets.
- Preserve toolbar command selection by preventing toolbar pointerdown focus transfer and syncing the editor selection before command execution.
- Defer native keyup/mouseup selection sync through animation frames so DOM paint and React state can settle before checkpoints that depend on visual layout.
- Keep history undo/redo owned by editor key handling so native caret restore is followed by explicit model selection restore.

No browser-specific delay or ignore rule is required for the #89 desktop traces. Mobile IME/touch-specific selection races remain covered by the separate mobile issues.
