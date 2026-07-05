import type {
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";

export const RICH_DOCUMENT_SCHEMA = "interactive-os.rich-document@1";
export const RICH_FRAGMENT_SCHEMA = "interactive-os.rich-document/fragment@1";
export const RICH_FRAGMENT_MIME = "application/x-rich-document-fragment";
export const ATOM_REPLACEMENT = "\uFFFC";

export const EDITABLE_DOCUMENT_ATTRIBUTE = "data-editable-document";
export const EDITABLE_BLOCK_ATTRIBUTE = "data-editable-block";
export const EDITABLE_BLOCK_TYPE_ATTRIBUTE = "data-editable-block-type";
export const EDITABLE_HEADING_LEVEL_ATTRIBUTE = "data-editable-heading-level";
export const EDITABLE_ATOM_TYPE_ATTRIBUTE = "data-editable-atom-type";
export const EDITABLE_MARK_ATTRIBUTE = "data-editable-mark";
export const EDITABLE_TEXT_ATTRIBUTE = "data-editable-text";
export const EDITABLE_ATOM_ATTRIBUTE = "data-editable-atom";

export type JSONPrimitive = string | number | boolean | null;
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

export type RichProjectionPolicy = {
  revealBlockSyntax?: "selected" | "always" | "never";
  revealInlineSyntax?: "selected" | "always" | "never";
  freezeDuringComposition?: boolean;
  composing?: boolean;
};

export type RichProjection = {
  documentId: string;
  blocks: RichProjectionBlock[];
};

export type RichProjectionBlock = {
  blockId: string;
  blockIndex: number;
  textPath: Pointer;
  text: string;
  spans: RichProjectionSpan[];
};

export type RichProjectionSpan =
  | {
      kind: "content";
      projectionStart: number;
      projectionEnd: number;
      textPath: Pointer;
      modelStart: number;
      modelEnd: number;
    }
  | {
      kind: "atom";
      projectionStart: number;
      projectionEnd: number;
      textPath: Pointer;
      atomId: string;
      modelOffset: number;
    }
  | {
      kind: "syntax";
      projectionStart: number;
      projectionEnd: number;
      marker: string;
      modelOffset: number;
      role: "blockPrefix" | "rangeOpen" | "rangeClose";
      target:
        | { kind: "block"; blockId: string }
        | { kind: "range"; blockId: string; rangeId: string };
      affinity: "before" | "after";
    };

export type RichVisualLineKind = "text" | "empty" | "atom-only";

export type RichVisualCaretMetric = {
  offset: number;
  x: number;
};

export type RichVisualLineSeed = {
  id: string;
  blockId: string;
  blockIndex: number;
  path: Pointer;
  startOffset: number;
  endOffset: number;
  kind: RichVisualLineKind;
  lineIndex: number;
  caretMetrics?: ReadonlyArray<RichVisualCaretMetric>;
};

export type RichCursorAffinity = "before" | "after";
export type RichCursorDirection = "backward" | "forward" | "up" | "down";
export type RichCursorMoveUnit =
  | "grapheme"
  | "word"
  | "lineBoundary"
  | "visualLine"
  | "documentBoundary";

export type RichCursorMoveCommand = {
  unit: RichCursorMoveUnit;
  direction: RichCursorDirection;
  extend?: boolean;
};

export type RichCursorVisualAffinityEdge = "start" | "end" | "inside";

export type RichCursorVisualAffinity = {
  lineId: string;
  lineIndex: number;
  lineOrder: number;
  edge: RichCursorVisualAffinityEdge;
  column: number;
};

export type RichCursorPoint = {
  blockId: string;
  path: Pointer;
  offset: number;
  affinity: RichCursorAffinity;
  order: number;
  visualAffinity: RichCursorVisualAffinity | null;
};

export type RichVirtualSelection = {
  anchor: RichCursorPoint;
  focus: RichCursorPoint;
  goalX: number | null;
};

export type RichVirtualSelectionRange = {
  anchor: RichCursorPoint;
  focus: RichCursorPoint;
  start: RichCursorPoint;
  end: RichCursorPoint;
  collapsed: boolean;
  direction: "none" | "forward" | "backward";
};

export type RichCursorWord = {
  blockId: string;
  path: Pointer;
  startOffset: number;
  endOffset: number;
};

export type RichCursorBlockFrame = {
  blockId: string;
  blockIndex: number;
  path: Pointer;
  textLength: number;
  caretOffsets: number[];
  words: RichCursorWord[];
};

export type RichCursorLineFrame = {
  id: string;
  blockId: string;
  blockIndex: number;
  path: Pointer;
  lineIndex: number;
  order: number;
  startOffset: number;
  endOffset: number;
  carets: RichCursorCaret[];
};

export type RichCursorCaret = RichCursorPoint & {
  lineId: string;
  lineIndex: number;
  lineOrder: number;
  column: number;
  x: number;
  y: number;
  atomId: string | null;
  isLineStart: boolean;
  isLineEnd: boolean;
};

export type RichCursorFrame = {
  documentId: string;
  blocks: RichCursorBlockFrame[];
  lines: RichCursorLineFrame[];
  carets: RichCursorCaret[];
};

export type RichCursorFrameOptions = {
  lineSeeds?: ReadonlyArray<RichVisualLineSeed>;
};

export type RichProjectionTextChange =
  | {
      ok: true;
      kind: "no-change" | "text";
      patch: ReadonlyArray<JSONPatchOperation>;
      selectionAfter: SelectionSnap | null;
    }
  | {
      ok: false;
      code: "block_not_found" | "invalid_projection";
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

export function createRichProjection(
  document: RichDocument,
  selection: SelectionSnap | null,
  policy: RichProjectionPolicy = {},
): RichProjection {
  const resolved = resolveProjectionPolicy(policy);
  const range = richBlockRangeFromSelection(selection);
  return {
    documentId: document.id,
    blocks: document.blocks.map((block, blockIndex) =>
      createRichProjectionBlock(
        block,
        blockIndex,
        blockRevealState(blockIndex, range, resolved.revealBlockSyntax),
        inlineRevealState(blockIndex, range, resolved.revealInlineSyntax),
      ),
    ),
  };
}

export function richProjectionBlockForTextPath(
  projection: RichProjection,
  textPath: Pointer,
): RichProjectionBlock | null {
  return (
    projection.blocks.find((block) => block.textPath === textPath) ?? null
  );
}

export function richProjectionOffsetToModelOffset(
  block: RichProjectionBlock,
  projectionOffset: number,
): number {
  const offset = clampOffset(projectionOffset, block.text.length);
  for (const span of block.spans) {
    if (offset < span.projectionStart || offset > span.projectionEnd) {
      continue;
    }
    if (span.kind === "content") {
      return span.modelStart + clampOffset(offset - span.projectionStart, span.modelEnd - span.modelStart);
    }
    if (span.kind === "atom") {
      return span.modelOffset + (offset > span.projectionStart ? 1 : 0);
    }
    return span.modelOffset;
  }

  const before = [...block.spans]
    .reverse()
    .find((span) => span.projectionEnd <= offset);
  if (before?.kind === "content") {
    return before.modelEnd;
  }
  if (before?.kind === "atom") {
    return before.modelOffset + 1;
  }
  if (before?.kind === "syntax") {
    return before.modelOffset;
  }
  return 0;
}

export function richModelOffsetToProjectionOffset(
  block: RichProjectionBlock,
  modelOffset: number,
): number {
  const content = block.spans.find(
    (span) =>
      span.kind === "content" &&
      span.modelStart <= modelOffset &&
      modelOffset <= span.modelEnd,
  );
  if (content?.kind === "content") {
    return (
      content.projectionStart +
      clampOffset(modelOffset - content.modelStart, content.modelEnd - content.modelStart)
    );
  }

  const atom = block.spans.find(
    (span) => span.kind === "atom" && span.modelOffset === modelOffset,
  );
  if (atom?.kind === "atom") {
    return atom.projectionStart;
  }

  const before = [...block.spans]
    .reverse()
    .find((span) => {
      if (span.kind === "content") {
        return span.modelEnd <= modelOffset;
      }
      if (span.kind === "atom") {
        return span.modelOffset + 1 <= modelOffset;
      }
      return span.modelOffset <= modelOffset;
    });
  return before?.projectionEnd ?? 0;
}

export function richProjectionTextToModelText(
  block: RichProjectionBlock,
  editableText: string,
): string {
  return parseProjectionBlockText(block, editableText).text;
}

export function createRichVisualLineSeeds(
  document: RichDocument,
): RichVisualLineSeed[] {
  const seeds: RichVisualLineSeed[] = [];
  document.blocks.forEach((block, blockIndex) => {
    const path = richTextPathForBlock(blockIndex);
    let lineIndex = 0;
    let startOffset = 0;
    for (let offset = 0; offset < block.text.length; offset += 1) {
      if (block.text[offset] !== "\n") {
        continue;
      }
      seeds.push(
        createRichVisualLineSeed(block, blockIndex, path, lineIndex, startOffset, offset),
      );
      lineIndex += 1;
      startOffset = offset + 1;
    }
    seeds.push(
      createRichVisualLineSeed(
        block,
        blockIndex,
        path,
        lineIndex,
        startOffset,
        block.text.length,
      ),
    );
  });
  return seeds;
}

function createRichVisualLineSeed(
  block: RichBlock,
  blockIndex: number,
  path: Pointer,
  lineIndex: number,
  startOffset: number,
  endOffset: number,
): RichVisualLineSeed {
  return {
    id: `${block.id}:line:${lineIndex}:${startOffset}-${endOffset}`,
    blockId: block.id,
    blockIndex,
    path,
    startOffset,
    endOffset,
    kind: richVisualLineKind(block.text.slice(startOffset, endOffset)),
    lineIndex,
  };
}

function richVisualLineKind(text: string): RichVisualLineKind {
  if (text.length === 0) {
    return "empty";
  }
  return Array.from(text).every((character) => character === ATOM_REPLACEMENT)
    ? "atom-only"
    : "text";
}

export function createRichCursorFrame(
  document: RichDocument,
  options: RichCursorFrameOptions = {},
): RichCursorFrame {
  const blocks: RichCursorBlockFrame[] = [];
  const lines: RichCursorLineFrame[] = [];
  const carets: RichCursorCaret[] = [];
  const lineSeeds = options.lineSeeds ?? createRichVisualLineSeeds(document);
  const lineSeedsByBlock = new Map<string, RichVisualLineSeed[]>();
  for (const seed of lineSeeds) {
    const key = `${seed.blockId}:${seed.path}`;
    const current = lineSeedsByBlock.get(key);
    if (current === undefined) {
      lineSeedsByBlock.set(key, [seed]);
    } else {
      current.push(seed);
    }
  }
  let lineOrder = 0;

  document.blocks.forEach((block, blockIndex) => {
    const path = richTextPathForBlock(blockIndex);
    const caretOffsets = richGraphemeBoundaryOffsets(block.text);
    const words = richWordSegments(block.text).map((word) => ({
      blockId: block.id,
      path,
      startOffset: word.startOffset,
      endOffset: word.endOffset,
    }));
    blocks.push({
      blockId: block.id,
      blockIndex,
      path,
      textLength: block.text.length,
      caretOffsets,
      words,
    });

    const blockLineSeeds =
      lineSeedsByBlock.get(`${block.id}:${path}`) ??
      createRichVisualLineSeeds(createRichDocument({ id: document.id, blocks: [block] }))
        .map((seed) => ({
          ...seed,
          blockIndex,
          path,
        }));
    const sortedLineSeeds = [...blockLineSeeds].sort(
      (left, right) =>
        left.lineIndex - right.lineIndex ||
        left.startOffset - right.startOffset ||
        left.endOffset - right.endOffset,
    );
    sortedLineSeeds.forEach((seed, fallbackLineIndex) => {
      appendRichCursorLine({
        block,
        blockIndex,
        path,
        caretMetrics: seed.caretMetrics,
        lineIndex: seed.lineIndex ?? fallbackLineIndex,
        lineOrder,
        startOffset: Math.max(0, Math.min(seed.startOffset, block.text.length)),
        endOffset: Math.max(0, Math.min(seed.endOffset, block.text.length)),
        caretOffsets,
        carets,
        lines,
      });
      lineOrder += 1;
    });
  });

  return {
    documentId: document.id,
    blocks,
    lines,
    carets,
  };
}

export function richCursorPointAt(
  frame: RichCursorFrame,
  path: Pointer,
  offset: number,
  affinity: RichCursorAffinity = "after",
): RichCursorPoint | null {
  const block = frame.blocks.find((candidate) => candidate.path === path);
  if (block === undefined) {
    return null;
  }
  const caret = closestRichCaretInBlock(frame, block, offset, affinity);
  return caret === null ? null : richCursorPointFromCaret(caret, affinity);
}

export function richCursorSelectionAt(
  frame: RichCursorFrame,
  path: Pointer,
  offset: number,
  affinity: RichCursorAffinity = "after",
): RichVirtualSelection | null {
  const point = richCursorPointAt(frame, path, offset, affinity);
  if (point === null) {
    return null;
  }
  return {
    anchor: point,
    focus: point,
    goalX: null,
  };
}

export function recoverRichVirtualSelection(
  frame: RichCursorFrame,
  selection: RichVirtualSelection,
): RichVirtualSelection {
  return {
    anchor: recoverRichCursorPoint(frame, selection.anchor),
    focus: recoverRichCursorPoint(frame, selection.focus),
    goalX: selection.goalX,
  };
}

export function richVirtualSelectionRange(
  frame: RichCursorFrame,
  selection: RichVirtualSelection,
): RichVirtualSelectionRange {
  const recovered = recoverRichVirtualSelection(frame, selection);
  const direction =
    recovered.anchor.order === recovered.focus.order
      ? "none"
      : recovered.anchor.order < recovered.focus.order
        ? "forward"
        : "backward";
  const [start, end] =
    recovered.anchor.order <= recovered.focus.order
      ? [recovered.anchor, recovered.focus]
      : [recovered.focus, recovered.anchor];
  return {
    anchor: recovered.anchor,
    focus: recovered.focus,
    start,
    end,
    collapsed: start.order === end.order,
    direction,
  };
}

export function moveRichVirtualSelection(
  frame: RichCursorFrame,
  selection: RichVirtualSelection,
  command: RichCursorMoveCommand,
): RichVirtualSelection {
  if (frame.carets.length === 0) {
    return selection;
  }

  const recovered = recoverRichVirtualSelection(frame, selection);
  const range = richVirtualSelectionRange(frame, recovered);
  const focus = richCaretForPoint(frame, recovered.focus);
  if (focus === null) {
    return recovered;
  }

  const extend = command.extend === true;
  const collapseTarget =
    !extend && !range.collapsed && collapsesRangeBeforeMove(command)
      ? command.direction === "backward"
        ? richCaretForPoint(frame, range.start)
        : richCaretForPoint(frame, range.end)
      : null;
  const target =
    collapseTarget ??
    richCursorMoveTarget(frame, focus, recovered.goalX, command);
  if (target === null) {
    return recovered;
  }

  const nextFocus = richCursorPointFromCaret(target);
  return {
    anchor: extend ? recovered.anchor : nextFocus,
    focus: nextFocus,
    goalX:
      command.unit === "visualLine"
        ? recovered.goalX ?? focus.x
        : null,
  };
}

export function applyRichProjectionTextChange(
  document: RichDocument,
  projection: RichProjection,
  textPath: Pointer,
  editableText: string,
  selectionAfter: SelectionSnap | null = null,
): RichProjectionTextChange {
  const blockProjection = richProjectionBlockForTextPath(projection, textPath);
  const blockIndex = richBlockIndexFromTextPath(textPath);
  const block = blockIndex === null ? undefined : document.blocks[blockIndex];
  if (blockProjection === null || blockIndex === null || block === undefined) {
    return {
      ok: false,
      code: "block_not_found",
      reason: `No projection block found for ${textPath}.`,
    };
  }

  const parsed = parseProjectionBlockText(blockProjection, editableText);
  const nextBlock = blockFromParsedProjection(block, parsed);
  if (sameJSONValue(block, nextBlock)) {
    return {
      ok: true,
      kind: "no-change",
      patch: [],
      selectionAfter,
    };
  }
  return {
    ok: true,
    kind: "text",
    patch: [{ op: "replace", path: blockPath(blockIndex), value: nextBlock }],
    selectionAfter,
  };
}

export function canonicalEditableDocumentAttributes(
  document: Pick<RichDocument, "id">,
): Record<string, string> {
  return {
    [EDITABLE_DOCUMENT_ATTRIBUTE]: document.id,
  };
}

export function canonicalEditableBlockAttributes(
  block: RichBlock,
  blockIndex: number,
): Record<string, string> {
  const surface = richTextSurfaceForBlock(blockIndex);
  return {
    [EDITABLE_BLOCK_ATTRIBUTE]: block.id,
    [EDITABLE_BLOCK_TYPE_ATTRIBUTE]: block.type,
    [EDITABLE_TEXT_ATTRIBUTE]: surface.textPath,
    ...(block.type === "heading"
      ? { [EDITABLE_HEADING_LEVEL_ATTRIBUTE]: block.level.toString() }
      : {}),
  };
}

export function canonicalEditableAtomAttributes(
  id: string,
  atom: RichInlineAtom,
): Record<string, string> {
  return {
    [EDITABLE_ATOM_ATTRIBUTE]: id,
    [EDITABLE_ATOM_TYPE_ATTRIBUTE]: atom.type,
    contenteditable: "false",
  };
}

export function canonicalEditableMarkAttributes(
  range: RichInlineRange,
): Record<string, string> {
  return {
    [EDITABLE_MARK_ATTRIBUTE]: range.type,
  };
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

type SegmenterGranularity = "grapheme" | "word";
type SegmenterSegment = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};
type SegmenterLike = {
  segment(input: string): Iterable<SegmenterSegment>;
};
type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locale?: string | string[],
    options?: { granularity: SegmenterGranularity },
  ) => SegmenterLike;
};

