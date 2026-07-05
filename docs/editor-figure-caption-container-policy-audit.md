# Editor Figure Caption Container Policy Audit

## Issue #75 Scope

Current `RichDocument` stores a flat `blocks` array. Each block has one text
surface (`text`, `atoms`, `ranges`) and optional extension data. The current
schema has no public nested editor, nested block children, iframe owner, or
block atom implementation.

This policy defines the future figure caption shape without changing the
current schema yet. The goal is to keep editable captions in the same canonical
document selection stream instead of mounting a nested editor.

## Schema Candidates

### Media-Only Figure Atom

A media-only figure is a block atom. It has no editable text surface and no
inside cursor points.

Future canonical shape:

```ts
type FigureBlockAtom = {
  id: string;
  type: "figure";
  src: string;
  alt?: string;
  title?: string;
  metadata?: Record<string, JSONValue>;
};
```

Compatibility with the current flat schema can use an `extension` block while
the public block union has no dedicated block atom type:

```ts
const figureAtomCandidate = {
  id: "figure-1",
  type: "extension",
  kind: "figure",
  text: "",
  atoms: {},
  ranges: {},
  data: {
    media: { src: "/image.png", alt: "Architecture diagram" },
  },
};
```

The empty `text` field is compatibility storage only. It must not become an
editable caption.

### Figure Group With Caption

An editable caption is not a block atom. It is a container block with media data
and one inline caption text surface owned by the outer document.

Future canonical shape:

```ts
type FigureGroupBlock = {
  id: string;
  type: "figureGroup";
  media: {
    type: "image" | "video" | "embed";
    src: string;
    alt?: string;
    title?: string;
    metadata?: Record<string, JSONValue>;
  };
  caption: {
    text: string;
    atoms: Record<string, RichInlineAtom>;
    ranges: Record<string, RichInlineRange>;
  };
  metadata?: Record<string, JSONValue>;
};
```

Compatibility with the current flat schema:

```ts
const figureGroupCandidate = {
  id: "figure-1",
  type: "extension",
  kind: "figureGroup",
  text: "A compact editor model.",
  atoms: {},
  ranges: {
    "caption-link": {
      type: "link",
      start: 10,
      end: 16,
      href: "https://example.com/model",
    },
  },
  data: {
    media: { type: "image", src: "/model.png", alt: "Model diagram" },
  },
};
```

In this compatibility shape, `/blocks/N/text`, `/blocks/N/atoms`, and
`/blocks/N/ranges` are the caption surface. `data.media` is the non-editable
media payload.

## Normal Form

Figure atoms:

- Have required stable `id`.
- Have required media source in the media payload.
- Have no caption text and no editable descendants.
- Normalize to a single block cursor unit.
- Delete, copy, paste, drag, and serialize as one media block.

Figure groups:

- Have required stable `id`.
- Have exactly one required `media` payload.
- Have exactly one caption inline text surface.
- Store caption atoms and ranges with offsets relative to caption text.
- Do not allow block children inside the caption.
- Do not mount a nested editor for the caption.
- Allow an empty caption as `text: ""` so a caret can be placed at caption
  offset `0` after the user chooses to edit the caption.
- Treat missing `atoms` or `ranges` as `{}` during import normalization.
- Reject or sanitize focusable controls, scripts, event handlers, and arbitrary
  style payloads in imported caption HTML.

## Cursor Stream

The media-only figure atom contributes only block edges:

```txt
previous block after
-> figure before
-> figure after
-> next block before
```

The figure group contributes media edges plus caption text points:

```txt
previous block after
-> figureGroup before
-> media before
-> media after
-> caption /blocks/N/text offset 0
-> caption /blocks/N/text offset 1..length
-> figureGroup after
-> next block before
```

Caption inline atoms follow the same rule as normal inline atoms:

```txt
caption text before atom
-> atom before
-> atom after
-> caption text after atom
```

Canonical selection rules:

- Caption carets and ranges use the same outer document selection stream as
  normal block text.
- Caption selection paths point at the caption text surface, not at an inner
  document.
- Media edges are virtual block-internal cursor points. They need an explicit
  future selection point representation before keyboard commands are
  implemented.
- A selected media node is explicit node selection, not a collapsed caret.
- Browser selection inside media chrome is never canonical caption selection.

## Keyboard Policy

Caption commands must be headless model commands. Browser native movement must
not cross from caption DOM into media DOM or neighboring blocks by itself.

| Input | Selection | Policy |
| --- | --- | --- |
| ArrowLeft | caption offset `0` | Move to `media after`, then `media before`, then previous block edge. |
| ArrowRight | `media after` | Move to caption offset `0`. |
| ArrowRight | caption end | Move to `figureGroup after`, then next block edge. |
| ArrowUp | first visual caption line | Move to `media after` or previous block by measured geometry. |
| ArrowDown | media edge | Move to closest caption caret by measured geometry. |
| Backspace | caption offset `0` | Move/select media edge first. Do not merge caption into previous block implicitly. |
| Backspace | selected media | Delete the figure group, or run an explicit product command that preserves caption as a paragraph. |
| Delete | `media before` or selected media | Delete the figure group, or run the same explicit preserve-caption command. |
| Delete | caption range | Delete only caption text and inline atoms in the range. |
| Enter | caption caret | Exit the figure group to a new paragraph after it. |
| Shift+Enter | caption caret | Optional future soft break inside caption text if multiline captions are enabled. |

