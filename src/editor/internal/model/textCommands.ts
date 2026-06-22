import type {
  JSONPatchOperation,
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  type CursorPointInput,
  type EdgeCursorPoint,
  normalizeCursorPoint,
  resolveCursorIndex,
  type TextCursorPoint,
} from "./cursor";
import {
  cursorPointInputFromSelection,
  moveWordLeft,
  moveWordRight,
  selectionFromCursorPoint,
} from "./cursorCommands";
import { activeMarksFromSelection } from "./markCommands";
import {
  mergeAdjacentText,
  normalizeBlocks,
  normalizeInlineChildren,
} from "./normalizer";
import {
  createDocumentRoot,
  createGeneratedBlockId,
  createParagraphBlock,
  type FigureBlockInput,
  FigureBlockSchema,
  type InlineNode,
  type InlineNodeInput,
  type InlineTextBlock,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  isTextBlock,
  type MentionInlineInput,
  MentionInlineSchema,
  type NoteBlock,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";
import {
  nextTextBoundaryOffset,
  previousTextBoundaryOffset,
  snapTextOffset,
} from "./textBoundaries";
import {
  blockAtomLocationFromPath,
  blockLocationFromPath,
  codeTextPath,
  inlineAtomLocationFromPath,
  inlinePath,
  type TextLocation,
  textInline,
  textLocationFromPath,
  textPath,
} from "./textCommandAddressing";
import {
  isTextLocationAtBlockEnd,
  isTextLocationAtBlockStart,
  selectionAfterBlockRemoval,
  selectionAtBlockEnd,
  selectionAtChildrenStart,
} from "./textCommandSelection";

export type TextCommandResult =
  | {
      ok: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: false;
      reason: string;
    };

type MentionInline = Extract<InlineNode, { type: "mention" }>;
type FigureBlock = Extract<NoteBlock, { type: "figure" }>;
type SelectedAtom =
  | {
      kind: "inline";
      blockIndex: number;
      childIndex: number;
    }
  | {
      kind: "figure";
      blockIndex: number;
    };

type SelectedDocumentRange = {
  start: CursorPoint;
  end: CursorPoint;
};

type ParagraphSplitPosition = {
  kind: "paragraph";
  blockIndex: number;
  block: InlineTextBlock;
  beforeChildren: InlineNode[];
  afterChildren: InlineNode[];
};

type CodeSplitPosition = {
  kind: "codeBlock";
  blockIndex: number;
  block: Extract<NoteBlock, { type: "codeBlock" }>;
  beforeText: string;
  afterText: string;
};

type BlockSplitPosition = {
  kind: "block";
  insertIndex: number;
};

type SplitPosition =
  | ParagraphSplitPosition
  | CodeSplitPosition
  | BlockSplitPosition;
type NonCodeSplitPosition = ParagraphSplitPosition | BlockSplitPosition;

export function insertText(
  document: NoteDocument,
  selection: SelectionSnap,
  text: string,
): TextCommandResult {
  const activeMarks = activeMarksFromSelection(selection);
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return replaceTextRange(
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      text,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithText(document, selectedAtom, text);
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithText(document, selectedRange, text);
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    const location = textLocationFromPath(document, point.path);
    if (location === null) {
      return { ok: false, reason: "Cursor text path does not exist." };
    }

    if (
      text.length > 0 &&
      activeMarks.length > 0 &&
      location.kind === "inline"
    ) {
      return replaceInlineTextRangeWithMarks(
        document,
        location,
        point.offset,
        point.offset,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(location, point.offset, point.offset, text);
  }

  return insertTextAtAtomEdge(document, point, text, activeMarks);
}

export function insertMention(
  document: NoteDocument,
  selection: SelectionSnap,
  mention: MentionInlineInput,
): TextCommandResult {
  const canonicalMention = MentionInlineSchema.parse(mention);
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return insertInlineAtomAtTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      canonicalMention,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithMention(
      document,
      selectedAtom,
      canonicalMention,
    );
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithInlineNode(
      document,
      selectedRange,
      canonicalMention,
    );
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    const location = textLocationFromPath(document, point.path);
    if (location === null) {
      return { ok: false, reason: "Cursor text path does not exist." };
    }

    return insertInlineAtomAtTextRange(
      document,
      location,
      point.offset,
      point.offset,
      canonicalMention,
    );
  }

  return insertMentionAtAtomEdge(document, point, canonicalMention);
}

export function insertInlineFragment(
  document: NoteDocument,
  selection: SelectionSnap,
  fragment: InlineNodeInput[],
): TextCommandResult {
  const children = normalizeInlineChildren(fragment);
  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    if (children.length === 1) {
      const result = replaceDocumentRangeWithInlineNode(
        document,
        selectedRange,
        children[0] as InlineNode,
      );
      if (result !== null) {
        return result;
      }
    }

    const result = replaceDocumentRangeWithText(
      document,
      selectedRange,
      inlineNodesPlainText(children),
    );
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const position = nonCodeSplitPositionFromCursorPoint(document, point);
  if (position === null) {
    return insertText(document, selection, inlineNodesPlainText(children));
  }

  if (position.kind === "paragraph") {
    return insertInlineFragmentAtParagraphPosition(position, children);
  }

  return insertInlineFragmentAtBlockPosition(position, children);
}

export function insertBlockFragment(
  document: NoteDocument,
  selection: SelectionSnap,
  fragment: NoteBlockInput[],
): TextCommandResult {
  const blocks = withFreshBlockIds(
    normalizeBlocks(createDocumentRoot(fragment).children),
  );
  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithBlockFragment(
      document,
      selectedRange,
      blocks,
    );
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const position = splitPositionFromCursorPoint(document, point);
  if (position === null) {
    return insertText(
      document,
      selection,
      blocks.map((block) => blockPlainText(block)).join("\n"),
    );
  }

  return insertBlockFragmentAtSplitPosition(document, position, blocks);
}

export function insertFigure(
  document: NoteDocument,
  selection: SelectionSnap,
  figure: FigureBlockInput,
): TextCommandResult {
  const canonicalFigure = FigureBlockSchema.parse(figure);
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return insertFigureAtTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      canonicalFigure,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithFigure(
      document,
      selectedAtom,
      canonicalFigure,
    );
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithFigure(
      document,
      selectedRange,
      canonicalFigure,
    );
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    const location = textLocationFromPath(document, point.path);
    if (location === null) {
      return { ok: false, reason: "Cursor text path does not exist." };
    }

    return insertFigureAtTextRange(
      document,
      location,
      point.offset,
      point.offset,
      canonicalFigure,
    );
  }

  return insertFigureAtAtomEdge(document, point, canonicalFigure);
}

export function deleteBackward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteSelection(document, selection, "backward");
}

export function deleteForward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteSelection(document, selection, "forward");
}

export function deleteWordBackward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteWordSelection(document, selection, "backward");
}

export function deleteWordForward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteWordSelection(document, selection, "forward");
}

export function splitParagraph(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = splitSelectedDocumentRange(document, selectedRange);
    if (result !== null) {
      return result;
    }
    const replacement = replaceDocumentRangeWithText(
      document,
      selectedRange,
      "\n",
    );
    if (replacement !== null) {
      return replacement;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    return splitParagraphAtTextPoint(document, point);
  }

  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    return splitParagraphAtInlineAtom(document, inline, point.edge);
  }

  const blockIndex = blockLocationFromPath(document, point.path);
  if (blockIndex !== null) {
    const block = document.root.children[blockIndex];
    if (isTextBlock(block)) {
      return splitParagraphAtBlockEdge(blockIndex, point.edge);
    }

    return splitParagraphAtFigure(blockIndex, point.edge);
  }

  return { ok: false, reason: "Cursor path does not exist." };
}

function deleteSelection(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
): TextCommandResult {
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return deleteTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return deleteSelectedAtom(document, selectedAtom);
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithText(document, selectedRange, "");
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    return deleteFromTextPoint(document, point, direction);
  }

  return deleteFromAtomPoint(document, point, direction);
}