function appendRichCursorLine({
  block,
  blockIndex,
  caretMetrics,
  path,
  lineIndex,
  lineOrder,
  startOffset,
  endOffset,
  caretOffsets,
  carets,
  lines,
}: {
  block: RichBlock;
  blockIndex: number;
  caretMetrics?: ReadonlyArray<RichVisualCaretMetric>;
  path: Pointer;
  lineIndex: number;
  lineOrder: number;
  startOffset: number;
  endOffset: number;
  caretOffsets: number[];
  carets: RichCursorCaret[];
  lines: RichCursorLineFrame[];
}): void {
  const lineCarets: RichCursorCaret[] = [];
  const lineId = `${block.id}:cursor-line:${lineIndex}:${startOffset}-${endOffset}`;
  const offsets = caretOffsets.filter(
    (offset) => startOffset <= offset && offset <= endOffset,
  );
  const measuredXByOffset = richMeasuredCaretXByOffset(caretMetrics);
  offsets.forEach((offset, column) => {
    const isLineStart = offset === startOffset;
    const isLineEnd = offset === endOffset;
    const x = measuredXByOffset.get(offset) ?? column;
    const caret: RichCursorCaret = {
      blockId: block.id,
      path,
      offset,
      affinity: "after",
      order: carets.length,
      visualAffinity: {
        lineId,
        lineIndex,
        lineOrder,
        edge: richCursorVisualAffinityEdge(isLineStart, isLineEnd),
        column,
      },
      lineId,
      lineIndex,
      lineOrder,
      column,
      x,
      y: lineOrder,
      atomId: atomAtCaretOffset(block, offset),
      isLineStart,
      isLineEnd,
    };
    carets.push(caret);
    lineCarets.push(caret);
  });
  lines.push({
    id: lineId,
    blockId: block.id,
    blockIndex,
    path,
    lineIndex,
    order: lineOrder,
    startOffset,
    endOffset,
    carets: lineCarets,
  });
}

