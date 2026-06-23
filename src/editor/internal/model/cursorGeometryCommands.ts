import type {
  SelectionContext,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { CursorPoint, CursorPointInput } from "./cursor";
import {
  firstCursorPoint,
  lastCursorPoint,
  moveCursorByBlockBoundary,
  normalizeCursorPoint,
} from "./cursor";
import {
  type CursorCommandResult,
  type CursorMoveOptions,
  collapseOpenRangeEdge,
  cursorPointInputFromSelection,
  selectionAfterMove,
} from "./cursorCommandSelection";
import type { NoteDocument } from "./noteDocument";
import { selectionFromCursorPoint } from "./richSelection";

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

export function moveVerticalCursorCommand(
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

export function moveLineBoundaryCursorCommand(
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
