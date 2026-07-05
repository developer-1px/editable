# Editor Android Virtual Keyboard Policy Audit

## Issue #1 Scope

Android virtual keyboards do not provide stable desktop-style `keydown`
semantics for rich editors. Backspace, Delete, Enter, paste, and composition
updates must be classified from `beforeinput`, `input`, composition state,
DOM/text-surface diffs, and delayed active-leaf flushes.

This audit defines the first-pass policy for Android virtual keyboard behavior.
It does not claim real-device coverage for every keyboard; those rows remain
explicit manual trace requirements.

## Evidence

| Source | Risk captured |
| --- | --- |
| ProseMirror Android discussion: https://discuss.prosemirror.net/t/contenteditable-on-android-is-the-absolute-worst/3810 | Android may hide the real key, keyboards differ by vendor/app, and keydown-based Backspace handling is unreliable. |
| ProseMirror input handling: https://github.com/ProseMirror/prosemirror-view/blob/master/src/input.ts | Android paths need browser-specific guards around Enter, composition, DOM observer, and native input. |
| ProseMirror view changelog: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | SwiftKey Backspace-as-Enter, Android image-join Backspace, Gboard spell correction Enter, virtual keyboard paste, and Chrome Android cursor bugs recur across releases. |
| W3C Input Events Level 2: https://www.w3.org/TR/input-events-2/ | `beforeinput.inputType`, `input`, and `getTargetRanges()` are the browser-level edit-intent APIs for contenteditable hosts. |
| Current repo tests | Existing unit/browser tests cover active IME leaf buffering, stale IME caret recovery, line break as model command, native text commits, paste commands, and atom/block boundary policy. |

## Failure Mode Matrix

| Operation | Android failure mode | Minimum evidence | First-pass handling point | Real device required |
| --- | --- | --- | --- | --- |
| Backspace inside one text leaf | `keydown` may be missing, generic, or misleading; native effect may delete more than one DOM node. | ProseMirror Android discussion; changelog Android backspace detection entries. | `beforeinput deleteContentBackward` classifies intent; `input` commits active leaf diff when the mapped range stays inside one text surface. | Yes: Gboard, Samsung Keyboard, SwiftKey. |
| Backspace at block boundary | Browser may join blocks, delete an image/block, or run Enter handler by mistake. | ProseMirror changelog lines for image join and block-element deletion. | Prefer controlled model command from `beforeinput` or keydown only when intent is reliable; otherwise delayed leaf flush and re-render. | Yes: Chrome Android with paragraphs, lists, images/atoms. |
| Delete key | Many virtual keyboards do not expose a distinct Delete key; hardware keyboards may. | Input Events spec for `deleteContentForward`; Android keyboard variance from ProseMirror discussion. | `beforeinput deleteContentForward` when present; hardware `keydown Delete` is secondary. | Yes: hardware keyboard plus virtual keyboard variants. |
| Enter / paragraph split | Keydown may be ignored, doubled, or confused with composition/Backspace; nested DOM can drop Enter. | ProseMirror changelog lines for Android Enter, Chinese keyboard Enter, nested DOM Enter, Gboard spell correction Enter. | `beforeinput insertParagraph`/`insertLineBreak` runs a model command and prevents native DOM mutation. Keydown is only a fallback. | Yes: Gboard Korean/Chinese, Samsung Keyboard, empty list item, code block. |
| Paste from virtual keyboard | Multi-line paste may appear as Enter-like effects; keyboard may close or lack clipboard data. | ProseMirror changelog virtual keyboard paste and Chrome Android paste entries. | App `paste` command owns rich paste; `beforeinput insertFromPaste` may classify but must not let rich DOM mutate first. Plain text fallback can commit through model. | Yes: Gboard clipboard, Samsung clipboard, Chrome Android. |
| Composition update | `keydown` may interleave with composition; Enter/Space can move caret or run wrong command. | ProseMirror changelog Chrome Android composition and Gboard entries; repo IME flush tests. | `compositionstart`/composing `input` leases active text surface; model commands flush lease first; final `input` commits once. | Yes: Korean/Japanese/Chinese Gboard and Samsung Keyboard. |
| Spell correction/suggestion accept | Enter or Space with a selected suggestion can produce wrong line/caret behavior. | ProseMirror changelog Gboard spell correction entries. | Treat as text replacement unless `insertParagraph` is clear; commit final active leaf diff and restore normalized selection. | Yes: Gboard suggestions on plain text/code. |
| Atom or uneditable boundary deletion | Native deletion may remove DOM chrome or create stray breaks. | Atom policy audit; ProseMirror uneditable-node/browser bug history. | Controlled model command only; native DOM deletion is ignored or reverted. | Yes before enabling any native boundary deletion. |

