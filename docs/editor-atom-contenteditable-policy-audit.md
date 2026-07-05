# Editor Atom Contenteditable Policy Audit

## Issue #5 Scope

Inline atoms, block atoms, future figure captions, and nested editable islands
all sit at a boundary where native `contenteditable=false` behavior diverges by
browser. The editor must treat these boundaries as model cursor positions or
explicit node selections, not as free-form browser-owned DOM selection.

Current evidence in this repo:

- `packages/editable/dom.test.ts` maps atom DOM to one model character,
  restores selections around atoms, copies atoms as structured fragments, and
  keeps atom offsets synced after native text input.
- `packages/editable/index.test.ts` creates headless cursor frames with atom
  before/after offsets and atom-only visual line seeds.
- `tests/browser/editable.spec.ts` covers atom copy/cut, malformed native atom
  DOM removal, drag/drop sources, BiDi atom geometry, and stray atom-boundary
  `<br>` handling.
- `tests/browser/fixtures/nestedEditableFixture.ts` records the nested editor
  ownership boundary for a `contenteditable=false` island containing an inner
  `contenteditable=true` surface.
- `docs/editor-figure-caption-container-policy-audit.md` defines editable
  captions as an outer document text surface rather than a nested editor.

## Boundary Matrix

| Boundary | Canonical shape | Chrome | Safari | Firefox | Android Chrome | iOS Safari | Policy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inline atom such as mention/tag/task marker | One `\uFFFC` model character with before/after offsets. | Medium risk: DOM selection can land before or after the element. | Medium risk: selection/geometry may drift around inline chips. | Medium risk: multi-range and uneditable-node behavior differs. | High risk: upstream reports keyboard dismissal and failed Backspace around `contenteditable=false`. | High risk until touch/virtual keyboard traces exist. | Render as `contenteditable=false`, but normalize every click, selection, copy, cut, paste, drag, and delete through model offsets. |
| Block atom such as media/embed | One block cursor unit with explicit before/after block edges. | Medium risk: drag/drop or partial DOM selection may split the node. | Medium risk: native selection may enter media chrome. | Medium risk: uneditable widget and flex/grid line-break bugs are recurring. | High risk: same Android uneditable-node deletion risk as inline atoms. | High risk until touch selection and keyboard traces exist. | Treat as explicit node selection or block edge only. Never trust partial native DOM deletion. |
| Future figure caption | Figure group with media edges plus one caption text surface in the outer document. | Medium risk if implemented as nested editor; low risk when implemented as outer caption surface. | Medium risk around selection handoff and geometry. | High risk for nested `contenteditable=true` inside `contenteditable=false`. | High risk if media/caption use nested editor or uneditable wrapper traversal. | High risk until real device context-menu and keyboard traces exist. | Do not implement captions as nested editors. Caption carets use the same document selection stream as normal text. |
| Nested editor island | Separate editor owner with focus handoff, not part of the outer selection stream. | Medium risk: event bubbling must be ownership-filtered. | Medium risk: focus/selection source can be owner-document specific. | High risk: upstream reports arrow movement cannot cross nested editors inside a false wrapper. | High risk: virtual keyboard and selection may collapse when crossing islands. | High risk: native editing UI may target the wrong owner. | Suspend outer selection while the inner editor owns focus. Outer commands must ignore inner-owned events. |

Risk meaning:

- Low: current automated browser evidence covers the behavior.
- Medium: current policy is defined, but browser-specific quirks still require
  normalization.
- High: real browser or real device trace is required before expanding native
  behavior.

## Cursor And Deletion Policy

Atom selection identity is model-owned:

```txt
text before atom
-> atom before
-> atom after
-> text after atom
```

Deletion policy:

| User intent | Canonical command | Native DOM mutation |
| --- | --- | --- |
| Backspace at `atom after` | Select or delete the previous atom as one model unit, depending on product mode. | Prevent or ignore. |
| Delete at `atom before` | Select or delete the next atom as one model unit, depending on product mode. | Prevent or ignore. |
| Range covers an atom | Remove the atom record and replace its `\uFFFC` character in one model patch. | Do not rely on browser node removal. |
| Backspace before/after block atom | Move to/select/delete the block atom by explicit block edge command. | Prevent or ignore. |
| Native text edit before an atom | Allow only inside the active text surface; then rebase atom offsets. | Read the leased text surface on `input`. |
| Browser removes atom DOM before state render | Re-render from model or commit the already-classified command. | DOM identity is evidence only. |

