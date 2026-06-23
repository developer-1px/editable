import type { SelectionSnap } from "@interactive-os/json-document";
import {
  firstCursorPoint,
  lastCursorPoint,
  moveCursor,
  moveCursorByBlockBoundary,
  moveCursorByWord,
  normalizeCursorPoint,
} from "./cursor";
import {
  type CursorCommandResult,
  type CursorMoveOptions,
  collapseOpenRangeEdge,
  cursorPointInputFromSelection,
  selectionAfterMove,
} from "./cursorCommandSelection";
import {
  type CursorGeometryAdapter,
  moveLineBoundaryCursorCommand,
  moveVerticalCursorCommand,
} from "./cursorGeometryCommands";
import type { NoteDocument } from "./noteDocument";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./richSelection";

export type {
  CursorCommandResult,
  CursorMoveOptions,
} from "./cursorCommandSelection";
export { cursorPointInputFromSelection } from "./cursorCommandSelection";
export type { CursorGeometryAdapter } from "./cursorGeometryCommands";
export {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./richSelection";

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
  return moveLineBoundaryCursorCommand(
    document,
    selection,
    geometry,
    "start",
    options,
  );
}

export function moveLineEnd(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveLineBoundaryCursorCommand(
    document,
    selection,
    geometry,
    "end",
    options,
  );
}

export function moveUp(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVerticalCursorCommand(
    document,
    selection,
    geometry,
    "up",
    "line",
    options,
  );
}

export function moveDown(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVerticalCursorCommand(
    document,
    selection,
    geometry,
    "down",
    "line",
    options,
  );
}

export function movePageUp(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVerticalCursorCommand(
    document,
    selection,
    geometry,
    "up",
    "page",
    options,
  );
}

export function movePageDown(
  document: NoteDocument,
  selection: SelectionSnap,
  geometry: CursorGeometryAdapter,
  options: CursorMoveOptions = {},
): CursorCommandResult {
  return moveVerticalCursorCommand(
    document,
    selection,
    geometry,
    "down",
    "page",
    options,
  );
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
