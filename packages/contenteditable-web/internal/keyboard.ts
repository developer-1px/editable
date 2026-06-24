export function historyCommandFromKey(event: KeyboardEvent): "undo" | "redo" | null {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "z" && event.shiftKey) {
    return "redo";
  }
  if (key === "z") {
    return "undo";
  }
  if (key === "y") {
    return "redo";
  }
  return null;
}

export function lineBoundaryCommandFromKey(
  event: KeyboardEvent,
): "line-start" | "line-end" | null {
  if (!event.metaKey || event.altKey || event.ctrlKey) {
    return null;
  }
  if (event.key === "ArrowLeft") {
    return "line-start";
  }
  if (event.key === "ArrowRight") {
    return "line-end";
  }
  return null;
}
