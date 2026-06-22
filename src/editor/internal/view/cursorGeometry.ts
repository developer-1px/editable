import type { CursorPoint } from "../model/cursor";
import type { NoteDocument } from "../model/noteDocument";
import { textBoundaryIndex } from "../model/textBoundaries";
import { pageStepForRoot } from "./cursorGeometryDom";
import { buildGeometryMap, pointForFragmentEdge } from "./cursorGeometryLayout";
import {
  caretRectAt,
  clamp,
  clampNumber,
  distanceToRect,
  makeRect,
  rectForAtomEdge,
} from "./cursorGeometryRects";
import type {
  CursorGeometry,
  GeometryMap,
  LayoutFragment,
  LayoutLine,
  LayoutRow,
  TextCaretFragment,
  TextLayoutFragment,
} from "./cursorGeometryTypes";

export type { CursorGeometry } from "./cursorGeometryTypes";

export function createDOMCursorGeometry(
  root: ParentNode,
  document: NoteDocument,
): CursorGeometry {
  const geometryMap = () => buildGeometryMap(root, document);

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
    pageStep() {
      return pageStepForRoot(root);
    },
  };
}

function rectForPoint(map: GeometryMap, point: CursorPoint): DOMRect | null {
  if (point.offset !== undefined) {
    const caret = textCaretFragmentForPoint(map, point);
    if (caret === null) {
      return null;
    }

    return caretRectForTextFragment(caret.fragment, caret.offset);
  }

  const figure = map.figures.get(point.path);
  if (figure !== undefined) {
    return rectForAtomEdge(figure.rect, point.edge);
  }

  const blockLine = blockLineForPointEdge(map, point);
  if (blockLine !== null) {
    return rectForLineEdge(blockLine, point.edge);
  }

  for (const line of map.lines) {
    if (point.path === line.start.path && point.edge === "before") {
      return rectForLineEdge(line, "before");
    }
    if (point.path === line.end.path && point.edge === "after") {
      return rectForLineEdge(line, "after");
    }

    const atom = line.fragments.find(
      (fragment) => fragment.kind === "atom" && fragment.path === point.path,
    );
    if (atom !== undefined) {
      return rectForAtomEdge(atom.rect, point.edge);
    }
  }

  return null;
}

function rectsForRange(
  map: GeometryMap,
  anchor: CursorPoint,
  focus: CursorPoint,
): DOMRect[] {
  const anchorOrder = orderForPoint(map, anchor);
  const focusOrder = orderForPoint(map, focus);
  if (
    anchorOrder === null ||
    focusOrder === null ||
    anchorOrder === focusOrder
  ) {
    return [];
  }

  const start = Math.min(anchorOrder, focusOrder);
  const end = Math.max(anchorOrder, focusOrder);
  const rects: DOMRect[] = [];

  for (const line of map.lines) {
    for (const fragment of line.fragments) {
      if (fragment.kind !== "text") {
        continue;
      }
      const overlapStart = Math.max(start, fragment.orderStart);
      const overlapEnd = Math.min(end, fragment.orderEnd);
      if (overlapStart >= overlapEnd) {
        continue;
      }

      const startOffset =
        fragment.offsets[overlapStart - fragment.orderStart] ??
        fragment.startOffset;
      const endOffset =
        fragment.offsets[overlapEnd - fragment.orderStart] ??
        fragment.endOffset;
      rects.push(rectForTextFragmentRange(fragment, startOffset, endOffset));
    }
  }

  return rects;
}

function pointFromCoordinates(
  map: GeometryMap,
  x: number,
  y: number,
): CursorPoint | null {
  const figure = nearestFigure(map, x, y);
  const line = nearestLine(map, x, y);
  if (line === null) {
    if (figure !== null) {
      return pointForFigureCoordinate(figure.path, figure.rect, x);
    }
    return null;
  }

  if (
    figure !== null &&
    distanceToRect(x, y, figure.rect) < distanceToRect(x, y, line.rect)
  ) {
    return pointForFigureCoordinate(figure.path, figure.rect, x);
  }

  const first = line.fragments[0];
  const last = line.fragments.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }

  if (x <= first.rect.left) {
    return pointForFragmentEdge(first, "before");
  }
  if (x >= last.rect.right) {
    return pointForFragmentEdge(last, "after");
  }

  const fragment =
    line.fragments.find(
      (candidate) => x >= candidate.rect.left && x <= candidate.rect.right,
    ) ?? nearestFragment(line, x);
  if (fragment === null) {
    return null;
  }

  if (fragment.kind === "atom") {
    return {
      path: fragment.path,
      edge:
        x < fragment.rect.left + fragment.rect.width / 2 ? "before" : "after",
    };
  }

  return {
    path: fragment.path,
    offset: offsetForTextFragmentX(fragment, x),
  };
}