function richMeasuredCaretXByOffset(
  caretMetrics: ReadonlyArray<RichVisualCaretMetric> | undefined,
): Map<number, number> {
  const measuredXByOffset = new Map<number, number>();
  if (caretMetrics === undefined) {
    return measuredXByOffset;
  }
  for (const metric of caretMetrics) {
    if (Number.isFinite(metric.offset) && Number.isFinite(metric.x)) {
      measuredXByOffset.set(metric.offset, metric.x);
    }
  }
  return measuredXByOffset;
}

function richGraphemeBoundaryOffsets(text: string): number[] {
  const offsets = new Set([0, text.length]);
  const segments = segmentRichText(text, "grapheme");
  for (const segment of segments) {
    offsets.add(segment.index);
    offsets.add(segment.index + segment.segment.length);
  }
  return sortedOffsets(offsets);
}

function richWordSegments(
  text: string,
): Array<{ startOffset: number; endOffset: number }> {
  const segments = segmentRichText(text, "word");
  return Array.from(segments)
    .filter((segment) => segment.isWordLike === true)
    .map((segment) => ({
      startOffset: segment.index,
      endOffset: segment.index + segment.segment.length,
    }));
}

function segmentRichText(
  text: string,
  granularity: SegmenterGranularity,
): Iterable<SegmenterSegment> {
  const Segmenter = (Intl as IntlWithSegmenter).Segmenter;
  if (Segmenter === undefined) {
    throw new Error("Intl.Segmenter is required for rich cursor navigation.");
  }
  return new Segmenter(undefined, { granularity }).segment(text);
}

