import type { SelectionSnap } from "@interactive-os/json-document";
import type { CursorPoint } from "../../model/cursor";
import type { NoteDocument } from "../../model/noteDocument";
import {
  type ContentEditableTextPoint,
  contentEditableTextPointFromCursorPoint,
  findElementByDataPath,
  textPositionForOffset,
} from "./contentEditableSelection";

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
  if (element === null) {
    return;
  }

  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  revealRectInVisualViewport(
    root.ownerDocument.defaultView,
    rectForContentEditablePoint(element, contentEditableTextPoint ?? point),
  );
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

function rectForContentEditablePoint(
  element: Element,
  point: CursorPoint | ContentEditableTextPoint,
): DOMRect | null {
  if (point.offset === undefined) {
    return element.getBoundingClientRect();
  }

  const position = textPositionForOffset(element, point.offset);
  if (position === null) {
    return element.getBoundingClientRect();
  }

  const range = element.ownerDocument.createRange();
  try {
    range.setStart(position.node, position.offset);
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.width !== 0 || rect.height !== 0) {
      return rect;
    }
  } catch {
    // Fall back to the mounted text run rect when jsdom/browser cannot provide a caret rect.
  } finally {
    range.detach();
  }

  return element.getBoundingClientRect();
}

function revealRectInVisualViewport(view: Window | null, rect: DOMRect | null) {
  if (view === null || rect === null) {
    return;
  }

  const visualViewport = view.visualViewport;
  if (
    visualViewport == null ||
    typeof view.scrollBy !== "function" ||
    rect.bottom <= visualViewport.offsetTop + visualViewport.height
  ) {
    return;
  }

  view.scrollBy({
    top: rect.bottom - (visualViewport.offsetTop + visualViewport.height),
  });
}
