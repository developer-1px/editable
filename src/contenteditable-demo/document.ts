import {
  createJSONDocument,
  type JSONDocument,
  type SelectionSnap,
} from "@interactive-os/json-document";
import {
  JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
  type JsonContentEditableFragment,
  type JsonContentEditableSelectionIntentResolver,
  type JsonContentEditableTextProjection,
  type JsonContentEditableVisualLayout,
  type JsonContentEditableVisualLayoutStore,
} from "../../packages/contenteditable-web";
import {
  applyRichProjectionTextChange,
  canonicalEditableAtomAttributes,
  canonicalEditableBlockAttributes,
  canonicalEditableMarkAttributes,
  createRichBlock,
  createRichDocument,
  createRichProjection,
  EDITABLE_ATOM_ATTRIBUTE,
  EDITABLE_ATOM_TYPE_ATTRIBUTE,
  EDITABLE_BLOCK_ATTRIBUTE,
  EDITABLE_BLOCK_TYPE_ATTRIBUTE,
  EDITABLE_HEADING_LEVEL_ATTRIBUTE,
  EDITABLE_MARK_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  edit,
  RICH_TEXT_ATOM_REPLACEMENT,
  type RichBlock,
  type RichDocument,
  type RichDocumentPlan,
  RichDocumentSchema,
  type RichInlineAtom,
  type RichInlineRange,
  type RichProjection,
  type RichProjectionBlock,
  type RichProjectionSpan,
  type RichVisualLineSeed,
  richAtomsPathForTextPath,
  richBlockIndexFromTextPath,
  richBlockStyleActive,
  richInlineRangeActive,
  richModelOffsetToProjectionOffset,
  richProjectionBlockForTextPath,
  richProjectionOffsetToModelOffset,
  richProjectionTextToModelText,
  richRangesPathForTextPath,
  richTextPathForBlock,
  richTextSurfaceForBlock,
  toggleRichBlockStyleForSelection,
  toggleRichInlineRangeForSelection,
  toggleRichTaskListItem,
} from "../../packages/rich-document";

const INITIAL_MENTION_ID = "mention-ada";
const TASK_MARKER_ID = "task-marker-block-4";
const INITIAL_TEXT = `Plain text. 한글과 日本語 IME. ${RICH_TEXT_ATOM_REPLACEMENT}`;
const RICH_PARAGRAPH_TEXT = `Ranges can mix bold, italic, underline, code, highlight, and a link beside ${RICH_TEXT_ATOM_REPLACEMENT} and ${RICH_TEXT_ATOM_REPLACEMENT}.`;
const TASK_TEXT = `${RICH_TEXT_ATOM_REPLACEMENT}Keep the DOM bridge tiny and the model commands headless.`;
const QUOTE_TEXT = "The browser proves the path; the model owns the state.";
const ATTACHMENT_TEXT = `Atoms stay alive across copy and paste: ${RICH_TEXT_ATOM_REPLACEMENT}`;

export type ContentEditableDemoDocument = RichDocument;
export type RichTextMarkType = "bold" | "underline";

export const contentEditableDemoTextPath = richTextPathForBlock;
export const contentEditableDemoAtomsPathForTextPath = richAtomsPathForTextPath;
export const contentEditableDemoRangesPathForTextPath =
  richRangesPathForTextPath;

