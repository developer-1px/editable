import type {
  Pointer,
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { FlushOptions } from "../contract";
import {
  closestAttributeElement,
  findElementByAttribute,
  textDOMPositionForOffset,
  textOffsetInElement,
} from "./domText";

export function chooseSelection(
  intent: NonNullable<FlushOptions["intent"]>,
  mappedSelection: SelectionSnap | null,
  derivedCaret: SelectionSnap,
  previousSelection: SelectionSnap | null,
): SelectionSnap {
  if (intent === "range-command") {
    if (mappedSelection !== null && !selectionIsCollapsed(mappedSelection)) {
      return mappedSelection;
    }
    if (previousSelection !== null && !selectionIsCollapsed(previousSelection)) {
      return previousSelection;
    }
    if (mappedSelection !== null) {
      return mappedSelection;
    }
    if (previousSelection !== null) {
      return previousSelection;
    }
    return derivedCaret;
  }

  if (
    intent === "text-commit" &&
    mappedSelection !== null &&
    !selectionIsCollapsed(mappedSelection)
  ) {
    return mappedSelection;
  }

  return derivedCaret;
}

export function selectionFromDOM(
  root: HTMLElement,
  textAttribute: string,
  atomAttribute: string,
): SelectionSnap | null {
  const selection = root.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    return null;
  }

  const anchor = textPointFromDOMPosition(
    root,
    textAttribute,
    atomAttribute,
    selection.anchorNode,
    selection.anchorOffset,
  );
  const focus = textPointFromDOMPosition(
    root,
    textAttribute,
    atomAttribute,
    selection.focusNode,
    selection.focusOffset,
  );
  if (anchor === null || focus === null) {
    return null;
  }

  return selectionFromPoints(anchor, focus);
}

export function selectionFromPoint(point: SelectionPoint): SelectionSnap {
  return selectionFromPoints(point, point);
}

export function selectionFromPoints(
  anchor: SelectionPoint,
  focus: SelectionPoint,
): SelectionSnap {
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

export function textPointFromDOMSelection(
  root: HTMLElement,
  textAttribute: string,
  atomAttribute: string,
): { path: Pointer; offset: number } | null {
  const selection = root.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.focusNode === null ||
    !root.contains(selection.focusNode)
  ) {
    return null;
  }
  return textPointFromDOMPosition(
    root,
    textAttribute,
    atomAttribute,
    selection.focusNode,
    selection.focusOffset,
  );
}

export function restoreDOMSelection(
  root: HTMLElement,
  selection: SelectionSnap | undefined,
  textAttribute: string,
  atomAttribute: string,
): boolean {
  const range = selection?.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return false;
  }

  const anchor = domPositionFromSelectionPoint(
    root,
    range.anchor,
    textAttribute,
    atomAttribute,
  );
  const focus = domPositionFromSelectionPoint(
    root,
    range.focus,
    textAttribute,
    atomAttribute,
  );
  if (anchor === null || focus === null) {
    return false;
  }

  const domSelection = root.ownerDocument.getSelection();
  if (domSelection === null) {
    return false;
  }

  domSelection.removeAllRanges();
  domSelection.collapse(anchor.node, anchor.offset);
  if (!sameDOMPosition(anchor, focus)) {
    domSelection.extend(focus.node, focus.offset);
  }
  return true;
}

export function isTextPoint(
  point: SelectionPoint,
): point is { path: Pointer; offset: number } {
  return typeof point === "object" && point !== null && point.offset !== undefined;
}

function selectionIsCollapsed(selection: SelectionSnap): boolean {
  const range = selection.selectionRanges[selection.primaryIndex];
  return (
    range === undefined ||
    sameSelectionPoint(range.anchor, range.focus)
  );
}

function textPointFromDOMPosition(
  root: HTMLElement,
  textAttribute: string,
  atomAttribute: string,
  node: Node,
  offset: number,
): { path: Pointer; offset: number } | null {
  const element = closestAttributeElement(root, node, textAttribute);
  if (element === null) {
    return null;
  }
  const path = element.getAttribute(textAttribute);
  if (path === null) {
    return null;
  }
  return {
    path,
    offset: textOffsetInElement(element, node, offset, atomAttribute),
  };
}

function domPositionFromSelectionPoint(
  root: HTMLElement,
  point: SelectionPoint,
  textAttribute: string,
  atomAttribute: string,
): { node: Node; offset: number } | null {
  if (isTextPoint(point)) {
    const element = findElementByAttribute(root, textAttribute, point.path);
    return element === null
      ? null
      : textDOMPositionForOffset(element, point.offset, atomAttribute);
  }
  return null;
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

function sameDOMPosition(
  left: { node: Node; offset: number },
  right: { node: Node; offset: number },
): boolean {
  return left.node === right.node && left.offset === right.offset;
}
