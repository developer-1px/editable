# Editable

`editable` is a TanStack Start app that hosts a structured rich-text editor.

The editor's document and selection state are canonical JSON state managed
through `@interactive-os/json-document`. The DOM is a rendered view plus a native
text input buffer for ordinary typing and IME composition; it is not the source
of document truth.

## Run

```bash
pnpm install
pnpm dev
```

The dev server runs on port `3000` by default.

## Verify

Use the full internal gate before treating an editor change as correct:

```bash
pnpm run verify:internal -- --repeat=1
```

That gate runs:

- focused/skipped/todo test marker scan
- Vitest discovery parity check for marker scanning
- README Docs inventory and editor evidence-section verification
- editor boundary verification
- TypeScript checking
- Vitest
- Vitest with deterministic shuffle seed `20260621`
- Biome check
- production build with generated route tree stability check
- `git diff --check`

For heavier repeat checks:

```bash
pnpm run verify:internal:stress
pnpm run verify:internal:soak
```

Real browser P0 smoke is separate from the internal fast gate:

```bash
pnpm run verify:browser
```

That gate runs the minimal input contract smoke in Chromium, Firefox, and
WebKit. IME cases remain recorded trace fixtures plus manual browser capture.

## Editor Boundaries

Public imports should go through these entrypoints:

- `src/editor/public`
- `src/editor/react`

The implementation is intentionally hidden under `src/editor/internal`.
Application routes should not import `src/editor/internal/*` directly.
The two public entrypoints are also separate: `src/editor/public` is headless,
and `src/editor/react` is the React editor surface.

Boundary rules are enforced by:

```bash
pnpm run verify:boundaries
```

## Architecture

Current split:

- `src/editor/internal/model`: canonical document, cursor, selection, command,
  markdown, clipboard, and normalization logic
- `src/editor/internal/view`: contenteditable buffering, DOM selection,
  keyboard policy, clipboard transfer, and geometry adapters
- `src/editor/internal/react`: React wiring, toolbar, document renderer, caret
  and selection overlays, debug recorder
- `src/editor/internal/debug`: interaction recording and report helpers
- `src/editor/internal/testing`: trace replay helpers

The intended ownership rule is:

- model commands mutate document and canonical selection
- view code may read DOM geometry and native input state
- React code wires events and renders state, but should not become the document
  model

## Docs

- `docs/rich-model-design.md`: design direction and model invariants
- `docs/editor-issues.md`: implementation issue history and accepted work
- `docs/editor-required-feature-list.md`: product/QA checklist of expected
  editor behavior
- `docs/editor-input-contract.md`: P0 browser input event to editor
  intent/model/selection/render contract
- `docs/editor-input-oracle-triage.md`: oracle source and triage procedure for
  new P0 input expectations
- `docs/editor-browser-input-gate.md`: Playwright browser smoke gate and IME
  manual capture split
- `docs/repo-analysis-report.md`: current confirmed-vs-ambiguous repo analysis
- `docs/editor-document-authority-audit.md`: document authority and stale-risk
  audit
- `docs/editor-document-normal-form-audit.md`: document schema and normal form
  audit
- `docs/editor-document-metadata-surface-audit.md`: document metadata and title
  surface audit
- `docs/editor-attrs-extension-surface-audit.md`: attrs compatibility and
  extension surface audit
- `docs/editor-code-block-compatibility-audit.md`: code block text and
  compatibility children audit
- `docs/editor-figure-media-trust-audit.md`: figure media source and trust
  policy audit
- `docs/editor-identity-policy-audit.md`: local document/block identity and
  collaboration policy audit
- `docs/editor-schema-migration-policy-audit.md`: schema version and migration
  policy audit
- `docs/editor-render-surface-audit.md`: document-to-DOM render surface audit
- `docs/editor-feature-coverage-audit.md`: required feature coverage split into
  confirmed, partially confirmed, and ambiguous areas
- `docs/editor-selection-model-audit.md`: canonical selection model and native
  selection policy audit
- `docs/editor-pointer-selection-audit.md`: pointer and mouse selection adapter
  audit
- `docs/editor-text-mutation-command-audit.md`: text mutation command and
  replacement policy audit
- `docs/editor-block-command-audit.md`: list depth block command and block
  editing extension audit
