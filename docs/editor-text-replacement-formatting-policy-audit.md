# Editor Text Replacement Formatting Policy Audit

## Issue #8 Scope

OS autocorrect, spellcheck replacement, macOS text replacement, and iOS
replacement UI are not ordinary typing, paste, or IME composition. They can
arrive as `insertReplacementText`, as a plain `insertText` after an acceptance
key, or as clipboard-like data where the reported type does not match the
payload. The editor must preserve marks, selection, and history by treating
these as native replacement evidence that is accepted only for one active text
surface.

This issue defines the editor policy and fixture requirements. Real OS trace
capture remains covered by the dedicated trace issue #85.

## Current Evidence

Repo evidence:

- `packages/editable/edit.test.ts` covers model-level
  `insertReplacementText` over a non-collapsed range.
- `packages/editable/dom.test.ts` covers native text commits before marks and
  IME composition replacing a range.
- `packages/editable/internal/dom/internal/ranges.ts` maps native text changes
  to mark/range offset patches and removes ranges only when they collapse.
- `tests/browser/fixtures/markBoundaryCompositionTrace.ts` records mark boundary
  composition traces for bold, italic, code, and link boundaries.
- `docs/editor-native-mutation-policy-audit.md` already limits
  `insertReplacementText` to one active text surface unless richer target
  evidence exists.

External evidence:

| Source | Observed replacement risk |
| --- | --- |
| Lexical PR #8417: https://github.com/facebook/lexical/pull/8417 | macOS text replacement acceptance can reorder caret placement, Backspace, Select All, Space, Return, and punctuation behavior; some cases require manual QA because they are not easy to synthesize. |
| Lexical PR #5789: https://github.com/facebook/lexical/pull/5789 | iOS autocorrect can report `text/html` while the payload is plain text, causing formatting loss when an editor trusts the reported type. |
| ProseMirror Android discussion: https://discuss.prosemirror.net/t/contenteditable-on-android-is-the-absolute-worst/3810 | Android virtual keyboards differ for swipe typing, voice input, autocorrect, and deletion behavior. |
| ProseMirror view changelog: https://raw.githubusercontent.com/ProseMirror/prosemirror-view/master/CHANGELOG.md | Gboard spell correction, Safari composition menus, Chrome/Android selection, and mark-boundary composition have required repeated browser-specific fixes. |

## Replacement Event Taxonomy

| Replacement type | Expected browser evidence | Editor classification | Commit policy |
| --- | --- | --- | --- |
| Plain typing correction inside one text leaf | `beforeinput`/`input` with `insertReplacementText`, or text delta on `input`. | Native text replacement. | Allow only when the changed range maps to one active text surface. Commit one model patch and rebase marks/atoms. |
| Spellcheck context-menu replacement | Often `insertReplacementText`; selection may be a word range. | Native text replacement with explicit range. | Same as plain typing correction. If target range is missing or crosses atom/block boundaries, prevent or revert and run controlled replacement. |
| macOS text replacement accepted by Space/Return/punctuation | Acceptance key may be observed before or after the replacement input; caret can be left before the acceptance boundary. | Native text replacement plus acceptance-key evidence. | Commit from final text delta once. Selection after must be the post-acceptance caret; do not create a separate history item for a phantom acceptance key. |
| macOS text replacement dismissed by Backspace | Backspace may accept a pending replacement in some browsers instead of deleting the typed character. | Controlled key command unless trace proves a safe native flow. | Prefer app command after flushing any active text. Do not trust native Backspace around pending replacement. |
| iOS autocorrect/prediction UI | May expose both `text/plain` and `text/html` while the HTML contains no element nodes. | Plain replacement, not rich paste. | If `text/html` has no element nodes, fall back to plain text and preserve current marks. |
| Replacement during IME composition | `insertCompositionText`/`insertFromComposition`, `isComposing`, and composition events. | Composition, not replacement. | Use the composition policy: buffer during preedit and commit once on final composition input. |
| Replacement crossing atom/block boundary | Target range spans `\uFFFC`, block edge, or uneditable chrome. | Controlled model command required. | Prevent or ignore native mutation. Atom/block deletion must remain explicit. |

## Mark Preservation Policy

