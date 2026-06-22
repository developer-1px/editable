import type { SelectionSnap } from "@interactive-os/json-document";
import type { CursorPoint } from "../model/cursor";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../model/cursorCommands";
import {
  isCodeBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../model/noteDocument";
import { snapTextOffset } from "../model/textBoundaries";

export type ContentEditableTextPoint = {
  path: string;
  offset: number;
};

export function readContentEditableCursorPoint(
  root: HTMLElement | null,
): CursorPoint | null {
  return root === null ? null : textPointFromDOMSelection(root);
}

export function readContentEditableSelection(
  root: HTMLElement | null,
  document: NoteDocument,
): SelectionSnap | null {
  if (root === null) {
    return null;
  }

  const selection = getSelectionForRoot(root);
  if (
    selection === null ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    return null;
  }

  const rawAnchor = textPointFromDOMPosition(
    root,
    selection.anchorNode,
    selection.anchorOffset,
  );
  const rawFocus = textPointFromDOMPosition(
    root,
    selection.focusNode,
    selection.focusOffset,
  );
  if (rawAnchor === null || rawFocus === null) {
    return null;
  }

  const anchor = snapContentEditableTextPoint(document, rawAnchor);
  const focus = snapContentEditableTextPoint(document, rawFocus);
  if (anchor.path === focus.path && anchor.offset === focus.offset) {
    return selectionFromCursorPoint(focus);
  }

  return selectionFromCursorRange(document, anchor, focus);
}

export function scrollContentEditableSelectionIntoView(
  root: HTMLElement | null,
  document: NoteDocument,
  selection: SelectionSnap | undefined,
) {
  if (root === null || selection === undefined) {
    return;
  }

  const point = selectionSnapshotPoint(selection);
  if (point === null) {
    return;
  }

  scrollContentEditablePointIntoView(root, document, point);
}

export function setContentEditableSelection(
  root: HTMLElement,
  document: NoteDocument,
  point: CursorPoint,
) {
  const contentEditableTextPoint = contentEditableTextPointFromCursorPoint(
    document,
    point,
  );
  const contentEditablePoint = contentEditableTextPoint ?? point;
  const element = findElementByDataPath(root, contentEditablePoint.path);
  if (element === null) {
    return;
  }

  const selection = getSelectionForRoot(root);
  if (selection === null) {
    return;
  }

  const range = root.ownerDocument.createRange();
  if (contentEditablePoint.offset !== undefined) {
    const position = textPositionForOffset(
      element,
      contentEditablePoint.offset,
    );
    if (position === null) {
      return;
    }
    range.setStart(position.node, position.offset);
  } else if (contentEditablePoint.edge === "before") {
    range.setStartBefore(element);
  } else {
    range.setStartAfter(element);
  }
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

export function textPointFromSelection(
  document: NoteDocument,
  selection: SelectionSnap,
): ContentEditableTextPoint | null {
  const point = selection.focus;
  if (point === null || typeof point === "string") {
    return null;
  }

  if (point.offset !== undefined) {
    return { path: point.path, offset: point.offset };
  }

  return contentEditableTextPointFromCursorPoint(document, {
    path: point.path,
    edge: point.edge === "after" ? "after" : "before",
  });
}

export function textPointFromDOMSelection(
  root: HTMLElement,
): ContentEditableTextPoint | null {
  const selection = getSelectionForRoot(root);
  if (
    selection === null ||
    selection.focusNode === null ||
    !root.contains(selection.focusNode)
  ) {
    return null;
  }

  return textPointFromDOMPosition(
    root,
    selection.focusNode,
    selection.focusOffset,
  );
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

export function readDocumentText(document: NoteDocument, path: string) {
  const match = /^\/root\/children\/(\d+)\/children\/(\d+)\/text$/.exec(path);
  if (match !== null) {
    const block = document.root.children[Number(match[1])];
    if (!isInlineTextBlock(block)) {
      return "";
    }

    const child = block.children[Number(match[2])];
    return child?.type === "text" ? child.text : "";
  }

  const codeMatch = /^\/root\/children\/(\d+)\/text$/.exec(path);
  if (codeMatch !== null) {
    const block = document.root.children[Number(codeMatch[1])];
    return isCodeBlock(block) ? block.text : "";
  }

  return "";
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function scrollContentEditablePointIntoView(
  root: HTMLElement,
  document: NoteDocument,
  point: CursorPoint,
) {
  const contentEditableTextPoint = contentEditableTextPointFromCursorPoint(
    document,
    point,
  );
  const targetPath = contentEditableTextPoint?.path ?? point.path;
  const element = findElementByDataPath(root, targetPath);
  if (element === null || typeof element.scrollIntoView !== "function") {
    return;
  }

  element.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function selectionSnapshotPoint(selection: SelectionSnap): CursorPoint | null {
  const point = selection.focus;
  if (point === undefined || point === null || typeof point === "string") {
    return null;
  }

  if (point.offset !== undefined) {
    return {
      path: point.path,
      offset: point.offset,
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }
  if (point.edge !== undefined) {
    return {
      path: point.path,
      edge: point.edge,
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }

  return null;
}

function textPointFromDOMPosition(
  root: HTMLElement,
  node: Node,
  offset: number,
): ContentEditableTextPoint | null {
  if (!root.contains(node)) {
    return null;
  }

  const textRun = closestTextRun(node);
  if (textRun === null) {
    return textPointFromElementBoundary(root, node, offset);
  }

  const path = textRun.getAttribute("data-path");
  if (path === null) {
    return null;
  }

  return {
    path,
    offset: textOffsetInElement(textRun, node, offset),
  };
}

function textPointFromElementBoundary(
  root: HTMLElement,
  node: Node,
  offset: number,
): ContentEditableTextPoint | null {
  if (!(node instanceof Element) || isContentEditableFalse(node)) {
    return null;
  }

  const boundaryOffset = clamp(offset, 0, node.childNodes.length);
  const previous = node.childNodes[boundaryOffset - 1] ?? null;
  const next = node.childNodes[boundaryOffset] ?? null;

  return (
    textPointAtBoundarySide(root, previous, "end") ??
    textPointAtBoundarySide(root, next, "start")
  );
}

function textPointAtBoundarySide(
  root: HTMLElement,
  node: ChildNode | null,
  side: "end" | "start",
): ContentEditableTextPoint | null {
  if (node === null || !root.contains(node) || isContentEditableFalse(node)) {
    return null;
  }

  const textRun = closestTextRun(node) ?? textRunInside(node, side);
  if (textRun === null) {
    return null;
  }

  const path = textRun.getAttribute("data-path");
  if (path === null) {
    return null;
  }

  return {
    path,
    offset: side === "end" ? (textRun.textContent?.length ?? 0) : 0,
  };
}

function textRunInside(node: ChildNode, side: "end" | "start"): Element | null {
  if (!(node instanceof Element)) {
    return null;
  }

  const textRuns = Array.from(node.querySelectorAll(".text-run[data-path]"));
  return side === "end"
    ? (textRuns[textRuns.length - 1] ?? null)
    : (textRuns[0] ?? null);
}

function isContentEditableFalse(node: Node): boolean {
  return (
    node instanceof Element &&
    node.closest('[contenteditable="false"]') !== null
  );
}

function snapContentEditableTextPoint(
  document: NoteDocument,
  point: ContentEditableTextPoint,
): ContentEditableTextPoint {
  return {
    path: point.path,
    offset: snapTextOffset(
      readDocumentText(document, point.path),
      point.offset,
    ),
  };
}

function getSelectionForRoot(root: HTMLElement): Selection | null {
  const rootNode = root.getRootNode();
  if (isShadowRootWithSelection(rootNode)) {
    return rootNode.getSelection();
  }

  return root.ownerDocument.getSelection();
}

function isShadowRootWithSelection(
  node: Node,
): node is Node & { getSelection: () => Selection | null } {
  return (
    "host" in node &&
    typeof (node as { getSelection?: unknown }).getSelection === "function"
  );
}

function closestTextRun(node: Node): Element | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return element?.closest(".text-run[data-path]") ?? null;
}

function contentEditableTextPointFromCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
): ContentEditableTextPoint | null {
  if (point.offset !== undefined) {
    return { path: point.path, offset: point.offset };
  }

  const match = /^\/root\/children\/(\d+)$/.exec(point.path);
  if (match === null) {
    return null;
  }

  const blockIndex = Number(match[1]);
  const block = document.root.children[blockIndex];
  if (isCodeBlock(block)) {
    return {
      path: `${point.path}/text`,
      offset: point.edge === "after" ? block.text.length : 0,
    };
  }

  if (!isInlineTextBlock(block)) {
    return null;
  }

  if (point.edge === "before") {
    const childIndex = block.children.findIndex(
      (child) => child.type === "text",
    );

    return childIndex === -1
      ? null
      : { path: textPath(blockIndex, childIndex), offset: 0 };
  }

  for (
    let childIndex = block.children.length - 1;
    childIndex >= 0;
    childIndex -= 1
  ) {
    const child = block.children[childIndex];
    if (child?.type === "text") {
      return {
        path: textPath(blockIndex, childIndex),
        offset: child.text.length,
      };
    }
  }

  return null;
}

function textPositionForOffset(
  element: Element,
  offset: number,
): { node: Text; offset: number } | null {
  const textLength = element.textContent?.length ?? 0;
  let remaining = clamp(offset, 0, textLength);
  let lastTextNode: Text | null = null;
  const textWalker = element.ownerDocument.createTreeWalker(element, 4);

  let current = textWalker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    lastTextNode = textNode;

    if (remaining <= textNode.data.length) {
      return { node: textNode, offset: remaining };
    }

    remaining -= textNode.data.length;
    current = textWalker.nextNode();
  }

  if (lastTextNode !== null) {
    return { node: lastTextNode, offset: lastTextNode.data.length };
  }

  const emptyTextNode = element.ownerDocument.createTextNode("");
  element.append(emptyTextNode);
  return { node: emptyTextNode, offset: 0 };
}

function textOffsetInElement(
  element: Element,
  focusNode: Node,
  focusOffset: number,
): number {
  const textLength = element.textContent?.length ?? 0;
  if (focusNode === element || element.contains(focusNode)) {
    const range = element.ownerDocument.createRange();
    try {
      range.setStart(element, 0);
      range.setEnd(
        focusNode,
        clamp(focusOffset, 0, nodeOffsetLimit(focusNode)),
      );
      return clamp(range.toString().length, 0, textLength);
    } catch {
      // Fall through to the text-node walk for invalid browser boundary input.
    } finally {
      range.detach();
    }
  }

  let offset = 0;
  const textWalker = element.ownerDocument.createTreeWalker(element, 4);

  let current = textWalker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    if (textNode === focusNode) {
      return offset + clamp(focusOffset, 0, textNode.data.length);
    }

    offset += textNode.data.length;
    current = textWalker.nextNode();
  }

  return textLength;
}

function nodeOffsetLimit(node: Node): number {
  return node instanceof Text ? node.data.length : node.childNodes.length;
}

function textPath(blockIndex: number, childIndex: number): string {
  return `/root/children/${blockIndex}/children/${childIndex}/text`;
}
