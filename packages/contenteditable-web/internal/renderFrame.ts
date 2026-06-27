import type {
  JsonContentEditableRenderBoundary,
  JsonContentEditableRenderBoundaryUnit,
  JsonContentEditableRenderFrame,
  JsonContentEditableRenderLine,
  JsonContentEditableVisualCaret,
  JsonContentEditableVisualLayout,
  JsonContentEditableVisualLine,
} from "../contract";

export function renderFrameFromVisualLayout(
  layout: JsonContentEditableVisualLayout | null,
): JsonContentEditableRenderFrame | null {
  if (layout === null) {
    return null;
  }

  const lines = layout.lines.map((line, lineIndex) =>
    renderLineFromVisualLine(line, lineIndex),
  );
  return {
    lines,
    boundaries: lines.flatMap((line) => line.boundaries),
  };
}

function renderLineFromVisualLine(
  line: JsonContentEditableVisualLine,
  lineIndex: number,
): JsonContentEditableRenderLine {
  const boundaries = line.carets.map((caret, boundaryIndex) =>
    renderBoundaryFromCaret(line, caret, lineIndex, boundaryIndex),
  );
  return {
    ...line,
    boundaries,
  };
}

function renderBoundaryFromCaret(
  line: JsonContentEditableVisualLine,
  caret: JsonContentEditableVisualCaret,
  lineIndex: number,
  boundaryIndex: number,
): JsonContentEditableRenderBoundary {
  return {
    id: `${line.id}:boundary:${lineIndex}:${boundaryIndex}:${caret.offset}`,
    lineId: line.id,
    path: caret.path,
    offset: caret.offset,
    x: caret.x,
    top: caret.top,
    bottom: caret.bottom,
    affinity: boundaryAffinity(line, caret),
    unit: boundaryUnit(line, caret),
  };
}

function boundaryAffinity(
  line: JsonContentEditableVisualLine,
  caret: JsonContentEditableVisualCaret,
): "before" | "after" {
  return caret.offset <= line.startOffset ? "before" : "after";
}

function boundaryUnit(
  line: JsonContentEditableVisualLine,
  caret: JsonContentEditableVisualCaret,
): JsonContentEditableRenderBoundaryUnit {
  if (line.kind === "atom-only") {
    return "atom";
  }
  if (caret.offset <= line.startOffset) {
    return "line-start";
  }
  if (caret.offset >= line.endOffset) {
    return "line-end";
  }
  return "text";
}
