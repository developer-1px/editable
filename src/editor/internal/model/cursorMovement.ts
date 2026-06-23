import type {
  CursorAffinity,
  CursorDirection,
  CursorPoint,
  CursorPointInput,
  EdgeCursorPoint,
} from "./cursor";
import {
  type AtomAddress,
  atomAddressFromPath,
  blockIndexFromCursorPath,
  type TextAddress,
  textAddressFromPath,
} from "./cursorAddressing";
import {
  firstCaretPointFromBlock,
  firstCaretPointInSingleBlock,
  firstCursorPoint,
  firstInlineCaretAfterIndex,
  lastCaretPointFromBlock,
  lastCaretPointInSingleBlock,
  lastCursorPoint,
  lastInlineCaretBeforeIndex,
} from "./cursorEndpoints";
import {
  cursorPointAtInMap,
  resolveCursorIndexInMap,
} from "./cursorIndexProjection";
import { createCursorMap } from "./cursorMap";
import { normalizeCursorPoint } from "./cursorNormalization";
import { resolveWordBoundaryCursorPoint } from "./cursorWordMovement";
import type { NoteDocument } from "./noteDocument";
import {
  nextTextBoundaryOffset,
  previousTextBoundaryOffset,
  snapTextOffset,
} from "./textBoundaries";

export function moveCursor(
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
): CursorPoint {
  const moved =
    direction === "forward"
      ? moveCursorForward(document, point)
      : moveCursorBackward(document, point);
  if (moved === null) {
    return normalizeCursorPoint(document, point);
  }

  return cursorPointAfterMove(moved, direction);
}

export function moveCursorByWord(
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
): CursorPoint {
  const normalized = normalizeCursorPoint(document, point);
  const next = resolveWordBoundaryCursorPoint(
    document,
    normalized,
    direction,
    moveCursor,
  );

  return cursorPointAfterMove(next ?? normalized, direction);
}

export function moveCursorByBlockBoundary(
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
): CursorPoint {
  const cursorMap = createCursorMap(document);
  const blockIndex = blockIndexFromCursorPath(point.path);
  const lastBlockIndex = Math.max(document.root.children.length - 1, 0);
  if (blockIndex === null) {
    return direction === "backward"
      ? firstCursorPoint(document)
      : lastCursorPoint(document);
  }

  const currentBlockIndex = clampOffset(blockIndex, lastBlockIndex);
  const currentBlockEdge = cursorMap.edges.get(
    `/root/children/${currentBlockIndex}`,
  );
  if (currentBlockEdge === undefined) {
    return direction === "backward"
      ? firstCursorPoint(document)
      : lastCursorPoint(document);
  }

  const current = resolveCursorIndexInMap(cursorMap, point);
  const targetBlockIndex =
    direction === "backward"
      ? current <= currentBlockEdge.before
        ? Math.max(currentBlockIndex - 1, 0)
        : currentBlockIndex
      : current >= currentBlockEdge.after
        ? Math.min(currentBlockIndex + 1, lastBlockIndex)
        : currentBlockIndex;
  const targetBlockEdge = cursorMap.edges.get(
    `/root/children/${targetBlockIndex}`,
  );
  if (targetBlockEdge === undefined) {
    return direction === "backward"
      ? firstCursorPoint(document)
      : lastCursorPoint(document);
  }

  return cursorPointAtInMap(
    cursorMap,
    direction === "backward" ? targetBlockEdge.before : targetBlockEdge.after,
  );
}

function moveCursorForward(
  document: NoteDocument,
  point: CursorPointInput,
): CursorPoint | null {
  const text = textAddressFromPath(document, point.path);
  if (text !== null) {
    const offset = snapTextOffset(text.text, point.offset ?? 0, "backward");
    if (offset < text.text.length) {
      return {
        path: text.path,
        offset: nextTextBoundaryOffset(text.text, offset),
      };
    }

    return nextCaretAfterText(document, text);
  }

  if (point.edge !== undefined) {
    const atom = atomAddressFromPath(document, point.path);
    if (atom !== null) {
      return point.edge === "before"
        ? { path: atom.path, edge: "after" }
        : nextCaretAfterAtom(document, atom);
    }

    return nextCaretFromBlockEdge(document, point);
  }

  return firstCursorPoint(document);
}

