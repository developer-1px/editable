import type {
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";

export const RICH_DOCUMENT_SCHEMA = "interactive-os.rich-document@1";
export const RICH_FRAGMENT_SCHEMA = "interactive-os.rich-document/fragment@1";
export const RICH_FRAGMENT_MIME = "application/x-rich-document-fragment";
export const ATOM_REPLACEMENT = "\uFFFC";

type JSONPrimitive = string | number | boolean | null;
export type JSONValue =
  | JSONPrimitive
  | { readonly [key: string]: JSONValue }
  | readonly JSONValue[];
export type JSONRecord = { [key: string]: JSONValue };

export type RichBlockType =
  | "paragraph"
  | "heading"
  | "listItem"
  | "quote"
  | "code"
  | "extension";
export type RichHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type RichListKind = "bullet" | "ordered" | "task";
export type RichInlineRangeType =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "highlight"
  | "link";
export type RichAtomType = "mention" | "tag" | "wikiLink" | "attachment" | string;

export type RichInlineAtom = {
  type: RichAtomType;
  offset: number;
  label?: string;
  text?: string;
  target?: string;
  href?: string;
  data?: JSONRecord;
  [key: string]: JSONValue | undefined;
};

export type RichInlineAtomInput = {
  type: RichAtomType;
  label?: string;
  text?: string;
  target?: string;
  href?: string;
  data?: JSONRecord;
  [key: string]: JSONValue | undefined;
};

export type RichInlineRange = {
  type: RichInlineRangeType | string;
  start: number;
  end: number;
  href?: string;
  data?: JSONRecord;
  [key: string]: JSONValue | undefined;
};

export type RichInlineRangeInput = {
  type: RichInlineRangeType | string;
  href?: string;
  data?: JSONRecord;
  [key: string]: JSONValue | undefined;
};

export type RichTextSurface = {
  textPath: Pointer;
  atomsPath: Pointer;
  rangesPath: Pointer;
};

type RichTextBlockBase = {
  id: string;
  text: string;
  atoms: Record<string, RichInlineAtom>;
  ranges: Record<string, RichInlineRange>;
  metadata?: JSONRecord;
};

export type RichParagraphBlock = RichTextBlockBase & {
  type: "paragraph";
};

export type RichHeadingBlock = RichTextBlockBase & {
  type: "heading";
  level: RichHeadingLevel;
};

export type RichListItemBlock = RichTextBlockBase & {
  type: "listItem";
  listKind: RichListKind;
  indent: number;
  checked?: boolean;
};

export type RichQuoteBlock = RichTextBlockBase & {
  type: "quote";
};

export type RichCodeBlock = RichTextBlockBase & {
  type: "code";
  language?: string;
};

export type RichExtensionBlock = RichTextBlockBase & {
  type: "extension";
  kind: string;
  data?: JSONRecord;
};

export type RichBlock =
  | RichParagraphBlock
  | RichHeadingBlock
  | RichListItemBlock
  | RichQuoteBlock
  | RichCodeBlock
  | RichExtensionBlock;

export type RichDocument = {
  schema: typeof RICH_DOCUMENT_SCHEMA;
  id: string;
  blocks: RichBlock[];
  metadata?: JSONRecord;
};

export type RichTextFragment = {
  schema: typeof RICH_FRAGMENT_SCHEMA;
  text: string;
  atoms?: Record<string, RichInlineAtom>;
  ranges?: Record<string, RichInlineRange>;
};

export type RichBlockFragment = {
  schema: typeof RICH_FRAGMENT_SCHEMA;
  blocks: RichBlock[];
};

export function isRichTextFragment(value: unknown): value is RichTextFragment {
  return (
    isPlainRecord(value) &&
    value.schema === RICH_FRAGMENT_SCHEMA &&
    typeof value.text === "string" &&
    (value.atoms === undefined || isPlainRecord(value.atoms)) &&
    (value.ranges === undefined || isPlainRecord(value.ranges))
  );
}

export type RichBlockStyle =
  | { type: "paragraph" }
  | { type: "heading"; level: RichHeadingLevel }
  | { type: "listItem"; listKind: RichListKind; indent?: number; checked?: boolean }
  | { type: "quote" }
  | { type: "code"; language?: string }
  | { type: "extension"; kind: string; data?: JSONRecord };

export type RichBlockPoint = { block: number; offset: number };
export type RichBlockRange = {
  collapsed: boolean;
  start: RichBlockPoint;
  end: RichBlockPoint;
};

export type RichDocumentPlan =
  | {
      ok: true;
      value: RichDocument;
      patch: ReadonlyArray<JSONPatchOperation>;
      selectionAfter: SelectionSnap | null;
    }
  | {
      ok: false;
      code:
        | "block_not_found"
        | "empty_selection"
        | "id_conflict"
        | "invalid_range"
        | "not_adjacent"
        | "unsupported_block";
      reason: string;
    };

export type RichBlockInput =
  | { type?: "paragraph"; id: string; text?: string }
  | { type: "heading"; id: string; level: RichHeadingLevel; text?: string }
  | {
      type: "listItem";
      id: string;
      listKind: RichListKind;
      indent?: number;
      checked?: boolean;
      text?: string;
    }
  | { type: "quote"; id: string; text?: string }
  | { type: "code"; id: string; language?: string; text?: string }
  | { type: "extension"; id: string; kind: string; data?: JSONRecord; text?: string };

export function createRichDocument({
  blocks = [],
  id,
  metadata,
}: {
  id: string;
  blocks?: RichBlock[];
  metadata?: JSONRecord;
}): RichDocument {
  return {
    schema: RICH_DOCUMENT_SCHEMA,
    id,
    blocks,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

export function createRichBlock(input: RichBlockInput): RichBlock {
  const base = emptyTextBlock(input.id, input.text ?? "");
  if (input.type === "heading") {
    return { ...base, type: "heading", level: input.level };
  }
  if (input.type === "listItem") {
    return {
      ...base,
      type: "listItem",
      listKind: input.listKind,
      indent: input.indent ?? 0,
      ...(input.checked === undefined ? {} : { checked: input.checked }),
    };
  }
  if (input.type === "quote") {
    return { ...base, type: "quote" };
  }
  if (input.type === "code") {
    return {
      ...base,
      type: "code",
      ...(input.language === undefined ? {} : { language: input.language }),
    };
  }
  if (input.type === "extension") {
    return {
      ...base,
      type: "extension",
      kind: input.kind,
      ...(input.data === undefined ? {} : { data: input.data }),
    };
  }
  return { ...base, type: "paragraph" };
}

export function richTextSurfaceForBlock(blockIndex: number): RichTextSurface {
  return {
    textPath: `/blocks/${blockIndex}/text`,
    atomsPath: `/blocks/${blockIndex}/atoms`,
    rangesPath: `/blocks/${blockIndex}/ranges`,
  };
}

export function richTextPathForBlock(blockIndex: number): Pointer {
  return richTextSurfaceForBlock(blockIndex).textPath;
}

export function richAtomsPathForTextPath(textPath: Pointer): Pointer | null {
  const index = richBlockIndexFromTextPath(textPath);
  return index === null ? null : richTextSurfaceForBlock(index).atomsPath;
}

export function richRangesPathForTextPath(textPath: Pointer): Pointer | null {
  const index = richBlockIndexFromTextPath(textPath);
  return index === null ? null : richTextSurfaceForBlock(index).rangesPath;
}

export function richBlockIndexFromTextPath(textPath: Pointer): number | null {
  const match = /^\/blocks\/(\d+)\/text$/.exec(textPath);
  return match === null ? null : Number(match[1]);
}

export function richBlockRangeFromSelection(
  selection: SelectionSnap | null,
): RichBlockRange | null {
  const range =
    selection === null
      ? undefined
      : selection.selectionRanges[selection.primaryIndex];
  if (
    range === undefined ||
    typeof range.anchor === "string" ||
    typeof range.focus === "string" ||
    typeof range.anchor.offset !== "number" ||
    typeof range.focus.offset !== "number"
  ) {
    return null;
  }
  const anchorBlock = richBlockIndexFromTextPath(range.anchor.path);
  const focusBlock = richBlockIndexFromTextPath(range.focus.path);
  if (anchorBlock === null || focusBlock === null) {
    return null;
  }
  const anchor = { block: anchorBlock, offset: range.anchor.offset };
  const focus = { block: focusBlock, offset: range.focus.offset };
  const [start, end] = orderBlockPoints(anchor, focus);
  return {
    collapsed: start.block === end.block && start.offset === end.offset,
    start,
    end,
  };
}

export function richBlockStyleActive(
  document: RichDocument,
  selection: SelectionSnap | null,
  style: RichBlockStyle,
): boolean {
  const range = richBlockRangeFromSelection(selection);
  if (range === null) {
    return false;
  }
  const end = range.collapsed ? range.start.block : range.end.block;
  for (let index = range.start.block; index <= end; index += 1) {
    const block = document.blocks[index];
    if (block !== undefined && blockMatchesStyle(block, style)) {
      return true;
    }
  }
  return false;
}

export function richInlineRangeActive(
  document: RichDocument,
  selection: SelectionSnap | null,
  type: RichInlineRangeType | string,
): boolean {
  const range = richBlockRangeFromSelection(selection);
  if (range === null || range.collapsed) {
    return false;
  }
  let active = false;
  forEachSelectedBlockPart(document.blocks, range, (block, _index, part) => {
    if (
      Object.values(block.ranges).some(
        (candidate) =>
          candidate.type === type &&
          candidate.start < part.end &&
          candidate.end > part.start,
      )
    ) {
      active = true;
    }
  });
  return active;
}

export function toggleRichBlockStyleForSelection(
  document: RichDocument,
  selection: SelectionSnap | null,
  style: RichBlockStyle,
  fallback: RichBlockStyle = { type: "paragraph" },
): RichDocumentPlan {
  const range = richBlockRangeFromSelection(selection);
  if (range === null) {
    return emptySelection();
  }

  if (range.collapsed) {
    const block = document.blocks[range.start.block];
    if (block === undefined) {
      return blockNotFound(`index:${range.start.block}`);
    }
    return setRichBlockType(
      document,
      block.id,
      blockMatchesStyle(block, style) ? fallback : style,
      selection,
    );
  }

  return setRichBlockStyleForRange(document, range, style);
}

export function toggleRichInlineRangeForSelection(
  document: RichDocument,
  selection: SelectionSnap | null,
  range: RichInlineRangeInput,
): RichDocumentPlan {
  const blockRange = richBlockRangeFromSelection(selection);
  if (blockRange === null || blockRange.collapsed) {
    return emptySelection();
  }

  const nextBlocks = document.blocks.map((block) => cloneBlock(block));
  let changed = false;
  forEachSelectedBlockPart(nextBlocks, blockRange, (block, blockIndex, part) => {
    const nextBlock = toggleRangeInBlock(block, part.start, part.end, range);
    nextBlocks[blockIndex] = nextBlock;
    changed = true;
  });

  if (!changed) {
    return emptySelection();
  }
  return {
    ok: true,
    value: { ...document, blocks: nextBlocks },
    patch: [{ op: "replace", path: "/blocks", value: nextBlocks }],
    selectionAfter: selection,
  };
}

export function toggleRichTaskListItem(
  document: RichDocument,
  blockId: string,
  selectionAfter: SelectionSnap | null = null,
): RichDocumentPlan {
  const located = findBlock(document, blockId);
  if (located === null) {
    return blockNotFound(blockId);
  }
  if (
    located.block.type !== "listItem" ||
    located.block.listKind !== "task"
  ) {
    return {
      ok: false,
      code: "unsupported_block",
      reason: `Block is not a task list item: ${blockId}.`,
    };
  }

  const checked = located.block.checked !== true;
  const atoms = Object.fromEntries(
    Object.entries(located.block.atoms).map(([id, atom]) => [
      id,
      atom.type === "taskMarker"
        ? {
            ...atom,
            checked,
            label: checked ? "- [x] " : "- [ ] ",
          }
        : atom,
    ]),
  );
  const nextBlock: RichBlock = {
    ...located.block,
    checked,
    atoms,
  };
  const value = {
    ...document,
    blocks: replaceAt(document.blocks, located.index, nextBlock),
  };
  return {
    ok: true,
    value,
    patch: [
      {
        op: "replace",
        path: blockPath(located.index),
        value: nextBlock,
      },
    ],
    selectionAfter,
  };
}

export function richTextFragmentFromRange(
  document: RichDocument,
  blockId: string,
  start: number,
  end: number,
): RichTextFragment | null {
  const located = findBlock(document, blockId);
  if (located === null || !validRange(located.block.text, start, end)) {
    return null;
  }

  const fragment: RichTextFragment = {
    schema: RICH_FRAGMENT_SCHEMA,
    text: located.block.text.slice(start, end),
  };
  const atoms = selectAtoms(located.block.atoms, start, end);
  const ranges = selectRanges(located.block.ranges, start, end);
  if (Object.keys(atoms).length > 0) {
    fragment.atoms = atoms;
  }
  if (Object.keys(ranges).length > 0) {
    fragment.ranges = ranges;
  }
  return fragment;
}

export function replaceRichTextRange(
  document: RichDocument,
  blockId: string,
  start: number,
  end: number,
  replacement: string | RichTextFragment,
): RichDocumentPlan {
  const located = findBlock(document, blockId);
  if (located === null) {
    return blockNotFound(blockId);
  }
  if (!validRange(located.block.text, start, end)) {
    return invalidRange(start, end);
  }

  const fragment = normalizeTextFragment(replacement);
  const nextBlock = replaceBlockRange(located.block, start, end, fragment);
  const nextBlocks = replaceAt(document.blocks, located.index, nextBlock);
  const value = { ...document, blocks: nextBlocks };
  const path = blockPath(located.index);
  return {
    ok: true,
    value,
    patch: [{ op: "replace", path, value: nextBlock }],
    selectionAfter: selectionAt(richTextSurfaceForBlock(located.index).textPath, start + fragment.text.length),
  };
}

export function insertRichAtom(
  document: RichDocument,
  blockId: string,
  offset: number,
  atomId: string,
  atom: RichInlineAtomInput,
): RichDocumentPlan {
  return replaceRichTextRange(document, blockId, offset, offset, {
    schema: RICH_FRAGMENT_SCHEMA,
    text: ATOM_REPLACEMENT,
    atoms: {
      [atomId]: { ...atom, offset: 0 },
    },
  });
}

export function toggleRichInlineRange(
  document: RichDocument,
  blockId: string,
  start: number,
  end: number,
  range: RichInlineRangeInput,
): RichDocumentPlan {
  const located = findBlock(document, blockId);
  if (located === null) {
    return blockNotFound(blockId);
  }
  if (!validRange(located.block.text, start, end) || start === end) {
    return invalidRange(start, end);
  }

  const nextRanges: Record<string, RichInlineRange> = {};
  let removed = false;
  for (const [id, existing] of Object.entries(located.block.ranges)) {
    if (existing.type !== range.type || existing.end <= start || existing.start >= end) {
      nextRanges[id] = existing;
      continue;
    }
    removed = true;
    if (existing.start < start) {
      nextRanges[uniqueId(`${id}-left`, nextRanges)] = {
        ...existing,
        end: start,
      };
    }
    if (existing.end > end) {
      nextRanges[uniqueId(`${id}-right`, nextRanges)] = {
        ...existing,
        start: end,
      };
    }
  }

  if (!removed) {
    nextRanges[uniqueId(`range-${range.type}`, nextRanges)] = {
      ...range,
      start,
      end,
    };
  }

  const nextBlock = { ...located.block, ranges: nextRanges };
  const value = {
    ...document,
    blocks: replaceAt(document.blocks, located.index, nextBlock),
  };
  return {
    ok: true,
    value,
    patch: [
      {
        op: "replace",
        path: `${blockPath(located.index)}/ranges`,
        value: nextRanges,
      },
    ],
    selectionAfter: selectionRange(
      richTextSurfaceForBlock(located.index).textPath,
      start,
      end,
    ),
  };
}

export function setRichBlockType(
  document: RichDocument,
  blockId: string,
  input: RichBlockStyle,
  selectionAfter: SelectionSnap | null = null,
): RichDocumentPlan {
  const located = findBlock(document, blockId);
  if (located === null) {
    return blockNotFound(blockId);
  }
  const nextBlock = {
    ...createRichBlock({
      ...(input as RichBlockInput),
      id: located.block.id,
      text: located.block.text,
    }),
    atoms: located.block.atoms,
    ranges: located.block.ranges,
    ...(located.block.metadata === undefined
      ? {}
      : { metadata: located.block.metadata }),
  } satisfies RichBlock;
  const value = {
    ...document,
    blocks: replaceAt(document.blocks, located.index, nextBlock),
  };
  return {
    ok: true,
    value,
    patch: [{ op: "replace", path: blockPath(located.index), value: nextBlock }],
    selectionAfter,
  };
}

export function splitRichBlock(
  document: RichDocument,
  blockId: string,
  offset: number,
  nextBlockId: string,
): RichDocumentPlan {
  const located = findBlock(document, blockId);
  if (located === null) {
    return blockNotFound(blockId);
  }
  if (document.blocks.some((block) => block.id === nextBlockId)) {
    return {
      ok: false,
      code: "id_conflict",
      reason: `Block id already exists: ${nextBlockId}.`,
    };
  }
  if (!validRange(located.block.text, offset, offset)) {
    return invalidRange(offset, offset);
  }

  const left = sliceBlock(located.block, 0, offset, located.block.id);
  const right = sliceBlock(
    located.block,
    offset,
    located.block.text.length,
    nextBlockId,
  );
  const nextBlocks = [
    ...document.blocks.slice(0, located.index),
    left,
    right,
    ...document.blocks.slice(located.index + 1),
  ];
  const value = { ...document, blocks: nextBlocks };
  return {
    ok: true,
    value,
    patch: [{ op: "replace", path: "/blocks", value: nextBlocks }],
    selectionAfter: selectionAt(
      richTextSurfaceForBlock(located.index + 1).textPath,
      0,
    ),
  };
}

export function mergeAdjacentRichBlocks(
  document: RichDocument,
  leftBlockId: string,
  rightBlockId: string,
): RichDocumentPlan {
  const left = findBlock(document, leftBlockId);
  const right = findBlock(document, rightBlockId);
  if (left === null) {
    return blockNotFound(leftBlockId);
  }
  if (right === null) {
    return blockNotFound(rightBlockId);
  }
  if (right.index !== left.index + 1) {
    return {
      ok: false,
      code: "not_adjacent",
      reason: `${leftBlockId} and ${rightBlockId} are not adjacent blocks.`,
    };
  }

  const offset = left.block.text.length;
  const merged: RichBlock = {
    ...left.block,
    text: left.block.text + right.block.text,
    atoms: {
      ...left.block.atoms,
      ...shiftAtoms(right.block.atoms, offset, left.block.atoms),
    },
    ranges: {
      ...left.block.ranges,
      ...shiftRanges(right.block.ranges, offset, left.block.ranges),
    },
  };
  const nextBlocks = [
    ...document.blocks.slice(0, left.index),
    merged,
    ...document.blocks.slice(right.index + 1),
  ];
  const value = { ...document, blocks: nextBlocks };
  return {
    ok: true,
    value,
    patch: [{ op: "replace", path: "/blocks", value: nextBlocks }],
    selectionAfter: selectionAt(richTextSurfaceForBlock(left.index).textPath, offset),
  };
}


export function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length));
}

