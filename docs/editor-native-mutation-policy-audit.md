# Editor Native Mutation Policy Audit

## Issue #6 Scope

Current policy treats the DOM as a view plus one active native text buffer. The
canonical document is the JSON model. `beforeinput` classifies a browser edit,
`input` commits allowed native text mutations, and controlled commands prevent
native DOM mutation before it happens.

Code surfaces:

- `packages/editable/internal/dom/internal/editTurn.ts`
- `packages/editable/internal/dom/createEditableHost.ts`
- `packages/editable/dom.test.ts`
- `tests/browser/editable.spec.ts`

## Native Mutation Policy By Operation

| Operation | Current/future policy | Commit point |
| --- | --- | --- |
| Text insertion | Allow native mutation only inside the active text surface. `beforeinput insertText` starts a native text turn; `input insertText` reads that surface and commits a model patch. | `input` |
| Deletion inside active text | Allow when the mapped target stays inside one text surface. Read the resulting text surface and rebase atoms/ranges. | `input` |
| Deletion at atom/block boundary | Controlled command. Do not trust browser DOM deletion around atoms, widgets, block joins, or uneditable nodes. | `keydown`/`beforeinput` command |
| Paste | Current app command and `paste` event own paste. Future `beforeinput insertFromPaste` may classify target ranges, but sanitized insertion remains a model command. | paste command |
| Drop | Drop is a model command using `DataTransfer` and resolved drop point. Native DOM movement is ignored. | drop command |
| Undo/redo | Browser history is blocked. App history owns document patches and selection. During composition, history is blocked until composition is committed or canceled. | app history command |
| Autocorrect/spellcheck replacement | Treat `insertReplacementText` as native text only when it targets one active text surface. If it crosses marks/atoms/blocks or arrives without usable target evidence, flush/revert through a controlled command. | `input` or controlled command |
| Composition | Composition owns one text surface temporarily. `insertCompositionText` stays buffered; `insertFromComposition` commits the surface once. | composition commit `input` |

## `beforeinput.inputType` Mapping

| `inputType` | Current turn | Default | Policy |
| --- | --- | --- | --- |
| `insertText` | `begin-native-text` | Allowed | Native fast path inside active text only. |
| `insertCompositionText` | `begin-native-text` before composition input, then `composing-input` on `input` | Allowed | Keep as composition buffer; do not commit until final composition input. |
| `insertFromComposition` | `commit-native-text` with `composition-commit` | Allowed | Commit active composition text once; suppress duplicate late commits after a model command. |
| `insertReplacementText` | `begin-native-text` today | Conditionally allowed | Same as text insertion only when target is one active leaf; otherwise controlled replacement. |
| `deleteContentBackward` / `deleteContentForward` | `begin-native-text` today | Conditionally allowed | Native only inside active text; atom/block edges need controlled deletion. |
| `deleteWord*` / `deleteSoftLine*` | `begin-native-text` today unless keydown command catches it | Conditionally allowed | Future mapping should prefer model command when visual/layout or block boundary semantics are needed. |
| `insertParagraph` / `insertLineBreak` | `run-model-instruction` or `flush-before-model-instruction` | Prevented | Insert `\n` through model command before browser creates stray DOM. |
| `insertFromPaste` / `insertFromDrop` | `begin-native-text` if only seen as `beforeinput`; app owns `paste`/drop paths | Prevent for rich path | Use sanitizer/importer and model command; do not let rich HTML mutate editor DOM first. |
| `historyUndo` / `historyRedo` | `history`, or `block-composing-history` while composing | Prevented | App history only. |
| Formatting input types | Not a native fast path | Prevent/control | Toolbar or command layer owns mark/range updates. |

## Event And Mutation Ordering

For native text fast path:

```txt
beforeinput
  -> classify active text surface
  -> allow browser mutation
input
  -> read only leased text surface
  -> map DOM text/selection to model offsets
  -> commit patch with selectionAfter
  -> render if projection/model requires it
selectionchange/select
  -> sync selection after DOM/model settle
```

For controlled path:

```txt
keydown/beforeinput/paste/drop
  -> flush active native text if needed
  -> preventDefault
  -> run model command
  -> render from model
  -> restore/sync selection
```

For future `MutationObserver` safety net:

- Self-mutations from renderer are ignored or drained while rendering.
- Native text mutations are interpreted only if they touch the leased active
  text surface.
- Mutations outside the active surface are not model input. Re-render from model
  or convert them to an explicit command only when the event classifier already
  proved the user intent.
- Composition mutations are accumulated until composition commit or explicit
  flush. Do not normalize the composition target mid-preedit.
- Observer records are interpreted after `beforeinput` classification and
  `input` handling, not as an independent source of truth.

## Current Evidence In This Repo

| Evidence | Policy proven |
| --- | --- |
| `packages/editable/dom.test.ts` native text tests | `input insertText` commits active text surface and stores undo history. |
| `packages/editable/dom.test.ts` line break tests | `insertParagraph`/Enter are model-owned before native line break mutation. |
| `packages/editable/dom.test.ts` composition tests | IME preedit is buffered; history is blocked during composition; final composition input commits once. |
| `tests/browser/editable.spec.ts` composition/history traces | Toolbar/model commands flush active composition before running and suppress late duplicate final composition input. |
| `tests/browser/fixtures/dragDropFixture.ts` | Drop is treated as a command boundary; native DOM movement is not canonical. |
| `tests/browser/fixtures/strayBreakFixture.ts` | Raw editor DOM `<br>` is ignored; meaningful line breaks are command/import decisions. |

## Upstream Divergence Risks

| Risk | Source |
| --- | --- |
| Input Events Level 2 defines `beforeinput`/`input`, `dataTransfer`, target ranges, inputType cancelability, and separate composition behavior, but it also frames editors as model-backed applications that may override browser DOM edits. | https://www.w3.org/TR/input-events-2/ |
| Lexical issue #3460 shows Safari/WebKit divergence where `beforeinput`/`input` and DOM text comparison left the model stale while the DOM showed updated text. | https://github.com/facebook/lexical/issues/3460 |
| ProseMirror input handling has special composition flushing and Safari/Firefox/Android guards around DOM observer, selection, and composition state. | https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts |
| ProseMirror paste handling avoids JS paste during non-Android composition because browser behavior is unreliable, then falls back to native/captured paste paths. | https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts#L2999-L3022 |
| ProseMirror changelog repeatedly records DOM sync, composition, paste, widget, and browser selection fixes, which argues against trusting arbitrary DOM mutation as canonical state. | https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md |

## Decision

Keep `beforeinput` as a classifier, not the canonical edit. The canonical commit
is either:

- an `input` read from the leased active text surface, or
- an explicit model command that prevented or superseded native DOM mutation.

Do not expand the native fast path beyond single-surface text/composition until
there is browser trace evidence for autocorrect, spellcheck replacement,
mobile deletion, and rich paste/drop target ranges.