function pointForVerticalMovement(
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

function pointFromLineCoordinate(
  line: LayoutLine,
  x: number,
): CursorPoint | null {
  const first = line.fragments[0];
  const last = line.fragments.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }

  if (x <= first.rect.left) {
    return pointForFragmentEdge(first, "before");
  }
  if (x >= last.rect.right) {
    return pointForFragmentEdge(last, "after");
  }

  const fragment =
    line.fragments.find(
      (candidate) => x >= candidate.rect.left && x <= candidate.rect.right,
    ) ?? nearestFragment(line, x);
  if (fragment === null) {
    return null;
  }

  if (fragment.kind === "atom") {
    return {
      path: fragment.path,
      edge:
        x < fragment.rect.left + fragment.rect.width / 2 ? "before" : "after",
    };
  }

  return {
    path: fragment.path,
    offset: offsetForTextFragmentX(fragment, x),
  };
}

function lineForPoint(map: GeometryMap, point: CursorPoint): LayoutLine | null {
  if (point.offset !== undefined) {
    const caret = textCaretFragmentForPoint(map, point);
    return caret === null ? null : lineContainingFragment(map, caret.fragment);
  }

  const blockLine = blockLineForPointEdge(map, point);
  if (blockLine !== null) {
    return blockLine;
  }

  for (const line of map.lines) {
    if (
      line.start.path === point.path ||
      line.end.path === point.path ||
      line.fragments.some((fragment) => fragment.path === point.path)
    ) {
      return line;
    }
  }

  return null;
}

function lineContainingFragment(
  map: GeometryMap,
  target: LayoutFragment,
): LayoutLine | null {
  return (
    map.lines.find((line) =>
      line.fragments.some((fragment) => fragment === target),
    ) ?? null
  );
}

function textFragmentForPoint(
  map: GeometryMap,
  point: Extract<CursorPoint, { offset: number }>,
): TextLayoutFragment | null {
  let exactEndMatch: TextLayoutFragment | null = null;
  for (const line of map.lines) {
    for (const fragment of line.fragments) {
      if (fragment.kind !== "text" || fragment.path !== point.path) {
        continue;
      }
      if (
        point.offset >= fragment.startOffset &&
        point.offset < fragment.endOffset
      ) {
        return fragment;
      }
      if (point.offset === fragment.endOffset) {
        exactEndMatch = fragment;
      }
    }
  }

  return exactEndMatch;
}

function textCaretFragmentForPoint(
  map: GeometryMap,
  point: Extract<CursorPoint, { offset: number }>,
): TextCaretFragment | null {
  const fragment = textFragmentForPoint(map, point);
  if (fragment === null) {
    return null;
  }

  if (
    !isEmptyTextFragment(fragment) &&
    point.affinity !== "backward" &&
    point.offset === fragment.endOffset
  ) {
    const next = nextCollapsedTextFragment(map, fragment);
    if (next !== null) {
      return { fragment: next, offset: next.startOffset };
    }
  }

  return { fragment, offset: point.offset };
}

function nextCollapsedTextFragment(
  map: GeometryMap,
  current: TextLayoutFragment,
): TextLayoutFragment | null {
  for (const line of map.lines) {
    for (const fragment of line.fragments) {
      if (
        fragment.kind === "text" &&
        fragment !== current &&
        fragment.orderStart === current.orderEnd
      ) {
        return fragment;
      }
    }
  }

  return null;
}

function isEmptyTextFragment(fragment: TextLayoutFragment): boolean {
  return fragment.startOffset === fragment.endOffset;
}

function orderForPoint(map: GeometryMap, point: CursorPoint): number | null {
  if (point.offset !== undefined) {
    const fragment = textFragmentForPoint(map, point);
    if (fragment === null) {
      return null;
    }
    return (
      fragment.orderStart + textBoundaryIndex(fragment.offsets, point.offset)
    );
  }

  const blockLine = blockLineForPointEdge(map, point);
  if (blockLine !== null) {
    const fragment = fragmentForLineEdge(blockLine, point.edge);
    if (fragment === null) {
      return null;
    }

    return point.edge === "before" ? fragment.orderStart : fragment.orderEnd;
  }

  for (const line of map.lines) {
    if (line.start.path === point.path && point.edge === "before") {
      return line.fragments[0]?.orderStart ?? null;
    }
    if (line.end.path === point.path && point.edge === "after") {
      return line.fragments.at(-1)?.orderEnd ?? null;
    }
    for (const fragment of line.fragments) {
      if (fragment.kind === "atom" && fragment.path === point.path) {
        return point.edge === "before"
          ? fragment.orderStart
          : fragment.orderEnd;
      }
    }
  }

  const figure = map.figures.get(point.path);
  if (figure !== undefined) {
    return point.edge === "before" ? figure.orderStart : figure.orderEnd;
  }

  return null;
}

