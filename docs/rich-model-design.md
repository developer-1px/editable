# Rich Model Design

## Goal

`json-document` is the canonical editor state. The DOM is only a view plus a native text input buffer.

The model must support:

- Basic Markdown-shaped documents: paragraph, heading, quote, list, code block.
- Inline marks: bold, italic, code, link.
- Inline atoms: mention/chip.
- Block atoms: figure/embed treated as one cursor unit.
- Deterministic cursor behavior before/after text, inline atoms, block boundaries, and block atoms.

## External Model Notes

- ProseMirror models documents as immutable values, not mutable DOM, with inline formatting stored as marks on flat inline content. It also treats leaf nodes as one token in its position sequence.
- ProseMirror's `atom` node spec means a node has no directly editable content and should be treated as one unit in the view.
- Quill Delta requires compact/canonical content and treats embeds as length one. It also gives line formatting a concrete position by attaching it to newline characters.
- Slate separates block/inline behavior from void/non-void behavior. Void nodes are rendered by custom code rather than edited as normal text.
- Slate normalizes aggressively so editor content always has a predictable shape.
- Lexical keeps editor state as a serializable node tree plus selection, and node properties must be JSON-serializable.
- W3C Input Events explicitly target editors where JavaScript keeps a background model and renders changes to DOM; contenteditable caret movement is still not fully specified.

## Decision

Do not make Markdown source text the rich editor model.

Markdown is an import/export format, or a separate source mode. The rich model stores structure directly:

- `**bold**` becomes a text run with a `bold` mark.
- `# title` becomes a heading block.
- `- item` becomes list structure.
- `![alt](src)` becomes a figure block atom.
- `@Ada` becomes a mention inline atom.

This keeps cursor offsets over visible text and atoms, not delimiter syntax.

## Schema Shape

```ts
type Mark =
  | { type: "bold"; attrs?: Record<string, JSONValue> }
  | { type: "italic"; attrs?: Record<string, JSONValue> }
  | { type: "code"; attrs?: Record<string, JSONValue> }
  | { type: "link"; href: string; title?: string; attrs?: Record<string, JSONValue> };

type InlineNode =
  | { kind: "text"; type: "text"; text: string; marks?: Mark[] }
  | { kind: "atom"; flow: "inline"; type: "mention"; id: string; label: string; attrs?: Record<string, JSONValue> };

type TextBlock =
  | { kind: "element"; flow: "block"; id: string; type: "paragraph"; children: InlineNode[] }
  | { kind: "element"; flow: "block"; id: string; type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: InlineNode[] }
  | { kind: "element"; flow: "block"; id: string; type: "quote"; children: InlineNode[] }
  | { kind: "element"; flow: "block"; id: string; type: "listItem"; ordered: boolean; depth: number; children: InlineNode[] }
  | { kind: "element"; flow: "block"; id: string; type: "codeBlock"; language?: string; text: string };

type BlockAtom =
  | { kind: "atom"; flow: "block"; id: string; type: "figure"; src: string; alt?: string; attrs?: Record<string, JSONValue> };

type BlockNode = TextBlock | BlockAtom;

type RichDocument = {
  schemaVersion: 1;
  id: string;
  title: string;
  tags: string[];
  root: {
    kind: "element";
    flow: "block";
    id: "root";
    type: "doc";
    children: BlockNode[];
    attrs?: Record<string, JSONValue>;
  };
};
```

Figure with editable caption is not a block atom. It should become a container block later:

```ts
type FigureWithCaption = {
  id: string;
  type: "figureGroup";
  media: { type: "figure"; src: string; alt?: string };
  caption: InlineNode[];
};
```

## Normal Form

The document must always normalize to one canonical shape:

- `root.children` contains only blocks.
- Empty imported documents normalize to one paragraph.
- Text blocks have at least one inline child.
- Empty text nodes exist only as the placeholder of an otherwise empty text block.
- Adjacent text nodes with identical marks are merged.
- Empty non-placeholder text nodes are removed.
- Mark arrays are sorted in a stable order and omit false/null values.
- Inline atoms have no editable children.
- Block atoms have only `before` and `after` cursor edges.
- IDs are stable and not derived from array index.