export function createContentEditableDemoValue(): ContentEditableDemoDocument {
  return createRichDocument({
    id: "contenteditable-demo",
    blocks: [
      {
        ...createRichBlock({
          id: "block-1",
          type: "paragraph",
          text: INITIAL_TEXT,
        }),
        atoms: {
          [INITIAL_MENTION_ID]: {
            type: "mention",
            userId: "ada",
            label: "@Ada",
            offset: INITIAL_TEXT.indexOf(RICH_TEXT_ATOM_REPLACEMENT),
          },
        },
      },
      createRichBlock({
        id: "block-2",
        type: "heading",
        level: 1,
        text: "Rich JSON document",
      }),
      {
        ...createRichBlock({
          id: "block-3",
          type: "paragraph",
          text: RICH_PARAGRAPH_TEXT,
        }),
        atoms: {
          "tag-core": {
            type: "tag",
            label: "#core",
            target: "core",
            offset: nthIndexOf(
              RICH_PARAGRAPH_TEXT,
              RICH_TEXT_ATOM_REPLACEMENT,
              1,
            ),
          },
          "wiki-canonical-html": {
            type: "wikiLink",
            label: "[[canonical-html]]",
            target: "canonical-editable-html",
            offset: nthIndexOf(
              RICH_PARAGRAPH_TEXT,
              RICH_TEXT_ATOM_REPLACEMENT,
              2,
            ),
          },
        },
        ranges: {
          "range-bold": rangeForText(RICH_PARAGRAPH_TEXT, "bold", "bold"),
          "range-italic": rangeForText(RICH_PARAGRAPH_TEXT, "italic", "italic"),
          "range-underline": rangeForText(
            RICH_PARAGRAPH_TEXT,
            "underline",
            "underline",
          ),
          "range-code": rangeForText(RICH_PARAGRAPH_TEXT, "code", "code"),
          "range-highlight": rangeForText(
            RICH_PARAGRAPH_TEXT,
            "highlight",
            "highlight",
          ),
          "range-link": rangeForText(RICH_PARAGRAPH_TEXT, "a link", "link", {
            href: "https://example.com/editable",
          }),
        },
      },
      {
        ...createRichBlock({
          id: "block-4",
          type: "listItem",
          listKind: "task",
          checked: false,
          text: TASK_TEXT,
        }),
        atoms: {
          [TASK_MARKER_ID]: {
            type: "taskMarker",
            label: "- [ ] ",
            checked: false,
            offset: 0,
          },
        },
        ranges: {
          "range-task-bold": rangeForText(TASK_TEXT, "DOM bridge", "bold"),
          "range-task-underline": rangeForText(
            TASK_TEXT,
            "headless",
            "underline",
          ),
        },
      },
      {
        ...createRichBlock({
          id: "block-5",
          type: "quote",
          text: QUOTE_TEXT,
        }),
        ranges: {
          "range-quote-italic": rangeForText(
            QUOTE_TEXT,
            "browser proves",
            "italic",
          ),
        },
      },
      createRichBlock({
        id: "block-6",
        type: "code",
        language: "ts",
        text: "replaceRichTextRange(document, selection, fragment)",
      }),
      {
        ...createRichBlock({
          id: "block-7",
          type: "paragraph",
          text: ATTACHMENT_TEXT,
        }),
        atoms: {
          "attachment-spec": {
            type: "attachment",
            label: "engine-spec.md",
            target: "docs/engine-spec.md",
            offset: ATTACHMENT_TEXT.indexOf(RICH_TEXT_ATOM_REPLACEMENT),
          },
        },
      },
    ],
  });
}

export function createContentEditableDemoDocument(): JSONDocument<ContentEditableDemoDocument> {
  return createJSONDocument(
    RichDocumentSchema,
    createContentEditableDemoValue(),
    {
      history: 100,
      selection: true,
      trustedInitial: true,
    },
  );
}

export function createContentEditableDemoProjection(
  document: ContentEditableDemoDocument,
  selection: SelectionSnap | null,
  composing = false,
): RichProjection {
  return createRichProjection(document, selection, {
    composing,
    revealBlockSyntax: "selected",
    revealInlineSyntax: "selected",
  });
}

export function contentEditableDemoTextProjection(
  projection: RichProjection | null,
  path: string,
): JsonContentEditableTextProjection<ContentEditableDemoDocument> | null {
  if (projection === null) {
    return null;
  }
  const block = richProjectionBlockForTextPath(projection, path);
  if (block === null) {
    return null;
  }
  return {
    editableTextToDocumentText(editableText) {
      return richProjectionTextToModelText(block, editableText);
    },
    editableOffsetToDocumentOffset(offset) {
      return richProjectionOffsetToModelOffset(block, offset);
    },
    documentOffsetToEditableOffset(offset) {
      return richModelOffsetToProjectionOffset(block, offset);
    },
    applyTextChange({ document, editableText, selection }) {
      const result = applyRichProjectionTextChange(
        document.value,
        projection,
        path,
        editableText,
        selection,
      );
      if (!result.ok) {
        return {
          ok: false,
          code: "invalid_projection",
          reason: result.reason,
        };
      }
      return {
        ok: true,
        kind: result.kind,
        patch: result.patch,
        selection: result.selectionAfter,
      };
    },
  };
}