function setRichBlockStyleForRange(
  document: RichDocument,
  range: RichBlockRange,
  style: RichBlockStyle,
): RichDocumentPlan {
  const nextBlocks: RichBlock[] = [];
  let selectionStart: RichBlockPoint | null = null;
  let selectionEnd: RichBlockPoint | null = null;

  document.blocks.forEach((block, blockIndex) => {
    if (blockIndex < range.start.block || blockIndex > range.end.block) {
      nextBlocks.push(cloneBlock(block));
      return;
    }

    const selectedStart =
      blockIndex === range.start.block ? range.start.offset : 0;
    const selectedEnd =
      blockIndex === range.end.block ? range.end.offset : block.text.length;

    if (selectedStart > 0) {
      nextBlocks.push(
        sliceBlock(
          block,
          0,
          selectedStart,
          reserveBlockId(block.id, nextBlocks),
        ),
      );
    }
    if (selectedEnd > selectedStart) {
      const selectedIndex = nextBlocks.length;
      const selectedId =
        selectedStart === 0
          ? reserveBlockId(block.id, nextBlocks)
          : reserveBlockId(`${block.id}-selection`, nextBlocks);
      const selected = applyBlockStyle(
        sliceBlock(block, selectedStart, selectedEnd, selectedId),
        style,
      );
      nextBlocks.push(selected);
      selectionStart ??= { block: selectedIndex, offset: 0 };
      selectionEnd = { block: selectedIndex, offset: selected.text.length };
    }
    if (selectedEnd < block.text.length) {
      nextBlocks.push(
        sliceBlock(
          block,
          selectedEnd,
          block.text.length,
          reserveBlockId(`${block.id}-after`, nextBlocks),
        ),
      );
    }
  });

  return {
    ok: true,
    value: { ...document, blocks: nextBlocks },
    patch: [{ op: "replace", path: "/blocks", value: nextBlocks }],
    selectionAfter:
      selectionStart === null || selectionEnd === null
        ? blockSelectionFromRange(range.start, range.end)
        : blockSelectionFromRange(selectionStart, selectionEnd),
  };
}

