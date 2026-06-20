import {
  type JSONPatchOperation,
  type SelectionPoint,
  type SelectionSnap,
  tryParsePointer,
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
  createParagraphBlock,
  type InlineNode,
  type InlineTextBlock,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  isTextBlock,
  type NoteBlock,
  type NoteDocument,
} from "./noteDocument";

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

type TextLocation = {
  blockIndex: number;
  path: string;
  text: string;
  marks?: Extract<InlineNode, { type: "text" }>["marks"];
} & (
  | {
      kind: "inline";
      childIndex: number;
    }
  | {
      kind: "code";
    }
);

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
  mention: MentionInline,
): TextCommandResult {
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return insertInlineAtomAtTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      mention,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithMention(document, selectedAtom, mention);
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
      mention,
    );
  }

  return insertMentionAtAtomEdge(document, point, mention);
}

export function insertFigure(
  document: NoteDocument,
  selection: SelectionSnap,
  figure: FigureBlock,
): TextCommandResult {
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return insertFigureAtTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      figure,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithFigure(document, selectedAtom, figure);
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
      figure,
    );
  }

  return insertFigureAtAtomEdge(document, point, figure);
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
    const block = document.blocks[blockIndex];
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
  if (selectedSingleTextRange(document, selection) !== null) {
    return insertText(document, selection, "");
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

  const startOffset =
    direction === "backward" ? point.offset - 1 : point.offset;
  const endOffset = startOffset + 1;
  if (startOffset < 0 || endOffset > location.text.length) {
    if (
      direction === "backward" &&
      point.offset === 0 &&
      isTextLocationAtBlockStart(document, location)
    ) {
      return mergeWithPreviousTextBlock(document, location.blockIndex);
    }
    if (
      direction === "forward" &&
      point.offset === location.text.length &&
      isTextLocationAtBlockEnd(document, location)
    ) {
      return mergeWithNextTextBlock(document, location.blockIndex);
    }

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
    edgeBlockIndex === null ? undefined : document.blocks[edgeBlockIndex];
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
      const block = document.blocks[inline.blockIndex];
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
  const block = document.blocks[location.blockIndex];

  if (
    nextText.length > 0 ||
    location.kind === "code" ||
    !isInlineTextBlock(block) ||
    block.children.length === 1
  ) {
    return replaceTextRange(location, startOffset, endOffset, "");
  }

  return {
    ok: true,
    patch: [
      {
        op: "remove",
        path: inlinePath(location.blockIndex, location.childIndex),
      },
    ],
    selectionAfter: selectionAfterInlineRemoval(
      document,
      location.blockIndex,
      location.childIndex,
    ),
  };
}

function deleteInlineAtom(
  document: NoteDocument,
  blockIndex: number,
  childIndex: number,
): TextCommandResult {
  const block = document.blocks[blockIndex];
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
          path: `/blocks/${blockIndex}/children`,
          value: [{ type: "text", text: "" }],
        },
      ],
      selectionAfter: selectionFromCursorPoint({ path, offset: 0 }),
    };
  }

  return {
    ok: true,
    patch: [{ op: "remove", path: inlinePath(blockIndex, childIndex) }],
    selectionAfter: selectionAfterInlineRemoval(
      document,
      blockIndex,
      childIndex,
    ),
  };
}

function deleteFigureBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  if (document.blocks.length === 1) {
    const block = createParagraphBlock("");

    return {
      ok: true,
      patch: [{ op: "replace", path: "/blocks/0", value: block }],
      selectionAfter: selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 0,
      }),
    };
  }

  return {
    ok: true,
    patch: [{ op: "remove", path: `/blocks/${blockIndex}` }],
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
    const path = inlinePath(atom.blockIndex, atom.childIndex);

    return {
      ok: true,
      patch: [{ op: "replace", path, value: textInline(text) }],
      selectionAfter: selectionFromCursorPoint({
        path: textPath(atom.blockIndex, atom.childIndex),
        offset: text.length,
      }),
    };
  }

  const block = createParagraphBlock(text);

  return {
    ok: true,
    patch: [
      { op: "replace", path: `/blocks/${atom.blockIndex}`, value: block },
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
      { op: "replace", path: `/blocks/${atom.blockIndex}`, value: block },
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
          path: `/blocks/${atom.blockIndex}`,
          value: figure,
        },
      ],
      selectionAfter: selectionFromCursorPoint({
        path: `/blocks/${atom.blockIndex}`,
        edge: "after",
      }),
    };
  }

  const block = document.blocks[atom.blockIndex];
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

  const block = document.blocks[location.blockIndex];
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
  const block = document.blocks[location.blockIndex];
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
    patch: [{ op: "add", path: `/blocks/${insertIndex}`, value: block }],
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
    patch: [{ op: "add", path: `/blocks/${insertIndex}`, value: block }],
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
      { op: "replace", path: `/blocks/${blockIndex}`, value: beforeBlock },
      { op: "add", path: `/blocks/${blockIndex + 1}`, value: afterBlock },
    ],
    selectionAfter: selectionAtChildrenStart(
      blockIndex + 1,
      afterBlock.children,
    ),
  };
}

function mergeWithPreviousTextBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  if (blockIndex <= 0) {
    return noOp({ path: `/blocks/${blockIndex}`, edge: "before" });
  }

  const previous = document.blocks[blockIndex - 1];
  const current = document.blocks[blockIndex];
  if (isCodeBlock(previous) && isCodeBlock(current)) {
    const selectionAfter = selectionAtBlockEnd(document, blockIndex - 1);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/blocks/${blockIndex - 1}/text`,
          value: previous.text + current.text,
        },
        { op: "remove", path: `/blocks/${blockIndex}` },
      ],
      selectionAfter,
    };
  }

  if (!isInlineTextBlock(previous) || !isInlineTextBlock(current)) {
    return noOp({ path: `/blocks/${blockIndex}`, edge: "before" });
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
        path: `/blocks/${blockIndex - 1}/children`,
        value: mergedChildren,
      },
      { op: "remove", path: `/blocks/${blockIndex}` },
    ],
    selectionAfter,
  };
}

function mergeWithNextTextBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  const current = document.blocks[blockIndex];
  const next = document.blocks[blockIndex + 1];
  if (isCodeBlock(current) && isCodeBlock(next)) {
    const selectionAfter = selectionAtBlockEnd(document, blockIndex);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/blocks/${blockIndex}/text`,
          value: current.text + next.text,
        },
        { op: "remove", path: `/blocks/${blockIndex + 1}` },
      ],
      selectionAfter,
    };
  }

  if (!isInlineTextBlock(current) || !isInlineTextBlock(next)) {
    return noOp({ path: `/blocks/${blockIndex}`, edge: "after" });
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
        path: `/blocks/${blockIndex}/children`,
        value: mergedChildren,
      },
      { op: "remove", path: `/blocks/${blockIndex + 1}` },
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
  const block = document.blocks[location.blockIndex];
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
        path: `/blocks/${location.blockIndex}/children`,
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
  const block = document.blocks[location.blockIndex];
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
        path: `/blocks/${location.blockIndex}/children`,
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
    const block = document.blocks[blockIndex];
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
    const previous = document.blocks[previousBlockIndex];
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
  const next = document.blocks[nextBlockIndex];
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
    patch: [{ op: "add", path: `/blocks/${blockIndex}`, value: block }],
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
  const block = document.blocks[location.blockIndex];
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
    const block = document.blocks[inline.blockIndex];
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
      { op: "replace", path: `/blocks/${blockIndex}`, value: beforeBlock },
      { op: "add", path: `/blocks/${figureIndex}`, value: figure },
      { op: "add", path: `/blocks/${figureIndex + 1}`, value: afterBlock },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: `/blocks/${figureIndex}`,
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
    patch: [{ op: "add", path: `/blocks/${blockIndex}`, value: figure }],
    selectionAfter: selectionFromCursorPoint({
      path: `/blocks/${blockIndex}`,
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
    const blockNode = document.blocks[block];
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
  const block = document.blocks[location.blockIndex];
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
    const previous = document.blocks[previousBlockIndex];
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
  const next = document.blocks[nextBlockIndex];
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
  const block = document.blocks[blockIndex];
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
  const block = document.blocks[blockIndex];
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
        path: `/blocks/${blockIndex}/children/${childIndex}`,
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
    patch: [{ op: "add", path: `/blocks/${blockIndex}`, value: block }],
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
  if (start === null || end === null) {
    return null;
  }

  const replacementChild =
    replacement.length === 0
      ? null
      : textInline(replacement, marksForReplacement(document, range.start));

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
      ? document.blocks.slice(end.blockIndex + 1)
      : document.blocks.slice(end.insertIndex);
  const blocks = normalizeBlocks([
    ...document.blocks.slice(0, start.blockIndex),
    beforeBlock,
    afterBlock,
    ...tailBlocks,
  ]);
  const selectionBlockIndex = start.blockIndex + 1;

  return {
    ok: true,
    patch: [{ op: "replace", path: "/blocks", value: blocks }],
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
          ...document.blocks.slice(end.blockIndex + 1),
        ]
      : document.blocks.slice(end.insertIndex);
  const blocks = normalizeBlocks([
    ...document.blocks.slice(0, start.insertIndex),
    emptyBlock,
    ...afterBlocks,
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/blocks", value: blocks }],
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
      { op: "replace", path: `/blocks/${start.blockIndex}`, value: block },
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
      ...document.blocks.slice(0, start.blockIndex),
      startBlock,
      ...document.blocks.slice(end.blockIndex),
    ]);

    return {
      ok: true,
      patch: [{ op: "replace", path: "/blocks", value: blocks }],
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
    ...document.blocks.slice(0, start.blockIndex),
    mergedBlock,
    ...document.blocks.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/blocks", value: blocks }],
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
    ...document.blocks.slice(0, start.blockIndex),
    startBlock,
    ...document.blocks.slice(end.insertIndex),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/blocks", value: blocks }],
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
  const replacementBlock =
    replacement === null
      ? []
      : [{ ...createParagraphBlock(""), children: [replacement] }];
  const blocks = normalizeBlocks([
    ...document.blocks.slice(0, start.insertIndex),
    ...replacementBlock,
    ...document.blocks.slice(end.insertIndex),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/blocks", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionAtReplacementBlockBoundary(blocks, start.insertIndex)
        : selectionFromCursorPoint({
            path: textPath(start.insertIndex, 0),
            offset: replacement.type === "text" ? replacement.text.length : 0,
          }),
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
    ...document.blocks.slice(0, start.insertIndex),
    endBlock,
    ...document.blocks.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/blocks", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionAtChildrenStart(start.insertIndex, endBlock.children)
        : selectionAfterInlinePrefix(start.insertIndex, endBlock.children, [
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

    const block = document.blocks[location.blockIndex];
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
    const block = document.blocks[inline.blockIndex];
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

  const block = document.blocks[blockIndex];
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
      path: `/blocks/${insertIndex}`,
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
    path: "/blocks/0/children/0/text",
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

function textLocationFromPath(
  document: NoteDocument,
  path: string,
): TextLocation | null {
  const indexes = textIndexesFromPath(path);
  if (indexes !== null) {
    const block = document.blocks[indexes.blockIndex];
    const child = isInlineTextBlock(block)
      ? block.children[indexes.childIndex]
      : undefined;
    if (child?.type !== "text") {
      return null;
    }

    return {
      blockIndex: indexes.blockIndex,
      kind: "inline",
      childIndex: indexes.childIndex,
      path,
      text: child.text,
      marks: child.marks,
    };
  }

  const codeIndex = codeTextIndexFromPath(path);
  if (codeIndex === null) {
    return null;
  }

  const block = document.blocks[codeIndex.blockIndex];
  return isCodeBlock(block)
    ? {
        blockIndex: codeIndex.blockIndex,
        kind: "code",
        path,
        text: block.text,
      }
    : null;
}

function inlineAtomLocationFromPath(
  document: NoteDocument,
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const indexes = inlineIndexesFromPath(path);
  if (indexes === null) {
    return null;
  }

  const block = document.blocks[indexes.blockIndex];
  const child = isInlineTextBlock(block)
    ? block.children[indexes.childIndex]
    : undefined;
  return child?.type === "mention" ? indexes : null;
}

function blockAtomLocationFromPath(
  document: NoteDocument,
  path: string,
): number | null {
  const blockIndex = blockIndexFromPath(path);
  const block = blockIndex === null ? undefined : document.blocks[blockIndex];

  return isFigureBlock(block) ? blockIndex : null;
}

function blockLocationFromPath(
  document: NoteDocument,
  path: string,
): number | null {
  const blockIndex = blockIndexFromPath(path);
  return blockIndex !== null && document.blocks[blockIndex] !== undefined
    ? blockIndex
    : null;
}

function textIndexesFromPath(
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments.length !== 5 ||
    segments[0] !== "blocks" ||
    segments[2] !== "children" ||
    segments[4] !== "text"
  ) {
    return null;
  }

  const blockIndex = arrayIndexFromSegment(segments[1]);
  const childIndex = arrayIndexFromSegment(segments[3]);

  return blockIndex === null || childIndex === null
    ? null
    : { blockIndex, childIndex };
}

function codeTextIndexFromPath(path: string): { blockIndex: number } | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments.length !== 3 ||
    segments[0] !== "blocks" ||
    segments[2] !== "text"
  ) {
    return null;
  }

  const blockIndex = arrayIndexFromSegment(segments[1]);

  return blockIndex === null ? null : { blockIndex };
}

function inlineIndexesFromPath(
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments.length !== 4 ||
    segments[0] !== "blocks" ||
    segments[2] !== "children"
  ) {
    return null;
  }

  const blockIndex = arrayIndexFromSegment(segments[1]);
  const childIndex = arrayIndexFromSegment(segments[3]);

  return blockIndex === null || childIndex === null
    ? null
    : { blockIndex, childIndex };
}

function blockIndexFromPath(path: string): number | null {
  const segments = tryParsePointer(path);
  if (segments === null || segments.length !== 2 || segments[0] !== "blocks") {
    return null;
  }

  return arrayIndexFromSegment(segments[1]);
}

function textPath(blockIndex: number, childIndex: number): string {
  return `/blocks/${blockIndex}/children/${childIndex}/text`;
}

function codeTextPath(blockIndex: number): string {
  return `/blocks/${blockIndex}/text`;
}

function inlinePath(blockIndex: number, childIndex: number): string {
  return `/blocks/${blockIndex}/children/${childIndex}`;
}

function textInline(
  text: string,
  marks?: Extract<InlineNode, { type: "text" }>["marks"],
): InlineNode {
  return marks === undefined || marks.length === 0
    ? { type: "text", text }
    : { type: "text", text, marks };
}

function selectionAfterInlineRemoval(
  document: NoteDocument,
  blockIndex: number,
  removedChildIndex: number,
): SelectionSnap {
  const block = document.blocks[blockIndex];
  if (!isInlineTextBlock(block)) {
    return selectionFromCursorPoint({
      path: `/blocks/${blockIndex}`,
      edge: "before",
    });
  }

  const next = block.children[removedChildIndex + 1];
  if (next?.type === "text") {
    return selectionFromCursorPoint({
      path: textPath(blockIndex, removedChildIndex),
      offset: 0,
    });
  }
  if (next?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(blockIndex, removedChildIndex),
      edge: "before",
    });
  }

  const previousIndex = removedChildIndex - 1;
  const previous = block.children[previousIndex];
  if (previous?.type === "text") {
    return selectionFromCursorPoint({
      path: textPath(blockIndex, previousIndex),
      offset: previous.text.length,
    });
  }
  if (previous?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(blockIndex, previousIndex),
      edge: "after",
    });
  }

  return selectionFromCursorPoint({
    path: textPath(blockIndex, 0),
    offset: 0,
  });
}

