# Interactive OS Editable

This repo is the `@interactive-os/editable` rich document editing kit in
progress. It is not a full editor product.

The public source package lives in `packages/editable`. It exposes a headless
kernel at `packages/editable` and a DOM adapter at `packages/editable/dom`.
Together they provide the thin editing layer that is hard to rebuild correctly:

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

The headless kernel holds the typed document model that can be projected to
canonical editable HTML. It does not parse arbitrary HTML and does not use DOM
APIs.

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

`test:core` runs the jsdom contract tests for the package interface. `verify:browser`
runs the `/demo` browser smoke tests. `verify:internal` runs TypeScript,
Vitest, Biome, and production build checks.

## Public Surface

Use `packages/editable/dom` for the DOM adapter and `packages/editable` for the
headless typed model. Use `packages/editable/schema` only when runtime zod
validation is needed.

The single editing interface is `edit` from `packages/editable`:

```
edit({ document, selection, goalX }, intent, { lineSeeds? })
  -> { patch, selectionAfter, goalX } | { kind: "history", command } | error
```

Its intent vocabulary is not invented: text intents are W3C Input Events
`inputType` values (`insertText`, `deleteContentBackward`, `formatBold`, ...)
and selection intents are the Selection API (`modifySelection` with the
`alter`/`direction`/`granularity` triple, `setBaseAndExtent`). Output is JSON
Patch plus `selectionAfter`. Adapters translate events to intents; hosts apply
patches and own history.

The rest of the public API is intentionally small:

- `createEditableHost`
- `createVisualLayoutStore`
- `measureVisualLayout`
- `isRichTextFragment`
- constants for text, atom, and clipboard attributes
- rich document adapter types from `packages/editable/dom`
- zod schemas from `packages/editable/schema`

Anything under `packages/editable/internal` is private implementation detail.
