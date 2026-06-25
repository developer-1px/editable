import type { SelectionPoint, SelectionSnap } from "@interactive-os/json-document";
import type {
  JsonContentEditableVisualCaret,
  JsonContentEditableVisualLayout,
  JsonContentEditableVisualLine,
} from "../contract";
import { isTextPoint, selectionFromPoints } from "./selection";

export type VerticalMotion = "up" | "down";

export type VerticalMoveResult = {
  goalX: number;
  selection: SelectionSnap;
};

export function moveSelectionVertically({
  direction,
  extend,
  goalX,
  layout,
  selection,
}: {
  direction: VerticalMotion;
  extend: boolean;
  goalX: number | null;
  layout: JsonContentEditableVisualLayout | null;
  selection: SelectionSnap | null;
}): VerticalMoveResult | null {
  const range =
    selection?.selectionRanges[selection.primaryIndex] ?? null;
  if (range === null || !isTextPoint(range.focus) || layout === null) {
    return null;
  }

  const current = findCaret(layout, range.focus);
  if (current === null) {
    return null;
  }

  const targetGoalX = goalX ?? current.caret.x;
  const targetLine = layout.lines[current.lineIndex + verticalDelta(direction)];
  if (targetLine === undefined) {
    return null;
  }

  const target = closestCaretToX(targetLine, targetGoalX);
  if (target === null) {
    return null;
  }

  const focus = {
    path: target.path,
    offset: target.offset,
  };
  const anchor = extend && isTextPoint(range.anchor) ? range.anchor : focus;
  return {
    goalX: targetGoalX,
    selection: selectionFromPoints(anchor, focus),
  };
}

function findCaret(
  layout: JsonContentEditableVisualLayout,
  point: SelectionPoint,
): { caret: JsonContentEditableVisualCaret; lineIndex: number } | null {
  if (!isTextPoint(point)) {
    return null;
  }

  let best:
    | { caret: JsonContentEditableVisualCaret; distance: number; lineIndex: number }
    | null = null;
  layout.lines.forEach((line, lineIndex) => {
    if (
      line.path !== point.path ||
      point.offset < line.startOffset ||
      line.endOffset < point.offset
    ) {
      return;
    }
    for (const caret of line.carets) {
      const distance = Math.abs(caret.offset - point.offset);
      if (
        best === null ||
        distance < best.distance ||
        (distance === best.distance && caret.x < best.caret.x)
      ) {
        best = { caret, distance, lineIndex };
      }
    }
  });
  return best;
}

function closestCaretToX(
  line: JsonContentEditableVisualLine,
  x: number,
): JsonContentEditableVisualCaret | null {
  let best: { caret: JsonContentEditableVisualCaret; distance: number } | null =
    null;
  for (const caret of line.carets) {
    const distance = Math.abs(caret.x - x);
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance && caret.offset > best.caret.offset)
    ) {
      best = { caret, distance };
    }
  }
  return best?.caret ?? null;
}

function verticalDelta(direction: VerticalMotion): number {
  return direction === "up" ? -1 : 1;
}
