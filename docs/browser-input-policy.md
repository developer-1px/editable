# Browser Input Policy

## Scope

This document records the editor boundary for `contenteditable`,
`beforeinput`, IME composition, and reconciliation.

The editor uses the browser as an editing host for text input and selection
plumbing only. `json-document` remains the canonical document model.

## Sources Checked

- WHATWG HTML, editing host and `contenteditable="plaintext-only"`:
  https://html.spec.whatwg.org/multipage/interaction.html#contenteditable
- W3C Input Events Level 2, 01 May 2026 Working Draft:
  https://www.w3.org/TR/input-events-2/
- W3C UI Events:
  https://www.w3.org/TR/uievents/
- W3C input-events issue #115, composition cancelability:
  https://github.com/w3c/input-events/issues/115
- MDN `beforeinput` compatibility note:
  https://developer.mozilla.org/en-US/docs/Web/API/Element/beforeinput_event

## Policy

The editor treats `keydown` as a shortcut/navigation signal only. Text
insertion, deletion, paragraph insertion, replacement text, paste/drop, and
history input must enter through `beforeinput`, `paste`, or a toolbar command.

When a `beforeinput` event is cancelable and maps to a headless command, the
editor prevents the browser default and commits `json-document` patches.

When the browser must own a live text mutation, such as IME composition or a
safe collapsed mutation inside the active text leaf, the editor lets the
editing host mutate that leaf, records the active leaf, and flushes the final
text back into `json-document` when editing is released.

When `beforeinput` is missing, non-cancelable, or has no usable target range,
the editor must reconcile from the resulting `input`/DOM state instead of
assuming `preventDefault()` worked.

## InputType Policy Table

| Group | Input types | Spec cancelable | `getTargetRanges()` on contenteditable | Editor policy |
| --- | --- | --- | --- | --- |
| Plain text insertion | `insertText` | Yes | Non-empty, except browser bugs | Defer to editing host only for collapsed active text leaf without active marks; otherwise prevent and run `insertText`. |
| Replacement/autocorrect | `insertReplacementText` | Yes in Input Events Level 2, but MDN warns browser/OS exceptions | Non-empty in contenteditable per spec | Same as text insertion, but keep reconciliation fallback because spellcheck/autocorrect can be non-cancelable in real browsers. |
| IME live composition | `insertCompositionText` | No | Target range surrounds the active composition text | Do not run headless command. Track active leaf and flush/reconcile after composition. |
| Composition commit | `insertFromComposition` where emitted, or final `insertText` after `compositionend` | Level/version dependent; issue #115 exists because this changed across levels | May be non-empty when emitted by contenteditable | Treat as composition commit and consume once; prevent duplicate DOM insertion when possible, otherwise reconcile. |
| Paragraph/line break | `insertParagraph`, `insertLineBreak` | Yes | Non-empty | Prevent and run split command. Physical `Enter` keydown does not split directly. |
| Paste/drop/yank | `insertFromPaste`, `insertFromPasteAsQuotation`, `insertFromDrop`, `insertFromYank` | Yes | Non-empty; `dataTransfer` is expected for contenteditable paste/drop variants | Prefer explicit `paste` handler for plain text in demo; otherwise prevent and run text insertion from `dataTransfer`/`data`. |
| Character deletion | `deleteContentBackward`, `deleteContentForward`, `deleteContent` | Yes | Non-empty | Prevent at structure boundaries and run headless delete. Defer only for safe collapsed deletion inside the active text leaf. Physical `Backspace`/`Delete` keydown does not delete directly. |
| Word/line deletion | `deleteWordBackward`, `deleteWordForward`, `deleteSoftLineBackward`, `deleteSoftLineForward`, `deleteEntireSoftLine`, `deleteHardLineBackward`, `deleteHardLineForward` | Yes | Non-empty | Implement supported word variants headlessly; unsupported line variants should prevent and fall back to closest safe headless behavior or no-op until modeled. |
| Cut/drag deletion | `deleteByCut`, `deleteByDrag` | Yes | Non-empty | Prevent structure mutation and run headless deletion; clipboard/drag payload is a separate policy. |
| History | `historyUndo`, `historyRedo` | Yes | Empty | Prevent and route to `json-document` history. |
| Formatting | `formatBold`, `formatItalic`, `formatUnderline`, `formatStrikeThrough`, `formatSuperscript`, `formatSubscript`, `formatJustify*`, `formatIndent`, `formatOutdent`, `formatRemove`, `formatSet*`, `formatBackColor`, `formatFontColor`, `formatFontName`, `insertLink` | Yes | Non-empty for contenteditable | Prevent browser rich formatting. Route only supported marks through headless commands; otherwise no-op. |

## Browser And Platform Notes