function applyBlockStyle(block: RichBlock, style: RichBlockStyle): RichBlock {
  return {
    ...createRichBlock({ ...style, id: block.id, text: block.text }),
    atoms: block.atoms,
    ranges: block.ranges,
    ...(block.metadata === undefined ? {} : { metadata: block.metadata }),
  };
}

function toggleRangeInBlock(
  block: RichBlock,
  start: number,
  end: number,
  range: RichInlineRangeInput,
): RichBlock {
  const nextRanges: Record<string, RichInlineRange> = {};
  let removed = false;
  for (const [id, existing] of Object.entries(block.ranges)) {
    if (
      existing.type !== range.type ||
      existing.end <= start ||
      existing.start >= end
    ) {
      nextRanges[id] = existing;
      continue;
    }
    removed = true;
    if (existing.start < start) {
      nextRanges[uniqueId(`${id}-left`, nextRanges)] = {
        ...existing,
        end: start,
      };
    }
    if (existing.end > end) {
      nextRanges[uniqueId(`${id}-right`, nextRanges)] = {
        ...existing,
        start: end,
      };
    }
  }

  if (!removed) {
    nextRanges[uniqueId(`range-${range.type}`, nextRanges)] = {
      ...range,
      start,
      end,
    };
  }

  return { ...block, ranges: nextRanges };
}

