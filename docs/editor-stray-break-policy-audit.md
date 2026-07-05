# Editor Stray Break Policy Audit

## Issue #7 Trace Summary

The browser fixture is `tests/browser/fixtures/strayBreakFixture.ts` and is
exercised in Chromium, WebKit, and Firefox by `tests/browser/editable.spec.ts`.

The fixture records two distinct import modes:

- `editor-dom`: current rendered editor DOM and active text leaf flushes.
- `html-paste`: future external HTML paste/import parsing.

Current editor policy:

- A model line break is the text character `\n`.
- `insertParagraph` and `insertLineBreak` are model-owned commands.
- Raw `<br>` nodes in current editor DOM are ignored as browser/view kludges.
- External HTML paste may convert `<br>` to `\n`, but only in contexts where the
  parser owns that decision.

## Classification Rules

| Context | `<br>` classification | Model result |
| --- | --- | --- |
| Current editor DOM or active text leaf flush | Browser/view kludge. | Ignore. |
| Empty paragraph placeholder such as `<p><br></p>` | Browser/view placeholder. | Empty text block, no `\n`. |
| Backspace near widget, atom, uneditable node, flex/grid wrapper, or list parent | Browser bug/kludge. | Ignore and re-render from model. |
| Enter before native DOM mutation | Model command. | Insert `\n`; prevent native mutation. |
| Paste inside code/pre context | Meaningful hard break. | Import as `\n`. |
| Paste inline HTML with an internal `<br>` between content | Meaningful hard break. | Import as `\n`. |
| Paste inline HTML with trailing `<br>` inside an inline parent | Source content unless it matches placeholder heuristics. | Import as trailing `\n` or preserve in future rich fragment. |
| Clipboard/editor trailing `<br>` that looks like a contenteditable placeholder | Kludge. | Drop. |
| Atom boundary `<br>` inserted only to make a cursor visible | Kludge. | Ignore; atom cursor edges are model positions. |

## DOM-To-Model Import Boundary

Current editor DOM extraction:

- Reads text nodes as text.
- Reads rich inline atom DOM as `\uFFFC`.
- Does not read `<br>` as text.
- Does not infer model line breaks from renderer helper DOM.

Future HTML paste/import:

- Parses `<br>` in code/pre as `\n`.
- Parses inline `<br>` as `\n` when the source is external HTML and the break is
  not an editor placeholder.
- Drops empty-block placeholder `<br>` nodes.
- Drops known browser kludge `<br>` nodes around widgets, atoms, list parents,
  and uneditable boundaries.
- Keeps the distinction between source HTML parsing and current editor DOM
  reconciliation. The same DOM node shape can mean different things depending on
  provenance.

## Trace Scenarios

| id | Scenario | Fixture case | Expected policy |
| --- | --- | --- | --- |
| BR-01 | Empty paragraph placeholder. | `empty-paragraph-placeholder` | One `<br>`, model text `""`. |
| BR-02 | Enter/native editor DOM shape before model reconciliation. | `native-enter-editor-dom` | Browser DOM `<br>` ignored; model break comes from command. |
| BR-03 | Atom boundary trailing break. | `atom-boundary-kludge` | Atom maps to `\uFFFC`; trailing `<br>` ignored. |
| BR-04 | Firefox-style list parent stray break. | `list-parent-stray-break` | List item text kept; parent `<br>` ignored. |
| BR-05 | Inline pasted hard break. | `inline-hard-break-paste` | `<br>` imports as `\n`. |
| BR-06 | Inline pasted trailing break. | `inline-trailing-break-paste` | External inline trailing break imports as `\n`. |
| BR-07 | Code block pasted break. | `code-block-paste` | `<br>` imports as `\n`. |
| BR-08 | Backspace before widget/flex/grid/inline-flex node. | Manual upstream regression trace. | Ignore browser-inserted bogus break and re-render from model. |

## Backspace, Enter, Paste, Empty, Code, Atom Policy

| Operation | Policy |
| --- | --- |
| Backspace | If native DOM inserts a `<br>` near widget/atom/uneditable content, ignore it and commit only the headless delete command. |
| Enter | Own `keydown`/`beforeinput` before native mutation. Insert `\n` through model command. |
| Paste plain text | Preserve plain text newlines as `\n` through paste command. |
| Paste HTML | Run HTML parser/sanitizer. Convert meaningful `<br>` to `\n`; drop placeholder/kludge breaks. |
| Empty paragraph | Represent as empty model text plus placeholder UI, not `<br>`. |
| Code block | Treat paste/import `<br>` as code text newline. |
| Atom boundary | Model has `before`/`after` atom edges. Cursor-helper `<br>` is not document text. |

## Known Browser And Upstream Cases

| Case | Source |
| --- | --- |
| Chrome inserts a random `<br>` when Backspace is pressed before a widget. | ProseMirror view 1.41.7 changelog: https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md#L1-L5 |
| Firefox inserts a bogus line break when backspacing before flex/grid styled widgets. | ProseMirror view 1.41.6 changelog: https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md#L9-L13 |
| Chrome/Safari insert a bogus hard break after backspacing before an inline-flex node. | ProseMirror view 1.41.4 changelog: https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md#L25-L31 |
| Firefox can add stray `<br>` nodes to parent list elements near uneditable content. | ProseMirror view 1.33.7 changelog: https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md#L235-L239 |
| Clipboard parser must not always drop trailing `<br>` nodes in inline parents. | ProseMirror view 1.23.3 changelog: https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md#L679-L683 |
| Clipboard parser should ignore trailing BR nodes that look like contenteditable kludges. | ProseMirror view 1.23.0 changelog: https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md#L697-L701 |
| Nested `<br>` detection matters for pasted code. | Lexical PR #8487: https://github.com/facebook/lexical/pull/8487 |

## Decision

Do not use raw current editor DOM `<br>` nodes as canonical document content.
The model stores line breaks as `\n`; editor commands and future paste/import
parsers decide when a browser or external HTML break becomes that character.