function sortedOffsets(offsets: Set<number>): number[] {
  return Array.from(offsets).sort((left, right) => left - right);
}

function atomAtCaretOffset(block: RichBlock, offset: number): string | null {
  for (const [id, atom] of Object.entries(block.atoms)) {
    if (offset === atom.offset || offset === atom.offset + 1) {
      return id;
    }
  }
  return null;
}

function richCursorPointFromCaret(
  caret: RichCursorCaret,
  affinity: RichCursorAffinity = caret.affinity,
): RichCursorPoint {
  return {
    blockId: caret.blockId,
    path: caret.path,
    offset: caret.offset,
    affinity,
    order: caret.order,
    visualAffinity: richCursorVisualAffinityFromCaret(caret),
  };
}

function richCursorVisualAffinityFromCaret(
  caret: Pick<
    RichCursorCaret,
    "column" | "isLineEnd" | "isLineStart" | "lineId" | "lineIndex" | "lineOrder"
  >,
): RichCursorVisualAffinity {
  return {
    lineId: caret.lineId,
    lineIndex: caret.lineIndex,
    lineOrder: caret.lineOrder,
    edge: richCursorVisualAffinityEdge(caret.isLineStart, caret.isLineEnd),
    column: caret.column,
  };
}

function richCursorVisualAffinityEdge(
  isLineStart: boolean,
  isLineEnd: boolean,
): RichCursorVisualAffinityEdge {
  if (isLineStart && !isLineEnd) {
    return "start";
  }
  if (isLineEnd && !isLineStart) {
    return "end";
  }
  return "inside";
}

