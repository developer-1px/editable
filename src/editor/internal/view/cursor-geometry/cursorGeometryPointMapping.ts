import type { CursorPoint } from "../../model/cursor";
import { pointForFragmentEdge } from "./cursorGeometryFragments";
import { clampNumber, distanceToRect } from "./cursorGeometryRects";
import type {
  GeometryMap,
  LayoutFragment,
  LayoutLine,
} from "./cursorGeometryTypes";

export function pointFromCoordinates(
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

  return pointFromLineCoordinate(line, x);
}

export function pointFromLineCoordinate(
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
    return pointForCoordinateFragmentEdge(last, "after");
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

  if (isLineBreakFragment(fragment)) {
    return pointForFragmentEdge(fragment, "before");
  }

  return {
    path: fragment.path,
    offset: offsetForTextFragmentX(fragment, x),
  };
}

export function pointForFigureCoordinate(
  path: string,
  rect: DOMRect,
  x: number,
): CursorPoint {
  return {
    path,
    edge: x < rect.left + rect.width / 2 ? "before" : "after",
  };
}

function pointForCoordinateFragmentEdge(
  fragment: LayoutFragment,
  edge: "before" | "after",
): CursorPoint {
  return edge === "after" && isLineBreakFragment(fragment)
    ? pointForFragmentEdge(fragment, "before")
    : pointForFragmentEdge(fragment, edge);
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

function isLineBreakFragment(fragment: LayoutFragment): boolean {
  return fragment.kind === "text" && fragment.isLineBreak === true;
}
