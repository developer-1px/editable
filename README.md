# JSON Document Contenteditable Web

This repo is a small `@interactive-os/json-document` contenteditable bridge and
rich document model lab. It is not a full editor product.

The package lives in `packages/contenteditable-web`, following the same naming
shape as `../json-document/packages/contenteditable-web`. It provides the thin
web layer that is hard to rebuild correctly:

- DOM selection to `json-document` selection mapping
- native contenteditable text and IME lease/flush
- JSON Patch commits with `selectionAfter`
- copy/cut/paste fragment transport
- atom offset preservation using `\uFFFC`
- range metadata rebasing for marks or other inline annotations
- undo/redo through `json-document` history

The demo route at `/demo` is only a smoke surface for the core protocol.
Product editor concerns such as toolbar frameworks, markdown policy, app
document schemas, overlays, debug recorders, and legacy editor history are not
part of this repo.

`packages/rich-document` holds the headless typed document model that can be
projected to canonical editable HTML. It does not parse arbitrary HTML and does
not use DOM APIs.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/demo`.

## Verify

```bash
pnpm run test:core
pnpm run verify:browser
pnpm run verify:internal
```

`test:core` runs the jsdom contract tests for the package API. `verify:browser`
runs the `/demo` browser smoke tests. `verify:internal` runs TypeScript,
Vitest, Biome, and production build checks.

## Public Surface

Use `packages/contenteditable-web` for the DOM adapter and
`packages/rich-document` for the headless typed model.

The public API is intentionally small:

- `createJsonContentEditable`
- `isJsonContentEditableFragment`
- constants for text, atom, and clipboard attributes
- types in `packages/contenteditable-web/contract.ts`

Anything under `packages/contenteditable-web/internal` is private
implementation detail.