export function createContentEditableDemoSelectionIntentResolver(
  document: JSONDocument<ContentEditableDemoDocument>,
  visualLayout: JsonContentEditableVisualLayoutStore,
): JsonContentEditableSelectionIntentResolver {
  return (intent, state) => {
    const snapshot = visualLayout.read();
    const lineSeeds =
      snapshot.layout === null
        ? null
        : richVisualLineSeedsFromMeasuredLayout(
            document.value,
            snapshot.layout,
          );
    const result = edit(
      {
        document: document.value,
        selection: state.selection,
        goalX: state.goalX,
      },
      intent,
      lineSeeds === null ? {} : { lineSeeds },
    );
    if (!result.ok || result.kind === "history") {
      return null;
    }
    return { selection: result.selectionAfter, goalX: result.goalX };
  };
}

function richVisualLineSeedsFromMeasuredLayout(
  document: ContentEditableDemoDocument,
  layout: JsonContentEditableVisualLayout,
): RichVisualLineSeed[] {
  const seeds: RichVisualLineSeed[] = [];
  const lineIndexByBlock = new Map<string, number>();
  for (const line of layout.lines) {
    const blockIndex = richBlockIndexFromTextPath(line.path);
    const block = blockIndex === null ? undefined : document.blocks[blockIndex];
    if (blockIndex === null || block === undefined) {
      continue;
    }
    const lineIndex = lineIndexByBlock.get(block.id) ?? 0;
    lineIndexByBlock.set(block.id, lineIndex + 1);
    seeds.push({
      id: line.id,
      blockId: block.id,
      blockIndex,
      path: line.path,
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      kind: line.kind,
      lineIndex,
      caretMetrics: line.carets.map((caret) => ({
        offset: caret.offset,
        x: caret.x,
      })),
    });
  }
  return seeds;
}

export function createMentionFragment(): JsonContentEditableFragment {
  const id = `mention-${Date.now().toString(36)}`;
  return {
    schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
    text: RICH_TEXT_ATOM_REPLACEMENT,
    atoms: {
      [id]: {
        type: "mention",
        userId: "ada",
        label: "@Ada",
        offset: 0,
      },
    },
  };
}

export function toggleContentEditableDemoHeading(
  document: JSONDocument<ContentEditableDemoDocument>,
  selection: SelectionSnap | null,
): void {
  commitDemoPlan(
    document,
    toggleRichBlockStyleForSelection(document.value, selection, {
      type: "heading",
      level: 1,
    }),
    "toggle heading",
  );
}

export function toggleContentEditableDemoMark(
  document: JSONDocument<ContentEditableDemoDocument>,
  type: RichTextMarkType,
  selection: SelectionSnap | null,
): void {
  commitDemoPlan(
    document,
    toggleRichInlineRangeForSelection(document.value, selection, { type }),
    `toggle ${type}`,
  );
}

export function toggleContentEditableDemoTaskMarker(
  document: JSONDocument<ContentEditableDemoDocument>,
  atomId: string,
  selection: SelectionSnap | null,
): void {
  const block = document.value.blocks.find((candidate) =>
    Object.hasOwn(candidate.atoms, atomId),
  );
  if (block === undefined) {
    return;
  }
  commitDemoPlan(
    document,
    toggleRichTaskListItem(document.value, block.id, selection),
    "toggle task",
  );
}

export function contentEditableDemoHeadingActive(
  document: ContentEditableDemoDocument,
  selection: SelectionSnap | null,
): boolean {
  return richBlockStyleActive(document, selection, {
    type: "heading",
    level: 1,
  });
}