function deleteWordSelection(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
): TextCommandResult {
  if (selectedDocumentRange(document, selection) !== null) {
    return deleteForward(document, selection);
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const wordSelection =
    direction === "backward"
      ? moveWordLeft(document, selection, { extend: true }).selectionAfter
      : moveWordRight(document, selection, { extend: true }).selectionAfter;

  if (selectedDocumentRange(document, wordSelection) === null) {
    return noOp(point);
  }

  return deleteForward(document, wordSelection);
}

function deleteFromTextPoint(
  document: NoteDocument,
  point: TextCursorPoint,
  direction: "backward" | "forward",
): TextCommandResult {
  const location = textLocationFromPath(document, point.path);
  if (location === null) {
    return { ok: false, reason: "Cursor text path does not exist." };
  }

  const currentOffset = snapTextOffset(
    location.text,
    point.offset,
    direction === "backward" ? "forward" : "backward",
  );
  if (direction === "backward" && currentOffset <= 0) {
    return isTextLocationAtBlockStart(document, location)
      ? mergeWithPreviousTextBlock(document, location.blockIndex)
      : noOp(point);
  }
  if (direction === "forward" && currentOffset >= location.text.length) {
    return isTextLocationAtBlockEnd(document, location)
      ? mergeWithNextTextBlock(document, location.blockIndex)
      : noOp(point);
  }

  const startOffset =
    direction === "backward"
      ? previousTextBoundaryOffset(location.text, currentOffset)
      : currentOffset;
  const endOffset =
    direction === "backward"
      ? currentOffset
      : nextTextBoundaryOffset(location.text, currentOffset);
  if (startOffset === endOffset) {
    return noOp(point);
  }

  return deleteTextRange(document, location, startOffset, endOffset);
}

function deleteFromAtomPoint(
  document: NoteDocument,
  point: EdgeCursorPoint,
  direction: "backward" | "forward",
): TextCommandResult {
  const edgeBlockIndex = blockLocationFromPath(document, point.path);
  const block =
    edgeBlockIndex === null
      ? undefined
      : document.root.children[edgeBlockIndex];
  if (edgeBlockIndex !== null && isTextBlock(block)) {
    if (direction === "backward" && point.edge === "before") {
      return mergeWithPreviousTextBlock(document, edgeBlockIndex);
    }
    if (direction === "forward" && point.edge === "after") {
      return mergeWithNextTextBlock(document, edgeBlockIndex);
    }

    return noOp(point);
  }

  const shouldDelete =
    (direction === "backward" && point.edge === "after") ||
    (direction === "forward" && point.edge === "before");
  if (!shouldDelete) {
    const inline = inlineAtomLocationFromPath(document, point.path);
    if (inline !== null) {
      if (
        direction === "backward" &&
        point.edge === "before" &&
        inline.childIndex === 0
      ) {
        return mergeWithPreviousTextBlock(document, inline.blockIndex);
      }
      const block = document.root.children[inline.blockIndex];
      if (
        direction === "forward" &&
        point.edge === "after" &&
        isInlineTextBlock(block) &&
        inline.childIndex === block.children.length - 1
      ) {
        return mergeWithNextTextBlock(document, inline.blockIndex);
      }
    }

    return noOp(point);
  }

  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    return deleteInlineAtom(document, inline.blockIndex, inline.childIndex);
  }

  const blockIndex = blockAtomLocationFromPath(document, point.path);
  if (blockIndex !== null) {
    return deleteFigureBlock(document, blockIndex);
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function deleteTextRange(
  document: NoteDocument,
  location: TextLocation,
  startOffset: number,
  endOffset: number,
): TextCommandResult {
  const nextText = [
    location.text.slice(0, startOffset),
    location.text.slice(endOffset),
  ].join("");
  const block = document.root.children[location.blockIndex];

  if (
    nextText.length > 0 ||
    location.kind === "code" ||
    !isInlineTextBlock(block) ||
    block.children.length === 1
  ) {
    return replaceTextRange(location, startOffset, endOffset, "");
  }

  const prefix = block.children.slice(0, location.childIndex);
  const children = normalizeInlineChildren([
    ...prefix,
    ...block.children.slice(location.childIndex + 1),
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${location.blockIndex}/children`,
        value: children,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      location.blockIndex,
      children,
      prefix,
    ),
  };
}

function deleteInlineAtom(
  document: NoteDocument,
  blockIndex: number,
  childIndex: number,
): TextCommandResult {
  const block = document.root.children[blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Inline atom must belong to a paragraph." };
  }

  if (block.children.length === 1) {
    const path = textPath(blockIndex, 0);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${blockIndex}/children`,
          value: [{ type: "text", text: "" }],
        },
      ],
      selectionAfter: selectionFromCursorPoint({ path, offset: 0 }),
    };
  }

  const prefix = block.children.slice(0, childIndex);
  const children = normalizeInlineChildren([
    ...prefix,
    ...block.children.slice(childIndex + 1),
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}/children`,
        value: children,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(blockIndex, children, prefix),
  };
}

function deleteFigureBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  if (document.root.children.length === 1) {
    const block = createParagraphBlock("");

    return {
      ok: true,
      patch: [{ op: "replace", path: "/root/children/0", value: block }],
      selectionAfter: selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    };
  }

  return {
    ok: true,
    patch: [{ op: "remove", path: `/root/children/${blockIndex}` }],
    selectionAfter: selectionAfterBlockRemoval(document, blockIndex),
  };
}

function deleteSelectedAtom(
  document: NoteDocument,
  atom: SelectedAtom,
): TextCommandResult {
  return atom.kind === "inline"
    ? deleteInlineAtom(document, atom.blockIndex, atom.childIndex)
    : deleteFigureBlock(document, atom.blockIndex);
}

function replaceSelectedAtomWithText(
  document: NoteDocument,
  atom: SelectedAtom,
  text: string,
): TextCommandResult {
  if (text.length === 0) {
    return deleteSelectedAtom(document, atom);
  }

  if (atom.kind === "inline") {
    const block = document.root.children[atom.blockIndex];
    if (!isInlineTextBlock(block)) {
      return { ok: false, reason: "Inline atom must belong to a paragraph." };
    }
    const replacement = textInline(text);
    const prefix = [...block.children.slice(0, atom.childIndex), replacement];
    const children = normalizeInlineChildren([
      ...prefix,
      ...block.children.slice(atom.childIndex + 1),
    ]);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${atom.blockIndex}/children`,
          value: children,
        },
      ],
      selectionAfter: selectionAfterInlinePrefix(
        atom.blockIndex,
        children,
        prefix,
      ),
    };
  }

  const block = createParagraphBlock(text);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${atom.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: textPath(atom.blockIndex, 0),
      offset: text.length,
    }),
  };
}

function replaceSelectedAtomWithMention(
  _document: NoteDocument,
  atom: SelectedAtom,
  mention: MentionInline,
): TextCommandResult {
  if (atom.kind === "inline") {
    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: inlinePath(atom.blockIndex, atom.childIndex),
          value: mention,
        },
      ],
      selectionAfter: selectionFromCursorPoint({
        path: inlinePath(atom.blockIndex, atom.childIndex),
        edge: "after",
      }),
    };
  }

  const block = {
    ...createParagraphBlock(""),
    children: [mention],
  };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${atom.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(atom.blockIndex, 0),
      edge: "after",
    }),
  };
}

