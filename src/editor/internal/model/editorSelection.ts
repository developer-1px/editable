import type {
  JSONDocument,
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  type CursorPointInput,
  normalizeCursorPoint,
} from "./cursor";
import type { NoteDocument } from "./noteDocument";
import {
  cursorPointInputFromSelectionPoint,
  type RichSelection,
  selectionFromRichSelection,
} from "./richSelection";

export function restoreInitialSelection(
  document: JSONDocument<NoteDocument>,
  selection: RichSelection | undefined,
) {
  document.selection?.restore(
    selection === undefined
      ? defaultSelection(document.value)
      : selectionFromRichSelection(document.value, selection),
  );
}

export function defaultSelection(document: NoteDocument): SelectionSnap {
  return selectionFromRichSelection(document, {
    type: "caret",
    point: normalizeCursorPoint(document, {
      path: "/root/children/0",
      edge: "before",
    }),
  });
}

export function selectionForCommand(
  document: JSONDocument<NoteDocument>,
): SelectionSnap {
  const selection = document.selection?.snapshot();
  if (selection === undefined) {
    return defaultSelection(document.value);
  }

  const richSelection = richSelectionFromSnap(document.value, selection);
  return richSelection === null
    ? defaultSelection(document.value)
    : selectionFromRichSelection(document.value, richSelection);
}

export function richSelectionFromSnap(
  document: NoteDocument,
  selection: SelectionSnap | undefined,
): RichSelection | null {
  if (selection === undefined || selection.focus === null) {
    return null;
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  if (selectionPointsEqual(range.anchor, range.focus)) {
    return {
      type: "caret",
      point: normalizeCursorPoint(
        document,
        cursorPointInputFromSelectionPoint(selection.focus),
      ),
      ...(selection.context === undefined
        ? {}
        : { context: selection.context }),
    };
  }

  if (isNodeSelectionSnap(selection, range)) {
    return {
      type: "node",
      target: selection.selectedPointers[0] ?? "",
      ...(selection.context === undefined
        ? {}
        : { context: selection.context }),
    };
  }

  return {
    type: "range",
    anchor: normalizeEditorCursorPoint(
      document,
      cursorPointInputFromSelectionPoint(range.anchor),
    ),
    focus: normalizeEditorCursorPoint(
      document,
      cursorPointInputFromSelectionPoint(range.focus),
    ),
    ...(selection.context === undefined ? {} : { context: selection.context }),
  };
}

function normalizeEditorCursorPoint(
  document: NoteDocument,
  point: CursorPointInput,
): CursorPoint {
  return normalizeCursorPoint(document, point);
}

function isNodeSelectionSnap(
  selection: SelectionSnap,
  range: SelectionSnap["selectionRanges"][number],
): boolean {
  const target = selection.selectedPointers[0];
  if (target === undefined || selection.selectedPointers.length !== 1) {
    return false;
  }

  return (
    (pointIsEdge(range.anchor, target, "before") &&
      pointIsEdge(range.focus, target, "after")) ||
    (pointIsEdge(range.anchor, target, "after") &&
      pointIsEdge(range.focus, target, "before"))
  );
}

function pointIsEdge(
  point: SelectionPoint,
  path: string,
  edge: "before" | "after",
): boolean {
  return (
    typeof point === "object" &&
    point !== null &&
    point.path === path &&
    point.edge === edge
  );
}

function selectionPointsEqual(left: SelectionPoint, right: SelectionPoint) {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }

  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}
