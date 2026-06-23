import type { CursorDirection, CursorPoint, CursorPointInput } from "./cursor";
import {
  cursorPointAtInMap,
  resolveCaretIndexInMap,
  resolveCursorIndexInMap,
} from "./cursorIndexProjection";
import { createCaretMap, createCursorMap } from "./cursorMap";
import type { NoteDocument } from "./noteDocument";

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

export function cursorPointAt(
  document: NoteDocument,
  boundaryIndex: number,
): CursorPoint {
  const caretMap = createCaretMap(document);
  return cursorPointAtInMap(caretMap, boundaryIndex);
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