function replaceSelectedAtomWithFigure(
  document: NoteDocument,
  atom: SelectedAtom,
  figure: FigureBlock,
): TextCommandResult {
  if (atom.kind === "figure") {
    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${atom.blockIndex}`,
          value: figure,
        },
      ],
      selectionAfter: selectionFromCursorPoint({
        path: `/root/children/${atom.blockIndex}`,
        edge: "after",
      }),
    };
  }

  const block = document.root.children[atom.blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Inline atom must belong to a paragraph." };
  }

  return insertFigureBetweenParagraphChildren(
    block,
    atom.blockIndex,
    block.children.slice(0, atom.childIndex),
    block.children.slice(atom.childIndex + 1),
    figure,
  );
}

function splitParagraphAtTextPoint(
  document: NoteDocument,
  point: TextCursorPoint,
): TextCommandResult {
  const location = textLocationFromPath(document, point.path);
  if (location === null) {
    return { ok: false, reason: "Cursor text path does not exist." };
  }

  const block = document.root.children[location.blockIndex];
  if (location.kind === "code") {
    return replaceTextRange(location, point.offset, point.offset, "\n");
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const child = block.children[location.childIndex];
  if (child?.type !== "text") {
    return { ok: false, reason: "Expected text child." };
  }

  const beforeText = textInline(child.text.slice(0, point.offset), child.marks);
  const afterText = textInline(child.text.slice(point.offset), child.marks);

  return splitTextBlockChildren(
    block,
    location.blockIndex,
    [...block.children.slice(0, location.childIndex), beforeText],
    [afterText, ...block.children.slice(location.childIndex + 1)],
  );
}

function splitParagraphAtInlineAtom(
  document: NoteDocument,
  location: { blockIndex: number; childIndex: number },
  edge: "before" | "after",
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const splitIndex =
    edge === "before" ? location.childIndex : location.childIndex + 1;

  return splitTextBlockChildren(
    block,
    location.blockIndex,
    block.children.slice(0, splitIndex),
    block.children.slice(splitIndex),
  );
}

function splitParagraphAtFigure(
  blockIndex: number,
  edge: "before" | "after",
): TextCommandResult {
  const insertIndex = edge === "before" ? blockIndex : blockIndex + 1;
  const block = createParagraphBlock("");

  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${insertIndex}`, value: block }],
    selectionAfter: selectionFromCursorPoint({
      path: textPath(insertIndex, 0),
      offset: 0,
    }),
  };
}

function splitParagraphAtBlockEdge(
  blockIndex: number,
  edge: "before" | "after",
): TextCommandResult {
  const insertIndex = edge === "before" ? blockIndex : blockIndex + 1;
  const block = createParagraphBlock("");

  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${insertIndex}`, value: block }],
    selectionAfter: selectionFromCursorPoint({
      path: textPath(insertIndex, 0),
      offset: 0,
    }),
  };
}

function splitTextBlockChildren(
  block: InlineTextBlock,
  blockIndex: number,
  beforeChildren: InlineNode[],
  afterChildren: InlineNode[],
): TextCommandResult {
  const selectionAfter =
    inlineUnitLength(beforeChildren) === 0 &&
    inlineUnitLength(afterChildren) > 0
      ? selectionAtChildrenStart(blockIndex, beforeChildren)
      : selectionAtChildrenStart(blockIndex + 1, afterChildren);
  const beforeBlock = {
    ...block,
    children: normalizeInlineChildren(beforeChildren),
  };
  const afterBlock = {
    ...createParagraphBlock(""),
    children: normalizeInlineChildren(afterChildren),
  };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}`,
        value: beforeBlock,
      },
      {
        op: "add",
        path: `/root/children/${blockIndex + 1}`,
        value: afterBlock,
      },
    ],
    selectionAfter,
  };
}

function mergeWithPreviousTextBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  if (blockIndex <= 0) {
    return noOp({ path: `/root/children/${blockIndex}`, edge: "before" });
  }

  const previous = document.root.children[blockIndex - 1];
  const current = document.root.children[blockIndex];
  if (isCodeBlock(previous) && isCodeBlock(current)) {
    const selectionAfter = selectionAtBlockEnd(document, blockIndex - 1);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${blockIndex - 1}/text`,
          value: previous.text + current.text,
        },
        { op: "remove", path: `/root/children/${blockIndex}` },
      ],
      selectionAfter,
    };
  }

  if (!isInlineTextBlock(previous) || !isInlineTextBlock(current)) {
    return noOp({ path: `/root/children/${blockIndex}`, edge: "before" });
  }

  const selectionAfter = selectionAtBlockEnd(document, blockIndex - 1);
  const mergedChildren = mergeAdjacentText([
    ...previous.children,
    ...current.children,
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex - 1}/children`,
        value: mergedChildren,
      },
      { op: "remove", path: `/root/children/${blockIndex}` },
    ],
    selectionAfter,
  };
}

function mergeWithNextTextBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  const current = document.root.children[blockIndex];
  const next = document.root.children[blockIndex + 1];
  if (isCodeBlock(current) && isCodeBlock(next)) {
    const selectionAfter = selectionAtBlockEnd(document, blockIndex);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${blockIndex}/text`,
          value: current.text + next.text,
        },
        { op: "remove", path: `/root/children/${blockIndex + 1}` },
      ],
      selectionAfter,
    };
  }

  if (!isInlineTextBlock(current) || !isInlineTextBlock(next)) {
    return noOp({ path: `/root/children/${blockIndex}`, edge: "after" });
  }

  const selectionAfter = selectionAtBlockEnd(document, blockIndex);
  const mergedChildren = mergeAdjacentText([
    ...current.children,
    ...next.children,
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}/children`,
        value: mergedChildren,
      },
      { op: "remove", path: `/root/children/${blockIndex + 1}` },
    ],
    selectionAfter,
  };
}

function replaceTextRange(
  location: TextLocation,
  startOffset: number,
  endOffset: number,
  replacement: string,
): TextCommandResult {
  const nextText = [
    location.text.slice(0, startOffset),
    replacement,
    location.text.slice(endOffset),
  ].join("");
  const offset = startOffset + replacement.length;

  return {
    ok: true,
    patch: [{ op: "replace", path: location.path, value: nextText }],
    selectionAfter: selectionFromCursorPoint({
      path: location.path,
      offset,
    }),
  };
}

function replaceInlineTextRangeWithMarks(
  document: NoteDocument,
  location: Extract<TextLocation, { kind: "inline" }>,
  startOffset: number,
  endOffset: number,
  replacement: string,
  replacementMarks: Extract<InlineNode, { type: "text" }>["marks"],
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected inline text block." };
  }

  const beforeText = location.text.slice(0, startOffset);
  const afterText = location.text.slice(endOffset);
  const rawChildren = [
    ...block.children.slice(0, location.childIndex),
    ...(beforeText.length === 0
      ? []
      : [textInline(beforeText, location.marks)]),
    ...(replacement.length === 0
      ? []
      : [textInline(replacement, replacementMarks)]),
    ...(afterText.length === 0 ? [] : [textInline(afterText, location.marks)]),
    ...block.children.slice(location.childIndex + 1),
  ];
  const children = normalizeInlineChildren(rawChildren);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${location.blockIndex}/children`,
        value: children,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(location.blockIndex, children, [
      ...block.children.slice(0, location.childIndex),
      ...(beforeText.length === 0
        ? []
        : [textInline(beforeText, location.marks)]),
      ...(replacement.length === 0
        ? []
        : [textInline(replacement, replacementMarks)]),
    ]),
  };
}

function noOp(point: TextCursorPoint | EdgeCursorPoint): TextCommandResult {
  return {
    ok: true,
    patch: [],
    selectionAfter: selectionFromCursorPoint(point),
  };
}

function insertInlineAtomAtTextRange(
  document: NoteDocument,
  location: TextLocation,
  startOffset: number,
  endOffset: number,
  atom: MentionInline,
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (location.kind === "code") {
    return {
      ok: false,
      reason: "Inline atoms cannot be inserted inside code blocks.",
    };
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const nextChildren: InlineNode[] = [
    ...block.children.slice(0, location.childIndex),
  ];
  const beforeText = location.text.slice(0, startOffset);
  if (beforeText.length > 0) {
    nextChildren.push(textInline(beforeText, location.marks));
  }
  const atomIndex = nextChildren.length;
  nextChildren.push(atom);
  const afterText = location.text.slice(endOffset);
  if (afterText.length > 0) {
    nextChildren.push(textInline(afterText, location.marks));
  }
  nextChildren.push(...block.children.slice(location.childIndex + 1));

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${location.blockIndex}/children`,
        value: nextChildren,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(location.blockIndex, atomIndex),
      edge: "after",
    }),
  };
}