function moveCursorBackward(
  document: NoteDocument,
  point: CursorPointInput,
): CursorPoint | null {
  const text = textAddressFromPath(document, point.path);
  if (text !== null) {
    const offset = snapTextOffset(text.text, point.offset ?? 0, "forward");
    if (offset > 0) {
      return {
        path: text.path,
        offset: previousTextBoundaryOffset(text.text, offset),
      };
    }

    return previousCaretBeforeText(document, text);
  }

  if (point.edge !== undefined) {
    const atom = atomAddressFromPath(document, point.path);
    if (atom !== null) {
      return point.edge === "after"
        ? { path: atom.path, edge: "before" }
        : previousCaretBeforeAtom(document, atom);
    }

    return previousCaretFromBlockEdge(document, point);
  }

  return lastCursorPoint(document);
}

function nextCaretAfterText(
  document: NoteDocument,
  text: TextAddress,
): CursorPoint | null {
  if (text.inlineIndex === undefined) {
    return firstCaretPointFromBlock(document, text.blockIndex + 1);
  }

  return firstInlineCaretAfterIndex(
    document,
    text.blockIndex,
    text.inlineIndex,
    { fromAdjacentTextBoundary: true },
  );
}

function previousCaretBeforeText(
  document: NoteDocument,
  text: TextAddress,
): CursorPoint | null {
  if (text.inlineIndex === undefined) {
    return lastCaretPointFromBlock(document, text.blockIndex - 1);
  }

  return lastInlineCaretBeforeIndex(
    document,
    text.blockIndex,
    text.inlineIndex,
    { fromAdjacentTextBoundary: true },
  );
}

function nextCaretAfterAtom(
  document: NoteDocument,
  atom: AtomAddress,
): CursorPoint | null {
  if (atom.inlineIndex === undefined) {
    return firstCaretPointFromBlock(document, atom.blockIndex + 1);
  }

  return firstInlineCaretAfterIndex(
    document,
    atom.blockIndex,
    atom.inlineIndex,
    { fromAdjacentTextBoundary: false },
  );
}

function previousCaretBeforeAtom(
  document: NoteDocument,
  atom: AtomAddress,
): CursorPoint | null {
  if (atom.inlineIndex === undefined) {
    return lastCaretPointFromBlock(document, atom.blockIndex - 1);
  }

  return lastInlineCaretBeforeIndex(
    document,
    atom.blockIndex,
    atom.inlineIndex,
    { fromAdjacentTextBoundary: false },
  );
}

function nextCaretFromBlockEdge(
  document: NoteDocument,
  point: CursorPointInput,
): CursorPoint | null {
  const blockIndex = blockIndexFromCursorPath(point.path);
  if (blockIndex === null || point.path !== `/root/children/${blockIndex}`) {
    return null;
  }

  return point.edge === "after"
    ? firstCaretPointFromBlock(document, blockIndex + 1)
    : firstCaretPointInSingleBlock(document, blockIndex);
}

function previousCaretFromBlockEdge(
  document: NoteDocument,
  point: CursorPointInput,
): CursorPoint | null {
  const blockIndex = blockIndexFromCursorPath(point.path);
  if (blockIndex === null || point.path !== `/root/children/${blockIndex}`) {
    return null;
  }

  return point.edge === "before"
    ? lastCaretPointFromBlock(document, blockIndex - 1)
    : lastCaretPointInSingleBlock(document, blockIndex);
}

function cursorPointAfterMove(
  point: CursorPoint,
  direction: CursorDirection,
): CursorPoint {
  if (point.offset === undefined) {
    return { ...point, affinity: pointAffinityFromEdge(point) };
  }

  return {
    ...point,
    affinity: direction === "forward" ? "backward" : "forward",
  };
}

function pointAffinityFromEdge(point: EdgeCursorPoint): CursorAffinity {
  return point.edge === "before" ? "forward" : "backward";
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(offset), 0), length);
}