| Browser/platform | Evidence | Practical conclusion |
| --- | --- | --- |
| Spec target | Input Events Level 2 says all `beforeinput` events except those emitted within an IME composition process are cancelable; the spec table marks `insertCompositionText` as non-cancelable. | Code must not assume every `beforeinput` can be canceled. |
| Contenteditable host | Input Events Level 2 says contenteditable `getTargetRanges()` is non-empty for non-history inputTypes, while history returns an empty array. | Use `getTargetRanges()` when available, but keep model selection as fallback. |
| Plaintext host | WHATWG HTML defines `contenteditable="plaintext-only"` as editable raw text with rich formatting disabled. | The demo root should remain `plaintext-only`; rich structure belongs to `json-document`. |
| Browser/OS reality | MDN notes `beforeinput` may be missing or non-cancelable for autocomplete, spellchecker correction, password-manager autofill, IME, and other browser/OS paths. | Keep an `input`/DOM reconciliation path for changes that escaped `beforeinput`. |
| Android Chrome / virtual keyboard | CKEditor #3131 reports Android delete recognition through `beforeinput`, but keydown can fire first and event order varies. | Do not mutate document from deletion keydown. Use `beforeinput`/reconciliation. |
| Android inline nodes | ProseMirror #903 reports mobile Chrome firing `beforeinput deleteContentBackward` around inline-node backspace failures. | Atom boundaries need headless delete handling keyed by `inputType`, not physical key names. |
| Soft keyboard / IME | Slate #2062 records that soft keyboards can make key events unreliable and recommends ignoring text keydown, allowing DOM update, then diffing/reconciling for some paths. | Keydown is not a reliable source of text intent on mobile/IME. |
| IME ordering | Chromium issue 41399759 says there are no guarantees about keyboard-event order with IME and points to `beforeinput` instead of `keydown`. | Composition sessions need their own state machine and trace tests. |

## Runtime Decision Matrix

Do not hard-code a browser-name matrix for cancelability. Use the event itself:

| Runtime observation | Meaning | Required behavior |
| --- | --- | --- |
| `event.cancelable === true` and inputType is supported headlessly | Browser default can be stopped for this event instance. | `preventDefault()`, flush any active text leaf, run the headless command. |
| `event.cancelable === false` | `preventDefault()` cannot be trusted for this event instance. | Let DOM update, track the affected text leaf when possible, reconcile on `input`/flush. |
| `event.isComposing === true` or `inputType === "insertCompositionText"` | Live IME composition is active. | Never run ordinary headless text insertion/deletion. Track composition and flush on commit/end. |
| `getTargetRanges()` returns non-empty ranges | Browser reports the DOM range it plans to affect. | Prefer this for diagnostics and future DOM-to-model mapping; still normalize through the canonical model. |
| `getTargetRanges()` returns an empty array for `historyUndo`/`historyRedo` | Spec-defined history behavior. | Route to `json-document` history; no DOM range is needed. |
| `getTargetRanges()` is missing or unexpectedly empty | Browser support gap, jsdom limitation, or non-contenteditable target. | Fall back to model selection and DOM selection; mark the trace as weak evidence. |

## Browser Confirmation Summary

| Engine/platform | Confirmed from sources | Missing evidence |
| --- | --- | --- |
| Chromium/Blink desktop | `beforeinput` is baseline supported per MDN; W3C issue #115 and historical reports show composition cancelability changed across Input Events levels. | Current per-inputType runtime matrix still needs trace capture on the target version. |
| Chrome Android/WebView | CKEditor, ProseMirror, and Slate reports all show soft-keyboard/key event unreliability and reliance on `beforeinput`/reconciliation. | Must be verified on real devices because event order differs by keyboard and Android version. |
| Firefox/Gecko | MDN links Gecko bugs as examples where `beforeinput` may be absent or non-cancelable in browser/OS-specific paths. | Need current Firefox desktop and Android trace results. |
| Safari/WebKit/iOS | WHATWG/MDN list the editing host and `beforeinput` surface, but source docs do not give a complete per-inputType cancelability matrix. | Need current Safari desktop and iOS trace results, especially IME and autocorrect. |

## Current Implementation Contract

- `BlockEditor` uses `contentEditable="plaintext-only"`.
- `BlockEditor` listens to native `beforeinput` instead of React synthetic
  `onBeforeInput`, because React does not expose every InputEvent field we need.
- `editingHostInputSession.planBeforeInput()` is the gate for browser-owned
  text leaf mutation versus headless mutation.
- `InputEvent.getTargetRanges()` is captured in the session input shape. The
  current implementation still falls back to canonical model selection and DOM
  selection; a future issue should map `StaticRange` to model paths for stronger
  browser verification.
- `inputAdapter` no longer maps physical `Backspace`, `Delete`, or `Enter`
  keydown to document mutation. The corresponding `beforeinput.inputType`
  drives the mutation.

## Follow-Up Issues

- Add a Playwright/WebDriver trace page that records `inputType`, `cancelable`,
  `isComposing`, `data`, `dataTransfer` presence, and target range count for the
  current browser.
- Run the trace page on Chrome desktop, Safari desktop, Firefox desktop, Chrome
  Android, and Safari iOS.
- Add `StaticRange` to model-point mapping and use it when model selection is
  stale but the browser target range is trustworthy.
