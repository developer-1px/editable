# Editor Nested Editable Focus Policy Audit

## Issue #76 Trace Summary

The browser fixture is `tests/browser/fixtures/nestedEditableFixture.ts` and is exercised in Chromium, WebKit, and Firefox by `tests/browser/editable.spec.ts`.

Fixture structure:

- `contenteditable=true` outer editor.
- `contenteditable=false` island inside the outer editor.
- `contenteditable=true` inner editor inside the island.
- Same-origin iframe with an editable body target.

## Active Editor Ownership

Raw copy/cut/paste/keydown events from the inner editor may still bubble through the outer DOM tree. The editor-level ownership check must therefore use active editor ownership, not DOM containment alone.

Outer editor owns an event only when:

- the event target is inside the outer root,
- the target is not inside a nested editable island,
- and `document.activeElement` is the outer root.

When the inner editor owns selection, outer copy/cut/paste/key handlers must ignore the event.

## Iframe Focus Handoff

Before entering an iframe editor, active outer text must be flushed or explicitly suspended. The trace records the outer text before iframe focus and then verifies parent focus moves to the iframe element.

Browser result:

- Chromium/WebKit expose the iframe inner editable as the iframe document active element.
- Firefox moves parent focus to the iframe but does not expose the iframe inner editable as `iframeDocument.activeElement` in this minimal trace.

## Workaround Decision

- Nested editable producer support remains unsupported as a public editor feature.
- If added later, nested editors must register ownership boundaries and stop outer command handling while inner ownership is active.
- Iframe editor support should use owner-document selection and focus state, with Firefox treating parent iframe focus as sufficient evidence of handoff when inner `activeElement` is unavailable.
