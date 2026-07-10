# Interactive OS Editable

`@interactive-os/editable` is a JSON-backed contenteditable experiment focused
on one hard invariant: native IME input and application rendering must never
replace the same live DOM node at the same time.

The current implementation keeps `@interactive-os/json-document` as canonical
state and mounts one deep editor module that owns the entire editable subtree.
Ordinary input is converted to model commands before the browser mutates DOM.
During composition the module pins the browser-owned text node and lends that
block to the IME; proven-disjoint `remote` updates are queued until settling,
while local or same-block commands return `composition_conflict` and must be
retried afterward.

React renders the toolbar and diagnostics only. It provides an empty root to the
editor and never renders descendants inside that root.

The previous implementation is preserved unchanged under
[`archive/pre-composition-island`](./archive/pre-composition-island).

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/`.

## Verify

```bash
pnpm run test:core
pnpm run verify:browser
pnpm run verify:internal
```

Synthetic composition tests verify the coordinator protocol only. Actual IME
acceptance still requires the
[`manual IME acceptance`](./docs/manual-ime-acceptance.md) matrix.
