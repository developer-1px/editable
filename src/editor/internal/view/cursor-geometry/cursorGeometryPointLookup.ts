import type { CursorPoint } from "../../model/cursor";
import { textBoundaryIndex } from "../../model/textBoundaries";
import type {
  GeometryMap,
  LayoutFragment,
  LayoutLine,
  TextCaretFragment,
  TextLayoutFragment,
} from "./cursorGeometryTypes";

export function lineForPoint(
  map: GeometryMap,
  point: CursorPoint,
): LayoutLine | null {
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

export function textCaretFragmentForPoint(
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

export function orderForPoint(
  map: GeometryMap,
  point: CursorPoint,
): number | null {
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

export function blockLineForPointEdge(
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

export function fragmentForLineEdge(
  line: LayoutLine,
  edge: "before" | "after",
): LayoutFragment | null {
  return (
    (edge === "before" ? line.fragments[0] : line.fragments.at(-1)) ?? null
  );
}
