import type { SelectionSnap } from "@interactive-os/json-document";
import {
  type CursorPoint,
  firstCursorPoint,
  moveCursorByWord,
  normalizeCursorPoint,
} from "../model/cursor";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../model/cursorCommands";
import type { NoteDocument } from "../model/noteDocument";
import {
  cursorPointInputFromSelectionPoint,
  selectionForRender,
  selectionFromNodeTarget,
} from "../model/richSelection";

export function selectionForView(
  document: NoteDocument,
  selection: SelectionSnap | undefined,
): SelectionSnap | undefined {
  return selectionForRender(document, selection);
}

export function selectionSnapshotPoint(selection: SelectionSnap | undefined) {
  const point = selection?.focus;
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

export function selectionRevealKey(
  selection: SelectionSnap | undefined,
): string | null {
  if (selection === undefined) {
    return null;
  }

  return JSON.stringify({
    focus: selection.focus,
    selectedPointers: selection.selectedPointers,
  });
}

export function selectableAtomPathFromEventTarget(
  target: EventTarget,
): string | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const atom = target.closest(
    ".mention-chip[data-path], .figure-block[data-path]",
  );
  return atom?.getAttribute("data-path") ?? null;
}

export function selectionAnchorForPointer(
  document: NoteDocument,
  selection: SelectionSnap,
): CursorPoint {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range !== undefined) {
    return normalizeCursorPoint(
      document,
      cursorPointInputFromSelectionPoint(range.anchor),
    );
  }

  return selectionSnapshotPoint(selection) ?? firstCursorPoint(document);
}

export function selectionForWordAtPoint(
  document: NoteDocument,
  point: CursorPoint,
): SelectionSnap {
  if (point.offset === undefined) {
    return isSelectableAtomPath(document, point.path)
      ? selectionFromNodeTarget(point.path)
      : selectionForCurrentBlock(document, point);
  }

  const anchor = moveCursorByWord(document, point, "backward");
  const focus = moveCursorByWord(document, point, "forward");

  return selectionFromCursorRange(document, anchor, focus);
}

export function selectionForCurrentBlock(
  document: NoteDocument,
  point: CursorPoint,
): SelectionSnap {
  const blockPath = blockPathFromCursorPath(point.path);
  if (blockPath === null) {
    return selectionFromCursorPoint(point);
  }

  const blockIndex = Number(blockPath.slice("/root/children/".length));
  const block = document.root.children[blockIndex];
  if (block?.type === "figure") {
    return selectionFromNodeTarget(blockPath);
  }

  return selectionFromCursorRange(
    document,
    { path: blockPath, edge: "before" },
    { path: blockPath, edge: "after" },
  );
}

function blockPathFromCursorPath(path: string): string | null {
  const match = /^\/root\/children\/\d+/.exec(path);
  return match?.[0] ?? null;
}

function isSelectableAtomPath(document: NoteDocument, path: string): boolean {
  const inlineMatch = /^\/root\/children\/(\d+)\/children\/(\d+)$/.exec(path);
  if (inlineMatch !== null) {
    const block = document.root.children[Number(inlineMatch[1])];
    const child =
      block?.type === "paragraph" ||
      block?.type === "heading" ||
      block?.type === "quote" ||
      block?.type === "listItem"
        ? block.children[Number(inlineMatch[2])]
        : undefined;

    return child?.type === "mention";
  }

  const blockMatch = /^\/root\/children\/(\d+)$/.exec(path);
  const block =
    blockMatch === null
      ? undefined
      : document.root.children[Number(blockMatch[1])];

  return block?.type === "figure";
}