function recoverRichCursorPoint(
  frame: RichCursorFrame,
  point: RichCursorPoint,
): RichCursorPoint {
  const block =
    frame.blocks.find((candidate) => candidate.blockId === point.blockId) ??
    frame.blocks.find((candidate) => candidate.path === point.path);
  if (block !== undefined) {
    const caret = closestRichCaretInBlock(
      frame,
      block,
      point.offset,
      point.affinity,
      point.visualAffinity ?? null,
    );
    if (caret !== null) {
      return richCursorPointFromCaret(caret, point.affinity);
    }
  }

  const nearest = closestRichCaretByOrder(frame, point.order);
  return nearest === null ? point : richCursorPointFromCaret(nearest, point.affinity);
}

function closestRichCaretInBlock(
  frame: RichCursorFrame,
  block: RichCursorBlockFrame,
  offset: number,
  affinity: RichCursorAffinity,
  visualAffinity: RichCursorVisualAffinity | null = null,
): RichCursorCaret | null {
  const clamped = clampOffset(offset, block.textLength);
  const blockCarets = frame.carets.filter(
    (caret) => caret.blockId === block.blockId,
  );
  if (blockCarets.length === 0) {
    return null;
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let candidates: RichCursorCaret[] = [];
  for (const caret of blockCarets) {
    const distance = Math.abs(caret.offset - clamped);
    if (distance < bestDistance) {
      bestDistance = distance;
      candidates = [caret];
      continue;
    }
    if (distance === bestDistance) {
      candidates.push(caret);
    }
  }
  return preferredRichCaretCandidate(candidates, affinity, visualAffinity);
}

function closestRichCaretByOrder(
  frame: RichCursorFrame,
  order: number,
): RichCursorCaret | null {
  if (frame.carets.length === 0) {
    return null;
  }
  const clamped = clampOffset(order, frame.carets.length - 1);
  return frame.carets[clamped] ?? null;
}

function richCaretForPoint(
  frame: RichCursorFrame,
  point: RichCursorPoint,
): RichCursorCaret | null {
  const exact = preferredRichCaretCandidate(
    frame.carets.filter(
      (caret) =>
        caret.blockId === point.blockId &&
        caret.path === point.path &&
        caret.offset === point.offset,
    ),
    point.affinity,
    point.visualAffinity ?? null,
  );
  if (exact !== null) {
    return exact;
  }
  const block =
    frame.blocks.find((candidate) => candidate.blockId === point.blockId) ??
    frame.blocks.find((candidate) => candidate.path === point.path);
  return block === undefined
    ? closestRichCaretByOrder(frame, point.order)
    : closestRichCaretInBlock(
        frame,
        block,
        point.offset,
        point.affinity,
        point.visualAffinity ?? null,
      );
}

function preferredRichCaretCandidate(
  candidates: RichCursorCaret[],
  affinity: RichCursorAffinity,
  visualAffinity: RichCursorVisualAffinity | null,
): RichCursorCaret | null {
  if (candidates.length === 0) {
    return null;
  }
  if (visualAffinity !== null) {
    const sameLineId = candidates.find(
      (caret) => caret.lineId === visualAffinity.lineId,
    );
    if (sameLineId !== undefined) {
      return sameLineId;
    }

    const sameLineOrderAndEdge = candidates.find(
      (caret) =>
        caret.lineOrder === visualAffinity.lineOrder &&
        richCursorVisualAffinityFromCaret(caret).edge === visualAffinity.edge,
    );
    if (sameLineOrderAndEdge !== undefined) {
      return sameLineOrderAndEdge;
    }

    const sameLineIndexAndEdge = candidates.find(
      (caret) =>
        caret.lineIndex === visualAffinity.lineIndex &&
        richCursorVisualAffinityFromCaret(caret).edge === visualAffinity.edge,
    );
    if (sameLineIndexAndEdge !== undefined) {
      return sameLineIndexAndEdge;
    }

    const sameLineOrder = candidates.find(
      (caret) => caret.lineOrder === visualAffinity.lineOrder,
    );
    if (sameLineOrder !== undefined) {
      return sameLineOrder;
    }

    const sameLineIndex = candidates.find(
      (caret) => caret.lineIndex === visualAffinity.lineIndex,
    );
    if (sameLineIndex !== undefined) {
      return sameLineIndex;
    }

    const sameEdge = candidates.find(
      (caret) =>
        richCursorVisualAffinityFromCaret(caret).edge === visualAffinity.edge,
    );
    if (sameEdge !== undefined) {
      return sameEdge;
    }
  }

  const affinityEdge: RichCursorVisualAffinityEdge =
    affinity === "before" ? "end" : "start";
  const sameAffinityEdge = candidates.find(
    (caret) => richCursorVisualAffinityFromCaret(caret).edge === affinityEdge,
  );
  return sameAffinityEdge ?? candidates[0] ?? null;
}

function collapsesRangeBeforeMove(command: RichCursorMoveCommand): boolean {
  return (
    (command.unit === "grapheme" || command.unit === "word") &&
    (command.direction === "backward" || command.direction === "forward")
  );
}

function richCursorMoveTarget(
  frame: RichCursorFrame,
  focus: RichCursorCaret,
  goalX: number | null,
  command: RichCursorMoveCommand,
): RichCursorCaret | null {
  if (command.unit === "grapheme") {
    return moveRichCaretByOrder(frame, focus, command.direction);
  }
  if (command.unit === "word") {
    return moveRichCaretByWord(frame, focus, command.direction);
  }
  if (command.unit === "lineBoundary") {
    return moveRichCaretToLineBoundary(frame, focus, command.direction);
  }
  if (command.unit === "visualLine") {
    return moveRichCaretByVisualLine(frame, focus, goalX, command.direction);
  }
  if (command.unit === "documentBoundary") {
    return moveRichCaretToDocumentBoundary(frame, command.direction);
  }
  return null;
}

function moveRichCaretByOrder(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction === "backward") {
    return frame.carets[Math.max(0, caret.order - 1)] ?? null;
  }
  if (direction === "forward") {
    return frame.carets[Math.min(frame.carets.length - 1, caret.order + 1)] ?? null;
  }
  return caret;
}

