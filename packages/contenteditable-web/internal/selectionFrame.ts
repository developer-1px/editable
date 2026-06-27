import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import type {
  JsonContentEditableRenderBoundary,
  JsonContentEditableRenderFrame,
  JsonContentEditableRenderLine,
  JsonContentEditableSelectionFrame,
} from "../contract";
import { isTextPoint, selectionFromPoints } from "./selection";

export type SelectionFrameMoveResult = {
  goalX: number | null;
  selection: SelectionSnap;
};

export function selectionFrameFromSelection({
  goalX,
  renderFrame,
  selection,
}: {
  goalX: number | null;
  renderFrame: JsonContentEditableRenderFrame | null;
  selection: SelectionSnap | null;
}): JsonContentEditableSelectionFrame | null {
  const range =
    selection?.selectionRanges[selection.primaryIndex] ?? null;
  if (
    selection === null ||
    range === null ||
    renderFrame === null ||
    !isTextPoint(range.anchor) ||
    !isTextPoint(range.focus)
  ) {
    return null;
  }

  const anchor = closestBoundaryToPoint(renderFrame, range.anchor);
  const focus = closestBoundaryToPoint(renderFrame, range.focus);
  if (anchor === null || focus === null) {
    return null;
  }

  return {
    renderFrame,
    selection,
    anchor: { boundary: anchor },
    focus: { boundary: focus },
    mode: sameSelectionPoint(range.anchor, range.focus) ? "caret" : "range",
    goalX,
  };
}

export function moveSelectionFrameVertically(
  frame: JsonContentEditableSelectionFrame,
  direction: "up" | "down",
  extend: boolean,
): SelectionFrameMoveResult | null {
  const currentLineIndex = lineIndexForBoundary(
    frame.renderFrame,
    frame.focus.boundary,
  );
  if (currentLineIndex === null) {
    return null;
  }

  const targetLine =
    frame.renderFrame.lines[currentLineIndex + verticalDelta(direction)];
  if (targetLine === undefined) {
    return null;
  }

  const targetGoalX = frame.goalX ?? frame.focus.boundary.x;
  const target = closestBoundaryToX(targetLine, targetGoalX);
  if (target === null) {
    return null;
  }

  return selectionResultFromBoundaries({
    anchor: extend ? frame.anchor.boundary : target,
    focus: target,
    goalX: targetGoalX,
  });
}

export function moveSelectionFrameToLineBoundary(
  frame: JsonContentEditableSelectionFrame,
  boundary: "line-start" | "line-end",
  extend: boolean,
): SelectionFrameMoveResult | null {
  const line = lineForBoundary(frame.renderFrame, frame.focus.boundary);
  if (line === null) {
    return null;
  }

  const target =
    boundary === "line-start"
      ? line.boundaries[0]
      : line.boundaries.at(-1);
  if (target === undefined) {
    return null;
  }

  return selectionResultFromBoundaries({
    anchor: extend ? frame.anchor.boundary : target,
    focus: target,
    goalX: null,
  });
}

function selectionResultFromBoundaries({
  anchor,
  focus,
  goalX,
}: {
  anchor: JsonContentEditableRenderBoundary;
  focus: JsonContentEditableRenderBoundary;
  goalX: number | null;
}): SelectionFrameMoveResult {
  return {
    goalX,
    selection: selectionFromPoints(
      selectionPointFromBoundary(anchor),
      selectionPointFromBoundary(focus),
    ),
  };
}

function closestBoundaryToPoint(
  renderFrame: JsonContentEditableRenderFrame,
  point: SelectionPoint,
): JsonContentEditableRenderBoundary | null {
  if (!isTextPoint(point)) {
    return null;
  }

  let best:
    | { boundary: JsonContentEditableRenderBoundary; distance: number }
    | null = null;
  for (const boundary of renderFrame.boundaries) {
    if (boundary.path !== point.path) {
      continue;
    }
    const distance = Math.abs(boundary.offset - point.offset);
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && boundary.x < best.boundary.x)
    ) {
      best = { boundary, distance };
    }
  }
  return best?.boundary ?? null;
}

function closestBoundaryToX(
  line: JsonContentEditableRenderLine,
  x: number,
): JsonContentEditableRenderBoundary | null {
  let best:
    | { boundary: JsonContentEditableRenderBoundary; distance: number }
    | null = null;
  for (const boundary of line.boundaries) {
    const distance = Math.abs(boundary.x - x);
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && boundary.offset > best.boundary.offset)
    ) {
      best = { boundary, distance };
    }
  }
  return best?.boundary ?? null;
}

function lineForBoundary(
  renderFrame: JsonContentEditableRenderFrame,
  boundary: JsonContentEditableRenderBoundary,
): JsonContentEditableRenderLine | null {
  return renderFrame.lines.find((line) => line.id === boundary.lineId) ?? null;
}

function lineIndexForBoundary(
  renderFrame: JsonContentEditableRenderFrame,
  boundary: JsonContentEditableRenderBoundary,
): number | null {
  const index = renderFrame.lines.findIndex((line) => line.id === boundary.lineId);
  return index === -1 ? null : index;
}

function selectionPointFromBoundary(
  boundary: JsonContentEditableRenderBoundary,
): { path: string; offset: number } {
  return {
    path: boundary.path,
    offset: boundary.offset,
  };
}

function sameSelectionPoint(left: SelectionPoint, right: SelectionPoint): boolean {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }
  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}

function verticalDelta(direction: "up" | "down"): number {
  return direction === "up" ? -1 : 1;
}
