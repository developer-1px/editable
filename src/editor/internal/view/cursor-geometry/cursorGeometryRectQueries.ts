import type { CursorPoint } from "../../model/cursor";
import { textBoundaryIndex } from "../../model/textBoundaries";
import {
  blockLineForPointEdge,
  fragmentForLineEdge,
  orderForPoint,
  textCaretFragmentForPoint,
} from "./cursorGeometryPointLookup";
import {
  caretRectAt,
  clamp,
  makeRect,
  rectForAtomEdge,
} from "./cursorGeometryRects";
import type {
  GeometryMap,
  LayoutFragment,
  LayoutLine,
  TextLayoutFragment,
} from "./cursorGeometryTypes";

export function rectForPoint(
  map: GeometryMap,
  point: CursorPoint,
): DOMRect | null {
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

export function rectsForRange(
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

function rectForLineEdge(
  line: LayoutLine,
  edge: "before" | "after",
): DOMRect | null {
  const fragment = fragmentForLineEdge(line, edge);
  return fragment === null ? null : rectForFragmentEdge(fragment, edge);
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
  fragment: TextLayoutFragment,
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
  fragment: TextLayoutFragment,
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