Decision: atom deletion is always a headless model command at a `before` or
`after` edge. Native DOM deletion around `contenteditable=false`, widgets,
media chrome, and nested editor wrappers is never canonical.

## Browser Trace Requirements

| id | Scenario | Browser/device | Required trace |
| --- | --- | --- | --- |
| AC-01 | Inline mention between text; caret after mention; press Backspace. | Android Chrome on a physical device or emulator with virtual keyboard. | `beforeinput`, `input`, `selectionchange`, keyboard visibility, active element, DOM selection, and final editor model. |
| AC-02 | Inline mention between text; caret before mention; press Delete if available or hardware keyboard Delete. | Android Chrome and desktop Firefox. | Confirm whether native selection dismisses, whether the atom can be deleted natively, and whether any stray `<br>` appears. |
| AC-03 | Media/block atom selected; press Backspace and Delete. | Chrome, Safari, Firefox desktop; Android/iOS manual pass before native expansion. | Confirm model command deletes one block unit and browser does not create partial DOM selection. |
| AC-04 | Figure with editable caption; arrow from caption start toward media. | Firefox desktop plus Safari desktop. | Confirm caption is not a nested editor and movement resolves through model media edges. |
| AC-05 | Nested inner editor inside `contenteditable=false` island; arrow at inner boundary. | Firefox desktop. | Record whether arrows can leave the inner editor; outer editor must not claim the event while inner focus is active. |
| AC-06 | Touch select across inline atom and text. | iOS Safari and Android Chrome physical devices. | Selection handles, context menu target, DOM range, and normalized model range. |

Minimum manual trace to reopen native behavior:

- AC-01 must pass before allowing native Backspace/Delete to mutate near inline
  `contenteditable=false` atoms on Android.
- AC-05 must pass before implementing nested editor traversal with browser
  arrow behavior on Firefox.

## API And Fallback Rules

Avoid:

- Treating `contenteditable=false` DOM selection as canonical atom selection.
- Letting browser Backspace/Delete remove atom or block atom DOM directly.
- Inferring caption selection from focus inside a nested editor or iframe.
- Using DOM child indexes around atoms without converting through the model
  `\uFFFC` offset.
- Treating browser-created atom-boundary `<br>` nodes as document content.
- Expanding native deletion fast paths from text interiors to atom/block edges
  without AC-01/AC-02 traces.

Allowed:

- Render atom DOM as `contenteditable=false` for browser editing isolation.
- Map atom DOM to one model character in DOM-to-model selection and text reads.
- Copy/cut/paste atoms through structured rich fragments with plain text
  fallback.
- Use measured geometry for hit testing, then normalize click/drop targets to
  model atom edges.
- Rebase atom offsets after allowed native text edits inside the same leased
  text surface.
- Treat nested editors as separate owners and ignore their inner events from the
  outer editor.

## Upstream Evidence

| Source | Risk captured |
| --- | --- |
| ProseMirror issue #565: https://github.com/ProseMirror/prosemirror/issues/565 | Android `contenteditable=false` can dismiss selection/keyboard and fail Backspace deletion. |
| Lexical issue #3143: https://github.com/facebook/lexical/issues/3143 | Firefox can fail arrow movement between nested editors inside a `contenteditable=false` wrapper. |
| ProseMirror view changelog: https://github.com/ProseMirror/prosemirror-view/blob/master/CHANGELOG.md | Uneditable nodes, widgets, inline leaf nodes, composition, and selection continue to need browser-specific fixes. |

## Decision

Inline atoms may be rendered as `contenteditable=false` only as view chrome for
one model character. Block atoms and media chrome are node selections or block
edges. Future editable captions must live in the outer document selection
stream, not inside a nested editor. Nested editors are separate owners with
focus handoff.

The editor can use native selection, geometry, and DOM mutation as trace
evidence, but every atom boundary edit resolves to a model command before it
changes canonical document state.