function moveRichCaretByWord(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction !== "backward" && direction !== "forward") {
    return caret;
  }
  const blockIndex = frame.blocks.findIndex(
    (block) => block.blockId === caret.blockId,
  );
  if (blockIndex < 0) {
    return caret;
  }

  if (direction === "forward") {
    for (let index = blockIndex; index < frame.blocks.length; index += 1) {
      const block = frame.blocks[index];
      const offset = index === blockIndex ? caret.offset : 0;
      const word = block?.words.find(
        (candidate) => candidate.endOffset > offset,
      );
      if (block !== undefined && word !== undefined) {
        return closestRichCaretInBlock(frame, block, word.endOffset, "after");
      }
    }
    return frame.carets.at(-1) ?? null;
  }

  for (let index = blockIndex; index >= 0; index -= 1) {
    const block = frame.blocks[index];
    if (block === undefined) {
      continue;
    }
    const offset = index === blockIndex ? caret.offset : block.textLength;
    const word = [...block.words]
      .reverse()
      .find((candidate) => candidate.startOffset < offset);
    if (word !== undefined) {
      return closestRichCaretInBlock(frame, block, word.startOffset, "before");
    }
  }
  return frame.carets[0] ?? null;
}

function moveRichCaretToLineBoundary(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  const line = frame.lines.find((candidate) => candidate.id === caret.lineId);
  if (line === undefined || line.carets.length === 0) {
    return caret;
  }
  if (direction === "backward") {
    return line.carets[0] ?? null;
  }
  if (direction === "forward") {
    return line.carets.at(-1) ?? null;
  }
  return caret;
}

function moveRichCaretByVisualLine(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  goalX: number | null,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction !== "up" && direction !== "down") {
    return caret;
  }
  const targetLine = frame.lines.find(
    (line) => line.order === caret.lineOrder + (direction === "up" ? -1 : 1),
  );
  if (targetLine === undefined || targetLine.carets.length === 0) {
    return caret;
  }
  const x = goalX ?? caret.x;
  return targetLine.carets.reduce((best, candidate) => {
    const bestDistance = Math.abs(best.x - x);
    const candidateDistance = Math.abs(candidate.x - x);
    if (candidateDistance < bestDistance) {
      return candidate;
    }
    if (candidateDistance > bestDistance) {
      return best;
    }
    return candidate.x < best.x ? candidate : best;
  });
}

function moveRichCaretToDocumentBoundary(
  frame: RichCursorFrame,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction === "backward") {
    return frame.carets[0] ?? null;
  }
  if (direction === "forward") {
    return frame.carets.at(-1) ?? null;
  }
  return null;
}

type ResolvedProjectionPolicy = Required<RichProjectionPolicy>;
type ParsedProjectionBlock = {
  style: RichBlockStyle;
  text: string;
  ranges: Record<string, RichInlineRange>;
};

