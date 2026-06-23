import type { CursorPoint } from "../cursor";
import { inlineUnitLength } from "../inlineUnits";
import { normalizeInlineChildren } from "../normalizer";
import {
  type InlineNode,
  type InlineTextBlock,
  isCodeBlock,
  isInlineTextBlock,
  type NoteBlock,
  type NoteDocument,
} from "../noteDocument";
import {
  blockLocationFromPath,
  inlineAtomLocationFromPath,
  textInline,
  textLocationFromPath,
} from "./textCommandAddressing";

export type ParagraphSplitPosition = {
  kind: "paragraph";
  blockIndex: number;
  block: InlineTextBlock;
  beforeChildren: InlineNode[];
  afterChildren: InlineNode[];
};

export type CodeSplitPosition = {
  kind: "codeBlock";
  blockIndex: number;
  block: Extract<NoteBlock, { type: "codeBlock" }>;
  beforeText: string;
  afterText: string;
};

export type BlockSplitPosition = {
  kind: "block";
  insertIndex: number;
};

export type SplitPosition =
  | ParagraphSplitPosition
  | CodeSplitPosition
  | BlockSplitPosition;

export type NonCodeSplitPosition = ParagraphSplitPosition | BlockSplitPosition;

export function splitPositionFromCursorPoint(
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

export function nonCodeSplitPositionFromCursorPoint(
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

export function blocksBeforeBlockFragmentPosition(
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

export function blocksAfterBlockFragmentPosition(
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

export function blocksBeforeSplitPosition(
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

export function blocksAfterSplitPosition(
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

export function marksForReplacement(
  document: NoteDocument,
  point: CursorPoint,
): Extract<InlineNode, { type: "text" }>["marks"] {
  if (point.offset === undefined) {
    return undefined;
  }

  return textLocationFromPath(document, point.path)?.marks;
}

export function isAtParagraphStart(position: ParagraphSplitPosition): boolean {
  return position.beforeChildren.length === 0;
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