function insertMentionAtAtomEdge(
  document: NoteDocument,
  point: EdgeCursorPoint,
  mention: MentionInline,
): TextCommandResult {
  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    const childIndex =
      point.edge === "before" ? inline.childIndex : inline.childIndex + 1;
    return addInlineAtom(inline.blockIndex, childIndex, mention);
  }

  const blockIndex = blockLocationFromPath(document, point.path);
  if (blockIndex !== null) {
    const block = document.root.children[blockIndex];
    if (isInlineTextBlock(block)) {
      return addInlineAtom(
        blockIndex,
        point.edge === "before" ? 0 : block.children.length,
        mention,
      );
    }

    return insertMentionAtFigureEdge(document, blockIndex, point.edge, mention);
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function insertMentionAtFigureEdge(
  document: NoteDocument,
  blockIndex: number,
  edge: "before" | "after",
  mention: MentionInline,
): TextCommandResult {
  if (edge === "before") {
    const previousBlockIndex = blockIndex - 1;
    const previous = document.root.children[previousBlockIndex];
    if (isInlineTextBlock(previous)) {
      return addInlineAtom(
        previousBlockIndex,
        previous.children.length,
        mention,
      );
    }

    return addParagraphWithInlineAtom(blockIndex, mention);
  }

  const nextBlockIndex = blockIndex + 1;
  const next = document.root.children[nextBlockIndex];
  if (isInlineTextBlock(next)) {
    return addInlineAtom(nextBlockIndex, 0, mention);
  }

  return addParagraphWithInlineAtom(nextBlockIndex, mention);
}

function addInlineAtom(
  blockIndex: number,
  childIndex: number,
  atom: MentionInline,
): TextCommandResult {
  return {
    ok: true,
    patch: [
      {
        op: "add",
        path: inlinePath(blockIndex, childIndex),
        value: atom,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(blockIndex, childIndex),
      edge: "after",
    }),
  };
}

function addParagraphWithInlineAtom(
  blockIndex: number,
  atom: MentionInline,
): TextCommandResult {
  const block = {
    ...createParagraphBlock(""),
    children: [atom],
  };

  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${blockIndex}`, value: block }],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(blockIndex, 0),
      edge: "after",
    }),
  };
}

function insertFigureAtTextRange(
  document: NoteDocument,
  location: TextLocation,
  startOffset: number,
  endOffset: number,
  figure: FigureBlock,
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (location.kind === "code") {
    return addFigureBlock(location.blockIndex + 1, figure);
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const beforeChildren: InlineNode[] = [
    ...block.children.slice(0, location.childIndex),
    textInline(location.text.slice(0, startOffset), location.marks),
  ];
  const afterChildren: InlineNode[] = [
    textInline(location.text.slice(endOffset), location.marks),
    ...block.children.slice(location.childIndex + 1),
  ];

  return insertFigureBetweenParagraphChildren(
    block,
    location.blockIndex,
    beforeChildren,
    afterChildren,
    figure,
  );
}

function insertFigureAtAtomEdge(
  document: NoteDocument,
  point: EdgeCursorPoint,
  figure: FigureBlock,
): TextCommandResult {
  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    const block = document.root.children[inline.blockIndex];
    if (!isInlineTextBlock(block)) {
      return { ok: false, reason: "Expected text block." };
    }
    const splitIndex =
      point.edge === "before" ? inline.childIndex : inline.childIndex + 1;

    return insertFigureBetweenParagraphChildren(
      block,
      inline.blockIndex,
      block.children.slice(0, splitIndex),
      block.children.slice(splitIndex),
      figure,
    );
  }

  const blockIndex = blockLocationFromPath(document, point.path);
  if (blockIndex !== null) {
    return addFigureBlock(
      point.edge === "before" ? blockIndex : blockIndex + 1,
      figure,
    );
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function insertFigureBetweenParagraphChildren(
  block: InlineTextBlock,
  blockIndex: number,
  beforeChildren: InlineNode[],
  afterChildren: InlineNode[],
  figure: FigureBlock,
): TextCommandResult {
  const beforeBlock = {
    ...block,
    children: normalizeInlineChildren(beforeChildren),
  };
  const afterBlock = {
    ...createParagraphBlock(""),
    children: normalizeInlineChildren(afterChildren),
  };
  const figureIndex = blockIndex + 1;

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}`,
        value: beforeBlock,
      },
      { op: "add", path: `/root/children/${figureIndex}`, value: figure },
      {
        op: "add",
        path: `/root/children/${figureIndex + 1}`,
        value: afterBlock,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: `/root/children/${figureIndex}`,
      edge: "after",
    }),
  };
}

function addFigureBlock(
  blockIndex: number,
  figure: FigureBlock,
): TextCommandResult {
  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${blockIndex}`, value: figure }],
    selectionAfter: selectionFromCursorPoint({
      path: `/root/children/${blockIndex}`,
      edge: "after",
    }),
  };
}

function insertTextAtAtomEdge(
  document: NoteDocument,
  point: EdgeCursorPoint,
  text: string,
  activeMarks: Extract<InlineNode, { type: "text" }>["marks"] = [],
): TextCommandResult {
  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    return insertTextAtInlineAtomEdge(
      document,
      inline,
      point.edge,
      text,
      activeMarks,
    );
  }

  const block = blockLocationFromPath(document, point.path);
  if (block !== null) {
    const blockNode = document.root.children[block];
    if (isTextBlock(blockNode)) {
      return point.edge === "before"
        ? insertTextAtParagraphStart(document, block, text, activeMarks)
        : insertTextAtParagraphEnd(document, block, text, activeMarks);
    }

    return insertTextAtBlockAtomEdge(
      document,
      block,
      point.edge,
      text,
      activeMarks,
    );
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function insertTextAtInlineAtomEdge(
  document: NoteDocument,
  location: { blockIndex: number; childIndex: number },
  edge: "before" | "after",
  text: string,
  activeMarks: Extract<InlineNode, { type: "text" }>["marks"] = [],
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Inline atom must belong to a paragraph." };
  }

  if (edge === "before") {
    const previousChildIndex = location.childIndex - 1;
    const previous = block.children[previousChildIndex];
    if (previous?.type === "text") {
      const path = textPath(location.blockIndex, previousChildIndex);
      if (activeMarks.length > 0) {
        return replaceInlineTextRangeWithMarks(
          document,
          {
            blockIndex: location.blockIndex,
            kind: "inline",
            childIndex: previousChildIndex,
            path,
            text: previous.text,
            marks: previous.marks,
          },
          previous.text.length,
          previous.text.length,
          text,
          activeMarks,
        );
      }

      return replaceTextRange(
        {
          blockIndex: location.blockIndex,
          kind: "inline",
          childIndex: previousChildIndex,
          path,
          text: previous.text,
        },
        previous.text.length,
        previous.text.length,
        text,
      );
    }

    return addInlineText(
      location.blockIndex,
      location.childIndex,
      text,
      activeMarks,
    );
  }

  const nextChildIndex = location.childIndex + 1;
  const next = block.children[nextChildIndex];
  if (next?.type === "text") {
    const path = textPath(location.blockIndex, nextChildIndex);
    if (activeMarks.length > 0) {
      return replaceInlineTextRangeWithMarks(
        document,
        {
          blockIndex: location.blockIndex,
          kind: "inline",
          childIndex: nextChildIndex,
          path,
          text: next.text,
          marks: next.marks,
        },
        0,
        0,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(
      {
        blockIndex: location.blockIndex,
        kind: "inline",
        childIndex: nextChildIndex,
        path,
        text: next.text,
      },
      0,
      0,
      text,
    );
  }

  return addInlineText(location.blockIndex, nextChildIndex, text, activeMarks);
}

function insertTextAtBlockAtomEdge(
  document: NoteDocument,
  blockIndex: number,
  edge: "before" | "after",
  text: string,
  activeMarks: Extract<InlineNode, { type: "text" }>["marks"] = [],
): TextCommandResult {
  if (edge === "before") {
    const previousBlockIndex = blockIndex - 1;
    const previous = document.root.children[previousBlockIndex];
    if (isTextBlock(previous)) {
      return insertTextAtParagraphEnd(
        document,
        previousBlockIndex,
        text,
        activeMarks,
      );
    }

    return addParagraph(blockIndex, text, activeMarks);
  }

  const nextBlockIndex = blockIndex + 1;
  const next = document.root.children[nextBlockIndex];
  if (isTextBlock(next)) {
    return insertTextAtParagraphStart(
      document,
      nextBlockIndex,
      text,
      activeMarks,
    );
  }

  return addParagraph(nextBlockIndex, text, activeMarks);
}

function insertTextAtParagraphEnd(
  document: NoteDocument,
  blockIndex: number,
  text: string,
  activeMarks: Extract<InlineNode, { type: "text" }>["marks"] = [],
): TextCommandResult {
  const block = document.root.children[blockIndex];
  if (isCodeBlock(block)) {
    return replaceTextRange(
      {
        blockIndex,
        kind: "code",
        path: codeTextPath(blockIndex),
        text: block.text,
      },
      block.text.length,
      block.text.length,
      text,
    );
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const childIndex = block.children.length - 1;
  const child = block.children[childIndex];
  if (child?.type === "text") {
    const path = textPath(blockIndex, childIndex);
    if (activeMarks.length > 0) {
      return replaceInlineTextRangeWithMarks(
        document,
        {
          blockIndex,
          kind: "inline",
          childIndex,
          path,
          text: child.text,
          marks: child.marks,
        },
        child.text.length,
        child.text.length,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(
      { blockIndex, kind: "inline", childIndex, path, text: child.text },
      child.text.length,
      child.text.length,
      text,
    );
  }

  return addInlineText(blockIndex, block.children.length, text, activeMarks);
}

function insertTextAtParagraphStart(
  document: NoteDocument,
  blockIndex: number,
  text: string,
  activeMarks: Extract<InlineNode, { type: "text" }>["marks"] = [],
): TextCommandResult {
  const block = document.root.children[blockIndex];
  if (isCodeBlock(block)) {
    return replaceTextRange(
      {
        blockIndex,
        kind: "code",
        path: codeTextPath(blockIndex),
        text: block.text,
      },
      0,
      0,
      text,
    );
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const child = block.children[0];
  if (child?.type === "text") {
    const path = textPath(blockIndex, 0);
    if (activeMarks.length > 0) {
      return replaceInlineTextRangeWithMarks(
        document,
        {
          blockIndex,
          kind: "inline",
          childIndex: 0,
          path,
          text: child.text,
          marks: child.marks,
        },
        0,
        0,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(
      { blockIndex, kind: "inline", childIndex: 0, path, text: child.text },
      0,
      0,
      text,
    );
  }

  return addInlineText(blockIndex, 0, text, activeMarks);
}

function addInlineText(
  blockIndex: number,
  childIndex: number,
  text: string,
  marks?: Extract<InlineNode, { type: "text" }>["marks"],
): TextCommandResult {
  const child = textInline(text, marks);
  const insertedTextPath = textPath(blockIndex, childIndex);

  return {
    ok: true,
    patch: [
      {
        op: "add",
        path: `/root/children/${blockIndex}/children/${childIndex}`,
        value: child,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: insertedTextPath,
      offset: text.length,
    }),
  };
}

function addParagraph(
  blockIndex: number,
  text: string,
  marks?: Extract<InlineNode, { type: "text" }>["marks"],
): TextCommandResult {
  const block = {
    ...createParagraphBlock(""),
    children: [textInline(text, marks)],
  };

  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${blockIndex}`, value: block }],
    selectionAfter: selectionFromCursorPoint({
      path: textPath(blockIndex, 0),
      offset: text.length,
    }),
  };
}

