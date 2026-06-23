import type {
  CursorAffinity,
  CursorDirection,
  CursorEdge,
  CursorPoint,
  CursorPointInput,
} from "./cursor";
import { blockIndexFromCursorPath } from "./cursorAddressing";
import type { CaretMap, CursorMap } from "./cursorMap";
import type { NoteDocument } from "./noteDocument";
import { textBoundaryIndex } from "./textBoundaries";

export function resolveCursorIndexInMap(
  cursorMap: CursorMap,
  point: CursorPointInput,
): number {
  if (point.offset !== undefined) {
    const text = cursorMap.text.get(point.path);
    if (text !== undefined) {
      return (
        text.start +
        textBoundaryIndex(text.offsets, clampOffset(point.offset, text.length))
      );
    }
  }

  if (point.edge !== undefined) {
    const edge = cursorMap.edges.get(point.path);
    if (edge !== undefined) {
      return point.edge === "after" ? edge.after : edge.before;
    }
  }

  return 0;
}

export function resolveCaretIndexInMap(
  document: NoteDocument,
  caretMap: CaretMap,
  point: CursorPointInput,
  direction?: CursorDirection,
): number {
  if (caretMap.positions.length === 0) {
    return 0;
  }

  const text = caretMap.text.get(point.path);
  if (text !== undefined) {
    return (
      text.start +
      textBoundaryIndex(
        text.offsets,
        clampOffset(point.offset ?? 0, text.length),
      )
    );
  }

  const edge = caretMap.edges.get(point.path);
  if (edge !== undefined) {
    return point.edge === "after" ? edge.after : edge.before;
  }

  if (point.edge !== undefined) {
    return projectBlockEdgeToCaretIndex(document, caretMap, point, direction);
  }

  if (blockIndexFromCursorPath(point.path) !== null) {
    return projectBlockEdgeToCaretIndex(
      document,
      caretMap,
      { ...point, edge: "before" },
      direction,
    );
  }

  return 0;
}

export function cursorPointAtInMap(
  cursorMap: CursorMap,
  boundaryIndex: number,
): CursorPoint {
  const index = clampOffset(boundaryIndex, cursorMap.positions.length - 1);
  const point = cursorMap.positions[index];

  if (point !== undefined) {
    return {
      ...point,
      affinity: pointAffinity(point, index, cursorMap.positions.length - 1),
    };
  }

  return { path: "/root/children/0", edge: "before", affinity: "forward" };
}

function projectBlockEdgeToCaretIndex(
  document: NoteDocument,
  caretMap: CaretMap,
  point: CursorPointInput & { edge?: CursorEdge },
  direction?: CursorDirection,
): number {
  const blockIndex = blockIndexFromCursorPath(point.path);
  const lastCaretIndex = Math.max(caretMap.positions.length - 1, 0);
  if (blockIndex === null) {
    return 0;
  }

  const blockPath = `/root/children/${blockIndex}`;
  if (point.path !== blockPath) {
    return 0;
  }

  if (blockIndex >= document.root.children.length) {
    return lastCaretIndex;
  }

  const edge = point.edge === "after" ? "after" : "before";
  const firstInBlock = firstCaretIndexForBlock(caretMap, blockIndex);
  const lastInBlock = lastCaretIndexForBlock(caretMap, blockIndex);
  const beforeBlock = lastCaretIndexBeforeBlock(caretMap, blockIndex);
  const afterBlock = firstCaretIndexAfterBlock(caretMap, blockIndex);

  if (edge === "before") {
    if (direction === "backward") {
      return (beforeBlock ?? firstInBlock ?? 0) + 1;
    }

    if (direction === "forward") {
      return (firstInBlock ?? afterBlock ?? lastCaretIndex) - 1;
    }

    return firstInBlock ?? afterBlock ?? lastCaretIndex;
  }

  if (direction === "forward") {
    return (afterBlock ?? lastInBlock ?? lastCaretIndex) - 1;
  }

  if (direction === "backward") {
    return (lastInBlock ?? beforeBlock ?? 0) + 1;
  }

  return lastInBlock ?? beforeBlock ?? 0;
}

function firstCaretIndexForBlock(
  caretMap: CaretMap,
  blockIndex: number,
): number | undefined {
  const index = caretMap.positions.findIndex(
    (point) => blockIndexFromCursorPath(point.path) === blockIndex,
  );

  return index === -1 ? undefined : index;
}

function lastCaretIndexForBlock(
  caretMap: CaretMap,
  blockIndex: number,
): number | undefined {
  for (let index = caretMap.positions.length - 1; index >= 0; index -= 1) {
    if (
      blockIndexFromCursorPath(caretMap.positions[index]?.path ?? "") ===
      blockIndex
    ) {
      return index;
    }
  }

  return undefined;
}

function firstCaretIndexAfterBlock(
  caretMap: CaretMap,
  blockIndex: number,
): number | undefined {
  const index = caretMap.positions.findIndex((point) => {
    const pointBlockIndex = blockIndexFromCursorPath(point.path);
    return pointBlockIndex !== null && pointBlockIndex > blockIndex;
  });

  return index === -1 ? undefined : index;
}

function lastCaretIndexBeforeBlock(
  caretMap: CaretMap,
  blockIndex: number,
): number | undefined {
  for (let index = caretMap.positions.length - 1; index >= 0; index -= 1) {
    const pointBlockIndex = blockIndexFromCursorPath(
      caretMap.positions[index]?.path ?? "",
    );
    if (pointBlockIndex !== null && pointBlockIndex < blockIndex) {
      return index;
    }
  }

  return undefined;
}

function pointAffinity(
  point: CursorPoint,
  index: number,
  lastIndex: number,
): CursorAffinity {
  if ("edge" in point) {
    return point.edge === "before" ? "forward" : "backward";
  }

  return index >= lastIndex ? "backward" : "forward";
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(offset), 0), length);
}
