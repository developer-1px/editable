import type {
  SelectionContext,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  type CursorPointInput,
  cursorPointAt,
  firstCursorPoint,
  lastCursorPoint,
  moveCursor,
  moveCursorByBlockBoundary,
  moveCursorByWord,
  normalizeCursorPoint,
  resolveCursorIndex,
  resolveDocumentCursorIndex,
} from "./cursor";
import type { NoteDocument } from "./noteDocument";
import {
  cursorPointInputFromSelectionPoint,
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./richSelection";

export {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./richSelection";

export type CursorCommandResult = {
  selectionAfter: SelectionSnap;
};

export type CursorMoveOptions = {
  extend?: boolean;
};

export type CursorGeometryAdapter = {
  rectForPoint(point: CursorPoint): DOMRect | null;
  pointFromCoordinates(x: number, y: number): CursorPointInput | null;
  pointForVerticalMovement?(
    origin: CursorPoint,
    x: number,
    direction: "up" | "down",
    distance: "line" | "page",
  ): CursorPointInput | null;
  lineStartPoint?(point: CursorPoint): CursorPointInput | null;
  lineEndPoint?(point: CursorPoint): CursorPointInput | null;
  pageStep?(): number;
};

export function moveLeft(
  document: NoteDocument,
  selection: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveHorizontal(document, selection, "backward", options);
}

export function moveRight(
  document: NoteDocument,
  selection: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveHorizontal(document, selection, "forward", options);
}

export function moveWordLeft(
  document: NoteDocument,
  selection: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveHorizontalByWord(document, selection, "backward", options);
}

export function moveWordRight(
  document: NoteDocument,
  selection: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveHorizontalByWord(document, selection, "forward", options);
}

export function moveBlockStart(
  document: NoteDocument,
  selection: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveByBlockBoundary(document, selection, "backward", options);
}

export function moveBlockEnd(
  document: NoteDocument,
  selection: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveByBlockBoundary(document, selection, "forward", options);
}

export function moveLineStart(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveByLineBoundary(document, selection, geometry, "start", options);
}

export function moveLineEnd(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveByLineBoundary(document, selection, geometry, "end", options);
}

export function moveUp(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVertical(document, selection, geometry, "up", "line", options);
}

export function moveDown(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVertical(document, selection, geometry, "down", "line", options);
}

export function movePageUp(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVertical(document, selection, geometry, "up", "page", options);
}

export function movePageDown(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVertical(document, selection, geometry, "down", "page", options);
}

export function moveStart(
  document: NoteDocument,
  selection?: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  const target = firstCursorPoint(document);

  return {
    selectionAfter:
      selection === undefined
        ? selectionFromCursorPoint(target)
        : selectionAfterMove(document, selection, target, options),
  };
}

export function moveEnd(
  document: NoteDocument,
  selection?: SelectionSnap,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  const target = lastCursorPoint(document);

  return {
    selectionAfter:
      selection === undefined
        ? selectionFromCursorPoint(target)
        : selectionAfterMove(document, selection, target, options),
  };
}

export function selectAll(document: NoteDocument): CursorCommandResult {
  return {
    selectionAfter: selectionFromCursorRange(
      document,
      firstCursorPoint(document),
      lastCursorPoint(document),
    ),
  };
}

function moveVertical(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  direction: "up" | "down",
  distance: "line" | "page",
  options: CursorMoveOptions,
): CursorCommandResult {
  const collapsedRangeEdge = collapseOpenRangeEdge(
    document,
    selection,
    direction === "up" ? "backward" : "forward",
    options,
  );
  if (collapsedRangeEdge !== null) {
    return { selectionAfter: selectionFromCursorPoint(collapsedRangeEdge) };
  }

  const current = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const rect = geometry.rectForPoint(current);
  if (rect === null) {
    const target =
      direction === "up"
        ? firstCursorPoint(document)
        : lastCursorPoint(document);

    return {
      selectionAfter: selectionAfterMove(
        document,
        selection,
        target,
        options,
        contextWithPreferredX(0),
      ),
    };
  }

  const preferredX =
    readPreferredX(selection.context) ?? rect.left + rect.width / 2;
  const step = distance === "page" ? pageStepForGeometry(geometry, rect) : 1;
  const targetY = direction === "up" ? rect.top - step : rect.bottom + step;
  const directionalTarget =
    distance === "line"
      ? geometry.pointForVerticalMovement?.(
          current,
          preferredX,
          direction,
          distance,
        )
      : undefined;
  const target =
    directionalTarget === undefined
      ? geometry.pointFromCoordinates(preferredX, targetY)
      : directionalTarget;
  if (target === null) {
    const fallback =
      direction === "up"
        ? firstCursorPoint(document)
        : lastCursorPoint(document);

    return {
      selectionAfter: selectionAfterMove(
        document,
        selection,
        fallback,
        options,
        contextWithPreferredX(preferredX),
      ),
    };
  }

  return {
    selectionAfter: selectionAfterMove(
      document,
      selection,
      normalizeCursorPoint(document, target),
      options,
      contextWithPreferredX(preferredX),
    ),
  };
}

function pageStepForGeometry(
  geometry: CursorGeometryAdapter,
  rect: DOMRect,
): number {
  const explicitStep = geometry.pageStep?.();
  if (explicitStep !== undefined && Number.isFinite(explicitStep)) {
    return Math.max(1, explicitStep);
  }

  return Math.max(1, rect.height * 10);
}

function moveHorizontal(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
  options: CursorMoveOptions,
): CursorCommandResult {
  const collapsedRangeEdge = collapseOpenRangeEdge(
    document,
    selection,
    direction,
    options,
  );
  if (collapsedRangeEdge !== null) {
    return { selectionAfter: selectionFromCursorPoint(collapsedRangeEdge) };
  }

  const current = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const next = moveCursor(document, current, direction);
  return {
    selectionAfter: selectionAfterMove(document, selection, next, options),
  };
}

function moveHorizontalByWord(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
  options: CursorMoveOptions,
): CursorCommandResult {
  const collapsedRangeEdge = collapseOpenRangeEdge(
    document,
    selection,
    direction,
    options,
  );
  if (collapsedRangeEdge !== null) {
    return { selectionAfter: selectionFromCursorPoint(collapsedRangeEdge) };
  }

  const current = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const next = moveCursorByWord(document, current, direction);

  return {
    selectionAfter: selectionAfterMove(document, selection, next, options),
  };
}

function collapseOpenRangeEdge(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
  options: CursorMoveOptions,
): CursorPoint | null {
  if (options.extend) {
    return null;
  }

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
  const anchorIndex = resolveDocumentCursorIndex(document, anchor);
  const focusIndex = resolveDocumentCursorIndex(document, focus);
  if (anchorIndex === focusIndex) {
    return null;
  }

  const start = anchorIndex < focusIndex ? anchor : focus;
  const end = anchorIndex < focusIndex ? focus : anchor;
  const target = direction === "backward" ? start : end;
  return withMovementAffinity(
    cursorPointAt(document, resolveCursorIndex(document, target)),
    direction,
  );
}

function withMovementAffinity(
  point: CursorPoint,
  direction: "backward" | "forward",
): CursorPoint {
  if (point.offset !== undefined) {
    return {
      ...point,
      affinity: direction === "forward" ? "backward" : "forward",
    };
  }

  return {
    ...point,
    affinity: point.edge === "before" ? "forward" : "backward",
  };
}

function moveByBlockBoundary(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
  options: CursorMoveOptions,
): CursorCommandResult {
  const current = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const next = moveCursorByBlockBoundary(document, current, direction);

  return {
    selectionAfter: selectionAfterMove(document, selection, next, options),
  };
}

function moveByLineBoundary(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  boundary: "start" | "end",
  options: CursorMoveOptions,
): CursorCommandResult {
  const current = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const target =
    boundary === "start"
      ? geometry.lineStartPoint?.(current)
      : geometry.lineEndPoint?.(current);
  const fallback =
    boundary === "start"
      ? moveCursorByBlockBoundary(document, current, "backward")
      : moveCursorByBlockBoundary(document, current, "forward");

  return {
    selectionAfter: selectionAfterMove(
      document,
      selection,
      normalizeCursorPoint(document, target ?? fallback),
      options,
    ),
  };
}

function selectionAfterMove(
  document: NoteDocument,
  selection: SelectionSnap,
  next: CursorPoint,
  options: CursorMoveOptions,
  context?: SelectionContext,
): SelectionSnap {
  if (!options.extend) {
    return selectionFromCursorPoint(next, context);
  }

  return selectionFromCursorRange(
    document,
    selectionAnchorInputFromSelection(document, selection),
    next,
    context,
  );
}

function readPreferredX(context: SelectionContext | undefined): number | null {
  const record = contextRecord(context);
  if (record === null) {
    return null;
  }

  const preferredX = record.preferredX;

  return typeof preferredX === "number" && Number.isFinite(preferredX)
    ? preferredX
    : null;
}

function contextWithPreferredX(preferredX: number): SelectionContext {
  return { preferredX };
}

function contextRecord(
  context: SelectionContext | undefined,
): Record<string, unknown> | null {
  return typeof context === "object" &&
    context !== null &&
    !Array.isArray(context)
    ? { ...context }
    : null;
}

export function cursorPointInputFromSelection(
  selection: SelectionSnap,
): CursorPointInput {
  const point = selection.focus ?? selection.anchor;

  if (point === null) {
    return { path: "/root/children/0", edge: "before" };
  }

  return cursorPointInputFromSelectionPoint(point);
}

function selectionAnchorInputFromSelection(
  document: NoteDocument,
  selection: SelectionSnap,
): CursorPointInput {
  const range = selection.selectionRanges[selection.primaryIndex];

  if (range !== undefined) {
    return cursorPointInputFromSelectionPoint(range.anchor);
  }

  return normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
}
