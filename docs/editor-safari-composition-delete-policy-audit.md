# Editor Safari Composition Delete Policy Audit

## Issue #3 Scope

Safari can order IME composition, keyboard, selection, and `beforeinput` events
differently from Chromium and Firefox. The failure mode in scope is stale
composition state leaking into a later Backspace/Delete range deletion after
IME text has already been confirmed.

This is a failure-mode audit. It does not add a Safari-specific implementation
branch because the current editor state machine does not keep a long-lived
Safari composition-end flag.

## Event Order Evidence

| Source | Relevant order/risk |
| --- | --- |
| Lexical PR #8154: https://github.com/facebook/lexical/pull/8154 | macOS Safari can fire `compositionend` before `keydown`; stale composition-end state later forced a multi-node selection into one text node before `beforeinput deleteContentBackward`. |
| ProseMirror input handling: https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts | ProseMirror carries browser-specific composition guards and Safari workarounds in its input pipeline. |
| ProseMirror view changelog: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | Safari composition issues recur around empty table cells, active mark changes, mutation records, spacebar menus, and Enter handling. |
| `tests/browser/editable.spec.ts` | Existing WebKit browser tests dispatch synthetic composition sequences, stale caret before Enter, toolbar flush during active composition, and mark-boundary composition traces. |

Expected Safari hazard sequence:

```txt
compositionstart
input insertCompositionText
compositionend
keydown Enter/Space/non-Backspace confirmation key
selectionchange/select later selects a range
keydown Backspace/Delete
beforeinput deleteContentBackward/deleteContentForward
input or controlled model deletion
```

The bug class appears when a state flag from `compositionend` survives past the
confirmation key and is consumed during the later delete key instead.

## Current State Machine Audit

Current relevant state:

- `lease`: active text surface lease, with `composing` metadata.
- `suppressNextCompositionCommit`: one-shot guard for late final composition
  input after a model command flushed preedit text.
- JSON document selection: canonical selection snapshot.

Current transitions:

| Event/turn | Current behavior | Stale-state risk |
| --- | --- | --- |
| `compositionstart` | Clears `suppressNextCompositionCommit` and starts a composing lease from DOM. | Low; no key-specific Safari flag is created. |
| composing `input` | Refreshes composing lease and does not commit document text. | Low; text remains buffered in the active surface. |
| `compositionend` | Marks the current lease as no longer composing. | Medium only if a later final input never arrives; no separate stale finalizer is stored. |
| `input insertFromComposition` | Begins a non-composing lease and commits text from DOM once. | Low; commit clears the lease. |
| model command while composing | Flushes active DOM text as `composition-commit`, runs the command, and sets one-shot suppression for a late duplicate final input. | Low; suppression is cleared on the next matching final input/beforeinput path. |
| `keydown` Backspace/Delete after composition | Runs the normal model-command path from the current normalized selection. | Low as long as no stale composition lease is reused. |
| `selectionchange`/`select` after composition | Syncs root-local DOM selection into canonical selection when it maps to the editor root. | Medium; raw DOM selection must not be interpreted while a stale composition lease is still active. |

The current approach avoids the Lexical #8154 shape because there is no
`isSafariEndingComposition`-style state that waits for a later `keydown`.

## Selection Source Of Truth

Decision: after composition has been committed or flushed, Backspace/Delete must
use the canonical model selection plus normalized active-leaf cursor/range, not
raw DOM selection and not stale composition state.

Rules:

- During active composition, the leased text surface is the only native buffer.
- On composition commit, read the leased text surface once, produce a model
  patch, and restore `selectionAfter`.
- After commit or flush, clear the lease before accepting a deletion command.
- A later DOM selection may update canonical selection only through the normal
  root-local selection mapper.
- If a delete command starts while a composition lease is still marked active,
  flush that lease first and suppress duplicate final composition input.
- Never force a multi-node selection into a single text node because of a stale
  composition flag.

## Required Trace Fixture

| id | Scenario | Fixture type | Expected result |
| --- | --- | --- | --- |
| SC-01 | WebKit synthetic Japanese/Korean composition, confirm with Enter, select all, press Delete. | Playwright WebKit synthetic composition events. | Confirmed IME text stays committed; full selected range is deleted; selection is not collapsed to one text node. |
| SC-02 | WebKit synthetic composition, confirm with Space, Shift+Arrow range across two text nodes, Backspace. | Playwright WebKit synthetic composition events. | Range deletion uses normalized model selection and deletes exactly the selected range. |
| SC-03 | Composition followed by toolbar command, then late final composition input. | Existing browser fixture. | Late final input is suppressed and does not duplicate preedit text. |
| SC-04 | Composition at bold/code/link boundaries, then Enter. | Existing mark-boundary fixture. | Composition commits once and mark/range metadata is rebased. |
| SC-05 | Real macOS Safari IME, confirm with Enter/Space, Cmd+A, Delete. | Manual Safari trace. | Event order, final model text, selection, and undo are recorded. |

Playwright WebKit cannot drive real OS IME input reliably, so SC-01 and SC-02
should dispatch the event order directly. SC-05 is required before adding any
Safari-specific keydown defer flag.

## Fixture Payload

Every Safari composition-delete trace should record:

- Browser engine/version and OS keyboard/input source.
- Event order for `compositionstart`, composing `input`, `compositionend`,
  `keydown`, `beforeinput`, final `input`, `selectionchange`, and `select`.
- `inputType`, `data`, `isComposing`, and `getTargetRanges()` when available.
- DOM selection anchor/focus nodes before delete and after delete.
- Canonical selection before delete and after delete.
- Active lease state before confirm, after confirm, and before delete.
- Document text and mark/atom records before composition, after commit, after
  selection, after deletion, and after undo.

## Guardrails

Avoid:

- A persistent Safari composition-ending flag that is cleared only by Backspace.
- Running a delayed composition finalizer during a later delete key.
- Updating canonical selection from DOM while the active lease is stale.
- Treating `compositionend` alone as proof that the DOM text and selection are
  fully settled across all browsers.
- Letting `beforeinput deleteContentBackward` operate on a browser-corrupted DOM
  selection after the model selection was already known.

Allowed:

- One active text-surface lease during composition.
- One-shot duplicate final-input suppression after a command flushes
  composition text.
- Synthetic WebKit event-order fixtures for the Safari bug path.
- Manual macOS Safari trace before adding Safari-specific native fast paths.

## Decision

The editor should keep composition state tied to the active text-surface lease,
not to a later keyboard event. Once composition is committed or flushed, the
lease must be cleared and deletion must use the canonical model selection plus
normalized active-leaf cursor/range.

DOM selection remains input evidence, but it is not the source of truth for a
post-composition range delete until it has passed the root-local selection
mapper and no stale composition lease is active.
