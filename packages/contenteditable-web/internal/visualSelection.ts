import type { SelectionSnap } from "@interactive-os/json-document";
import type {
  JsonContentEditableVisualLayout,
  JsonContentEditableRenderFrame,
  JsonContentEditableSelectionFrame,
} from "../contract";
import { renderFrameFromVisualLayout } from "./renderFrame";
import {
  moveSelectionFrameToLineBoundary,
  moveSelectionFrameVertically,
  selectionFrameFromSelection,
} from "./selectionFrame";

export type VerticalMotion = "up" | "down";

export type VerticalMoveResult = {
  goalX: number;
  selection: SelectionSnap;
};

export type LineBoundaryMoveResult = {
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
  const frame = selectionFrameFromSelection({
    goalX,
    renderFrame: renderFrameFromVisualLayout(layout),
    selection,
  });
  if (frame === null) {
    return null;
  }

  const moved = moveSelectionFrameVertically(frame, direction, extend);
  if (moved === null || moved.goalX === null) {
    return null;
  }

  return {
    goalX: moved.goalX,
    selection: moved.selection,
  };
}

export function moveSelectionToRenderLineBoundary({
  boundary,
  extend,
  layout,
  selection,
}: {
  boundary: "line-start" | "line-end";
  extend: boolean;
  layout: JsonContentEditableVisualLayout | null;
  selection: SelectionSnap | null;
}): LineBoundaryMoveResult | null {
  const frame = selectionFrameFromSelection({
    goalX: null,
    renderFrame: renderFrameFromVisualLayout(layout),
    selection,
  });
  if (frame === null) {
    return null;
  }

  const moved = moveSelectionFrameToLineBoundary(frame, boundary, extend);
  return moved === null ? null : { selection: moved.selection };
}

export { renderFrameFromVisualLayout };
export type { JsonContentEditableRenderFrame, JsonContentEditableSelectionFrame };