function selectedDocumentRange(
  document: NoteDocument,
  selection: SelectionSnap,
): SelectedDocumentRange | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  const anchor = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.anchor),
  );
  const focus = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.focus),
  );
  const anchorIndex = resolveCursorIndex(document, anchor);
  const focusIndex = resolveCursorIndex(document, focus);

  if (anchorIndex === focusIndex) {
    return null;
  }

  return anchorIndex < focusIndex
    ? { start: anchor, end: focus }
    : { start: focus, end: anchor };
}

function replaceDocumentRangeWithText(
  document: NoteDocument,
  range: SelectedDocumentRange,
  replacement: string,
): TextCommandResult | null {
  const start = nonCodeSplitPositionFromCursorPoint(document, range.start);
  const end = nonCodeSplitPositionFromCursorPoint(document, range.end);
  const replacementChild =
    replacement.length === 0
      ? null
      : textInline(replacement, marksForReplacement(document, range.start));
  if (start !== null && end !== null) {
    return replaceNonCodeDocumentRange(document, start, end, replacementChild);
  }

  const codeStart = splitPositionFromCursorPoint(document, range.start);
  const codeEnd = splitPositionFromCursorPoint(document, range.end);
  if (codeStart === null || codeEnd === null) {
    return null;
  }

  return replaceCodeAwareDocumentRange(
    document,
    codeStart,
    codeEnd,
    replacement,
    replacementChild,
  );
}

function replaceDocumentRangeWithInlineNode(
  document: NoteDocument,
  range: SelectedDocumentRange,
  replacement: InlineNode,
): TextCommandResult | null {
  const start = nonCodeSplitPositionFromCursorPoint(document, range.start);
  const end = nonCodeSplitPositionFromCursorPoint(document, range.end);
  if (start === null || end === null) {
    return null;
  }

  return replaceNonCodeDocumentRange(document, start, end, replacement);
}

function replaceDocumentRangeWithFigure(
  document: NoteDocument,
  range: SelectedDocumentRange,
  figure: FigureBlock,
): TextCommandResult | null {
  const start = splitPositionFromCursorPoint(document, range.start);
  const end = splitPositionFromCursorPoint(document, range.end);
  if (start === null || end === null) {
    return null;
  }

  const beforeBlocks = blocksBeforeSplitPosition(document, start);
  const afterBlocks = blocksAfterSplitPosition(document, end);
  const figureIndex = beforeBlocks.length;
  const blocks = normalizeBlocks([...beforeBlocks, figure, ...afterBlocks]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionFromCursorPoint({
      path: `/root/children/${figureIndex}`,
      edge: "after",
    }),
  };
}

function replaceDocumentRangeWithBlockFragment(
  document: NoteDocument,
  range: SelectedDocumentRange,
  fragment: NoteBlock[],
): TextCommandResult | null {
  const start = splitPositionFromCursorPoint(document, range.start);
  const end = splitPositionFromCursorPoint(document, range.end);
  if (start === null || end === null) {
    return null;
  }

  return spliceBlockFragment(
    blocksBeforeBlockFragmentPosition(document, start),
    fragment,
    blocksAfterBlockFragmentPosition(document, end),
  );
}

function insertBlockFragmentAtSplitPosition(
  document: NoteDocument,
  position: SplitPosition,
  fragment: NoteBlock[],
): TextCommandResult {
  return spliceBlockFragment(
    blocksBeforeBlockFragmentPosition(document, position),
    fragment,
    blocksAfterBlockFragmentPosition(document, position),
  );
}

function spliceBlockFragment(
  beforeBlocks: NoteBlock[],
  fragment: NoteBlock[],
  afterBlocks: NoteBlock[],
): TextCommandResult {
  const insertIndex = beforeBlocks.length;
  const blocks = ensureUniqueBlockIds(
    normalizeBlocks([...beforeBlocks, ...fragment, ...afterBlocks]),
  );
  const lastInsertedIndex = Math.min(
    insertIndex + Math.max(fragment.length, 1) - 1,
    blocks.length - 1,
  );
  const insertedBlock = blocks[lastInsertedIndex];

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      insertedBlock === undefined
        ? selectionAtReplacementBlockBoundary(blocks, insertIndex)
        : selectionAtInsertedBlockEnd(lastInsertedIndex, insertedBlock),
  };
}

function blocksBeforeBlockFragmentPosition(
  document: NoteDocument,
  position: SplitPosition,
): NoteBlock[] {
  if (position.kind === "block") {
    return document.root.children.slice(0, position.insertIndex);
  }

  const partialBlock = blockBeforeSplitPosition(position);
  return [
    ...document.root.children.slice(0, position.blockIndex),
    ...(partialBlock === null ? [] : [partialBlock]),
  ];
}

