import type { CursorPoint } from "./cursor";
import {
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";
import {
  nextTextBoundaryOffset,
  previousTextBoundaryOffset,
} from "./textBoundaries";

export function firstCursorPoint(document: NoteDocument): CursorPoint {
  return firstCaretPointFromBlock(document, 0) ?? fallbackCursorPoint();
}

export function lastCursorPoint(document: NoteDocument): CursorPoint {
  return (
    lastCaretPointFromBlock(document, document.root.children.length - 1) ??
    fallbackCursorPoint()
  );
}

export function firstCaretPointFromBlock(
  document: NoteDocument,
  blockIndex: number,
): CursorPoint | null {
  for (
    let index = Math.max(blockIndex, 0);
    index < document.root.children.length;
    index += 1
  ) {
    const point = firstCaretPointInSingleBlock(document, index);
    if (point !== null) {
      return point;
    }
  }

  return null;
}

export function lastCaretPointFromBlock(
  document: NoteDocument,
  blockIndex: number,
): CursorPoint | null {
  for (
    let index = Math.min(blockIndex, document.root.children.length - 1);
    index >= 0;
    index -= 1
  ) {
    const point = lastCaretPointInSingleBlock(document, index);
    if (point !== null) {
      return point;
    }
  }

  return null;
}

export function firstCaretPointInSingleBlock(
  document: NoteDocument,
  blockIndex: number,
): CursorPoint | null {
  const block = document.root.children[blockIndex];
  const blockPath = `/root/children/${blockIndex}`;
  if (block === undefined) {
    return null;
  }

  if (isFigureBlock(block)) {
    return { path: blockPath, edge: "before" };
  }

  if (isCodeBlock(block)) {
    return { path: `${blockPath}/text`, offset: 0 };
  }

  if (!isInlineTextBlock(block)) {
    return null;
  }

  if (block.children.length === 0) {
    return { path: `${blockPath}/children/0/text`, offset: 0 };
  }

  return (
    firstInlineCaretAfterIndex(document, blockIndex, -1, {
      fromAdjacentTextBoundary: false,
    }) ?? { path: `${blockPath}/children/0/text`, offset: 0 }
  );
}

export function lastCaretPointInSingleBlock(
  document: NoteDocument,
  blockIndex: number,
): CursorPoint | null {
  const block = document.root.children[blockIndex];
  const blockPath = `/root/children/${blockIndex}`;
  if (block === undefined) {
    return null;
  }

  if (isFigureBlock(block)) {
    return { path: blockPath, edge: "after" };
  }

  if (isCodeBlock(block)) {
    return { path: `${blockPath}/text`, offset: block.text.length };
  }

  if (!isInlineTextBlock(block)) {
    return null;
  }

  if (block.children.length === 0) {
    return { path: `${blockPath}/children/0/text`, offset: 0 };
  }

  return (
    lastInlineCaretBeforeIndex(document, blockIndex, block.children.length, {
      fromAdjacentTextBoundary: false,
    }) ?? { path: `${blockPath}/children/0/text`, offset: 0 }
  );
}

export function firstInlineCaretAfterIndex(
  document: NoteDocument,
  blockIndex: number,
  inlineIndex: number,
  options: { fromAdjacentTextBoundary: boolean },
): CursorPoint | null {
  const block = document.root.children[blockIndex];
  if (!isInlineTextBlock(block)) {
    return firstCaretPointFromBlock(document, blockIndex + 1);
  }

  const nextIndex = inlineIndex + 1;
  const child = block.children[nextIndex];
  if (child === undefined) {
    return firstCaretPointFromBlock(document, blockIndex + 1);
  }

  const childPath = `/root/children/${blockIndex}/children/${nextIndex}`;
  if (child.type === "mention") {
    return { path: childPath, edge: "before" };
  }

  return {
    path: `${childPath}/text`,
    offset:
      options.fromAdjacentTextBoundary && child.text.length > 0
        ? nextTextBoundaryOffset(child.text, 0)
        : 0,
  };
}

export function lastInlineCaretBeforeIndex(
  document: NoteDocument,
  blockIndex: number,
  inlineIndex: number,
  options: { fromAdjacentTextBoundary: boolean },
): CursorPoint | null {
  const block = document.root.children[blockIndex];
  if (!isInlineTextBlock(block)) {
    return lastCaretPointFromBlock(document, blockIndex - 1);
  }

  const previousIndex = inlineIndex - 1;
  const child = block.children[previousIndex];
  if (child === undefined) {
    return lastCaretPointFromBlock(document, blockIndex - 1);
  }

  const childPath = `/root/children/${blockIndex}/children/${previousIndex}`;
  if (child.type === "mention") {
    return { path: childPath, edge: "after" };
  }

  return {
    path: `${childPath}/text`,
    offset:
      options.fromAdjacentTextBoundary && child.text.length > 0
        ? previousTextBoundaryOffset(child.text, child.text.length)
        : child.text.length,
  };
}

function fallbackCursorPoint(): CursorPoint {
  return { path: "/root/children/0", edge: "before", affinity: "forward" };
}
