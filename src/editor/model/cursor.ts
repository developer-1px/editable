import {
  type SelectionPointObject,
  tryParsePointer,
} from "@interactive-os/json-document";
import {
  type InlineNode,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";

export type CursorDirection = "backward" | "forward";
export type CursorEdge = "before" | "after";
export type CursorAffinity = "backward" | "forward";
export type TextCursorPoint = {
  path: string;
  offset: number;
  edge?: never;
  affinity?: CursorAffinity;
};
export type EdgeCursorPoint = {
  path: string;
  edge: CursorEdge;
  offset?: never;
  affinity?: CursorAffinity;
};
export type CursorPoint = TextCursorPoint | EdgeCursorPoint;
export type CursorPointInput = {
  path: string;
  offset?: number;
  edge?: CursorEdge;
  affinity?: CursorAffinity;
};

type CursorMap = {
  positions: CursorPoint[];
  text: Map<string, { start: number; length: number; value: string }>;
  edges: Map<string, { before: number; after: number }>;
  atoms: Map<string, { before: number; after: number }>;
};

export function firstCursorPoint(document: NoteDocument): CursorPoint {
  return cursorPointAt(document, 0);
}

export function lastCursorPoint(document: NoteDocument): CursorPoint {
  return cursorPointAt(document, cursorLength(document));
}

export function moveCursor(
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
): CursorPoint {
  const length = cursorLength(document);
  const current = resolveCursorIndex(document, point);
  const next =
    direction === "forward"
      ? Math.min(current + 1, length)
      : Math.max(current - 1, 0);

  return cursorPointAt(document, next);
}

export function moveCursorByWord(
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
): CursorPoint {
  const cursorMap = createCursorMap(document);
  const length = Math.max(cursorMap.positions.length - 1, 0);
  const current = resolveCursorIndexInMap(cursorMap, point);
  const next =
    direction === "forward"
      ? nextWordBoundary(cursorMap, current, length)
      : previousWordBoundary(cursorMap, current);

  return cursorPointAt(document, next);
}

export function moveCursorByBlockBoundary(
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
): CursorPoint {
  const cursorMap = createCursorMap(document);
  const blockIndex = blockIndexFromCursorPath(point.path);
  const lastBlockIndex = Math.max(document.blocks.length - 1, 0);
  if (blockIndex === null) {
    return direction === "backward"
      ? firstCursorPoint(document)
      : lastCursorPoint(document);
  }

  const currentBlockIndex = clampOffset(blockIndex, lastBlockIndex);
  const currentBlockEdge = cursorMap.edges.get(`/blocks/${currentBlockIndex}`);
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
  const targetBlockEdge = cursorMap.edges.get(`/blocks/${targetBlockIndex}`);
  if (targetBlockEdge === undefined) {
    return direction === "backward"
      ? firstCursorPoint(document)
      : lastCursorPoint(document);
  }

  return cursorPointAt(
    document,
    direction === "backward" ? targetBlockEdge.before : targetBlockEdge.after,
  );
}

export function cursorLength(document: NoteDocument): number {
  return Math.max(createCursorMap(document).positions.length - 1, 0);
}

export function resolveCursorIndex(
  document: NoteDocument,
  point: CursorPointInput,
): number {
  const cursorMap = createCursorMap(document);

  return resolveCursorIndexInMap(cursorMap, point);
}

export function selectedAtomPointersBetween(
  document: NoteDocument,
  anchor: CursorPointInput,
  focus: CursorPointInput,
): string[] {
  const cursorMap = createCursorMap(document);
  const anchorIndex = resolveCursorIndexInMap(cursorMap, anchor);
  const focusIndex = resolveCursorIndexInMap(cursorMap, focus);
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);

  if (start === end) {
    return [];
  }

  return Array.from(cursorMap.atoms.entries()).flatMap(([path, atom]) =>
    atom.before >= start && atom.after <= end ? [path] : [],
  );
}

