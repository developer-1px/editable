import type { EditorTraceStep } from "./editorTraceReplayTypes";

export function replaceTextRun(
  root: HTMLElement,
  path: string,
  text: string,
  offset?: number,
) {
  const element = findElementByDataPath(root, path);
  if (element === null) {
    throw new Error(`Missing text run for ${path}.`);
  }

  element.textContent = text;
  if (offset !== undefined) {
    setTextSelection(root, path, offset);
  }
}

export function setTraceSelection(
  root: HTMLElement,
  step: Extract<EditorTraceStep, { kind: "selection" }>,
) {
  if (step.path !== undefined && step.offset !== undefined) {
    setTextSelection(root, step.path, step.offset);
    return;
  }

  if (step.anchor !== undefined && step.focus !== undefined) {
    setTextRangeSelection(root, step.anchor, step.focus);
    return;
  }

  throw new Error("Selection step requires path/offset or anchor/focus.");
}

export function findElementByDataPath(
  root: ParentNode,
  path: string,
): Element | null {
  for (const element of Array.from(root.querySelectorAll("[data-path]"))) {
    if (element.getAttribute("data-path") === path) {
      return element;
    }
  }

  return null;
}

function setTextSelection(root: HTMLElement, path: string, offset: number) {
  setTextRangeSelection(root, { path, offset }, { path, offset });
}

function setTextRangeSelection(
  root: HTMLElement,
  anchor: { path: string; offset: number },
  focus: { path: string; offset: number },
) {
  const anchorPosition = textPositionForPathOffset(root, anchor);
  const focusPosition = textPositionForPathOffset(root, focus);

  const range = root.ownerDocument.createRange();
  range.setStart(anchorPosition.node, anchorPosition.offset);
  range.setEnd(focusPosition.node, focusPosition.offset);

  const selection = root.ownerDocument.getSelection();
  if (selection === null) {
    throw new Error("Selection is unavailable.");
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function textPositionForPathOffset(
  root: HTMLElement,
  point: { path: string; offset: number },
) {
  const element = findElementByDataPath(root, point.path);
  if (element === null) {
    throw new Error(`Missing text run for ${point.path}.`);
  }

  const position = textPositionForOffset(element, point.offset);
  if (position === null) {
    throw new Error(`Missing text node for ${point.path}.`);
  }

  return position;
}

function textPositionForOffset(
  element: Element,
  offset: number,
): { node: Text; offset: number } | null {
  const textLength = element.textContent?.length ?? 0;
  let remaining = clamp(offset, 0, textLength);
  let lastTextNode: Text | null = null;
  const walker = element.ownerDocument.createTreeWalker(element, 4);

  let current = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    lastTextNode = textNode;

    if (remaining <= textNode.data.length) {
      return { node: textNode, offset: remaining };
    }

    remaining -= textNode.data.length;
    current = walker.nextNode();
  }

  if (lastTextNode !== null) {
    return { node: lastTextNode, offset: lastTextNode.data.length };
  }

  const emptyTextNode = element.ownerDocument.createTextNode("");
  element.append(emptyTextNode);
  return { node: emptyTextNode, offset: 0 };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