function blockLineForPointEdge(
  map: GeometryMap,
  point: Extract<CursorPoint, { edge: "before" | "after" }>,
): LayoutLine | null {
  const blockLines = map.lines.filter((line) => line.blockPath === point.path);
  if (blockLines.length === 0) {
    return null;
  }

  return point.edge === "before"
    ? (blockLines[0] ?? null)
    : (blockLines.at(-1) ?? null);
}

function rectForLineEdge(
  line: LayoutLine,
  edge: "before" | "after",
): DOMRect | null {
  const fragment = fragmentForLineEdge(line, edge);
  return fragment === null ? null : rectForFragmentEdge(fragment, edge);
}

function fragmentForLineEdge(
  line: LayoutLine,
  edge: "before" | "after",
): LayoutFragment | null {
  return (
    (edge === "before" ? line.fragments[0] : line.fragments.at(-1)) ?? null
  );
}

function rectForFragmentEdge(
  fragment: LayoutFragment,
  edge: "before" | "after",
): DOMRect {
  if (fragment.kind === "atom") {
    return rectForAtomEdge(fragment.rect, edge);
  }

  return caretRectForTextFragment(
    fragment,
    edge === "before" ? fragment.startOffset : fragment.endOffset,
  );
}

function caretRectForTextFragment(
  fragment: Extract<LayoutFragment, { kind: "text" }>,
  offset: number,
): DOMRect {
  const index = clamp(
    textBoundaryIndex(fragment.offsets, offset),
    0,
    fragment.caretXs.length - 1,
  );

  return caretRectAt(
    fragment.rect.left + (fragment.caretXs[index] ?? 0),
    fragment.rect.top,
    fragment.rect.height,
  );
}

function rectForTextFragmentRange(
  fragment: Extract<LayoutFragment, { kind: "text" }>,
  startOffset: number,
  endOffset: number,
): DOMRect {
  const startIndex = clamp(
    textBoundaryIndex(fragment.offsets, startOffset),
    0,
    fragment.caretXs.length - 1,
  );
  const endIndex = clamp(
    textBoundaryIndex(fragment.offsets, endOffset),
    0,
    fragment.caretXs.length - 1,
  );
  const left = fragment.rect.left + (fragment.caretXs[startIndex] ?? 0);
  const right =
    fragment.rect.left + (fragment.caretXs[endIndex] ?? fragment.rect.width);

  return makeRect(
    left,
    fragment.rect.top,
    Math.max(1, right - left),
    fragment.rect.height,
  );
}

function offsetForTextFragmentX(
  fragment: Extract<LayoutFragment, { kind: "text" }>,
  x: number,
): number {
  const relativeX = clampNumber(x - fragment.rect.left, 0, fragment.rect.width);
  for (let index = 0; index < fragment.caretXs.length - 1; index += 1) {
    const left = fragment.caretXs[index] ?? 0;
    const right = fragment.caretXs[index + 1] ?? fragment.rect.width;
    if (relativeX < left + (right - left) / 2) {
      return fragment.offsets[index] ?? fragment.startOffset;
    }
  }

  return fragment.endOffset;
}

function nearestLine(
  map: GeometryMap,
  x: number,
  y: number,
): LayoutLine | null {
  return nearestByDistance(map.lines, (line) =>
    distanceToRect(x, y, line.rect),
  );
}

function nearestFigure(
  map: GeometryMap,
  x: number,
  y: number,
): { path: string; rect: DOMRect } | null {
  return nearestByDistance(
    Array.from(map.figures.entries(), ([path, figure]) => ({
      path,
      rect: figure.rect,
    })),
    (figure) => distanceToRect(x, y, figure.rect),
  );
}

function nearestFragment(line: LayoutLine, x: number): LayoutFragment | null {
  return nearestByDistance(line.fragments, (fragment) =>
    x < fragment.rect.left
      ? fragment.rect.left - x
      : x > fragment.rect.right
        ? x - fragment.rect.right
        : 0,
  );
}

function nearestByDistance<T>(
  items: T[],
  distance: (item: T) => number,
): T | null {
  let nearest: { item: T; distance: number } | null = null;
  for (const item of items) {
    const nextDistance = distance(item);
    if (nearest === null || nextDistance < nearest.distance) {
      nearest = { item, distance: nextDistance };
    }
  }

  return nearest?.item ?? null;
}

function pointForFigureCoordinate(
  path: string,
  rect: DOMRect,
  x: number,
): CursorPoint {
  return {
    path,
    edge: x < rect.left + rect.width / 2 ? "before" : "after",
  };
}