function selectionAfterBlockRemoval(
  document: NoteDocument,
  removedBlockIndex: number,
): SelectionSnap {
  const next = document.blocks[removedBlockIndex + 1];
  if (next !== undefined) {
    return selectionAtBlockStart(
      document,
      removedBlockIndex + 1,
      removedBlockIndex,
    );
  }

  const previousIndex = removedBlockIndex - 1;
  const previous = document.blocks[previousIndex];
  if (previous !== undefined) {
    return selectionAtBlockEnd(document, previousIndex);
  }

  return selectionFromCursorPoint({
    path: "/blocks/0/children/0/text",
    offset: 0,
  });
}

function selectionAtBlockStart(
  document: NoteDocument,
  sourceBlockIndex: number,
  targetBlockIndex: number,
): SelectionSnap {
  const block = document.blocks[sourceBlockIndex];
  if (isFigureBlock(block)) {
    return selectionFromCursorPoint({
      path: `/blocks/${targetBlockIndex}`,
      edge: "before",
    });
  }

  if (isCodeBlock(block)) {
    return selectionFromCursorPoint({
      path: codeTextPath(targetBlockIndex),
      offset: 0,
    });
  }

  const child = isInlineTextBlock(block) ? block.children[0] : undefined;
  if (child?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(targetBlockIndex, 0),
      edge: "before",
    });
  }

  return selectionFromCursorPoint({
    path: textPath(targetBlockIndex, 0),
    offset: 0,
  });
}