function resolveCursorIndexInMap(
  cursorMap: CursorMap,
  point: CursorPointInput,
): number {
  if (point.offset !== undefined) {
    const text = cursorMap.text.get(point.path);
    if (text !== undefined) {
      return text.start + clampOffset(point.offset, text.length);
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

export function normalizeCursorPoint(
  document: NoteDocument,
  point: CursorPointInput,
): CursorPoint {
  const cursorMap = createCursorMap(document);
  const text = cursorMap.text.get(point.path);

  if (text !== undefined) {
    return {
      path: point.path,
      offset: clampOffset(point.offset ?? 0, text.length),
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }

  if (cursorMap.edges.has(point.path)) {
    return {
      path: point.path,
      edge: point.edge === "after" ? "after" : "before",
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }

  return firstCursorPoint(document);
}

export function toSelectionPoint(point: CursorPoint): SelectionPointObject {
  return { ...point };
}

export function cursorPointAt(
  document: NoteDocument,
  boundaryIndex: number,
): CursorPoint {
  const cursorMap = createCursorMap(document);
  const index = clampOffset(boundaryIndex, cursorMap.positions.length - 1);
  const point = cursorMap.positions[index];

  if (point !== undefined) {
    return {
      ...point,
      affinity: pointAffinity(point, index, cursorMap.positions.length - 1),
    };
  }

  return { path: "/blocks/0", edge: "before", affinity: "forward" };
}

function createCursorMap(document: NoteDocument): CursorMap {
  const positions: CursorPoint[] = [];
  const text = new Map<
    string,
    { start: number; length: number; value: string }
  >();
  const edges = new Map<string, { before: number; after: number }>();
  const atoms = new Map<string, { before: number; after: number }>();

  for (const [blockIndex, block] of document.blocks.entries()) {
    const blockPath = `/blocks/${blockIndex}`;

    if (isFigureBlock(block)) {
      atoms.set(blockPath, appendEdgePositions(positions, edges, blockPath));
      continue;
    }

    const before = positions.length;
    positions.push({ path: blockPath, edge: "before" });

    if (isCodeBlock(block)) {
      appendPlainTextPositions(
        positions,
        text,
        `${blockPath}/text`,
        block.text,
      );
    } else if (isInlineTextBlock(block)) {
      let previousInlineWasText = false;
      for (const [inlineIndex, child] of block.children.entries()) {
        const childPath = `${blockPath}/children/${inlineIndex}`;

        if (child.type === "mention") {
          atoms.set(
            childPath,
            appendEdgePositions(positions, edges, childPath),
          );
          previousInlineWasText = false;
          continue;
        }

        appendInlineTextPositions(positions, text, childPath, child, {
          collapseStart: previousInlineWasText,
        });
        previousInlineWasText = true;
      }
    }

    const after = positions.length;
    positions.push({ path: blockPath, edge: "after" });
    edges.set(blockPath, { before, after });
  }

  return { positions, text, edges, atoms };
}

function appendInlineTextPositions(
  positions: CursorPoint[],
  text: Map<string, { start: number; length: number; value: string }>,
  childPath: string,
  child: Extract<InlineNode, { type: "text" }>,
  options: { collapseStart?: boolean } = {},
) {
  appendPlainTextPositions(positions, text, `${childPath}/text`, child.text, {
    collapseStart: options.collapseStart,
  });
}

function appendPlainTextPositions(
  positions: CursorPoint[],
  text: Map<string, { start: number; length: number; value: string }>,
  path: string,
  value: string,
  options: { collapseStart?: boolean } = {},
) {
  const collapseStart = options.collapseStart === true && positions.length > 0;
  const start = collapseStart ? positions.length - 1 : positions.length;

  text.set(path, { start, length: value.length, value });

  for (
    let offset = collapseStart ? 1 : 0;
    offset <= value.length;
    offset += 1
  ) {
    positions.push({ path, offset });
  }
}

function appendEdgePositions(
  positions: CursorPoint[],
  edges: Map<string, { before: number; after: number }>,
  path: string,
): { before: number; after: number } {
  const before = positions.length;
  positions.push({ path, edge: "before" });
  const after = positions.length;
  positions.push({ path, edge: "after" });
  const range = { before, after };
  edges.set(path, range);

  return range;
}

type CursorUnitKind = "atom" | "separator" | "word";

function nextWordBoundary(
  cursorMap: CursorMap,
  current: number,
  length: number,
): number {
  let index = clampOffset(current, length);

  while (index < length && unitKindAt(cursorMap, index) === "separator") {
    index += 1;
  }

  if (unitKindAt(cursorMap, index) === "atom") {
    return Math.min(index + 1, length);
  }

  while (index < length && unitKindAt(cursorMap, index) === "word") {
    index += 1;
  }

  return index;
}

function previousWordBoundary(cursorMap: CursorMap, current: number): number {
  let index = clampOffset(current, cursorMap.positions.length - 1) - 1;

  while (index >= 0 && unitKindAt(cursorMap, index) === "separator") {
    index -= 1;
  }

  if (index < 0) {
    return 0;
  }

  if (unitKindAt(cursorMap, index) === "atom") {
    return index;
  }

  while (index > 0 && unitKindAt(cursorMap, index - 1) === "word") {
    index -= 1;
  }

  return index;
}

function unitKindAt(
  cursorMap: CursorMap,
  boundaryIndex: number,
): CursorUnitKind {
  for (const atom of cursorMap.atoms.values()) {
    if (atom.before === boundaryIndex && atom.after === boundaryIndex + 1) {
      return "atom";
    }
  }

  for (const entry of cursorMap.text.values()) {
    if (
      boundaryIndex >= entry.start &&
      boundaryIndex < entry.start + entry.length
    ) {
      return isWordCharacter(entry.value[boundaryIndex - entry.start])
        ? "word"
        : "separator";
    }
  }

  return "separator";
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /^[\p{L}\p{N}_]$/u.test(character);
}

function blockIndexFromCursorPath(path: string): number | null {
  const segments = tryParsePointer(path);
  if (segments === null || segments[0] !== "blocks") {
    return null;
  }

  return arrayIndexFromSegment(segments[1]);
}

function arrayIndexFromSegment(segment: string | undefined): number | null {
  if (segment === undefined || !/^(0|[1-9]\d*)$/.test(segment)) {
    return null;
  }

  return Number(segment);
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
