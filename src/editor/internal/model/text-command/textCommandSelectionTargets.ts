import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  type CursorPointInput,
  normalizeCursorPoint,
  resolveCursorIndex,
  type TextCursorPoint,
} from "../cursor";
import type { NoteDocument } from "../noteDocument";
import {
  blockAtomLocationFromPath,
  inlineAtomLocationFromPath,
  type TextLocation,
  textLocationFromPath,
} from "./textCommandAddressing";

export type SelectedAtom =
  | {
      kind: "inline";
      blockIndex: number;
      childIndex: number;
    }
  | {
      kind: "figure";
      blockIndex: number;
    };

export type SelectedDocumentRange = {
  start: CursorPoint;
  end: CursorPoint;
};

export function selectedDocumentRange(
  document: NoteDocument,
  selection: SelectionSnap,
): SelectedDocumentRange | null {
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
  const anchorIndex = resolveCursorIndex(document, anchor);
  const focusIndex = resolveCursorIndex(document, focus);

  if (anchorIndex === focusIndex) {
    return null;
  }

  return anchorIndex < focusIndex
    ? { start: anchor, end: focus }
    : { start: focus, end: anchor };
}

export function selectedSingleTextRange(
  document: NoteDocument,
  selection: SelectionSnap,
): { location: TextLocation; startOffset: number; endOffset: number } | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  const anchor = normalizeTextCursorPoint(document, range.anchor);
  const focus = normalizeTextCursorPoint(document, range.focus);

  if (anchor === null || focus === null || anchor.path !== focus.path) {
    return null;
  }

  const startOffset = Math.min(anchor.offset, focus.offset);
  const endOffset = Math.max(anchor.offset, focus.offset);
  if (startOffset === endOffset) {
    return null;
  }

  const location = textLocationFromPath(document, anchor.path);
  return location === null ? null : { location, startOffset, endOffset };
}

export function selectedSingleAtom(
  document: NoteDocument,
  selection: SelectionSnap,
): SelectedAtom | null {
  const path = selection.selectedPointers[0];
  if (path === undefined || selection.selectedPointers.length !== 1) {
    return null;
  }
  if (!selectionCoversOnlyAtom(document, selection, path)) {
    return null;
  }

  const inline = inlineAtomLocationFromPath(document, path);
  if (inline !== null) {
    return { kind: "inline", ...inline };
  }

  const blockIndex = blockAtomLocationFromPath(document, path);
  return blockIndex === null ? null : { kind: "figure", blockIndex };
}

function selectionCoversOnlyAtom(
  document: NoteDocument,
  selection: SelectionSnap,
  path: string,
): boolean {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return false;
  }

  const anchor = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.anchor),
  );
  const focus = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.focus),
  );
  const start = Math.min(
    resolveCursorIndex(document, anchor),
    resolveCursorIndex(document, focus),
  );
  const end = Math.max(
    resolveCursorIndex(document, anchor),
    resolveCursorIndex(document, focus),
  );
  const atomStart = resolveCursorIndex(document, { path, edge: "before" });
  const atomEnd = resolveCursorIndex(document, { path, edge: "after" });

  return start === atomStart && end === atomEnd;
}

function normalizeTextCursorPoint(
  document: NoteDocument,
  point: SelectionPoint,
): TextCursorPoint | null {
  const input = cursorPointInputFromSelectionPoint(point);
  const normalized = normalizeCursorPoint(document, input);

  return normalized.offset !== undefined ? normalized : null;
}

function cursorPointInputFromSelectionPoint(
  point: SelectionPoint,
): CursorPointInput {
  if (typeof point === "string") {
    return { path: point };
  }

  return {
    path: point.path,
    ...(point.offset !== undefined ? { offset: point.offset } : {}),
    ...(point.edge !== undefined ? { edge: point.edge } : {}),
    ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
  };
}
