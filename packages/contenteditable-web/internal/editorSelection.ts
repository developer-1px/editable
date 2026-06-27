import type {
  Pointer,
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import type {
  EditCommand,
  EditorContractResult,
  EditorPoint,
  EditorSelection,
  EditorSelectionDirection,
  ModelOperation,
  ModelTextOperation,
  RenderBoundary,
  RenderFrame,
  RenderLine,
  SelectionModelErrorCode,
} from "./editorContract";
import { editorContractBlocked, editorContractOk } from "./editorContract";

type MoveCommand = Extract<EditCommand, { type: "move" }>;

export function editorSelectionFromSelectionSnap(
  selection: SelectionSnap | null,
  options: {
    direction?: EditorSelectionDirection;
    goalX?: number | null;
  } = {},
): EditorContractResult<EditorSelection | null, SelectionModelErrorCode> {
  if (selection === null) {
    return editorContractOk(null);
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return editorContractBlocked(
      "invalid-selection",
      "The selection has no primary range.",
    );
  }

  const anchor = editorPointFromSelectionPoint(range.anchor);
  const focus = editorPointFromSelectionPoint(range.focus);
  if (anchor === null || focus === null) {
    return editorContractBlocked(
      "invalid-selection",
      "The selection range is not a text range.",
    );
  }

  const direction = options.direction ?? inferSelectionDirection(anchor, focus);
  if (direction === null) {
    return editorContractBlocked(
      "invalid-selection",
      "The selection direction is ambiguous across text surfaces.",
    );
  }

  return editorContractOk({
    anchor,
    focus,
    direction,
    goalX: options.goalX ?? null,
  });
}

export function selectionSnapFromEditorSelection(
  selection: EditorSelection,
): SelectionSnap {
  const anchor = selectionPointFromEditorPoint(selection.anchor);
  const focus = selectionPointFromEditorPoint(selection.focus);
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

export function collapseEditorSelection(
  selection: EditorSelection,
  edge: "anchor" | "focus",
): EditorSelection {
  const point = cloneEditorPoint(selection[edge]);
  return {
    anchor: point,
    focus: point,
    direction: "none",
    goalX: null,
  };
}

export function moveEditorSelection(
  selection: EditorSelection,
  frame: RenderFrame | null,
  command: MoveCommand,
): EditorContractResult<EditorSelection, SelectionModelErrorCode> {
  if (frame === null) {
    return editorContractBlocked("missing-layout", "No render frame is available.");
  }

  if (command.unit === "grapheme") {
    return moveByBoundary(selection, frame, command);
  }

  if (command.unit === "visual-line") {
    return moveByVisualLine(selection, frame, command);
  }

  return editorContractBlocked(
    "unsupported-unit",
    `${command.unit} movement is not handled by the render-frame selection model.`,
  );
}

export function recoverEditorSelectionAfterModelOperations(
  selection: EditorSelection,
  operations: ReadonlyArray<ModelOperation>,
): EditorContractResult<EditorSelection, SelectionModelErrorCode> {
  let recovered = cloneEditorSelection(selection);
  for (const operation of operations) {
    if (operation.selectionAfter !== null) {
      recovered = cloneEditorSelection(operation.selectionAfter);
      continue;
    }
    if (operation.type === "replaceText") {
      const applied = recoverSelectionAfterTextReplacement(recovered, operation);
      if (!applied.ok) {
        return applied;
      }
      recovered = applied.value;
      continue;
    }
    return editorContractBlocked(
      "unsupported-operation",
      "Selection recovery needs selectionAfter for patch operations.",
    );
  }
  return editorContractOk(recovered);
}

function moveByBoundary(
  selection: EditorSelection,
  frame: RenderFrame,
  command: MoveCommand,
): EditorContractResult<EditorSelection, SelectionModelErrorCode> {
  if (command.direction !== "backward" && command.direction !== "forward") {
    return editorContractBlocked(
      "unsupported-unit",
      "Grapheme movement only supports backward and forward directions.",
    );
  }

  const ordered = orderedBoundaries(frame);
  const anchor = closestBoundaryIndex(ordered, selection.anchor);
  const focus = closestBoundaryIndex(ordered, selection.focus);
  if (anchor === null || focus === null) {
    return editorContractBlocked(
      "missing-boundary",
      "The selection is not represented in the render frame.",
    );
  }

  const directionDelta = command.direction === "backward" ? -1 : 1;
  let targetIndex = clampBoundaryIndex(focus + directionDelta, ordered);
  if (!command.extend && anchor !== focus) {
    targetIndex = command.direction === "backward"
      ? Math.min(anchor, focus)
      : Math.max(anchor, focus);
  }

  return selectionFromBoundaryMove({
    anchor: command.extend ? ordered[anchor] : ordered[targetIndex],
    focus: ordered[targetIndex],
    frame,
    goalX: null,
  });
}

function moveByVisualLine(
  selection: EditorSelection,
  frame: RenderFrame,
  command: MoveCommand,
): EditorContractResult<EditorSelection, SelectionModelErrorCode> {
  if (command.direction === "start" || command.direction === "end") {
    return moveToVisualLineEdge(selection, frame, command);
  }
  if (command.direction !== "up" && command.direction !== "down") {
    return editorContractBlocked(
      "unsupported-unit",
      "Visual line movement only supports up, down, start, and end directions.",
    );
  }

  const focus = locateBoundary(frame, selection.focus);
  if (focus === null) {
    return editorContractBlocked(
      "missing-boundary",
      "The selection focus is not represented in the render frame.",
    );
  }

  const targetLineIndex = focus.lineIndex + (command.direction === "up" ? -1 : 1);
  const targetLine = frame.lines[targetLineIndex];
  if (targetLine === undefined) {
    return editorContractBlocked(
      "missing-boundary",
      "There is no visual line in the requested direction.",
    );
  }

  const goalX = selection.goalX ?? focus.boundary.x;
  const target = closestBoundaryToX(targetLine, goalX);
  if (target === null) {
    return editorContractBlocked(
      "missing-boundary",
      "The target visual line has no caret boundary.",
    );
  }

  return selectionFromBoundaryMove({
    anchor: command.extend ? selection.anchor : target.point,
    focus: target.point,
    frame,
    goalX,
  });
}

function moveToVisualLineEdge(
  selection: EditorSelection,
  frame: RenderFrame,
  command: MoveCommand,
): EditorContractResult<EditorSelection, SelectionModelErrorCode> {
  const focus = locateBoundary(frame, selection.focus);
  if (focus === null) {
    return editorContractBlocked(
      "missing-boundary",
      "The selection focus is not represented in the render frame.",
    );
  }

  const target =
    command.direction === "start"
      ? focus.line.boundaries[0]
      : focus.line.boundaries.at(-1);
  if (target === undefined) {
    return editorContractBlocked(
      "missing-boundary",
      "The current visual line has no caret boundary.",
    );
  }

  return selectionFromBoundaryMove({
    anchor: command.extend ? selection.anchor : target.point,
    focus: target.point,
    frame,
    goalX: null,
  });
}

function recoverSelectionAfterTextReplacement(
  selection: EditorSelection,
  operation: ModelTextOperation,
): EditorContractResult<EditorSelection, SelectionModelErrorCode> {
  if (
    operation.range.start < 0 ||
    operation.range.end < operation.range.start
  ) {
    return editorContractBlocked(
      "invalid-selection",
      "The text replacement range is invalid.",
    );
  }

  const anchor = recoverPointAfterTextReplacement(selection.anchor, operation);
  const focus = recoverPointAfterTextReplacement(selection.focus, operation);
  return editorContractOk({
    anchor,
    focus,
    direction: inferSelectionDirection(anchor, focus) ?? selection.direction,
    goalX: null,
  });
}

function recoverPointAfterTextReplacement(
  point: EditorPoint,
  operation: ModelTextOperation,
): EditorPoint {
  if (point.path !== operation.path) {
    return cloneEditorPoint(point);
  }

  const { start, end } = operation.range;
  const insertedLength = operation.text.length;
  const removedLength = end - start;
  if (point.offset < start) {
    return cloneEditorPoint(point);
  }
  if (point.offset > end) {
    return {
      ...point,
      offset: point.offset + insertedLength - removedLength,
    };
  }
  return {
    ...point,
    offset: point.affinity === "before" ? start : start + insertedLength,
  };
}

function selectionFromBoundaryMove({
  anchor,
  focus,
  frame,
  goalX,
}: {
  anchor: EditorPoint | RenderBoundary;
  focus: EditorPoint | RenderBoundary;
  frame: RenderFrame;
  goalX: number | null;
}): EditorContractResult<EditorSelection, SelectionModelErrorCode> {
  const anchorPoint = cloneEditorPoint(pointFromBoundaryOrPoint(anchor));
  const focusPoint = cloneEditorPoint(pointFromBoundaryOrPoint(focus));
  const direction = directionFromRenderFrame(frame, anchorPoint, focusPoint);
  if (direction === null) {
    return editorContractBlocked(
      "missing-boundary",
      "The moved selection is not represented in the render frame.",
    );
  }
  return editorContractOk({
    anchor: anchorPoint,
    focus: focusPoint,
    direction,
    goalX,
  });
}

function directionFromRenderFrame(
  frame: RenderFrame,
  anchor: EditorPoint,
  focus: EditorPoint,
): EditorSelectionDirection | null {
  if (sameEditorPoint(anchor, focus)) {
    return "none";
  }
  const ordered = orderedBoundaries(frame);
  const anchorIndex = closestBoundaryIndex(ordered, anchor);
  const focusIndex = closestBoundaryIndex(ordered, focus);
  if (anchorIndex === null || focusIndex === null) {
    return null;
  }
  return anchorIndex <= focusIndex ? "forward" : "backward";
}

function pointFromBoundaryOrPoint(input: EditorPoint | RenderBoundary): EditorPoint {
  return "point" in input ? input.point : input;
}

function editorPointFromSelectionPoint(point: SelectionPoint): EditorPoint | null {
  if (typeof point === "string" || point.offset === undefined) {
    return null;
  }
  return {
    path: point.path,
    offset: point.offset,
    affinity: point.edge ?? "before",
  };
}

function selectionPointFromEditorPoint(point: EditorPoint): {
  path: Pointer;
  offset: number;
  edge: "before" | "after";
} {
  return {
    path: point.path,
    offset: point.offset,
    edge: point.affinity,
  };
}

function inferSelectionDirection(
  anchor: EditorPoint,
  focus: EditorPoint,
): EditorSelectionDirection | null {
  if (sameEditorPoint(anchor, focus)) {
    return "none";
  }
  if (anchor.path !== focus.path) {
    return null;
  }
  return anchor.offset <= focus.offset ? "forward" : "backward";
}

function locateBoundary(
  frame: RenderFrame,
  point: EditorPoint,
): {
  boundary: RenderBoundary;
  line: RenderLine;
  lineIndex: number;
} | null {
  let best:
    | {
        boundary: RenderBoundary;
        distance: number;
        line: RenderLine;
        lineIndex: number;
      }
    | null = null;
  for (let lineIndex = 0; lineIndex < frame.lines.length; lineIndex += 1) {
    const line = frame.lines[lineIndex];
    if (line === undefined) {
      continue;
    }
    for (const boundary of line.boundaries) {
      if (boundary.point.path !== point.path) {
        continue;
      }
      const distance = Math.abs(boundary.point.offset - point.offset);
      if (
        best === null ||
        distance < best.distance ||
        (distance === best.distance && boundary.x < best.boundary.x)
      ) {
        best = { boundary, distance, line, lineIndex };
      }
    }
  }
  if (best === null) {
    return null;
  }
  return {
    boundary: best.boundary,
    line: best.line,
    lineIndex: best.lineIndex,
  };
}

function closestBoundaryToX(
  line: RenderLine,
  x: number,
): RenderBoundary | null {
  let best: { boundary: RenderBoundary; distance: number } | null = null;
  for (const boundary of line.boundaries) {
    const distance = Math.abs(boundary.x - x);
    if (
      best === null ||
      distance < best.distance ||
      (distance === best.distance &&
        boundary.point.offset > best.boundary.point.offset)
    ) {
      best = { boundary, distance };
    }
  }
  return best?.boundary ?? null;
}

function orderedBoundaries(frame: RenderFrame): ReadonlyArray<RenderBoundary> {
  return frame.lines.flatMap((line) => line.boundaries);
}

function closestBoundaryIndex(
  boundaries: ReadonlyArray<RenderBoundary>,
  point: EditorPoint,
): number | null {
  let best: { index: number; distance: number } | null = null;
  for (let index = 0; index < boundaries.length; index += 1) {
    const boundary = boundaries[index];
    if (boundary === undefined) {
      continue;
    }
    if (boundary.point.path !== point.path) {
      continue;
    }
    const distance = Math.abs(boundary.point.offset - point.offset);
    if (best === null || distance < best.distance) {
      best = { index, distance };
    }
  }
  return best === null ? null : best.index;
}

function clampBoundaryIndex(
  index: number,
  boundaries: ReadonlyArray<RenderBoundary>,
): number {
  return Math.min(Math.max(index, 0), Math.max(boundaries.length - 1, 0));
}

function cloneEditorSelection(selection: EditorSelection): EditorSelection {
  return {
    anchor: cloneEditorPoint(selection.anchor),
    focus: cloneEditorPoint(selection.focus),
    direction: selection.direction,
    goalX: selection.goalX,
  };
}

function cloneEditorPoint(point: EditorPoint): EditorPoint {
  return {
    path: point.path,
    offset: point.offset,
    affinity: point.affinity,
  };
}

function sameEditorPoint(left: EditorPoint, right: EditorPoint): boolean {
  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.affinity === right.affinity
  );
}
