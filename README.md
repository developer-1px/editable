# JSON Contenteditable Core

This repo is a small `@interactive-os/json-document` contenteditable bridge.
It is not a full editor product.

The core lives in `codex/core` and provides the thin layer that is hard to
rebuild correctly:

- DOM selection to `json-document` selection mapping
- native contenteditable text and IME lease/flush
- JSON Patch commits with `selectionAfter`
- copy/cut/paste fragment transport
- atom offset preservation using `\uFFFC`
- range metadata rebasing for marks or other inline annotations
- undo/redo through `json-document` history

The demo route at `/codex` is only a smoke surface for the core protocol.
Product editor concerns such as toolbar frameworks, markdown policy, app
document schemas, overlays, debug recorders, and legacy editor history are not
part of this repo.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/codex`.

## Verify

```bash
pnpm run test:core
pnpm run verify:browser
pnpm run verify:internal
```

`test:core` runs the jsdom contract tests for the core API. `verify:browser`
runs the `/codex` browser smoke tests. `verify:internal` runs TypeScript,
Vitest, Biome, and production build checks.

## Public Surface

Use `codex/core`.

The public API is intentionally small:

- `createJsonContentEditable`
- `isJsonContentEditableFragment`
- constants for text, atom, and clipboard attributes
- types in `codex/core/contract.ts`

Anything under `codex/core/internal` is private implementation detail.
