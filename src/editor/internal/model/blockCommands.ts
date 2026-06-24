import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import { resolveCursorIndex } from "./cursor";
import type { NoteDocument } from "./noteDocument";
import {
  cursorPointInputFromSelectionPoint,
  selectionIsCollapsed,
} from "./richSelection";

export type BlockCommandResult =
  | {
      ok: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: false;
      reason: string;
    };

export function adjustSelectedListDepth(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "indent" | "outdent",
): BlockCommandResult | null {
  const blockIndexes = selectedListItemIndexes(document, selection);
  if (blockIndexes.length === 0) {
    return null;
  }

  const delta = direction === "indent" ? 1 : -1;
  const patch = blockIndexes.flatMap((blockIndex) => {
    const block = document.root.children[blockIndex];
    if (block?.type !== "listItem") {
      return [];
    }

    const depth = Math.max(0, block.depth + delta);
    return depth === block.depth
      ? []
      : [
          {
            op: "replace" as const,
            path: `/root/children/${blockIndex}/depth`,
            value: depth,
          },
        ];
  });

  return {
    ok: true,
    patch,
    selectionAfter: selection,
  };
}

function selectedListItemIndexes(
  document: NoteDocument,
  selection: SelectionSnap,
): number[] {
  if (selectionIsCollapsed(selection)) {
    const point = selection.focus ?? selection.anchor;
    if (point === null) {
      return [];
    }

    const blockIndex = blockIndexFromPath(
      cursorPointInputFromSelectionPoint(point).path,
    );
    return blockIndex !== null &&
      document.root.children[blockIndex]?.type === "listItem"
      ? [blockIndex]
      : [];
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return [];
  }

  const anchor = resolveCursorIndex(
    document,
    cursorPointInputFromSelectionPoint(range.anchor),
  );
  const focus = resolveCursorIndex(
    document,
    cursorPointInputFromSelectionPoint(range.focus),
  );
  const start = Math.min(anchor, focus);
  const end = Math.max(anchor, focus);

  return document.root.children.flatMap((block, blockIndex) => {
    if (block.type !== "listItem") {
      return [];
    }

    const path = `/root/children/${blockIndex}`;
    const blockStart = resolveCursorIndex(document, { path, edge: "before" });
    const blockEnd = resolveCursorIndex(document, { path, edge: "after" });

    return Math.max(start, blockStart) < Math.min(end, blockEnd)
      ? [blockIndex]
      : [];
  });
}

function blockIndexFromPath(path: string): number | null {
  const match = /^\/root\/children\/(\d+)(?:\/|$)/.exec(path);
  if (match === null) {
    return null;
  }

  return Number.parseInt(match[1] ?? "", 10);
}