function resolveProjectionPolicy(
  policy: RichProjectionPolicy,
): ResolvedProjectionPolicy {
  const composing = policy.composing ?? false;
  const freeze = policy.freezeDuringComposition ?? true;
  return {
    revealBlockSyntax:
      composing && freeze ? "never" : (policy.revealBlockSyntax ?? "selected"),
    revealInlineSyntax:
      composing && freeze ? "never" : (policy.revealInlineSyntax ?? "selected"),
    freezeDuringComposition: freeze,
    composing,
  };
}

function blockRevealState(
  blockIndex: number,
  range: RichBlockRange | null,
  mode: ResolvedProjectionPolicy["revealBlockSyntax"],
): boolean {
  if (mode === "always") {
    return true;
  }
  if (mode === "never" || range === null) {
    return false;
  }
  return range.start.block <= blockIndex && blockIndex <= range.end.block;
}

function inlineRevealState(
  blockIndex: number,
  range: RichBlockRange | null,
  mode: ResolvedProjectionPolicy["revealInlineSyntax"],
): {
  mode: ResolvedProjectionPolicy["revealInlineSyntax"];
  range: RichBlockRange | null;
} {
  return {
    mode,
    range:
      mode === "selected" &&
      range !== null &&
      range.start.block <= blockIndex &&
      blockIndex <= range.end.block
        ? range
        : null,
  };
}

function createRichProjectionBlock(
  block: RichBlock,
  blockIndex: number,
  revealBlock: boolean,
  inlineReveal: {
    mode: ResolvedProjectionPolicy["revealInlineSyntax"];
    range: RichBlockRange | null;
  },
): RichProjectionBlock {
  const textPath = richTextPathForBlock(blockIndex);
  const spans: RichProjectionSpan[] = [];
  let text = "";

  const appendSyntax = (
    marker: string,
    role: Extract<RichProjectionSpan, { kind: "syntax" }>["role"],
    modelOffset: number,
    target: Extract<RichProjectionSpan, { kind: "syntax" }>["target"],
    affinity: Extract<RichProjectionSpan, { kind: "syntax" }>["affinity"],
  ) => {
    if (marker.length === 0) {
      return;
    }
    const start = text.length;
    text += marker;
    spans.push({
      kind: "syntax",
      projectionStart: start,
      projectionEnd: text.length,
      marker,
      modelOffset,
      role,
      target,
      affinity,
    });
  };

  const blockMarker = revealBlock ? blockSyntaxMarker(block) : null;
  if (blockMarker !== null) {
    appendSyntax(
      blockMarker,
      "blockPrefix",
      0,
      { kind: "block", blockId: block.id },
      "before",
    );
  }

  const markers = inlineMarkersForBlock(block, inlineReveal);
  const atomsByOffset = new Map(
    Object.entries(block.atoms).map(
      ([id, atom]) => [atom.offset, [id, atom] as const],
    ),
  );
  const appendContent = (start: number, end: number) => {
    let offset = start;
    while (offset < end) {
      const atom = atomsByOffset.get(offset);
      if (
        atom !== undefined &&
        block.text[offset] === ATOM_REPLACEMENT
      ) {
        const projectionStart = text.length;
        text += ATOM_REPLACEMENT;
        spans.push({
          kind: "atom",
          projectionStart,
          projectionEnd: text.length,
          textPath,
          atomId: atom[0],
          modelOffset: offset,
        });
        offset += 1;
        continue;
      }

      const chunkStart = offset;
      while (
        offset < end &&
        !(
          atomsByOffset.has(offset) &&
          block.text[offset] === ATOM_REPLACEMENT
        )
      ) {
        offset += 1;
      }
      const projectionStart = text.length;
      text += block.text.slice(chunkStart, offset);
      spans.push({
        kind: "content",
        projectionStart,
        projectionEnd: text.length,
        textPath,
        modelStart: chunkStart,
        modelEnd: offset,
      });
    }
  };

  let offset = 0;
  for (const marker of markers) {
    appendContent(offset, marker.offset);
    appendSyntax(
      marker.marker,
      marker.role,
      marker.offset,
      { kind: "range", blockId: block.id, rangeId: marker.rangeId },
      marker.role === "rangeOpen" ? "before" : "after",
    );
    offset = marker.offset;
  }
  appendContent(offset, block.text.length);

  return {
    blockId: block.id,
    blockIndex,
    textPath,
    text,
    spans,
  };
}

function blockSyntaxMarker(block: RichBlock): string | null {
  if (block.type === "heading") {
    return `${"#".repeat(block.level)} `;
  }
  if (block.type === "quote") {
    return "> ";
  }
  return null;
}

function inlineMarkersForBlock(
  block: RichBlock,
  reveal: {
    mode: ResolvedProjectionPolicy["revealInlineSyntax"];
    range: RichBlockRange | null;
  },
): Array<{
  marker: string;
  offset: number;
  rangeId: string;
  role: "rangeOpen" | "rangeClose";
}> {
  if (reveal.mode === "never") {
    return [];
  }
  const markers: Array<{
    marker: string;
    offset: number;
    rangeId: string;
    role: "rangeOpen" | "rangeClose";
  }> = [];
  for (const [rangeId, range] of Object.entries(block.ranges)) {
    const marker = inlineSyntaxMarker(range.type);
    if (marker === null) {
      continue;
    }
    if (
      reveal.mode === "selected" &&
      !rangeIntersectsSelection(range, reveal.range)
    ) {
      continue;
    }
    markers.push({ marker, offset: range.start, rangeId, role: "rangeOpen" });
    markers.push({ marker, offset: range.end, rangeId, role: "rangeClose" });
  }
  return markers.sort((left, right) => {
    if (left.offset !== right.offset) {
      return left.offset - right.offset;
    }
    if (left.role !== right.role) {
      return left.role === "rangeClose" ? -1 : 1;
    }
    return right.marker.length - left.marker.length;
  });
}

