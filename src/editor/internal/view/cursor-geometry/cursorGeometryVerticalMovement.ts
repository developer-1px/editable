import type { CursorPoint } from "../../model/cursor";
import { lineForPoint } from "./cursorGeometryPointLookup";
import {
  pointForFigureCoordinate,
  pointFromCoordinates,
  pointFromLineCoordinate,
} from "./cursorGeometryPointMapping";
import { rectForPoint } from "./cursorGeometryRectQueries";
import type { GeometryMap, LayoutRow } from "./cursorGeometryTypes";

export function pointForVerticalMovement(
  map: GeometryMap,
  origin: CursorPoint,
  x: number,
  direction: "up" | "down",
  distance: "line" | "page",
): CursorPoint | null {
  if (distance === "page") {
    const originRect = rectForPoint(map, origin);
    if (originRect === null) {
      return null;
    }

    const pageStep = Math.max(1, originRect.height * 10);
    const y =
      direction === "up"
        ? originRect.top - pageStep
        : originRect.bottom + pageStep;
    return pointFromCoordinates(map, x, y);
  }

  const rows = layoutRows(map);
  const originIndex = rowIndexForPoint(map, rows, origin);
  if (originIndex === null) {
    return null;
  }

  const targetIndex = direction === "up" ? originIndex - 1 : originIndex + 1;
  const targetRow = rows[targetIndex];
  if (targetRow === undefined) {
    return null;
  }

  return pointFromRowCoordinate(targetRow, x);
}

function layoutRows(map: GeometryMap): LayoutRow[] {
  return [
    ...map.lines.map(
      (line): LayoutRow => ({
        kind: "line",
        line,
        rect: line.rect,
      }),
    ),
    ...Array.from(
      map.figures.entries(),
      ([path, figure]): LayoutRow => ({
        kind: "figure",
        path,
        rect: figure.rect,
      }),
    ),
  ].sort((left, right) => {
    const topDifference = left.rect.top - right.rect.top;
    if (Math.abs(topDifference) > 0.5) {
      return topDifference;
    }

    return left.rect.left - right.rect.left;
  });
}

function rowIndexForPoint(
  map: GeometryMap,
  rows: LayoutRow[],
  point: CursorPoint,
): number | null {
  if (point.edge !== undefined && map.figures.has(point.path)) {
    const index = rows.findIndex(
      (row) => row.kind === "figure" && row.path === point.path,
    );
    return index >= 0 ? index : null;
  }

  const line = lineForPoint(map, point);
  if (line === null) {
    return null;
  }

  const index = rows.findIndex(
    (row) => row.kind === "line" && row.line === line,
  );
  return index >= 0 ? index : null;
}

function pointFromRowCoordinate(row: LayoutRow, x: number): CursorPoint | null {
  if (row.kind === "figure") {
    return pointForFigureCoordinate(row.path, row.rect, x);
  }

  return pointFromLineCoordinate(row.line, x);
}