function forEachSelectedBlockPart(
  blocks: ReadonlyArray<RichBlock>,
  range: RichBlockRange,
  callback: (
    block: RichBlock,
    blockIndex: number,
    part: { start: number; end: number },
  ) => void,
): void {
  for (
    let blockIndex = range.start.block;
    blockIndex <= range.end.block;
    blockIndex += 1
  ) {
    const block = blocks[blockIndex];
    if (block === undefined) {
      continue;
    }
    const start = blockIndex === range.start.block ? range.start.offset : 0;
    const end =
      blockIndex === range.end.block ? range.end.offset : block.text.length;
    if (start < end) {
      callback(block, blockIndex, { start, end });
    }
  }
}

function blockMatchesStyle(block: RichBlock, style: RichBlockStyle): boolean {
  if (block.type !== style.type) {
    return false;
  }
  if (style.type === "heading") {
    return block.type === "heading" && block.level === style.level;
  }
  if (style.type === "listItem") {
    return (
      block.type === "listItem" &&
      block.listKind === style.listKind &&
      block.indent === (style.indent ?? 0) &&
      block.checked === style.checked
    );
  }
  if (style.type === "code") {
    return block.type === "code" && block.language === style.language;
  }
  if (style.type === "extension") {
    return block.type === "extension" && block.kind === style.kind;
  }
  return true;
}

