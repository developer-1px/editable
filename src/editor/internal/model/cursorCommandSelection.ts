import type {
  SelectionContext,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  type CursorPointInput,
  cursorPointAt,
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

export type CursorCommandResult = {
  selectionAfter: SelectionSnap;
};

export type CursorMoveOptions = {
  extend?: boolean;
};

export function collapseOpenRangeEdge(
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

export function selectionAfterMove(
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
