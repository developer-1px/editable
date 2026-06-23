import {
  applyPatchToTrustedState,
  type JSONPatchOperation,
  type SelectionSnap,
} from "@interactive-os/json-document";
import type { CursorPoint } from "../../model/cursor";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import {
  type NoteDocument,
  NoteDocumentSchema,
} from "../../model/noteDocument";
import {
  collapsedSelectionPointWithSelectedPointers,
  selectionIsCollapsed,
} from "../../model/richSelection";

export function documentAfterPatch(
  document: NoteDocument,
  patch: JSONPatchOperation[],
): NoteDocument {
  const result = applyPatchToTrustedState(NoteDocumentSchema, document, patch);

  return result.result.ok ? result.state : document;
}

export function selectionWithoutCollapsedSelectedPointers(
  selection: SelectionSnap,
): SelectionSnap {
  const collapsedPoint = collapsedSelectionPointWithSelectedPointers(selection);

  return collapsedPoint === null
    ? selection
    : selectionFromCursorPoint(collapsedPoint, selection.context);
}

export function shouldDeleteSelectionBeforeNativeComposition(
  selection: SelectionSnap,
): boolean {
  if (selectionIsCollapsed(selection)) {
    return false;
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return false;
  }

  const anchor = offsetSelectionPoint(range.anchor);
  const focus = offsetSelectionPoint(range.focus);
  return anchor === null || focus === null || anchor.path !== focus.path;
}

export function selectionWithTransientContext(
  selection: SelectionSnap,
  source: SelectionSnap,
): SelectionSnap {
  if (
    selection.context !== undefined ||
    source.context === undefined ||
    !selectionIsCollapsed(selection) ||
    !selectionIsCollapsed(source)
  ) {
    return selection;
  }

  return { ...selection, context: source.context };
}

export function cursorPointsEqual(
  left: CursorPoint | null,
  right: CursorPoint | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }

  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge &&
    left.affinity === right.affinity
  );
}

function offsetSelectionPoint(
  point: SelectionSnap["focus"],
): { path: string; offset: number } | null {
  if (
    typeof point !== "object" ||
    point === null ||
    point.offset === undefined
  ) {
    return null;
  }

  return { path: point.path, offset: point.offset };
}
