import type {
  SelectionContext,
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  type CursorPointInput,
  normalizeCursorPoint,
  resolveCursorIndex,
  selectedAtomPointersBetween,
  toSelectionPoint,
} from "./cursor";
import type { NoteDocument } from "./noteDocument";

export type RichSelection =
  | {
      type: "caret";
      point: CursorPoint;
      context?: SelectionContext;
    }
  | {
      type: "range";
      anchor: CursorPointInput;
      focus: CursorPointInput;
      context?: SelectionContext;
    }
  | {
      type: "node";
      target: string;
      context?: SelectionContext;
    };

export function selectionFromRichSelection(
  document: NoteDocument,
  selection: RichSelection,
): SelectionSnap {
  if (selection.type === "caret") {
    return selectionFromCursorPoint(selection.point, selection.context);
  }

  if (selection.type === "node") {
    return selectionFromNodeTarget(selection.target, selection.context);
  }

  return selectionFromCursorRange(
    document,
    selection.anchor,
    selection.focus,
    selection.context,
  );
}

export function selectionFromCursorPoint(
  point: CursorPoint,
  context?: SelectionContext,
): SelectionSnap {
  const selectionPoint = toSelectionPoint(point);

  return {
    selectedPointers: [],
    selectionRanges: [{ anchor: selectionPoint, focus: selectionPoint }],
    primaryIndex: 0,
    anchor: selectionPoint,
    focus: selectionPoint,
    ...(context !== undefined ? { context } : {}),
  };
}

export function selectionFromCursorRange(
  document: NoteDocument,
  anchor: CursorPointInput,
  focus: CursorPointInput,
  context?: SelectionContext,
): SelectionSnap {
  const anchorPoint = normalizeCursorPoint(document, anchor);
  const focusPoint = normalizeCursorPoint(document, focus);
  const anchorIndex = resolveCursorIndex(document, anchorPoint);
  const focusIndex = resolveCursorIndex(document, focusPoint);
  if (
    anchorPoint.offset !== undefined &&
    focusPoint.offset !== undefined &&
    anchorIndex === focusIndex
  ) {
    return selectionFromCursorPoint(focusPoint, context);
  }

  const selectionAnchor = toSelectionPoint(anchorPoint);
  const selectionFocus = toSelectionPoint(focusPoint);

  return {
    selectedPointers: [],
    selectionRanges: [{ anchor: selectionAnchor, focus: selectionFocus }],
    primaryIndex: 0,
    anchor: selectionAnchor,
    focus: selectionFocus,
    ...(context !== undefined ? { context } : {}),
  };
}

export function selectionFromNodeTarget(
  target: string,
  context?: SelectionContext,
): SelectionSnap {
  const anchor = { path: target, edge: "before" as const };
  const focus = { path: target, edge: "after" as const };

  return {
    selectedPointers: [target],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
    ...(context !== undefined ? { context } : {}),
  };
}

export function selectionForRender(
  document: NoteDocument,
  selection: SelectionSnap | undefined,
): SelectionSnap | undefined {
  if (selection === undefined) {
    return undefined;
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined || selectionPointsEqual(range.anchor, range.focus)) {
    return { ...selection, selectedPointers: [] };
  }

  return {
    ...selection,
    selectedPointers: selectedAtomPointersBetween(
      document,
      cursorPointInputFromSelectionPoint(range.anchor),
      cursorPointInputFromSelectionPoint(range.focus),
    ),
  };
}

export function selectionIsCollapsed(selection: SelectionSnap): boolean {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return selection.selectedPointers.length === 0;
  }

  return (
    selection.selectedPointers.length === 0 &&
    selectionPointsEqual(range.anchor, range.focus)
  );
}

export function collapsedSelectionPointWithSelectedPointers(
  selection: SelectionSnap,
): CursorPoint | null {
  if (selection.selectedPointers.length === 0) {
    return null;
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined || !selectionPointsEqual(range.anchor, range.focus)) {
    return null;
  }

  return cursorPointFromSelectionPoint(range.focus);
}

export function cursorPointInputFromSelectionPoint(
  point: SelectionPoint,
): CursorPointInput {
  if (typeof point === "string") {
    return { path: point, edge: "before" };
  }

  return {
    path: point.path,
    ...(point.offset !== undefined ? { offset: point.offset } : {}),
    ...(point.edge !== undefined ? { edge: point.edge } : {}),
    ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
  };
}

function cursorPointFromSelectionPoint(
  point: SelectionPoint,
): CursorPoint | null {
  if (typeof point === "string") {
    return null;
  }

  if (point.offset !== undefined) {
    return {
      path: point.path,
      offset: point.offset,
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }

  if (point.edge !== undefined) {
    return {
      path: point.path,
      edge: point.edge,
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }

  return null;
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
