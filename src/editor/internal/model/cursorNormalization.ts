import type { SelectionPointObject } from "@interactive-os/json-document";
import type { CursorPoint, CursorPointInput } from "./cursor";
import { firstCursorPoint } from "./cursorEndpoints";
import { createCursorMap } from "./cursorMap";
import type { NoteDocument } from "./noteDocument";
import { snapTextOffset } from "./textBoundaries";

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