function inlineSyntaxMarker(type: string): string | null {
  if (type === "bold") {
    return "**";
  }
  if (type === "underline") {
    return "__";
  }
  if (type === "italic") {
    return "_";
  }
  if (type === "code") {
    return "`";
  }
  return null;
}

function rangeIntersectsSelection(
  range: RichInlineRange,
  selection: RichBlockRange | null,
): boolean {
  if (selection === null) {
    return false;
  }
  const start = selection.start.offset;
  const end = selection.collapsed ? start : selection.end.offset;
  return selection.collapsed
    ? range.start <= start && start <= range.end
    : range.start < end && range.end > start;
}

function parseProjectionBlockText(
  block: RichProjectionBlock,
  editableText: string,
): ParsedProjectionBlock {
  const originalStyle = blockStyleForProjection(block);
  const heading = /^(#{1,6})\s/.exec(editableText);
  const body =
    heading === null ? editableText : editableText.slice(heading[0].length);
  const inline = parseInlineProjectionSyntax(body);
  return {
    style:
      heading === null
        ? originalStyle.type === "heading"
          ? { type: "paragraph" }
          : originalStyle
        : { type: "heading", level: heading[1].length as RichHeadingLevel },
    text: inline.text,
    ranges: inline.ranges,
  };
}

function blockStyleForProjection(block: RichProjectionBlock): RichBlockStyle {
  const prefix = block.spans.find(
    (span) => span.kind === "syntax" && span.role === "blockPrefix",
  );
  if (prefix?.kind === "syntax" && /^#{1,6}\s$/.test(prefix.marker)) {
    return {
      type: "heading",
      level: (prefix.marker.trim().length || 1) as RichHeadingLevel,
    };
  }
  if (prefix?.kind === "syntax" && prefix.marker === "> ") {
    return { type: "quote" };
  }
  return { type: "paragraph" };
}

function parseInlineProjectionSyntax(text: string): {
  text: string;
  ranges: Record<string, RichInlineRange>;
} {
  let output = "";
  const ranges: Record<string, RichInlineRange> = {};
  const active = new Map<string, number>();
  let index = 0;
  while (index < text.length) {
    const marker = inlineMarkerAt(text, index);
    if (marker !== null) {
      const start = active.get(marker.type);
      if (start === undefined) {
        active.set(marker.type, output.length);
      } else {
        active.delete(marker.type);
        if (start < output.length) {
          ranges[uniqueId(`range-${marker.type}`, ranges)] = {
            type: marker.type,
            start,
            end: output.length,
          };
        }
      }
      index += marker.marker.length;
      continue;
    }
    output += text[index] ?? "";
    index += 1;
  }
  return { text: output, ranges };
}

function inlineMarkerAt(
  text: string,
  index: number,
): { type: RichInlineRangeType; marker: string } | null {
  if (text.startsWith("**", index)) {
    return { type: "bold", marker: "**" };
  }
  if (text.startsWith("__", index)) {
    return { type: "underline", marker: "__" };
  }
  if (text[index] === "`") {
    return { type: "code", marker: "`" };
  }
  if (text[index] === "_") {
    return { type: "italic", marker: "_" };
  }
  return null;
}

function blockFromParsedProjection(
  original: RichBlock,
  parsed: ParsedProjectionBlock,
): RichBlock {
  return {
    ...createRichBlock({
      ...(parsed.style as RichBlockInput),
      id: original.id,
      text: parsed.text,
    }),
    atoms: remapAtomsToText(original.atoms, parsed.text),
    ranges: {
      ...preserveUnsupportedRanges(original, parsed.text),
      ...parsed.ranges,
    },
    ...(original.metadata === undefined ? {} : { metadata: original.metadata }),
  } satisfies RichBlock;
}

function remapAtomsToText(
  atoms: Record<string, RichInlineAtom>,
  text: string,
): Record<string, RichInlineAtom> {
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === ATOM_REPLACEMENT) {
      offsets.push(index);
    }
  }
  const next: Record<string, RichInlineAtom> = {};
  Object.entries(atoms)
    .sort((left, right) => left[1].offset - right[1].offset)
    .forEach(([id, atom], index) => {
      const offset = offsets[index];
      if (offset !== undefined) {
        next[id] = { ...atom, offset };
      }
    });
  return next;
}

function preserveUnsupportedRanges(
  block: RichBlock,
  nextText: string,
): Record<string, RichInlineRange> {
  if (block.text !== nextText) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(block.ranges).filter(
      ([, range]) => inlineSyntaxMarker(range.type) === null,
    ),
  );
}

function sameJSONValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clampOffset(offset: number, length: number): number {
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

function uniqueId(id: string, records: Record<string, unknown>): string {
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

function blockPath(index: number): Pointer {
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

// The single editing interface. See edit.ts.
export {
  edit,
  type EditAlter,
  type EditDirection,
  type EditEnvironment,
  type EditErrorCode,
  type EditGranularity,
  type EditIntent,
  type EditPoint,
  type EditResult,
  type EditState,
} from "./edit";
