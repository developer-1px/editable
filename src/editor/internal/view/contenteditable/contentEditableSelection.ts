import type { SelectionSnap } from "@interactive-os/json-document";
import type { CursorPoint } from "../../model/cursor";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../../model/cursorCommands";
import type { NoteDocument } from "../../model/noteDocument";
import {
  type ContentEditableTextPoint,
  contentEditableTextPointFromCursorPoint,
  findElementByDataPath,
  snapContentEditableTextPoint,
  textPointFromDOMPosition,
  textPositionForOffset,
} from "./contentEditableTextPoint";

export {
  type ContentEditableTextPoint,
  clamp,
  contentEditableTextPointFromCursorPoint,
  findElementByDataPath,
  readDocumentText,
  textPointFromSelection,
  textPositionForOffset,
} from "./contentEditableTextPoint";

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

export function isContentEditableDOMSelectionCollapsed(
  root: HTMLElement,
): boolean {
  const selection = getSelectionForRoot(root);
  return selection?.isCollapsed === true;
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