- `docs/editor-mark-command-audit.md`: rich text mark command and active mark
  context audit
- `docs/editor-cursor-navigation-model-audit.md`: logical cursor stream and
  navigation command audit
- `docs/editor-coordinate-hit-testing-audit.md`: coordinate to cursor point
  hit-testing fallback policy audit
- `docs/editor-markdown-adapter-audit.md`: markdown import/export adapter audit
- `docs/editor-clipboard-transfer-audit.md`: clipboard text transfer vs rich
  paste restore audit
- `docs/editor-clipboard-slice-context-audit.md`: clipboard HTML slice context
  and data-pm-slice policy audit
- `docs/editor-hidden-clipboard-fallback-audit.md`: hidden clipboard DOM
  fallback and blur/refocus policy audit
- `docs/editor-drag-dom-mutation-audit.md`: drag preparation DOM mutation and
  cleanup policy audit
- `docs/editor-link-mark-audit.md`: link mark command vs URL input policy audit
- `docs/editor-line-break-policy-audit.md`: current line-break and block split
  policy audit
- `docs/editor-keyboard-input-policy-audit.md`: keyboard ownership vs input
  adapter policy audit
- `docs/editor-keyboard-fallback-audit.md`: ignored DOM and atom keyboard
  native fallback audit
- `docs/editor-beforeinput-policy-audit.md`: beforeinput trust boundary and
  Chrome Android delete fallback audit
- `docs/editor-event-ownership-audit.md`: editor root vs node/widget DOM event
  ownership audit
- `docs/editor-contenteditable-buffer-audit.md`: native contenteditable buffer
  adapter audit
- `docs/editor-native-selection-bridge-audit.md`: DOM selection to canonical
  selection bridge audit
- `docs/editor-selection-visibility-lifecycle-audit.md`: native selection and
  custom overlay visibility lifecycle audit
- `docs/editor-shadow-selection-fallback-audit.md`: ShadowRoot selection and
  Safari fallback policy audit
- `docs/editor-scroll-focus-policy-audit.md`: scroll reveal and focus
  preventScroll policy audit
- `docs/editor-custom-selection-handoff-audit.md`: custom node selection owner
  handoff audit
- `docs/editor-widget-decoration-lifecycle-audit.md`: widget-like DOM identity,
  key, and destroy lifecycle audit
- `docs/editor-cursor-geometry-audit.md`: cursor geometry adapter audit
- `docs/editor-model-command-surface-audit.md`: headless model command surface
  audit
- `docs/editor-history-grouping-audit.md`: undo unit and history grouping audit
- `docs/editor-public-surface-audit.md`: public headless and React editor
  surface audit
- `docs/editor-read-only-policy-audit.md`: React read-only mutation policy audit
- `docs/editor-toolbar-command-audit.md`: React toolbar command bridge audit
- `docs/editor-debug-recorder-audit.md`: internal debug recorder certainty audit
- `docs/editor-verification-gate-audit.md`: internal verification gate audit
- `docs/editor-ime-trace-replay-audit.md`: internal IME trace replay audit
- `docs/editor-style-surface-audit.md`: editor style surface certainty audit
- `docs/editor-whitespace-css-policy-audit.md`: text block white-space and
  Gecko hack-node policy audit
- `docs/editor-app-route-embedding-audit.md`: app route editor embedding audit
- `docs/editor-package-surface-audit.md`: package script and dependency audit
- `docs/editor-static-assets-audit.md`: public static asset and starter residue
  audit
- `docs/editor-root-config-audit.md`: root config and scaffold residue audit
- `docs/editor-internal-module-surface-audit.md`: internal module surface and
  import direction audit
- `docs/editor-public-export-audit.md`: public facade export certainty audit
- `docs/editor-public-schema-audit.md`: public document schema validation audit
- `docs/editor-public-type-export-audit.md`: public type-only export audit
- `docs/editor-git-rename-audit.md`: current legacy-to-internal editor tree
  rename/refactor audit
- `docs/editor-visual-selection-audit.md`: functional selection overlay vs
  visual styling audit

Keep implementation status out of the design document. Use executable tests,
`docs/editor-issues.md`, and audit docs for coverage claims. Run
`pnpm run verify:docs` to keep this section aligned with top-level docs. It also
requires the `## 증거 강도` heading in every `docs/editor-*.md` file.