function selectionAtChildrenStart(
  blockIndex: number,
  children: InlineNode[],
): SelectionSnap {
  const child = children[0];
  if (child?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(blockIndex, 0),
      edge: "before",
    });
  }

  return selectionFromCursorPoint({
    path: textPath(blockIndex, 0),
    offset: 0,
  });
}

function selectionAtBlockEnd(
  document: NoteDocument,
  blockIndex: number,
): SelectionSnap {
  const block = document.blocks[blockIndex];
  if (isFigureBlock(block)) {
    return selectionFromCursorPoint({
      path: `/blocks/${blockIndex}`,
      edge: "after",
    });
  }

  if (isCodeBlock(block)) {
    return selectionFromCursorPoint({
      path: codeTextPath(blockIndex),
      offset: block.text.length,
    });
  }

  if (isInlineTextBlock(block)) {
    const childIndex = block.children.length - 1;
    const child = block.children[childIndex];
    if (child?.type === "mention") {
      return selectionFromCursorPoint({
        path: inlinePath(blockIndex, childIndex),
        edge: "after",
      });
    }
    if (child?.type === "text") {
      return selectionFromCursorPoint({
        path: textPath(blockIndex, childIndex),
        offset: child.text.length,
      });
    }
  }

  return selectionFromCursorPoint({
    path: textPath(blockIndex, 0),
    offset: 0,
  });
}

function isTextLocationAtBlockStart(
  document: NoteDocument,
  location: TextLocation,
): boolean {
  if (location.kind === "code") {
    return true;
  }

  const block = document.blocks[location.blockIndex];

  return isInlineTextBlock(block) && location.childIndex === 0;
}

function isTextLocationAtBlockEnd(
  document: NoteDocument,
  location: TextLocation,
): boolean {
  if (location.kind === "code") {
    return true;
  }

  const block = document.blocks[location.blockIndex];

  return (
    isInlineTextBlock(block) &&
    location.childIndex === block.children.length - 1
  );
}

function arrayIndexFromSegment(segment: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(segment)) {
    return null;
  }

  return Number(segment);
}
