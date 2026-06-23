import { lineForPoint } from "./cursorGeometryPointLookup";
import { pointFromCoordinates } from "./cursorGeometryPointMapping";
import { rectForPoint, rectsForRange } from "./cursorGeometryRectQueries";
import type { CursorGeometry, GeometryMap } from "./cursorGeometryTypes";
import { pointForVerticalMovement } from "./cursorGeometryVerticalMovement";

export function createCursorGeometryQueries(
  geometryMap: () => GeometryMap,
  pageStep: () => number,
): CursorGeometry {
  return {
    rectForPoint(point) {
      return rectForPoint(geometryMap(), point);
    },
    rectsForRange(anchor, focus) {
      return rectsForRange(geometryMap(), anchor, focus);
    },
    pointFromCoordinates(x, y) {
      return pointFromCoordinates(geometryMap(), x, y);
    },
    pointForVerticalMovement(origin, x, direction, distance) {
      return pointForVerticalMovement(
        geometryMap(),
        origin,
        x,
        direction,
        distance,
      );
    },
    lineStartPoint(point) {
      return lineForPoint(geometryMap(), point)?.start ?? null;
    },
    lineEndPoint(point) {
      return lineForPoint(geometryMap(), point)?.end ?? null;
    },
    pageStep,
  };
}