function blocksAfterBlockFragmentPosition(
  document: NoteDocument,
  position: SplitPosition,
): NoteBlock[] {
  if (position.kind === "block") {
    return document.root.children.slice(position.insertIndex);
  }

  const partialBlock = blockAfterSplitPosition(position);
  return [
    ...(partialBlock === null ? [] : [partialBlock]),
    ...document.root.children.slice(position.blockIndex + 1),
  ];
}

function blockBeforeSplitPosition(position: SplitPosition): NoteBlock | null {
  if (position.kind === "block") {
    return null;
  }
  if (position.kind === "codeBlock") {
    return position.beforeText.length === 0
      ? null
      : { ...position.block, text: position.beforeText };
  }
  if (inlineUnitLength(position.beforeChildren) === 0) {
    return null;
  }

  return {
    ...position.block,
    children: normalizeInlineChildren(position.beforeChildren),
  };
}

function blockAfterSplitPosition(position: SplitPosition): NoteBlock | null {
  if (position.kind === "block") {
    return null;
  }
  if (position.kind === "codeBlock") {
    return position.afterText.length === 0
      ? null
      : { ...position.block, text: position.afterText };
  }
  if (inlineUnitLength(position.afterChildren) === 0) {
    return null;
  }

  return {
    ...position.block,
    children: normalizeInlineChildren(position.afterChildren),
  };
}

function insertInlineFragmentAtParagraphPosition(
  position: ParagraphSplitPosition,
  fragment: InlineNode[],
): TextCommandResult {
  const prefix = [...position.beforeChildren, ...fragment];
  const block = {
    ...position.block,
    children: normalizeInlineChildren([...prefix, ...position.afterChildren]),
  };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${position.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      position.blockIndex,
      block.children,
      prefix,
    ),
  };
}

