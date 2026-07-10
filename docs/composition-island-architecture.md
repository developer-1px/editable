# Composition Island Architecture

## Decision

`JSONDocument` is the canonical value, selection, and history owner. One
coordinator owns every descendant of the editable root; React renders only the
empty mount element and the surrounding controls.

The implementation does not pretend that two writers can safely mutate the
same live `Text` node. Instead it changes ownership by input phase:

```txt
normal input                    active IME composition
------------                    ----------------------
beforeinput -> JSON command     browser owns one block's DOM
JSONDocument -> keyed DOM       bounded DOM diff -> JSONDocument
                                document transactions wait
```

This is a short, block-granular lease rather than a CRDT. A CRDT or remote-op
adapter can sit above the coordinator, but it must retry or buffer an operation
that receives `composition_conflict`.

## Ownership Invariants

1. The coordinator is the only bridge between DOM and `JSONDocument`.
2. React never reconciles descendants of the editable root.
3. Cancelable ordinary insertion, deletion, Enter, paste, cut, and history
   intent are converted to model commands in `beforeinput`; the browser does
   not perform those DOM writes.
4. During composition, the exact `Text` node and its ancestor chain are pinned.
   The composing block is opaque to projection until settling completes.
5. A `remote` change proven to touch only another block is queued and committed
   immediately after settling. Local commands and any change that may touch the
   composing block fail with `composition_conflict`; they do not claim to cancel
   the operating-system IME.
6. Renderer writes run with the observer disconnected and drained. They can
   never be re-ingested as native input.
7. DOM changes without a bounded native-input intent are rejected and the
   canonical projection is restored.

## Input Protocol

### Ordinary editable commands

For cancelable `beforeinput`, the coordinator prevents the browser default and
commits the equivalent JSON patch. This avoids engine-specific empty-block
rewrites such as replacing the owned text surface with a bare `<br>`.

Selection endpoints may be `Text` offsets or element child boundaries. Root and
block boundaries are resolved to the first or last owned text surface, covering
Firefox's native Select All representation and empty-block caret positions.
When `beforeinput.getTargetRanges()` is available, its range takes precedence
over a stale DOM selection, which is required by several mobile IME flows.

Some engines expose a non-cancelable, composition-shaped event for a whole-root
replacement. The coordinator records the selected JSON range and data before
the browser writes, discards that known transient DOM rewrite on `input`, and
replays the captured model command.

### IME composition

`compositionstart` records the selected JSON range and pins the active text
node. `input` plus `MutationObserver` evidence is accepted only from that block.
The smallest text change is computed near the known composition range so
repeated strings such as `aaa -> aaaa` do not move the edit to the wrong equal
substring.

Each accepted native update becomes a JSON transaction. Consecutive updates
from the same composition session are explicitly merged into one undo entry.
Disjoint queued updates are committed only after that entry is complete, so
linear `JSONDocument` history never exposes an intermediate preedit on undo.

`compositionend` is not treated as the final write by itself. The coordinator
enters a short settling phase, drains late input and mutation records, then
releases the DOM lease and restores normal projection. A new composition start
settles and cancels the previous timer first, so an old timer cannot terminate
the new session.

### Concurrent application changes

- Proven-disjoint `remote` change: validate and queue it, then commit it as the
  next normal history entry after composition settles.
- Local application command: return `composition_conflict` and retry after
  settling, even if it currently targets another block.
- Same composing block: return `composition_conflict`; the caller retries or
  buffers it until the phase becomes `idle`.
- Direct writes to the supplied `JSONDocument`: unsupported while mounted. The
  editor reports `out_of_band_document_write` and recovers conservatively.

The demo's “remote” origin means a queued asynchronous application update, not
a full collaborative undo model. True collaboration needs causal operations and
origin-selective undo in the CRDT/OT layer instead of this linear queue.

## Rendering and Observation

Blocks are keyed by persisted IDs. Text updates use `CharacterData` operations
and preserve a canonical single text node plus an empty-block placeholder. A
type change may replace a block element only outside composition. Foreign root
children, duplicate keyed nodes, nested markup, and attribute changes are
removed during recovery.

The mount API intentionally stays small:

```ts
const editor = mountJsonEditable({ root, document, onFault });
editor.dispatch(action);
editor.getSnapshot();
editor.subscribe(listener);
editor.destroy();
```

`destroy()` drains the current native turn, releases pinned references, removes
listeners and observers, and restores the host attributes it borrowed.

## Evidence Boundary

The automated suite verifies:

- coordinator transitions and history in jsdom;
- owner-document/cross-realm DOM behavior;
- ordinary typing, empty-block deletion, and root-boundary Select All in real
  Chromium, Firefox, and WebKit;
- synthetic composition range accumulation, node identity, conflict rejection,
  and settling in all three engines.

Script-created `CompositionEvent` and `InputEvent` objects do **not** establish
an OS text-input session. They test the protocol only. Release acceptance still
requires real Korean and Japanese desktop IME plus iOS and Android keyboard
traces described in [manual IME acceptance](./manual-ime-acceptance.md).

## Primary References

- ProseMirror protects local composition DOM and incrementally reconciles
  around it: [view descriptions](https://github.com/ProseMirror/prosemirror-view/blob/master/src/viewdesc.ts)
  and [DOM observation](https://github.com/ProseMirror/prosemirror-view/blob/master/src/domobserver.ts).
- CodeMirror tests composition preservation and conflicting updates in browser
  fixtures: [composition tests](https://github.com/codemirror/view/blob/main/test/webtest-composition.ts)
  and [DOM observation](https://github.com/codemirror/view/blob/main/src/domobserver.ts).
- CKEditor suppresses view rendering while native composition owns DOM, then
  renders after composition: [view renderer](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-engine/src/view/renderer.ts)
  and [composition observer](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-engine/src/view/observer/compositionobserver.ts).
- EditContext is the platform-level alternative in which the user agent sends
  text updates without directly editing the DOM: [W3C EditContext](https://www.w3.org/TR/edit-context/).
