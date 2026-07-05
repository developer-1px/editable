# Editor Mobile CJK IME TargetRange Policy Audit

## Issue #2 Scope

Mobile CJK IMEs may not emit the desktop composition lifecycle. Some keyboard
paths update an in-progress syllable by asking the editor to delete a
non-collapsed `targetRange`, then insert the next syllable text, without
`compositionstart` or `compositionend`.

This audit defines which event fields are trusted and which device traces are
still required before expanding the native fast path.

## Evidence

| Source | Relevant behavior |
| --- | --- |
| Lexical PR #8475: https://github.com/facebook/lexical/pull/8475 | iOS built-in Korean 10-key does not fire `compositionstart`/`compositionend`; each syllable step sends `beforeinput deleteContentBackward` with a non-collapsed `targetRange`, then `beforeinput insertText`. |
| Lexical issue #7779: https://github.com/facebook/lexical/issues/7779 | CJK composition can reinsert previously deleted text on later input, and Backspace behavior can differ across similar mobile environments. |
| W3C Input Events Level 2: https://www.w3.org/TR/input-events-2/ | For contenteditable hosts, `getTargetRanges()` is expected to describe the affected range for most `beforeinput` input types; composition text has separate input types and cancelability rules. |
| Existing repo fixtures | Desktop composition traces cover Korean, Japanese, and Chinese IME-like synthetic flows at mark boundaries, toolbar flush, stale caret, and active text leaf commits. |

## IME Matrix

| Input environment | `compositionstart/end` | `beforeinput.inputType` pattern | `event.data` | `getTargetRanges()` | Current confidence | Required trace |
| --- | --- | --- | --- | --- | --- | --- |
| iOS Korean 10-key built-in keyboard | Absent per upstream report. | `deleteContentBackward` with non-collapsed range, then `insertText`. | Insert step carries updated syllable text. | Required; delete range is the key signal. | High from Lexical PR #8475, but not reproduced in this repo. | iPhone/iPad Safari with built-in Korean 10-key. |
| iOS Japanese IME | Unknown. | Unknown; may use composition events or replacement-style input. | Unknown. | Unknown. | Low. | iOS Safari with Japanese Kana/Romaji keyboards. |
| iOS Chinese IME | Unknown. | Unknown; likely candidate/commit-specific. | Unknown. | Unknown. | Low. | iOS Safari with Simplified and Traditional Chinese keyboards. |
| Android Gboard Korean | Unknown for current repo. | Android keyboards may diverge for composition, Enter, Backspace, and paste. | Unknown. | Unknown. | Medium upstream risk, low local evidence. | Android Chrome with Gboard Korean 2-set and 10-key if available. |
| Android Samsung Korean | Unknown for current repo. | Vendor keyboard path may differ from Gboard. | Unknown. | Unknown. | Low. | Samsung Internet and Chrome with Samsung Korean keyboard. |
| Desktop Korean 2-set | Present in current synthetic fixtures. | `insertCompositionText`, then `insertFromComposition` on commit. | Available in synthetic events. | Not relied on for current desktop path. | Medium; synthetic, not OS-driven. | macOS/Windows real browser trace before engine-specific changes. |
| Desktop Japanese IME | Present in current synthetic mark-boundary fixtures. | `insertCompositionText`, then `insertFromComposition`. | Available in synthetic events. | Not relied on for current desktop path. | Medium; synthetic, not OS-driven. | macOS/Windows real browser trace before engine-specific changes. |

## TargetRange Policy

Use a non-collapsed `beforeinput.getTargetRanges()` result as the authoritative
delete range only when all conditions hold:

- The event is trusted `beforeinput`.
- `inputType` is `deleteContentBackward` or `deleteContentForward`.
- The target range maps entirely inside one active editor text surface.
- The mapped range does not cross an atom, block boundary, widget chrome,
  nested editor, iframe, or shadow-root ownership boundary.
- The browser path is known to be IME-like, replacement-like, or otherwise lacks
  usable composition events.
- The following insert/input event can be correlated to the same active surface.

Do not use target ranges as authoritative when:

- The range is collapsed and normal model deletion can handle the operation.
- The range cannot be mapped to one text path and offsets.
- The range crosses `\uFFFC` atom characters or block boundaries.
- The event is a rich paste/drop/formatting operation.
- The current active lease belongs to another owner document/root.

Decision: for mobile CJK IME-like deletion, targetRange is a deletion intent,
not a DOM mutation to trust blindly. It may become the active text leaf deletion
range after mapping and ownership checks; otherwise the editor must fall back to
a controlled command or ignore/re-render from model.

## Event Handling Policy

| Event pattern | Policy |
| --- | --- |
| `compositionstart` -> composing `input` -> `compositionend` -> final `input` | Use the existing composition lease policy. Buffer preedit, commit once. |
| `beforeinput deleteContentBackward` with non-collapsed targetRange -> `beforeinput insertText` | Treat as IME-like replacement inside one active text leaf. Delete mapped target range, then insert updated text as one replacement flow when correlated. |
| `beforeinput deleteContentBackward` with collapsed targetRange | Use normal deletion policy; do not infer IME replacement. |
| `deleteContentBackward` targetRange crosses atom/block boundary | Reject native fast path. Atom/block deletion remains an explicit model command. |
| Missing `compositionend` after composing input | Keep composition lease until final input or explicit flush by model command/blur. |
| New input arrives after a delete where the previous text reappears | Treat as stale DOM/model divergence; flush active leaf from model-owned selection and log full trace payload. |

## Minimum Fixture Requirements

| id | Fixture | Expected result |
| --- | --- | --- |
| CJK-01 | Synthetic iOS Korean 10-key sequence: non-collapsed `deleteContentBackward` targetRange for the previous syllable, followed by `insertText` for the updated syllable. | Model text replaces exactly the target range; no orphan jamo accumulate. |
| CJK-02 | Same sequence with targetRange straddling two text nodes inside one text surface. | Range maps to one model text path; replacement is correct. |
| CJK-03 | Same sequence where targetRange crosses an inline atom. | Native fast path rejected; atom remains model-owned. |
| CJK-04 | iOS Japanese and Chinese real keyboard traces. | Fill matrix fields for composition events, inputType, data, and target ranges. |
| CJK-05 | Android Gboard and Samsung Korean real keyboard traces. | Fill matrix fields and classify Backspace/Enter overlap with issue #1/#72. |
| CJK-06 | Desktop Korean/Japanese real browser trace. | Confirm whether synthetic desktop assumptions match real event order and target ranges. |

## Trace Payload

Record:

- Device, OS version, browser, keyboard app, language, layout, and input mode.
- Event order for `keydown`, `beforeinput`, `input`, `compositionstart`,
  `compositionupdate`, `compositionend`, `selectionchange`, and `select`.
- `inputType`, `data`, `isComposing`, `dataTransfer.types`, and
  `getTargetRanges()` start/end containers and offsets.
- DOM selection before and after each event.
- Mapped model text path and offsets for each target range.
- Active lease state and canonical selection before/after replacement.
- Model text, atoms, marks, history unit, and undo result.

## Decision

The editor should not assume mobile CJK input has composition events. For
IME-like delete/insert pairs with non-collapsed target ranges, the target range
is the strongest available deletion evidence only after root ownership and
single-text-surface mapping succeed.

Unverified mobile keyboards stay out of the native fast path until their trace
fills the matrix above.
