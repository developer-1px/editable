import type { SelectionSnap } from "@interactive-os/json-document";
import { normalizeCursorPoint, type TextCursorPoint } from "../cursor";
import {
  cursorPointInputFromSelection,
  selectionFromCursorPoint,
} from "../cursorCommands";
import { inlineUnitLength } from "../inlineUnits";
import { normalizeBlocks, normalizeInlineChildren } from "../normalizer";
import {
  createParagraphBlock,
  type InlineNode,
  type InlineTextBlock,
  isInlineTextBlock,
  isTextBlock,
  type NoteDocument,
} from "../noteDocument";
import {
  blockLocationFromPath,
  inlineAtomLocationFromPath,
  textInline,
  textLocationFromPath,
  textPath,
} from "./textCommandAddressing";
import { replaceDocumentRangeWithText } from "./textCommandDocumentRange";
import { replaceTextRange } from "./textCommandEditingPrimitives";
import type { TextCommandResult } from "./textCommandResult";
import { selectionAtChildrenStart } from "./textCommandSelection";
import {
  type SelectedDocumentRange,
  selectedDocumentRange,
} from "./textCommandSelectionTargets";
import {
  type BlockSplitPosition,
  type NonCodeSplitPosition,
  nonCodeSplitPositionFromCursorPoint,
  type ParagraphSplitPosition,
} from "./textCommandSplitPosition";

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

  const blockTypeExit = splitEmptyTypedBlockAsParagraph(
    block,
    location.blockIndex,
  );
  if (blockTypeExit !== null) {
    return blockTypeExit;
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

function splitEmptyTypedBlockAsParagraph(
  block: InlineTextBlock,
  blockIndex: number,
): TextCommandResult | null {
  if (!shouldExitTypedBlockOnSplit(block)) {
    return null;
  }

  const paragraph: InlineTextBlock = {
    id: block.id,
    kind: "element",
    type: "paragraph",
    flow: "block",
    children: [textInline("")],
  };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}`,
        value: paragraph,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: textPath(blockIndex, 0),
      offset: 0,
    }),
  };
}

function shouldExitTypedBlockOnSplit(block: InlineTextBlock): boolean {
  if (block.type === "paragraph") {
    return false;
  }

  let text = "";
  for (const child of block.children) {
    if (child.type !== "text") {
      return false;
    }
    text += child.text;
  }

  return block.type === "listItem"
    ? text.trim().length === 0
    : text.length === 0;
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
