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
import {
  nextTextBoundaryOffset,
  previousTextBoundaryOffset,
  snapTextOffset,
  textBoundaryIndex,
  textBoundaryOffsets,
} from "./textBoundaries";

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
  text: Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >;
  edges: Map<string, { before: number; after: number }>;
  atoms: Map<string, { before: number; after: number }>;
};

type CaretMap = CursorMap;

export function firstCursorPoint(document: NoteDocument): CursorPoint {
  return firstCaretPointFromBlock(document, 0) ?? fallbackCursorPoint();
}

export function lastCursorPoint(document: NoteDocument): CursorPoint {
  return (
    lastCaretPointFromBlock(document, document.root.children.length - 1) ??
    fallbackCursorPoint()
  );
}

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
  const next =
    direction === "forward"
      ? nextWordBoundaryFromPoint(document, normalized)
      : previousWordBoundaryFromPoint(document, normalized);

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

export function cursorLength(document: NoteDocument): number {
  return Math.max(createCaretMap(document).positions.length - 1, 0);
}

export function resolveCursorIndex(
  document: NoteDocument,
  point: CursorPointInput,
): number {
  const caretMap = createCaretMap(document);

  return resolveCaretIndexInMap(document, caretMap, point);
}

export function resolveDocumentCursorIndex(
  document: NoteDocument,
  point: CursorPointInput,
): number {
  const cursorMap = createCursorMap(document);

  return resolveCursorIndexInMap(cursorMap, point);
}

export function documentCursorPointAt(
  document: NoteDocument,
  boundaryIndex: number,
): CursorPoint {
  const cursorMap = createCursorMap(document);

  return cursorPointAtInMap(cursorMap, boundaryIndex);
}

export function moveDocumentCursor(
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
): CursorPoint {
  const cursorMap = createCursorMap(document);
  const current = resolveCursorIndexInMap(cursorMap, point);
  const next = direction === "forward" ? current + 1 : current - 1;

  return cursorPointAtInMap(cursorMap, next);
}