function emptyTextBlock(id: string, text: string): RichTextBlockBase {
  return {
    id,
    text,
    atoms: {},
    ranges: {},
  };
}

function normalizeTextFragment(replacement: string | RichTextFragment): RichTextFragment {
  return typeof replacement === "string"
    ? { schema: RICH_FRAGMENT_SCHEMA, text: replacement }
    : replacement;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function replaceBlockRange(
  block: RichBlock,
  start: number,
  end: number,
  fragment: RichTextFragment,
): RichBlock {
  const delta = fragment.text.length - (end - start);
  return {
    ...block,
    text: block.text.slice(0, start) + fragment.text + block.text.slice(end),
    atoms: replaceAtoms(block.atoms, start, end, delta, fragment.atoms ?? {}),
    ranges: replaceRanges(
      block.ranges,
      start,
      end,
      fragment.text.length,
      delta,
      fragment.ranges ?? {},
    ),
  };
}

function replaceAtoms(
  atoms: Record<string, RichInlineAtom>,
  start: number,
  end: number,
  delta: number,
  insertedAtoms: Record<string, RichInlineAtom>,
): Record<string, RichInlineAtom> {
  const next: Record<string, RichInlineAtom> = {};
  for (const [id, atom] of Object.entries(atoms)) {
    if (atom.offset >= start && atom.offset < end) {
      continue;
    }
    next[id] = {
      ...atom,
      offset: atom.offset >= end ? atom.offset + delta : atom.offset,
    };
  }
  for (const [id, atom] of Object.entries(insertedAtoms)) {
    next[uniqueId(id, next)] = {
      ...atom,
      offset: start + atom.offset,
    };
  }
  return next;
}

function replaceRanges(
  ranges: Record<string, RichInlineRange>,
  start: number,
  end: number,
  insertedLength: number,
  delta: number,
  insertedRanges: Record<string, RichInlineRange>,
): Record<string, RichInlineRange> {
  const next: Record<string, RichInlineRange> = {};
  for (const [id, range] of Object.entries(ranges)) {
    if (range.end <= start) {
      next[id] = range;
      continue;
    }
    if (range.start >= end) {
      next[id] = {
        ...range,
        start: range.start + delta,
        end: range.end + delta,
      };
      continue;
    }
    if (range.start < start) {
      next[uniqueId(`${id}-left`, next)] = { ...range, end: start };
    }
    if (range.end > end) {
      next[uniqueId(`${id}-right`, next)] = {
        ...range,
        start: start + insertedLength,
        end: range.end + delta,
      };
    }
  }
  for (const [id, range] of Object.entries(insertedRanges)) {
    next[uniqueId(id, next)] = {
      ...range,
      start: start + range.start,
      end: start + range.end,
    };
  }
  return next;
}

function selectAtoms(
  atoms: Record<string, RichInlineAtom>,
  start: number,
  end: number,
): Record<string, RichInlineAtom> {
  const selected: Record<string, RichInlineAtom> = {};
  for (const [id, atom] of Object.entries(atoms)) {
    if (atom.offset >= start && atom.offset < end) {
      selected[id] = { ...atom, offset: atom.offset - start };
    }
  }
  return selected;
}

function selectRanges(
  ranges: Record<string, RichInlineRange>,
  start: number,
  end: number,
): Record<string, RichInlineRange> {
  const selected: Record<string, RichInlineRange> = {};
  for (const [id, range] of Object.entries(ranges)) {
    const nextStart = Math.max(start, range.start);
    const nextEnd = Math.min(end, range.end);
    if (nextStart < nextEnd) {
      selected[id] = {
        ...range,
        start: nextStart - start,
        end: nextEnd - start,
      };
    }
  }
  return selected;
}

function sliceBlock(
  block: RichBlock,
  start: number,
  end: number,
  id: string,
): RichBlock {
  return {
    ...block,
    id,
    text: block.text.slice(start, end),
    atoms: selectAtoms(block.atoms, start, end),
    ranges: selectRanges(block.ranges, start, end),
  };
}

function shiftAtoms(
  atoms: Record<string, RichInlineAtom>,
  offset: number,
  existing: Record<string, RichInlineAtom>,
): Record<string, RichInlineAtom> {
  const next: Record<string, RichInlineAtom> = {};
  for (const [id, atom] of Object.entries(atoms)) {
    next[uniqueId(id, { ...existing, ...next })] = {
      ...atom,
      offset: atom.offset + offset,
    };
  }
  return next;
}

function shiftRanges(
  ranges: Record<string, RichInlineRange>,
  offset: number,
  existing: Record<string, RichInlineRange>,
): Record<string, RichInlineRange> {
  const next: Record<string, RichInlineRange> = {};
  for (const [id, range] of Object.entries(ranges)) {
    next[uniqueId(id, { ...existing, ...next })] = {
      ...range,
      start: range.start + offset,
      end: range.end + offset,
    };
  }
  return next;
}

function cloneBlock(block: RichBlock): RichBlock {
  return {
    ...block,
    atoms: Object.fromEntries(
      Object.entries(block.atoms).map(([id, atom]) => [id, { ...atom }]),
    ),
    ranges: Object.fromEntries(
      Object.entries(block.ranges).map(([id, range]) => [id, { ...range }]),
    ),
  };
}

function reserveBlockId(
  id: string,
  blocks: ReadonlyArray<RichBlock>,
): string {
  const existing = Object.fromEntries(blocks.map((block) => [block.id, true]));
  return uniqueId(id, existing);
}

function findBlock(
  document: RichDocument,
  blockId: string,
): { block: RichBlock; index: number } | null {
  const index = document.blocks.findIndex((block) => block.id === blockId);
  const block = document.blocks[index];
  return block === undefined ? null : { block, index };
}

function validRange(text: string, start: number, end: number): boolean {
  return (
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 0 &&
    end >= start &&
    end <= text.length
  );
}

function replaceAt<T>(array: ReadonlyArray<T>, index: number, value: T): T[] {
  return [...array.slice(0, index), value, ...array.slice(index + 1)];
}

export function uniqueId(id: string, records: Record<string, unknown>): string {
  if (records[id] === undefined) {
    return id;
  }
  let index = 2;
  while (records[`${id}-${index}`] !== undefined) {
    index += 1;
  }
  return `${id}-${index}`;
}

function selectionAt(path: Pointer, offset: number): SelectionSnap {
  return selectionRange(path, offset, offset);
}

function selectionRange(path: Pointer, start: number, end: number): SelectionSnap {
  const anchor = { path, offset: start };
  const focus = { path, offset: end };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

function blockSelectionFromRange(
  anchor: RichBlockPoint,
  focus: RichBlockPoint,
): SelectionSnap {
  const anchorPoint = {
    path: richTextPathForBlock(anchor.block),
    offset: anchor.offset,
  };
  const focusPoint = {
    path: richTextPathForBlock(focus.block),
    offset: focus.offset,
  };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor: anchorPoint, focus: focusPoint }],
    primaryIndex: 0,
    anchor: anchorPoint,
    focus: focusPoint,
  };
}

function orderBlockPoints(
  left: RichBlockPoint,
  right: RichBlockPoint,
): [RichBlockPoint, RichBlockPoint] {
  if (
    left.block < right.block ||
    (left.block === right.block && left.offset <= right.offset)
  ) {
    return [left, right];
  }
  return [right, left];
}

export function blockPath(index: number): Pointer {
  return `/blocks/${index}`;
}

function blockNotFound(blockId: string): RichDocumentPlan {
  return {
    ok: false,
    code: "block_not_found",
    reason: `No block found for id: ${blockId}.`,
  };
}

function invalidRange(start: number, end: number): RichDocumentPlan {
  return {
    ok: false,
    code: "invalid_range",
    reason: `Invalid text range: ${start}..${end}.`,
  };
}

function emptySelection(): RichDocumentPlan {
  return {
    ok: false,
    code: "empty_selection",
    reason: "No rich document selection is available.",
  };
}