| Replacement target | Mark/range result |
| --- | --- |
| Replacement entirely inside an active mark | Preserve the mark over the replacement text. |
| Replacement starts before a mark and ends inside it | Clip the mark start to the replacement start and keep the marked suffix only if non-empty. |
| Replacement starts inside a mark and ends after it | Keep the marked prefix and extend it over inserted text only for the overlapped replacement segment. |
| Replacement exactly covers a marked word | Preserve the mark over the inserted word when the replacement was initiated from that marked text. |
| Replacement crosses multiple marks | Rebase each mark independently; do not drop unrelated marks outside the changed range. |
| Replacement crosses a link range | Preserve the link on replacement text only when the visible label was the selected text. Never change `href` from OS replacement data. |
| Replacement crosses code text | Do not apply spellcheck/autocorrect automatically when code spellcheck is disabled. If a browser still emits a replacement, treat it as plain code text and preserve the code mark only inside the original code range. |
| Replacement crosses a mention/atom | Reject the native fast path. Mentions are atoms, not spellcheckable text. |

Decision: replacement is a text-range edit, not paste. Mark updates must follow
the same range rebasing logic as native text change and rich fragment insertion.
Formatting is lost only when the replaced range itself is removed and no active
mark policy says the inserted text inherits it.

## Spellcheck And Autocorrect Surface Policy

| Surface | Spellcheck/autocorrect policy |
| --- | --- |
| Plain paragraph/list/heading text | Allow native spellcheck and autocorrect. |
| Bold/italic/underline/strike/highlight text | Allow; preserve and rebase marks. |
| Link label text | Allow plain replacement of the visible label; preserve `href`; reject rich HTML from replacement UI unless it has trusted editor fragment data. |
| Code mark and code block | Disable spellcheck/autocorrect where the browser supports it. If replacement still fires, treat as plain text inside code and do not infer formatting from OS payload. |
| Mention, tag, task marker, attachment atom | Disable; replacement may not target atom DOM or cross the atom character. |
| Figure caption text | Allow only when implemented as an outer document text surface; do not route replacement through a nested editor. |
| Widget/decorator chrome | Disable; not part of the document text surface. |

## Minimum Fixture Set

| id | Fixture | Expected result |
| --- | --- | --- |
| TR-01 | Synthetic `insertReplacementText` over a selected bold word in one text surface. | One model patch; replacement text remains bold; selection moves to replacement end. |
| TR-02 | Synthetic native text delta before a bold range. | Range offsets shift; mark content remains unchanged. |
| TR-03 | Synthetic iOS-like replacement payload reporting `text/html` plus `text/plain`, where parsed HTML has no element nodes. | Treat as plain text replacement; do not invoke rich HTML paste; preserve active marks. |
| TR-04 | Replacement range crosses bold/code/link boundaries. | Ranges clip/rebase independently; code/link metadata is not dropped outside the changed range. |
| TR-05 | Replacement range crosses a mention atom. | Native fast path rejected; controlled model command required. |
| TR-06 | macOS text replacement accepted by Space, Return, punctuation, and dismissed by Backspace. | Manual OS trace required; final model text, caret, and history unit are recorded. |
| TR-07 | iOS prediction/autocorrect on bold, link, code, and mention-adjacent text. | Manual device trace required; verify data types, DOM mutation, mark retention, selection, and history. |

The synthetic fixture set can run in jsdom/Playwright. TR-06 and TR-07 require
real OS input and should be tracked under #85 before enabling additional native
fast paths.

## Trace Payload

Every real replacement trace should record:

- Browser, OS, keyboard, locale, and input method.
- `keydown`, `beforeinput`, `input`, `compositionstart`,
  `compositionupdate`, `compositionend`, `selectionchange`, and `paste` order.
- `inputType`, `data`, `dataTransfer.types`, `isComposing`, and
  `getTargetRanges()` shape when exposed.
- Active element, root owner document, DOM selection, and text surface path.
- Text before/after, mark/range records before/after, atom records before/after.
- History transaction grouping and undo result.
- Whether reported `text/html` contains element nodes or only plain text.

## Decision

Treat autocorrect, spellcheck replacement, macOS text replacement, and iOS
replacement UI as native text replacement only when the evidence maps to one
active text surface. It is not composition unless composition events and
`insertCompositionText`/`insertFromComposition` are active. It is not rich paste
unless trusted rich data or real element-bearing HTML is present.

Until real OS traces prove otherwise, replacement near atoms, block boundaries,
code surfaces, nested editors, or untrusted HTML payloads must fall back to a
controlled model command or a plain-text native commit with mark rebasing.