## Clipboard Policy

| Selection | Copy result | Cut result | Paste result |
| --- | --- | --- | --- |
| media-only figure atom | Media block fragment plus plain fallback. | Delete the atom as one history unit. | Replace selected atom with pasted block fragment. |
| figure group node | Media plus caption fragment. | Delete the group as one history unit. | Replace selected group with sanitized blocks. |
| caption range | Caption inline fragment only. | Delete only caption text/ranges/atoms. | Insert sanitized inline content into caption. |
| media edge caret | No caption text selection. | No-op unless media is explicitly selected. | Insert block before/after figure by edge affinity. |

Current reader expectation:

- There is no rich `text/html` importer for figure captions.
- Current paste should continue to use plain text or internal rich fragments.
- Unknown figure caption HTML must not be treated as trusted document schema.

Future HTML importer expectation:

- Accept `<figure>` with one primary media child and optional `<figcaption>`.
- Import figcaption inline text, safe links, and allowed inline marks.
- Drop scripts, event handlers, arbitrary classes, unsafe URLs, and style
  declarations that are not part of the supported mark model.
- Flatten block children inside `<figcaption>` into caption text or reject the
  paste as a block paste, depending on product scope.

## Markdown, Export, And Import Boundary

Current scope:

- Keep media-only figure atom behavior separate from caption support.
- Do not add Markdown caption syntax as part of this issue.
- Do not infer a caption from a paragraph adjacent to an image during import.

Future scope:

- JSON is the canonical round-trip format for `figureGroup`.
- HTML export may emit `<figure><img><figcaption>...</figcaption></figure>`.
- HTML import may parse the same shape into `figureGroup`.
- Generic Markdown export should emit `![alt](src)` for the media and only emit
  caption text through an explicit product extension. Common Markdown has no
  portable caption syntax that round-trips without ambiguity.

## Migration And Compatibility

Figure atom to figure group:

- Preserve the block `id`.
- Move media fields into `media`.
- Create an empty caption surface.
- Place the initial caret at caption offset `0` only when the user explicitly
  starts caption editing.
- Keep undo history as one migration command if triggered by an editor action.

Figure group to figure atom:

- Allowed only when caption text, atoms, and ranges are empty.
- If caption content exists, require an explicit lossy conversion or preserve the
  caption as a following paragraph.
- Preserve media fields and stable media metadata.

Compatibility with current `extension` block:

- `kind: "figure"` means media-only block atom.
- `kind: "figureGroup"` means `text` is caption text and `data.media` is media.
- These candidates are schema-design examples only until a real producer and
  figure-specific renderer are added. The current generic `extension` text block
  rendering must not be treated as figure semantics.
- Tests for future commands must verify that caption text paths remain ordinary
  outer document paths.

## Why Not A Nested Editor

Caption selection belongs to the same document history, clipboard, and block
ordering as surrounding body text. A nested editor would introduce a second
selection owner for a short inline caption and would require special routing for
copy, cut, paste, composition, undo, redo, and arrow handoff.

The default caption design therefore uses the outer document model:

- One document state.
- One undo history.
- One clipboard serializer.
- One selection stream.
- Explicit media edge points for non-text movement.

Nested editors remain valid only when the inner content is an independent
document with independent history, schema, collaboration state, or iframe owner.
Those cases must follow the nested ownership policy in
`docs/editor-nested-editable-focus-policy-audit.md`.

## Required Trace Scenarios

| id | Scenario | Expected evidence |
| --- | --- | --- |
| FC-01 | Convert selected media-only figure atom to figure group. | Same block id, same media payload, empty caption text, caret at caption offset `0`. |
| FC-02 | ArrowRight from media edge into empty caption. | Selection becomes `/blocks/N/text` offset `0`; no nested editor focus. |
| FC-03 | Type text into caption and undo. | Caption text changes through the same document history as body text. |
| FC-04 | Backspace at caption offset `0`. | First command selects or moves to media edge; previous paragraph is not merged. |
| FC-05 | Delete selected media in a non-empty figure group. | Either deletes the whole group or runs explicit preserve-caption conversion; no silent media drop. |
| FC-06 | Enter from caption middle/end. | New paragraph after figure group; caption remains inline-only. |
| FC-07 | Copy caption range. | Clipboard contains caption inline fragment, not media payload. |
| FC-08 | Copy figure group node selection. | Clipboard contains media plus caption fragment. |
| FC-09 | Paste unsafe figcaption HTML. | Unsafe URLs, styles, classes, scripts, and event handlers are dropped before model insertion. |
| FC-10 | Export unsupported Markdown. | Media exports as image syntax; caption requires explicit extension or separate paragraph fallback. |

## Decision

Use a figure group container block for editable captions. Keep media-only figures
as block atoms. Do not put caption editing inside a nested editor, an iframe, or
a `contenteditable=false` wrapper island unless the product requirement is an
independent inner document owner.