function insertInlineFragmentAtBlockPosition(
  position: BlockSplitPosition,
  fragment: InlineNode[],
): TextCommandResult {
  const block = {
    ...createParagraphBlock(""),
    children: normalizeInlineChildren(fragment),
  };

  return {
    ok: true,
    patch: [
      {
        op: "add",
        path: `/root/children/${position.insertIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      position.insertIndex,
      block.children,
      fragment,
    ),
  };
}

function inlineNodesPlainText(children: InlineNode[]): string {
  return children
    .map((child) => (child.type === "mention" ? `@${child.label}` : child.text))
    .join("");
}

function blockPlainText(block: NoteBlock): string {
  if (isFigureBlock(block)) {
    return block.alt ?? "";
  }
  if (isCodeBlock(block)) {
    return block.text;
  }
  return isInlineTextBlock(block) ? inlineNodesPlainText(block.children) : "";
}

function withFreshBlockIds(blocks: NoteBlock[]): NoteBlock[] {
  return blocks.map((block) => ({
    ...block,
    id: createGeneratedBlockId(),
  }));
}

function ensureUniqueBlockIds(blocks: NoteBlock[]): NoteBlock[] {
  const seen = new Set<string>();

  return blocks.map((block) => {
    if (!seen.has(block.id)) {
      seen.add(block.id);
      return block;
    }

    const id = nextUnusedBlockId(seen);
    seen.add(id);
    return { ...block, id };
  });
}

function nextUnusedBlockId(seen: Set<string>): string {
  let id = createGeneratedBlockId();
  while (seen.has(id)) {
    id = createGeneratedBlockId();
  }

  return id;
}

function blocksBeforeSplitPosition(
  document: NoteDocument,
  position: SplitPosition,
): NoteBlock[] {
  if (position.kind === "block") {
    return document.root.children.slice(0, position.insertIndex);
  }

  const partialBlock =
    position.kind === "codeBlock"
      ? { ...position.block, text: position.beforeText }
      : {
          ...position.block,
          children: normalizeInlineChildren(position.beforeChildren),
        };

  return [
    ...document.root.children.slice(0, position.blockIndex),
    partialBlock,
  ];
}

function blocksAfterSplitPosition(
  document: NoteDocument,
  position: SplitPosition,
): NoteBlock[] {
  if (position.kind === "block") {
    return document.root.children.slice(position.insertIndex);
  }

  const partialBlock =
    position.kind === "codeBlock"
      ? { ...position.block, text: position.afterText }
      : {
          ...position.block,
          children: normalizeInlineChildren(position.afterChildren),
        };

  return [
    partialBlock,
    ...document.root.children.slice(position.blockIndex + 1),
  ];
}

function replaceNonCodeDocumentRange(
  document: NoteDocument,
  start: NonCodeSplitPosition,
  end: NonCodeSplitPosition,
  replacementChild: InlineNode | null,
): TextCommandResult | null {
  if (start.kind === "paragraph" && end.kind === "paragraph") {
    if (start.blockIndex === end.blockIndex) {
      return replaceSameParagraphRange(start, end, replacementChild);
    }

    return replaceParagraphToParagraphRange(
      document,
      start,
      end,
      replacementChild,
    );
  }

  if (start.kind === "paragraph" && end.kind === "block") {
    return replaceParagraphToBlockRange(document, start, end, replacementChild);
  }

  if (start.kind === "block" && end.kind === "block") {
    return replaceBlockToBlockRange(document, start, end, replacementChild);
  }

  if (start.kind === "block" && end.kind === "paragraph") {
    return replaceBlockToParagraphRange(document, start, end, replacementChild);
  }

  return null;
}

function replaceCodeAwareDocumentRange(
  document: NoteDocument,
  start: SplitPosition,
  end: SplitPosition,
  replacementText: string,
  replacementChild: InlineNode | null,
): TextCommandResult | null {
  if (start.kind !== "codeBlock" && end.kind !== "codeBlock") {
    return replaceNonCodeDocumentRange(document, start, end, replacementChild);
  }

  if (start.kind === "codeBlock" && end.kind === "codeBlock") {
    return replaceCodeToCodeRange(document, start, end, replacementText);
  }

  if (start.kind === "codeBlock" && end.kind === "paragraph") {
    return replaceCodeToParagraphRange(document, start, end, replacementText);
  }

  if (start.kind === "paragraph" && end.kind === "codeBlock") {
    return replaceParagraphToCodeRange(document, start, end, replacementChild);
  }

  if (start.kind === "codeBlock" && end.kind === "block") {
    return replaceCodeToBlockRange(document, start, end, replacementText);
  }

  if (start.kind === "block" && end.kind === "codeBlock") {
    return replaceBlockToCodeRange(document, start, end, replacementChild);
  }

  return null;
}

function splitSelectedDocumentRange(
  document: NoteDocument,
  range: SelectedDocumentRange,
): TextCommandResult | null {
  const start = nonCodeSplitPositionFromCursorPoint(document, range.start);
  const end = nonCodeSplitPositionFromCursorPoint(document, range.end);
  if (start === null || end === null) {
    return null;
  }

  if (start.kind === "paragraph") {
    return splitSelectedRangeFromParagraphStart(document, start, end);
  }

  return splitSelectedRangeFromBlockStart(document, start, end);
}

function splitSelectedRangeFromParagraphStart(
  document: NoteDocument,
  start: ParagraphSplitPosition,
  end: NonCodeSplitPosition,
): TextCommandResult {
  const beforeBlock = {
    ...start.block,
    children: normalizeInlineChildren(start.beforeChildren),
  };
  const afterBlock =
    end.kind === "paragraph"
      ? {
          ...createParagraphBlock(""),
          children: normalizeInlineChildren(end.afterChildren),
        }
      : createParagraphBlock("");
  const tailBlocks =
    end.kind === "paragraph"
      ? document.root.children.slice(end.blockIndex + 1)
      : document.root.children.slice(end.insertIndex);
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    beforeBlock,
    afterBlock,
    ...tailBlocks,
  ]);
  const selectionBlockIndex = start.blockIndex + 1;

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionAtChildrenStart(
      selectionBlockIndex,
      (blocks[selectionBlockIndex] as InlineTextBlock).children,
    ),
  };
}

function splitSelectedRangeFromBlockStart(
  document: NoteDocument,
  start: BlockSplitPosition,
  end: NonCodeSplitPosition,
): TextCommandResult {
  const emptyBlock = createParagraphBlock("");
  const afterBlocks =
    end.kind === "paragraph"
      ? [
          {
            ...end.block,
            children: normalizeInlineChildren(end.afterChildren),
          },
          ...document.root.children.slice(end.blockIndex + 1),
        ]
      : document.root.children.slice(end.insertIndex);
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.insertIndex),
    emptyBlock,
    ...afterBlocks,
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionAtChildrenStart(
      start.insertIndex,
      (blocks[start.insertIndex] as InlineTextBlock).children,
    ),
  };
}

function replaceSameParagraphRange(
  start: ParagraphSplitPosition,
  end: ParagraphSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const rawChildren = [
    ...start.beforeChildren,
    ...(replacement === null ? [] : [replacement]),
    ...end.afterChildren,
  ];
  const children = normalizeInlineChildren(rawChildren);
  const block = { ...start.block, children };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${start.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      start.blockIndex,
      children,
      replacement === null
        ? start.beforeChildren
        : [...start.beforeChildren, replacement],
    ),
  };
}

function replaceParagraphToParagraphRange(
  document: NoteDocument,
  start: ParagraphSplitPosition,
  end: ParagraphSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementPrefix =
    replacement === null
      ? start.beforeChildren
      : [...start.beforeChildren, replacement];

  if (isAtParagraphStart(end)) {
    const startBlock = {
      ...start.block,
      children: normalizeInlineChildren(replacementPrefix),
    };
    const blocks = normalizeBlocks([
      ...document.root.children.slice(0, start.blockIndex),
      startBlock,
      ...document.root.children.slice(end.blockIndex),
    ]);

    return {
      ok: true,
      patch: [{ op: "replace", path: "/root/children", value: blocks }],
      selectionAfter: selectionAfterInlinePrefix(
        start.blockIndex,
        startBlock.children,
        replacementPrefix,
      ),
    };
  }

  const rawChildren = [...replacementPrefix, ...end.afterChildren];
  const mergedBlock = {
    ...start.block,
    children: normalizeInlineChildren(rawChildren),
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    mergedBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionAfterInlinePrefix(
      start.blockIndex,
      mergedBlock.children,
      replacementPrefix,
    ),
  };
}

function replaceParagraphToBlockRange(
  document: NoteDocument,
  start: ParagraphSplitPosition,
  end: BlockSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementPrefix =
    replacement === null
      ? start.beforeChildren
      : [...start.beforeChildren, replacement];
  const startBlock = {
    ...start.block,
    children: normalizeInlineChildren(replacementPrefix),
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    ...document.root.children.slice(end.insertIndex),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionAfterInlinePrefix(
      start.blockIndex,
      startBlock.children,
      replacementPrefix,
    ),
  };
}

function replaceBlockToBlockRange(
  document: NoteDocument,
  start: BlockSplitPosition,
  end: BlockSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementChildren =
    replacement === null ? [] : normalizeInlineChildren([replacement]);
  const replacementBlock =
    replacement === null
      ? []
      : [{ ...createParagraphBlock(""), children: replacementChildren }];
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.insertIndex),
    ...replacementBlock,
    ...document.root.children.slice(end.insertIndex),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionAtReplacementBlockBoundary(blocks, start.insertIndex)
        : selectionAfterInlinePrefix(start.insertIndex, replacementChildren, [
            replacement,
          ]),
  };
}

function replaceBlockToParagraphRange(
  document: NoteDocument,
  start: BlockSplitPosition,
  end: ParagraphSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const rawChildren = [
    ...(replacement === null ? [] : [replacement]),
    ...end.afterChildren,
  ];
  const endBlock = {
    ...end.block,
    children: normalizeInlineChildren(rawChildren),
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.insertIndex),
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionAtChildrenStart(start.insertIndex, endBlock.children)
        : selectionAfterInlinePrefix(start.insertIndex, endBlock.children, [
            replacement,
          ]),
  };
}

function replaceCodeToCodeRange(
  document: NoteDocument,
  start: CodeSplitPosition,
  end: CodeSplitPosition,
  replacement: string,
): TextCommandResult {
  const selectionAfter = selectionFromCursorPoint({
    path: codeTextPath(start.blockIndex),
    offset: start.beforeText.length + replacement.length,
  });

  if (start.blockIndex === end.blockIndex) {
    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: codeTextPath(start.blockIndex),
          value: `${start.beforeText}${replacement}${end.afterText}`,
        },
      ],
      selectionAfter,
    };
  }

  const startBlock = {
    ...start.block,
    text: `${start.beforeText}${replacement}`,
  };
  const endBlock = { ...end.block, text: end.afterText };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter,
  };
}

function replaceCodeToParagraphRange(
  document: NoteDocument,
  start: CodeSplitPosition,
  end: ParagraphSplitPosition,
  replacement: string,
): TextCommandResult {
  const startBlock = {
    ...start.block,
    text: `${start.beforeText}${replacement}`,
  };
  const endBlock = {
    ...end.block,
    children: normalizeInlineChildren(end.afterChildren),
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionFromCursorPoint({
      path: codeTextPath(start.blockIndex),
      offset: startBlock.text.length,
    }),
  };
}

function replaceParagraphToCodeRange(
  document: NoteDocument,
  start: ParagraphSplitPosition,
  end: CodeSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementPrefix =
    replacement === null
      ? start.beforeChildren
      : [...start.beforeChildren, replacement];
  const startBlock = {
    ...start.block,
    children: normalizeInlineChildren(replacementPrefix),
  };
  const endBlock = { ...end.block, text: end.afterText };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionAfterInlinePrefix(
      start.blockIndex,
      startBlock.children,
      replacementPrefix,
    ),
  };
}

function replaceCodeToBlockRange(
  document: NoteDocument,
  start: CodeSplitPosition,
  end: BlockSplitPosition,
  replacement: string,
): TextCommandResult {
  const startBlock = {
    ...start.block,
    text: `${start.beforeText}${replacement}`,
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    ...document.root.children.slice(end.insertIndex),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionFromCursorPoint({
      path: codeTextPath(start.blockIndex),
      offset: startBlock.text.length,
    }),
  };
}

function replaceBlockToCodeRange(
  document: NoteDocument,
  start: BlockSplitPosition,
  end: CodeSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementChildren =
    replacement === null ? [] : normalizeInlineChildren([replacement]);
  const replacementBlock =
    replacement === null
      ? []
      : [{ ...createParagraphBlock(""), children: replacementChildren }];
  const endBlock = { ...end.block, text: end.afterText };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.insertIndex),
    ...replacementBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionFromCursorPoint({
            path: codeTextPath(start.insertIndex),
            offset: 0,
          })
        : selectionAfterInlinePrefix(start.insertIndex, replacementChildren, [
            replacement,
          ]),
  };
}

function splitPositionFromCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
): SplitPosition | null {
  if (point.offset !== undefined) {
    const location = textLocationFromPath(document, point.path);
    if (location === null) {
      return null;
    }

    const block = document.root.children[location.blockIndex];
    if (location.kind === "code") {
      if (!isCodeBlock(block)) {
        return null;
      }

      return {
        kind: "codeBlock",
        blockIndex: location.blockIndex,
        block,
        beforeText: block.text.slice(0, point.offset),
        afterText: block.text.slice(point.offset),
      };
    }

    const child = isInlineTextBlock(block)
      ? block.children[location.childIndex]
      : undefined;
    if (!isInlineTextBlock(block) || child?.type !== "text") {
      return null;
    }

    const beforeText = child.text.slice(0, point.offset);
    const afterText = child.text.slice(point.offset);

    return {
      kind: "paragraph",
      blockIndex: location.blockIndex,
      block,
      beforeChildren: [
        ...block.children.slice(0, location.childIndex),
        ...(beforeText.length === 0
          ? []
          : [textInline(beforeText, child.marks)]),
      ],
      afterChildren: [
        ...(afterText.length === 0 ? [] : [textInline(afterText, child.marks)]),
        ...block.children.slice(location.childIndex + 1),
      ],
    };
  }

  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    const block = document.root.children[inline.blockIndex];
    if (!isInlineTextBlock(block)) {
      return null;
    }

    const splitIndex =
      point.edge === "before" ? inline.childIndex : inline.childIndex + 1;

    return {
      kind: "paragraph",
      blockIndex: inline.blockIndex,
      block,
      beforeChildren: block.children.slice(0, splitIndex),
      afterChildren: block.children.slice(splitIndex),
    };
  }

  const blockIndex = blockLocationFromPath(document, point.path);
  if (blockIndex === null) {
    return null;
  }

  const block = document.root.children[blockIndex];
  if (isInlineTextBlock(block)) {
    const splitIndex = point.edge === "before" ? 0 : block.children.length;

    return {
      kind: "paragraph",
      blockIndex,
      block,
      beforeChildren: block.children.slice(0, splitIndex),
      afterChildren: block.children.slice(splitIndex),
    };
  }

  if (isCodeBlock(block)) {
    return {
      kind: "codeBlock",
      blockIndex,
      block,
      beforeText: point.edge === "before" ? "" : block.text,
      afterText: point.edge === "before" ? block.text : "",
    };
  }

  return {
    kind: "block",
    insertIndex: point.edge === "before" ? blockIndex : blockIndex + 1,
  };
}

function nonCodeSplitPositionFromCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
): NonCodeSplitPosition | null {
  const position = splitPositionFromCursorPoint(document, point);
  if (position === null) {
    return null;
  }
  if (position.kind !== "codeBlock") {
    return position;
  }

  return blockBoundaryFromCodeSplitPosition(position);
}

function blockBoundaryFromCodeSplitPosition(
  position: CodeSplitPosition,
): BlockSplitPosition | null {
  if (position.beforeText.length === 0) {
    return { kind: "block", insertIndex: position.blockIndex };
  }

  if (position.afterText.length === 0) {
    return { kind: "block", insertIndex: position.blockIndex + 1 };
  }

  return null;
}

function marksForReplacement(
  document: NoteDocument,
  point: CursorPoint,
): Extract<InlineNode, { type: "text" }>["marks"] {
  if (point.offset === undefined) {
    return undefined;
  }

  return textLocationFromPath(document, point.path)?.marks;
}

function isAtParagraphStart(position: ParagraphSplitPosition): boolean {
  return position.beforeChildren.length === 0;
}

function selectionAfterInlinePrefix(
  blockIndex: number,
  children: InlineNode[],
  prefix: InlineNode[],
): SelectionSnap {
  let remaining = inlineUnitLength(prefix);

  if (remaining === 0) {
    return selectionAtChildrenStart(blockIndex, children);
  }

  for (const [childIndex, child] of children.entries()) {
    if (child.type === "text") {
      if (remaining <= child.text.length) {
        return selectionFromCursorPoint({
          path: textPath(blockIndex, childIndex),
          offset: remaining,
        });
      }

      remaining -= child.text.length;
    } else {
      if (remaining <= 1) {
        return selectionFromCursorPoint({
          path: inlinePath(blockIndex, childIndex),
          edge: "after",
        });
      }

      remaining -= 1;
    }
  }

  return selectionAfterChildrenEnd(blockIndex, children);
}

function selectionAfterChildrenEnd(
  blockIndex: number,
  children: InlineNode[],
): SelectionSnap {
  const childIndex = children.length - 1;
  const child = children[childIndex];

  if (child?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(blockIndex, childIndex),
      edge: "after",
    });
  }

  return selectionFromCursorPoint({
    path: textPath(blockIndex, Math.max(childIndex, 0)),
    offset: child?.type === "text" ? child.text.length : 0,
  });
}

function selectionAtInsertedBlockEnd(
  blockIndex: number,
  block: NoteBlock,
): SelectionSnap {
  if (isFigureBlock(block)) {
    return selectionFromCursorPoint({
      path: `/root/children/${blockIndex}`,
      edge: "after",
    });
  }
  if (isCodeBlock(block)) {
    return selectionFromCursorPoint({
      path: codeTextPath(blockIndex),
      offset: block.text.length,
    });
  }

  return selectionAfterChildrenEnd(blockIndex, block.children);
}

function selectionAtReplacementBlockBoundary(
  blocks: NoteBlock[],
  insertIndex: number,
): SelectionSnap {
  const next = blocks[insertIndex];
  if (isInlineTextBlock(next)) {
    return selectionAtChildrenStart(insertIndex, next.children);
  }
  if (isCodeBlock(next)) {
    return selectionFromCursorPoint({
      path: codeTextPath(insertIndex),
      offset: 0,
    });
  }
  if (isFigureBlock(next)) {
    return selectionFromCursorPoint({
      path: `/root/children/${insertIndex}`,
      edge: "before",
    });
  }

  const previousIndex = insertIndex - 1;
  const previous = blocks[previousIndex];
  if (isInlineTextBlock(previous)) {
    return selectionAfterChildrenEnd(previousIndex, previous.children);
  }
  if (isCodeBlock(previous)) {
    return selectionFromCursorPoint({
      path: codeTextPath(previousIndex),
      offset: previous.text.length,
    });
  }

  return selectionFromCursorPoint({
    path: "/root/children/0/children/0/text",
    offset: 0,
  });
}

function inlineUnitLength(children: InlineNode[]): number {
  return children.reduce(
    (total, child) => total + (child.type === "text" ? child.text.length : 1),
    0,
  );
}

function selectedSingleTextRange(
  document: NoteDocument,
  selection: SelectionSnap,
): { location: TextLocation; startOffset: number; endOffset: number } | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  const anchor = normalizeTextCursorPoint(document, range.anchor);
  const focus = normalizeTextCursorPoint(document, range.focus);

  if (anchor === null || focus === null || anchor.path !== focus.path) {
    return null;
  }

  const startOffset = Math.min(anchor.offset, focus.offset);
  const endOffset = Math.max(anchor.offset, focus.offset);
  if (startOffset === endOffset) {
    return null;
  }

  const location = textLocationFromPath(document, anchor.path);
  return location === null ? null : { location, startOffset, endOffset };
}

function selectedSingleAtom(
  document: NoteDocument,
  selection: SelectionSnap,
): SelectedAtom | null {
  const path = selection.selectedPointers[0];
  if (path === undefined || selection.selectedPointers.length !== 1) {
    return null;
  }
  if (!selectionCoversOnlyAtom(document, selection, path)) {
    return null;
  }

  const inline = inlineAtomLocationFromPath(document, path);
  if (inline !== null) {
    return { kind: "inline", ...inline };
  }

  const blockIndex = blockAtomLocationFromPath(document, path);
  return blockIndex === null ? null : { kind: "figure", blockIndex };
}

function selectionCoversOnlyAtom(
  document: NoteDocument,
  selection: SelectionSnap,
  path: string,
): boolean {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return false;
  }

  const anchor = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.anchor),
  );
  const focus = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.focus),
  );
  const start = Math.min(
    resolveCursorIndex(document, anchor),
    resolveCursorIndex(document, focus),
  );
  const end = Math.max(
    resolveCursorIndex(document, anchor),
    resolveCursorIndex(document, focus),
  );
  const atomStart = resolveCursorIndex(document, { path, edge: "before" });
  const atomEnd = resolveCursorIndex(document, { path, edge: "after" });

  return start === atomStart && end === atomEnd;
}

function normalizeTextCursorPoint(
  document: NoteDocument,
  point: SelectionPoint,
): TextCursorPoint | null {
  const input = cursorPointInputFromSelectionPoint(point);
  const normalized = normalizeCursorPoint(document, input);

  return normalized.offset !== undefined ? normalized : null;
}

function cursorPointInputFromSelectionPoint(
  point: SelectionPoint,
): CursorPointInput {
  if (typeof point === "string") {
    return { path: point };
  }

  return {
    path: point.path,
    ...(point.offset !== undefined ? { offset: point.offset } : {}),
    ...(point.edge !== undefined ? { edge: point.edge } : {}),
    ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
  };
}