export function contentEditableDemoMarkActive(
  document: ContentEditableDemoDocument,
  selection: SelectionSnap | null,
  type: RichTextMarkType,
): boolean {
  return richInlineRangeActive(document, selection, type);
}

export function renderContentEditableDemoContent(
  root: HTMLElement,
  document: ContentEditableDemoDocument,
  projection: RichProjection = createContentEditableDemoProjection(
    document,
    null,
  ),
): void {
  root.replaceChildren();
  document.blocks.forEach((block, blockIndex) => {
    const projectedBlock = projection.blocks[blockIndex];
    if (projectedBlock === undefined) {
      return;
    }
    const element = root.ownerDocument.createElement(blockElementName(block));
    element.className = "contenteditable-block";
    element.dataset.blockType = blockDatasetType(block);
    element.classList.toggle(
      "contenteditable-block-heading",
      block.type === "heading",
    );
    element.classList.toggle(
      "contenteditable-block-list-item",
      block.type === "listItem",
    );
    element.classList.toggle(
      "contenteditable-block-quote",
      block.type === "quote",
    );
    element.classList.toggle(
      "contenteditable-block-code",
      block.type === "code",
    );
    if (block.type === "listItem") {
      element.dataset.listKind = block.listKind;
      element.dataset.checked = block.checked === true ? "true" : "false";
    }
    if (block.type === "code" && block.language !== undefined) {
      element.dataset.language = block.language;
    }
    const attributes = canonicalEditableBlockAttributes(block, blockIndex);
    for (const [attribute, value] of Object.entries(attributes)) {
      if (attribute !== EDITABLE_TEXT_ATTRIBUTE) {
        element.setAttribute(attribute, value);
      }
    }
    renderBlockContent(element, block, projectedBlock);
    root.append(element);
  });
}

export function summarizeContentEditableDemoModel(
  document: ContentEditableDemoDocument,
) {
  return document.blocks.map((block, blockIndex) => ({
    id: block.id,
    type: blockDatasetType(block),
    surface: richTextSurfaceForBlock(blockIndex),
    textLength: block.text.length,
    atoms: Object.fromEntries(
      Object.entries(block.atoms).map(([id, atom]) => [id, atom.offset]),
    ),
    ranges: Object.fromEntries(
      Object.entries(block.ranges).map(([id, range]) => [
        id,
        {
          type: range.type,
          start: range.start,
          end: range.end,
        },
      ]),
    ),
  }));
}

export function summarizeContentEditableDemoDOM(root: HTMLElement | null) {
  if (root === null) {
    return [];
  }
  return Array.from(root.querySelectorAll(`[${EDITABLE_BLOCK_ATTRIBUTE}]`)).map(
    (block) => ({
      id: block.getAttribute(EDITABLE_BLOCK_ATTRIBUTE),
      type: block.getAttribute(EDITABLE_BLOCK_TYPE_ATTRIBUTE),
      headingLevel: block.getAttribute(EDITABLE_HEADING_LEVEL_ATTRIBUTE),
      textPath: block
        .querySelector(`[${EDITABLE_TEXT_ATTRIBUTE}]`)
        ?.getAttribute(EDITABLE_TEXT_ATTRIBUTE),
      atoms: Array.from(
        block.querySelectorAll(`[${EDITABLE_ATOM_ATTRIBUTE}]`),
      ).map((atom) => ({
        id: atom.getAttribute(EDITABLE_ATOM_ATTRIBUTE),
        type: atom.getAttribute(EDITABLE_ATOM_TYPE_ATTRIBUTE),
        text: atom.textContent,
      })),
      marks: Array.from(
        block.querySelectorAll(`[${EDITABLE_MARK_ATTRIBUTE}]`),
      ).map((mark) => ({
        type: mark.getAttribute(EDITABLE_MARK_ATTRIBUTE),
        text: mark.textContent,
      })),
    }),
  );
}

type ActiveMarks = {
  bold: boolean;
  code: boolean;
  highlight: boolean;
  italic: boolean;
  linkHref: string | null;
  strike: boolean;
  underline: boolean;
};

