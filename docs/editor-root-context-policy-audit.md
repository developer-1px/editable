# Editor Root Context Policy Audit

## Issue #90 Cross-Root Fixture Audit

The editable DOM adapter treats the mounted root as the source of browser context:

- DOM reads that depend on element classes must not rely on the parent window's `HTMLElement`, `Element`, or `Text` constructors.
- Selection reads and restores use the root node's `getSelection()` when available, then fall back to `root.ownerDocument.getSelection()`.
- Clipboard, paste, composition, and overlay probes are created from the editor root's owner document/window, not from the parent document.

Browser fixtures live in `tests/browser/fixtures/crossRootFixture.ts` and are exercised from `tests/browser/editable.spec.ts`.

## Fixture Coverage

| Root context | Chromium trace | WebKit trace | Policy result |
| --- | --- | --- | --- |
| Same-origin iframe document | Passes focus, ArrowRight, Shift+ArrowRight, copy, cut, paste, drop, and overlay owner-document checks. | Passes the same checks. | Supported when the editor is mounted with the iframe document's root. |
| ShadowRoot | Passes focus, horizontal selection, range copy/cut, paste/drop, IME commit, and overlay checks. | Focus and geometry are traceable, but native shadow selection is not exposed to the adapter in this fixture, so copy/cut/paste/composition remain a reproducible limitation. | Supported where the browser exposes shadow selection. The WebKit limitation is kept as an explicit fixture expectation. |
| Portal document via same-origin iframe | Passes focus, selection, copy/cut, paste/drop, and overlay checks while parent document selection remains present. | Passes the same checks. | Supported when clipboard and selection are resolved from the portal document's owner window/document. |

## Parent Selection And Clipboard Source

The iframe and portal fixtures install a parent-document selection before focusing the editor. Copy/cut then read from the editor owner document/window and keep the parent selection as trace evidence. This prevents accidental fallback to the parent document selection when an iframe or portal editor is active.

## Remount, Adoption, And Root Moves

Root remount and DOM node adoption are separate cases:

- Remounting an editor by creating a new host for a new root is supported.
- Moving an existing root within the same document is only safe while the root's owner document/window does not change.
- Adopting an existing editor root into another `Document`, `ShadowRoot`, iframe, popup, or portal document is unsupported for the current host instance.

If cross-root adoption becomes required, the DOM adapter should expose an explicit `updateRoot`-style API that refreshes owner document/window, selection source, clipboard source, and overlay host document together. Until then, recreate the host after adoption instead of reusing it.
