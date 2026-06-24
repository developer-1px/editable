import type { ReplayedEditorState } from "./editorTraceReplayTypes";

export function readReplayedEditorState(
  root: HTMLElement,
): ReplayedEditorState {
  const view = root.querySelector(".document-view");
  const domSelection = readDomSelectionState(root);

  return {
    ...domSelection,
    pathText: readPathText(root),
    selectionAnchorEdge:
      view?.getAttribute("data-selection-anchor-edge") ?? null,
    selectionAnchorOffset:
      view?.getAttribute("data-selection-anchor-offset") ?? null,
    selectionAnchorPath:
      view?.getAttribute("data-selection-anchor-path") ?? null,
    selectionEdge: view?.getAttribute("data-selection-edge") ?? null,
    selectionFocusEdge: view?.getAttribute("data-selection-focus-edge") ?? null,
    selectionFocusOffset:
      view?.getAttribute("data-selection-focus-offset") ?? null,
    selectionFocusPath: view?.getAttribute("data-selection-focus-path") ?? null,
    selectionOffset: view?.getAttribute("data-selection-offset") ?? null,
    selectionPath: view?.getAttribute("data-selection-path") ?? null,
    selectionRangeCount:
      view?.getAttribute("data-selection-range-count") ?? null,
    selectionSelectedPointers:
      view?.getAttribute("data-selection-selected-pointers") ?? null,
    text: view?.textContent ?? "",
  };
}

export function replayedEditorStatesEqual(
  left: ReplayedEditorState,
  right: ReplayedEditorState,
): boolean {
  return (
    left.text === right.text &&
    left.selectionPath === right.selectionPath &&
    left.selectionOffset === right.selectionOffset &&
    left.selectionEdge === right.selectionEdge &&
    left.selectionAnchorPath === right.selectionAnchorPath &&
    left.selectionAnchorOffset === right.selectionAnchorOffset &&
    left.selectionAnchorEdge === right.selectionAnchorEdge &&
    left.selectionFocusPath === right.selectionFocusPath &&
    left.selectionFocusOffset === right.selectionFocusOffset &&
    left.selectionFocusEdge === right.selectionFocusEdge &&
    left.selectionRangeCount === right.selectionRangeCount &&
    left.selectionSelectedPointers === right.selectionSelectedPointers &&
    pathTextEqual(left.pathText, right.pathText)
  );
}

function readPathText(root: HTMLElement): Record<string, string> {
  const pathText: Record<string, string> = {};
  for (const element of Array.from(root.querySelectorAll("[data-path]"))) {
    const path = element.getAttribute("data-path");
    if (path !== null) {
      pathText[path] = element.textContent ?? "";
    }
  }

  return pathText;
}

function readDomSelectionState(
  root: HTMLElement,
): Pick<
  ReplayedEditorState,
  | "domSelectionAnchorOffset"
  | "domSelectionAnchorPath"
  | "domSelectionCollapsed"
  | "domSelectionFocusOffset"
  | "domSelectionFocusPath"
  | "domSelectionText"
> {
  const selection = root.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    return {
      domSelectionAnchorOffset: null,
      domSelectionAnchorPath: null,
      domSelectionCollapsed: null,
      domSelectionFocusOffset: null,
      domSelectionFocusPath: null,
      domSelectionText: "",
    };
  }

  return {
    domSelectionAnchorOffset: domTextOffsetForNode(
      selection.anchorNode,
      selection.anchorOffset,
    ),
    domSelectionAnchorPath: dataPathForNode(selection.anchorNode),
    domSelectionCollapsed: String(selection.isCollapsed),
    domSelectionFocusOffset: domTextOffsetForNode(
      selection.focusNode,
      selection.focusOffset,
    ),
    domSelectionFocusPath: dataPathForNode(selection.focusNode),
    domSelectionText: selection.toString(),
  };
}

function dataPathForNode(node: Node): string | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest("[data-path]")?.getAttribute("data-path") ?? null;
}

function domTextOffsetForNode(node: Node, offset: number): string | null {
  const element = node instanceof Element ? node : node.parentElement;
  const pathElement = element?.closest("[data-path]");
  if (pathElement === null || pathElement === undefined) {
    return null;
  }

  let textOffset = 0;
  const walker = pathElement.ownerDocument.createTreeWalker(pathElement, 4);
  let current = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    if (textNode === node) {
      return String(
        clamp(textOffset + offset, 0, pathElement.textContent?.length ?? 0),
      );
    }
    textOffset += textNode.data.length;
    current = walker.nextNode();
  }

  return null;
}

function pathTextEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) {
    return false;
  }

  return leftEntries.every(([path, text]) => right[path] === text);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