function commitDemoPlan(
  document: JSONDocument<ContentEditableDemoDocument>,
  plan: RichDocumentPlan,
  label: string,
): void {
  if (!plan.ok) {
    return;
  }
  document.commit(plan.patch, {
    label,
    origin: "contenteditable-demo",
    selectionAfter: plan.selectionAfter ?? undefined,
  });
}

function renderBlockContent(
  root: HTMLElement,
  block: RichBlock,
  projection: RichProjectionBlock,
): void {
  const textSurface = root.ownerDocument.createElement("span");
  textSurface.className = "contenteditable-text-surface";
  textSurface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, projection.textPath);
  root.append(textSurface);

  for (const span of projection.spans) {
    if (span.kind === "syntax") {
      appendSyntaxMarker(textSurface, span);
      continue;
    }
    if (span.kind === "atom") {
      appendAtom(textSurface, block.atoms[span.atomId], span.atomId);
      continue;
    }
    appendModelText(textSurface, block, span.modelStart, span.modelEnd);
  }

  if (textSurface.childNodes.length === 0) {
    textSurface.append(root.ownerDocument.createTextNode(""));
  }
}

function appendSyntaxMarker(root: HTMLElement, span: RichProjectionSpan): void {
  if (span.kind !== "syntax") {
    return;
  }
  const element = root.ownerDocument.createElement("span");
  element.className = "editable-syntax-marker";
  element.dataset.editableSyntax = span.role;
  element.textContent = span.marker;
  root.append(element);
}

function appendModelText(
  root: HTMLElement,
  block: RichBlock,
  start: number,
  end: number,
): void {
  let buffer = "";
  let bufferMarks = emptyActiveMarks();
  const flushText = () => {
    if (buffer.length === 0) {
      return;
    }
    appendMarkedText(root, buffer, bufferMarks);
    buffer = "";
  };

  for (let offset = start; offset < end; offset += 1) {
    const activeMarks = marksAt(block.ranges, offset);
    if (!sameActiveMarks(activeMarks, bufferMarks)) {
      flushText();
      bufferMarks = activeMarks;
    }
    buffer += block.text[offset] ?? "";
  }

  flushText();
}

function appendAtom(
  root: HTMLElement,
  atom: RichInlineAtom | undefined,
  id: string,
): void {
  if (atom === undefined) {
    root.append(root.ownerDocument.createTextNode(RICH_TEXT_ATOM_REPLACEMENT));
    return;
  }
  const element = createAtomElement(root, id, atom);
  for (const [attribute, value] of Object.entries(
    canonicalEditableAtomAttributes(id, atom),
  )) {
    element.setAttribute(attribute, value);
  }
  appendMarkedNode(root, element, emptyActiveMarks());
}

function blockElementName(block: RichBlock): keyof HTMLElementTagNameMap {
  return block.type === "heading" ? `h${block.level}` : "div";
}

function blockDatasetType(block: RichBlock): string {
  return block.type === "heading" ? `heading${block.level}` : block.type;
}

function marksAt(
  ranges: Record<string, RichInlineRange>,
  offset: number,
): ActiveMarks {
  const active = emptyActiveMarks();
  for (const range of Object.values(ranges)) {
    if (range.start <= offset && offset < range.end) {
      if (range.type === "bold") {
        active.bold = true;
      }
      if (range.type === "underline") {
        active.underline = true;
      }
      if (range.type === "italic") {
        active.italic = true;
      }
      if (range.type === "strike") {
        active.strike = true;
      }
      if (range.type === "code") {
        active.code = true;
      }
      if (range.type === "highlight") {
        active.highlight = true;
      }
      if (range.type === "link") {
        active.linkHref = range.href ?? "";
      }
    }
  }
  return active;
}

function sameActiveMarks(left: ActiveMarks, right: ActiveMarks): boolean {
  return (
    left.bold === right.bold &&
    left.code === right.code &&
    left.highlight === right.highlight &&
    left.italic === right.italic &&
    left.linkHref === right.linkHref &&
    left.strike === right.strike &&
    left.underline === right.underline
  );
}