## Handling Policy By Signal

| Signal | Android policy |
| --- | --- |
| `keydown Backspace/Delete/Enter` | Treat as a hint, not the authoritative edit source, for virtual keyboard input. Use it for hardware keyboard paths and desktop-like browser behavior only when not composing and when the command can be run before native DOM mutation. |
| `beforeinput deleteContentBackward/deleteContentForward` | Primary deletion classifier. Use target ranges only when they map to one active text leaf; atom/block boundaries require controlled commands. |
| `beforeinput insertParagraph/insertLineBreak` | Primary Enter classifier. Prevent default and run the model line-break command. |
| `beforeinput insertFromPaste` | Classifier only. Paste remains app-owned through sanitizer/importer and model command. |
| `input` after allowed native text mutation | Commit by reading only the leased active text surface and rebasing atoms/ranges. |
| `input` during composition | Buffer; do not commit document text until final composition input or explicit flush. |
| `compositionend` | End composition metadata, but do not assume selection and DOM have settled until final input or explicit flush. |
| Delayed active leaf flush | Use when Android reports intent late, keydown is misleading, or DOM mutation already happened inside the leased text surface. |

## Current Fit With The Repo

Current code already follows most of this policy:

- `resolveEditTurn` treats `beforeinput insertParagraph`/`insertLineBreak` as
  model commands.
- Native text input starts a text-surface lease and commits on `input`.
- Composition input is buffered until final composition input or command flush.
- Model commands during composition flush the active leaf and suppress duplicate
  final composition input.
- Paste is app-owned through the paste handler, not trusted rich native DOM.
- Atom and block boundary deletion policies are documented as model-owned.

Remaining gaps before Android native expansion:

- No real Android keyboard trace recorder has filled the matrix above.
- `getTargetRanges()` is not yet a first-class deletion source in the current
  DOM adapter.
- Hardware Android keyboard behavior is not separated from virtual keyboard
  behavior in policy tests.

## Required Android Trace Matrix

| id | Device/browser/keyboard | Operations |
| --- | --- | --- |
| AVK-01 | Pixel or emulator, Chrome Android, Gboard Korean | Backspace, Enter, composition update, suggestion accept, multi-line paste. |
| AVK-02 | Samsung device, Chrome Android and Samsung Internet, Samsung Keyboard Korean | Backspace, Enter, composition update, suggestion accept. |
| AVK-03 | Android Chrome, SwiftKey | Backspace near text/block boundary and Enter. |
| AVK-04 | Android Chrome, Gboard Chinese/Japanese | Enter during composition, candidate accept, Backspace while composing. |
| AVK-05 | Android Chrome with hardware keyboard | Distinguish hardware `keydown` reliability from virtual keyboard behavior. |
| AVK-06 | Android Chrome with inline atom/block atom fixtures | Backspace/Delete/Enter near uneditable content and image/media boundaries. |

Trace fields:

- Device, OS, browser, keyboard app, language, layout, hardware/virtual mode.
- Event order for `keydown`, `beforeinput`, `input`, `compositionstart`,
  `compositionupdate`, `compositionend`, `selectionchange`, `paste`, and
  clipboard events.
- `key`, `code`, `inputType`, `data`, `isComposing`, `dataTransfer.types`, and
  `getTargetRanges()` shape.
- DOM selection and mapped model selection before/after each event.
- Active text lease state, text surface path, text before/after, atom/range
  records, history unit, undo result, and whether the virtual keyboard closed.

## Decision

Android virtual keyboard editing must not be keyed primarily off `keydown`.
`beforeinput.inputType` classifies the operation, `input` plus the active
text-surface lease commits allowed text mutations, composition input remains
buffered until commit/flush, and atom/block boundary edits stay model-owned.

Real Android traces are required before loosening these rules for a specific
keyboard, browser, or node boundary.
