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
                                structural intent waits or is validated
                                document transactions wait
```

This is a short, block-granular lease rather than a CRDT. A causal or remote-op
adapter can sit above the coordinator through
`getJsonEditableDocumentHost(editor)`. The host flushes pending native input
and defers ready work until the lease is released; the app retries a deferred
inbox from a microtask after observing idle state.

## Ownership Invariants

1. The coordinator is the only bridge between DOM and `JSONDocument`.
2. React never reconciles descendants of the editable root.
3. Cancelable ordinary insertion, deletion, Enter, paste, cut, and history
   intent are converted to model commands in `beforeinput`; the browser does
   not perform those DOM writes. During composition, an explicit structural
   intent is retained until the text-node lease can be released.
4. During composition, the exact `Text` node and its ancestor chain are pinned.
   The composing block is opaque to projection until settling completes.
5. A `remote` change proven to touch only another block is queued and committed
   immediately after settling. Local commands and any change that may touch the
   composing block fail with `composition_conflict`; they do not claim to cancel
   the operating-system IME.
6. Renderer writes run with the observer disconnected and drained. They can
   never be re-ingested as native input.
7. DOM changes without a bounded native-input intent are rejected and the
   canonical projection is restored. A rejected turn is atomic: admitted text
   records from the same turn are not partially committed.

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
replays the captured model command. Firefox may deliver the mutation observer
turn before `input`; while this captured intent is live those records are also
discarded rather than passed to generic foreign-DOM admission. The transient
DOM is never adopted, and timeout recovery restores canonical projection if
`input` does not arrive.

### IME composition

`compositionstart` records the selected JSON range and pins the exact active
`Text` node and ancestor chain. It also snapshots the keyed block identities,
so an input-only fallback cannot redefine a post-mutation node or element as
the original block. `input` plus
`MutationObserver` evidence is accepted only from that block. The smallest text
change is computed near the known composition range so
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

### Structural intent during composition

Composition state and edit intent are independent axes:

- `isComposing` says whether the browser still owns the leased DOM;
- `inputType` says what edit the user requested.

Therefore composing state is not a global event firewall. A physical
`keydown Enter` remains ignored because it may only confirm an IME candidate.
A paragraph intent is instead evidenced by `beforeinput` or `input` with
`insertParagraph`/`insertLineBreak`, or by a composition result ending in a
line-break character. `beforeinput` starts one logical intent. A non-cancelable
`beforeinput` is paired with its later `input`; a canceled `beforeinput` expects
no `input`, so a later input-only event remains a new intent. Newline-bearing
`compositionend` and its adjacent input phase are deduplicated. Two distinct
`beforeinput` events remain two paragraph intents even within one composition.
Candidate confirmation without one of those signals does not split a block.

For a cancelable structural event, the coordinator prevents the transient DOM
write, drains the final composition text, releases the lease, and executes the
existing JSON paragraph command exactly once. The paragraph is a separate undo
entry from the composition.

For a non-cancelable or input-only mobile path, the event grants a one-shot
capability for one expected native block split. The coordinator verifies the
original block and pinned text identities and order, a single adjacent native
block, a strict text/empty-`br` grammar (including native `<div><br></div>`),
and exact left/right text against the pre-event
canonical value. The native element, markup, ID, and type are never adopted.
The transient DOM is discarded and the same JSON paragraph command is replayed.
Any extra block, attribute, nested element, text mismatch, or mutation in
another block rejects the entire turn and restores the canonical projection.
Validation is mandatory when the lease settles, including an early settle
caused by teardown or a new composition. A final IME text replacement such as
preedit-to-committed text is accepted only when its diff remains inside the
captured composition range; it is merged into the composition history before
the paragraph command runs.

Some mobile engines encode Enter as a trailing newline in the composition
text. That newline is removed from the composition history entry before the
paragraph command runs, preventing it from leaking into either resulting
block. Its location is recalculated after late final input or a validated native
split rather than inferred from `compositionend.data` length. The normalized
model selection is restored before queued remote commits, so their Undo records
cannot capture a stale pre-normalization DOM caret.

### Concurrent application changes

- Proven-disjoint `remote` change: validate and queue it, then commit it after
  composition settles but before structural intent replay. This preserves the
  queued patch's original index paths; the paragraph remains the first Undo.
- Local application command: return `composition_conflict` and retry after
  settling, even if it currently targets another block.
- Same composing block: return `composition_conflict`; the caller retries or
  buffers it until the phase becomes `idle`.
- Direct writes to the supplied `JSONDocument`: unsupported while mounted. The
  editor reports `out_of_band_document_write` and recovers conservatively.

### Causal document host

`getJsonEditableDocumentHost(editor)` is the only supported path for an adapter
whose own `doc.commit()` must be reconciled as an editor-owned publication. It
is a small capability rather than a second transaction API, and the separate
getter keeps the established `JsonEditable` structural contract unchanged:

```ts
const inbox = createCausalPatchInbox(document, {
  positionalSchema: EditableDocumentSchema,
  host: getJsonEditableDocumentHost(editor),
});
```

Before every coordinator-owned native, application, or history change,
`runDocumentChange` assigns a monotonic sequence. `ownsPublication` returns
that sequence only during the synchronous publication; origin strings are not
used as authority. A ready apply reserves from the same sequence before its
scope-bound closure runs. Raw `document.commit()` calls therefore remain out of
band.
Editor snapshot subscribers are exception-isolated and report
`subscriber_failed`; fault observers are isolated as well. A user callback
therefore cannot abort the document's subscriber loop before a causal inbox
journals an owned publication.

For a ready causal envelope, `runReady` first drains mutation records. It calls
the supplied `apply()` exactly once only when the editor is idle and has no
pending composition, native intent, structural intent, or queued remote patch.
It refuses immediately, without attempting that drain, while a browser event
handler or another coordinator-owned document publication is still on the
stack. This prevents both pre-native DOM interleaving and nested journal order
from depending on subscriber registration order.

That condition must hold both before and after the drain: recovery that cancels
a damaged composition still defers the current turn, so a causal render cannot
overlap an OS composition that has not delivered its final event. Otherwise
`runReady` returns `host_not_ready` without calling `apply()`. The first
publication whose `mergeKey` matches the ready envelope id is reconciled as a
remote change. A nested or second publication remains out of band, while the
causal inbox independently detects projection divergence.

Browser composition activity is tracked separately from the pinned
`CompositionSession`. Losing an ancestor or Text identity may cancel the pin,
but it does not release the OS lease. Ready work remains deferred until
`compositionend`, blur, or a non-composing `insertFromComposition` input clears
that latch. Release is queued after the native event handler returns, so a
synchronous editor subscriber cannot re-enter the inbox before final native
flush and phase handling complete. A generation token prevents an old release
from closing a newly started composition, and a new composing signal cancels
any orphaned settle timer from a damaged session. Clearing the latch emits a
snapshot change so a coalesced retry waiting behind a damaged composition wakes
up.

If `compositionend` arrives after the pinned session was already lost, the
editor still enters the same 30 ms settling window before exposing idle state;
this leaves room for the browser's late final input.

Retry is scheduled in a microtask after an idle snapshot, not synchronously
inside an editor subscriber. This lets the current document publication finish
and reach the causal inbox's ownership subscriber before another ingestion
begins. The app-owned `causalDocumentInbox` tracer implements this coalesced
retry and avoids a same-revision microtask loop when another pending input state
still prevents readiness.

Ready publications and composition settling update canonical JSON selection
regardless of focus. They restore the matching DOM selection only when the
editable root still matches `:focus` in its document or shadow-root context;
automatic reconciliation must not reclaim focus from an external control.
Explicit local commands retain their existing focus-and-selection restoration
behavior.

The demo's “remote” origin means a queued asynchronous application update, not
a full collaborative undo model. True collaboration needs causal operations and
origin-selective undo in the CRDT/OT layer instead of this linear queue.

## Rendering and Observation

Blocks are keyed by persisted IDs. Text updates use `CharacterData` operations
and preserve a canonical single text node plus an empty-block placeholder. A
type change may replace a block element only outside composition. Foreign root
children, duplicate keyed nodes, nested markup, and attribute changes are
removed during recovery. Expected native paragraph DOM is accepted only as a
temporary effect of the one-shot structural capability described above.

The mount API intentionally stays small:

```ts
const editor = mountJsonEditable({ root, document, onFault });
const host = getJsonEditableDocumentHost(editor);
editor.dispatch(action);
editor.getSnapshot();
editor.subscribe(listener);
editor.destroy();
```

The package encodes that public seam as a direct-child layer hierarchy:

```txt
packages/editable/
├─ index.ts, editor.ts, model.ts       public facade layer
├─ browser/
│  ├─ index.ts                         public -> browser seam
│  ├─ editor.ts                        editor contract and mount facade
│  ├─ editorCoordinator.ts             event order and mounted-session state
│  ├─ documentProjection.ts            keyed canonical DOM projection
│  ├─ editableDOM.ts                   surface and placeholder primitives
│  ├─ domSelection.ts                  DOM <-> model selection mapping
│  ├─ nativeTextMutation.ts            bounded text-mutation admission
│  └─ nativeParagraph.ts               one-shot native Enter grammar
└─ core/
   ├─ index.ts                         browser -> core seam
   ├─ model.ts                         document model and selection meaning
   ├─ editorCommands.ts                action -> patch and selection plan
   └─ textChange.ts                    DOM-free text change calculations
