import type { NoteDocument } from "../../model/noteDocument";
import { pageStepForRoot } from "./cursorGeometryDom";
import { buildGeometryMap } from "./cursorGeometryLayout";
import { createCursorGeometryQueries } from "./cursorGeometryQueries";
import type { CursorGeometry } from "./cursorGeometryTypes";

export type { CursorGeometry } from "./cursorGeometryTypes";

export function createDOMCursorGeometry(
  root: ParentNode,
  document: NoteDocument,
): CursorGeometry {
  const geometryMap = () => buildGeometryMap(root, document);
  return createCursorGeometryQueries(geometryMap, () => pageStepForRoot(root));
}