export function createCursorIndexResolver(
  document: NoteDocument,
): (point: CursorPointInput) => number {
  const caretMap = createCaretMap(document);

  return (point) => resolveCaretIndexInMap(document, caretMap, point);
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

function resolveCaretIndexInMap(
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

type TextAddress = {
  blockIndex: number;
  inlineIndex?: number;
  path: string;
  text: string;
};

type AtomAddress = {
  blockIndex: number;
  inlineIndex?: number;
  path: string;
};

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

function textAddressFromPath(
  document: NoteDocument,
  path: string,
): TextAddress | null {
  const segments = tryParsePointer(path);
  const blockIndex = blockIndexFromParsedPointer(segments);
  if (segments === null || blockIndex === null) {
    return null;
  }

  const block = document.root.children[blockIndex];
  if (block === undefined) {
    return null;
  }

  if (isCodeBlock(block) && segments.length === 4 && segments[3] === "text") {
    return { blockIndex, path, text: block.text };
  }

  if (
    !isInlineTextBlock(block) ||
    segments.length !== 6 ||
    segments[3] !== "children" ||
    segments[5] !== "text"
  ) {
    return null;
  }

  const inlineIndex = arrayIndexFromSegment(segments[4]);
  if (inlineIndex === null) {
    return null;
  }

  const child = block.children[inlineIndex];
  if (child?.type !== "text") {
    if (inlineIndex === 0 && block.children.length === 0) {
      return { blockIndex, inlineIndex, path, text: "" };
    }

    return null;
  }

  return { blockIndex, inlineIndex, path, text: child.text };
}

function atomAddressFromPath(
  document: NoteDocument,
  path: string,
): AtomAddress | null {
  const segments = tryParsePointer(path);
  const blockIndex = blockIndexFromParsedPointer(segments);
  if (segments === null || blockIndex === null) {
    return null;
  }

  const block = document.root.children[blockIndex];
  if (block === undefined) {
    return null;
  }

  if (isFigureBlock(block) && path === `/root/children/${blockIndex}`) {
    return { blockIndex, path };
  }

  if (
    !isInlineTextBlock(block) ||
    segments.length !== 5 ||
    segments[3] !== "children"
  ) {
    return null;
  }

  const inlineIndex = arrayIndexFromSegment(segments[4]);
  if (inlineIndex === null) {
    return null;
  }

  const child = block.children[inlineIndex];
  if (child?.type !== "mention") {
    return null;
  }

  return { blockIndex, inlineIndex, path };
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

function firstCaretPointFromBlock(
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

function lastCaretPointFromBlock(
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

function firstCaretPointInSingleBlock(
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

function lastCaretPointInSingleBlock(
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

function firstInlineCaretAfterIndex(
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

function lastInlineCaretBeforeIndex(
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

function nextWordBoundaryFromPoint(
  document: NoteDocument,
  point: CursorPoint,
): CursorPoint | null {
  let current = point;
  let next = moveCursor(document, current, "forward");

  while (!cursorPointsEqual(current, next)) {
    const unitKind = unitKindBetween(document, current, next);
    if (unitKind !== "separator") {
      break;
    }

    current = next;
    next = moveCursor(document, current, "forward");
  }

  if (cursorPointsEqual(current, next)) {
    return current;
  }

  if (unitKindBetween(document, current, next) === "atom") {
    return next;
  }

  while (!cursorPointsEqual(current, next)) {
    const unitKind = unitKindBetween(document, current, next);
    if (unitKind !== "word") {
      break;
    }

    current = next;
    next = moveCursor(document, current, "forward");
  }

  return current;
}

function previousWordBoundaryFromPoint(
  document: NoteDocument,
  point: CursorPoint,
): CursorPoint | null {
  let current = point;
  let previous = moveCursor(document, current, "backward");

  while (!cursorPointsEqual(previous, current)) {
    const unitKind = unitKindBetween(document, previous, current);
    if (unitKind !== "separator") {
      break;
    }

    current = previous;
    previous = moveCursor(document, current, "backward");
  }

  if (cursorPointsEqual(previous, current)) {
    return current;
  }

  if (unitKindBetween(document, previous, current) === "atom") {
    return previous;
  }

  while (!cursorPointsEqual(previous, current)) {
    const unitKind = unitKindBetween(document, previous, current);
    if (unitKind !== "word") {
      break;
    }

    current = previous;
    previous = moveCursor(document, current, "backward");
  }

  return current;
}

function unitKindBetween(
  document: NoteDocument,
  from: CursorPoint,
  to: CursorPoint,
): CursorUnitKind {
  if (from.edge === "before" && to.edge === "after" && from.path === to.path) {
    return "atom";
  }

  if (
    from.offset !== undefined &&
    to.offset !== undefined &&
    from.path === to.path
  ) {
    const text = textAddressFromPath(document, from.path);
    if (
      text !== null &&
      nextTextBoundaryOffset(text.text, from.offset) === to.offset
    ) {
      return wordKindForCharacter(text.text.slice(from.offset, to.offset));
    }
  }

  if (from.offset !== undefined && to.offset !== undefined) {
    const fromText = textAddressFromPath(document, from.path);
    const toText = textAddressFromPath(document, to.path);
    if (
      fromText !== null &&
      toText !== null &&
      fromText.blockIndex === toText.blockIndex &&
      fromText.inlineIndex !== undefined &&
      toText.inlineIndex !== undefined &&
      toText.inlineIndex === fromText.inlineIndex + 1 &&
      from.offset === fromText.text.length &&
      to.offset === nextTextBoundaryOffset(toText.text, 0)
    ) {
      return wordKindForCharacter(toText.text.slice(0, to.offset));
    }

    if (
      fromText !== null &&
      toText !== null &&
      fromText.blockIndex === toText.blockIndex &&
      fromText.inlineIndex !== undefined &&
      toText.inlineIndex !== undefined &&
      toText.inlineIndex === fromText.inlineIndex + 1 &&
      from.offset ===
        previousTextBoundaryOffset(fromText.text, fromText.text.length) &&
      to.offset === 0
    ) {
      return wordKindForCharacter(fromText.text.slice(from.offset));
    }
  }

  return "separator";
}

function wordKindForCharacter(character: string | undefined): CursorUnitKind {
  return isWordCharacter(character) ? "word" : "separator";
}

function cursorPointsEqual(left: CursorPointInput, right: CursorPointInput) {
  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}

function blockIndexFromParsedPointer(segments: string[] | null): number | null {
  if (
    segments === null ||
    segments[0] !== "root" ||
    segments[1] !== "children"
  ) {
    return null;
  }

  return arrayIndexFromSegment(segments[2]);
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
      offset: snapTextOffset(text.value, point.offset ?? 0, point.affinity),
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
  const caretMap = createCaretMap(document);
  return cursorPointAtInMap(caretMap, boundaryIndex);
}

function cursorPointAtInMap(
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

function createCursorMap(document: NoteDocument): CursorMap {
  const positions: CursorPoint[] = [];
  const text = new Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >();
  const edges = new Map<string, { before: number; after: number }>();
  const atoms = new Map<string, { before: number; after: number }>();

  for (const [blockIndex, block] of document.root.children.entries()) {
    const blockPath = `/root/children/${blockIndex}`;

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

      if (block.children.length === 0) {
        appendPlainTextPositions(
          positions,
          text,
          `${blockPath}/children/0/text`,
          "",
        );
      }
    }

    const after = positions.length;
    positions.push({ path: blockPath, edge: "after" });
    edges.set(blockPath, { before, after });
  }

  return { positions, text, edges, atoms };
}

function createCaretMap(document: NoteDocument): CaretMap {
  const positions: CursorPoint[] = [];
  const text = new Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >();
  const edges = new Map<string, { before: number; after: number }>();
  const atoms = new Map<string, { before: number; after: number }>();

  for (const [blockIndex, block] of document.root.children.entries()) {
    const blockPath = `/root/children/${blockIndex}`;

    if (isFigureBlock(block)) {
      atoms.set(blockPath, appendEdgePositions(positions, edges, blockPath));
      continue;
    }

    const blockStart = positions.length;
    if (isCodeBlock(block)) {
      appendPlainTextPositions(
        positions,
        text,
        `${blockPath}/text`,
        block.text,
      );
      continue;
    }

    if (isInlineTextBlock(block)) {
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

      if (positions.length === blockStart) {
        appendPlainTextPositions(
          positions,
          text,
          `${blockPath}/children/0/text`,
          "",
        );
      }
    }
  }

  return { positions, text, edges, atoms };
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

function appendInlineTextPositions(
  positions: CursorPoint[],
  text: Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >,
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
  text: Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >,
  path: string,
  value: string,
  options: { collapseStart?: boolean } = {},
) {
  const collapseStart = options.collapseStart === true && positions.length > 0;
  const start = collapseStart ? positions.length - 1 : positions.length;
  const offsets = textBoundaryOffsets(value);

  text.set(path, { start, length: value.length, offsets, value });

  for (const offset of collapseStart ? offsets.slice(1) : offsets) {
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

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}

function blockIndexFromCursorPath(path: string): number | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments[0] !== "root" ||
    segments[1] !== "children"
  ) {
    return null;
  }

  return arrayIndexFromSegment(segments[2]);
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

function pointAffinityFromEdge(point: EdgeCursorPoint): CursorAffinity {
  return point.edge === "before" ? "forward" : "backward";
}

function fallbackCursorPoint(): CursorPoint {
  return { path: "/root/children/0", edge: "before", affinity: "forward" };
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(offset), 0), length);
}