```

The allowed direction is `public -> browser -> core`. A layer may access peers
and its immediate child's explicit `index.ts`, but never a grandchild, parent,
or child implementation file. Code outside the package may import only the
root `index.ts`. `pnpm run check:editable-layers` checks static, type-only,
dynamic, and export-from dependencies and runs as part of the normal check.
Non-literal dynamic imports are rejected because their target cannot be proven
to stay on an allowed seam. Aliased CommonJS loaders, Node `createRequire`
sources, Vite glob loaders, and source-tree symlinks are rejected for the same
reason.
The DOM platform, `@interactive-os/json-document`, and Zod are declared
external dependencies rather than package child layers; core remains DOM-free.

The root `editor.ts` and `model.ts` are compatibility facades and enter browser
only through `browser/index.ts`. Browser policy modules neither commit
`JSONDocument` changes nor report faults. The coordinator remains the single
transaction and timing owner, so layering does not split the composition lease
across competing state holders.

`destroy()` uses the same mandatory native-effect validation, trailing-newline
normalization, queued-remote ordering, and structural replay as timed settling
before it removes listeners and restores the host attributes it borrowed.

## Evidence Boundary

The automated suite verifies:

- coordinator transitions and history in jsdom;
- causal host publication ownership, delayed positional rebase, selection
  restoration, pending-native flush, composition defer, and microtask retry;
- owner-document/cross-realm DOM behavior;
- ordinary typing, empty-block deletion, and root-boundary Select All in real
  Chromium, Firefox, and WebKit;
- ordinary trusted Enter plus cancelable, input-only, trailing-newline, and
  non-cancelable structural protocol paths in all three engines;
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
  and routes Enter from `beforeinput`: [Enter observer](https://github.com/ckeditor/ckeditor5/blob/master/packages/ckeditor5-enter/src/enterobserver.ts).
- Slate ignores composing keydown while retaining `insertParagraph`, with a
  separate Android mutation/action queue: [editable input routing](https://github.com/ianstormtaylor/slate/blob/main/packages/slate-react/src/components/editable.tsx)
  and [Android input manager](https://github.com/ianstormtaylor/slate/blob/main/packages/slate-react/src/hooks/android-input-manager/android-input-manager.ts).
- Lexical handles paragraph input and trailing composition newlines separately
  from candidate-confirming keydown: [event routing](https://github.com/facebook/lexical/blob/main/packages/lexical/src/LexicalEvents.ts).
- Quill's Safari IME guard shows why composing Enter keydown cannot itself be a
  paragraph command: [keyboard module](https://github.com/slab/quill/blob/main/packages/quill/src/modules/keyboard.ts).
- EditContext is the platform-level alternative in which the user agent sends
  text updates without directly editing the DOM: [W3C EditContext](https://www.w3.org/TR/edit-context/).