Unlike Slate, this model does not need empty text sentinels around inline atoms because cursor points can reference atom edges directly.

## Cursor Model

The headless model exposes a logical cursor stream derived from the tree.

Text:

```txt
text("abc") => offset 0, 1, 2, 3
```

Inline atom:

```txt
mention => before, after
```

Text block:

```txt
paragraph before -> inline positions -> paragraph after
```

Block atom:

```txt
figure before -> figure after
```

Important rules:

- Atom has no inside cursor.
- Moving across an atom is `before -> after`.
- Backspace at atom `after` deletes the atom.
- Delete at atom `before` deletes the atom.
- A collapsed caret at an atom edge is not a selected atom.
- Node selection is explicit and is the only state that fills `selectedPointers`.
- Paragraph `after` and next paragraph `before` are distinct legal positions, even if their rects are close.

## Selection Model

Use explicit selection variants internally, then serialize into `json-document` selection state.

```ts
type RichSelection =
  | { type: "caret"; point: CursorPoint }
  | { type: "range"; anchor: CursorPoint; focus: CursorPoint }
  | { type: "node"; target: string };
```

Mapping:

- `caret` -> collapsed `selectionRanges`, empty `selectedPointers`.
- `range` -> non-collapsed `selectionRanges`, selected pointers only when needed for rendering.
- `node` -> `selectedPointers: [target]`, anchor/focus around the node edges.

This prevents the earlier bug where figure/mention edge carets were drawn as selected atoms.

## Commands

All non-native editing goes through command functions:

```ts
type RichCommandResult = {
  patch: JSONPatchOperation[];
  selectionAfter: SelectionSnap;
};
```

Command rules:

- Commands never read or mutate DOM.
- Commands return patches plus `selectionAfter`.
- Commands normalize the result or only emit patches that preserve normal form.
- Undo/redo stores both document patches and selection.
- Horizontal movement is headless.
- Enter, Backspace, Delete, paste, mark toggles, atom insertion are headless.
- Vertical movement asks the view for geometry, then normalizes the returned point through headless code.

## Contenteditable Policy

Keep `contenteditable`, but reduce its authority.

- Native DOM editing is allowed only inside the active text leaf.
- During native text input and IME composition, do not sync every `input` event into `json-document`.
- Flush the active text leaf on `compositionend`, `blur`, paste, toolbar command, undo/redo, arrow movement out of text, or any headless command.
- DOM mutation outside the active text leaf is prevented or reverted.
- Atom and block selection is rendered by our overlay, not trusted from browser selection drawing.

## Implementation Order

1. Extract `normalizeDocument(document)` from `textCommands.ts`.
2. Add structured marks to text nodes and make mark normalization canonical.
3. Replace ED-012 Markdown-source behavior with Markdown import/export tests.
4. Introduce `RichSelection` internally and map it to `SelectionSnap`.
5. Generalize cursor stream names from atom-only edges to `EdgeCursorPoint`.
6. Add heading/list/code block schemas without changing the cursor stream contract.
7. Add mark commands: `toggleMark`, `setLink`, `clearMarks`.
8. Keep figure as a block atom until editable caption is required.
9. Move contenteditable text buffering into its own input-buffer module.

## References

- ProseMirror Guide: https://prosemirror.net/docs/guide/
- ProseMirror Reference: https://prosemirror.net/docs/ref/
- Quill Delta: https://quilljs.com/docs/delta/
- Quill Delta Design: https://quilljs.com/docs/guides/designing-the-delta-format/
- Slate Nodes: https://docs.slatejs.org/concepts/02-nodes
- Slate Normalizing: https://docs.slatejs.org/concepts/11-normalizing
- Lexical Nodes: https://lexical.dev/docs/concepts/nodes
- Lexical Editor State: https://lexical.dev/docs/concepts/editor-state
- W3C Input Events Level 2: https://www.w3.org/TR/input-events-2/
- W3C ContentEditable Draft: https://w3c.github.io/contentEditable/