function appendMarkedText(
  root: HTMLElement,
  text: string,
  marks: ActiveMarks,
): void {
  appendMarkedNode(root, root.ownerDocument.createTextNode(text), marks);
}

function appendMarkedNode(
  root: HTMLElement,
  node: Node,
  marks: ActiveMarks,
): void {
  let next = node;
  if (marks.linkHref !== null) {
    next = wrapMark(root, next, "span", "link", {
      className: "inline-link",
      data: { href: marks.linkHref },
    });
  }
  if (marks.highlight) {
    next = wrapMark(root, next, "mark", "highlight", {
      className: "inline-highlight",
    });
  }
  if (marks.code) {
    next = wrapMark(root, next, "code", "code", {
      className: "inline-code",
    });
  }
  if (marks.strike) {
    next = wrapMark(root, next, "s", "strike");
  }
  if (marks.underline) {
    next = wrapMark(root, next, "u", "underline");
  }
  if (marks.italic) {
    next = wrapMark(root, next, "em", "italic");
  }
  if (marks.bold) {
    next = wrapMark(root, next, "strong", "bold");
  }
  root.append(next);
}

function rangeForText(
  text: string,
  needle: string,
  type: RichInlineRange["type"],
  rest: Omit<RichInlineRange, "type" | "start" | "end"> = {},
): RichInlineRange {
  const start = text.indexOf(needle);
  if (start < 0) {
    throw new Error(`Missing range text: ${needle}`);
  }
  return {
    type,
    start,
    end: start + needle.length,
    ...rest,
  };
}

function nthIndexOf(text: string, needle: string, occurrence: number): number {
  let start = -1;
  for (let count = 0; count < occurrence; count += 1) {
    start = text.indexOf(needle, start + 1);
    if (start < 0) {
      throw new Error(`Missing occurrence ${occurrence} for ${needle}`);
    }
  }
  return start;
}

function emptyActiveMarks(): ActiveMarks {
  return {
    bold: false,
    code: false,
    highlight: false,
    italic: false,
    linkHref: null,
    strike: false,
    underline: false,
  };
}

function createAtomElement(
  root: HTMLElement,
  id: string,
  atom: RichInlineAtom,
): HTMLElement {
  const element = root.ownerDocument.createElement("span");
  element.className = atomClassName(atom);
  if (atom.type === "taskMarker") {
    const checked = atom.checked === true;
    element.dataset.taskMarkerId = id;
    element.dataset.checked = checked ? "true" : "false";
    element.setAttribute("aria-checked", checked ? "true" : "false");
    element.setAttribute("aria-label", checked ? "Completed" : "Incomplete");
    element.setAttribute("role", "checkbox");
    element.textContent = checked ? "✓" : "";
    return element;
  }

  element.textContent =
    atom.label ?? atom.text ?? atom.target ?? atom.href ?? atom.type;
  return element;
}

function atomClassName(atom: RichInlineAtom): string {
  if (atom.type === "mention") {
    return "atom-chip mention-chip";
  }
  if (atom.type === "tag") {
    return "atom-chip tag-chip";
  }
  if (atom.type === "wikiLink") {
    return "atom-chip wiki-chip";
  }
  if (atom.type === "attachment") {
    return "atom-chip attachment-chip";
  }
  if (atom.type === "taskMarker") {
    return "contenteditable-block-marker";
  }
  return "atom-chip";
}

function wrapMark<K extends keyof HTMLElementTagNameMap>(
  root: HTMLElement,
  node: Node,
  tagName: K,
  type: RichInlineRange["type"],
  options: {
    className?: string;
    data?: Record<string, string>;
  } = {},
): HTMLElementTagNameMap[K] {
  const element = root.ownerDocument.createElement(tagName);
  if (options.className !== undefined) {
    element.className = options.className;
  }
  for (const [key, value] of Object.entries(options.data ?? {})) {
    element.dataset[key] = value;
  }
  for (const [attribute, value] of Object.entries(
    canonicalEditableMarkAttributes({ type, start: 0, end: 0 }),
  )) {
    element.setAttribute(attribute, value);
  }
  element.append(node);
  return element;
}
