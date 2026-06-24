import type { SelectionSnap } from "@interactive-os/json-document";
import {
  type CursorPoint,
  normalizeCursorPoint,
  resolveCursorIndex,
} from "./cursor";
import { inlineUnitLength } from "./inlineUnits";
import {
  type InlineNode,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";
import { cursorPointInputFromSelectionPoint } from "./richSelection";
import { inlinePath, textPath } from "./text-command/textCommandAddressing";

export type InlineUnitRange = {
  blockIndex: number;
  startUnit: number;
  endUnit: number;
};

type InlinePosition = {
  blockIndex: number;
  unitOffset: number;
};

export function selectedInlineUnitRange(
  document: NoteDocument,
  selection: SelectionSnap,
): InlineUnitRange | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  const anchor = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.anchor),
  );
  const focus = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.focus),
  );
  const start =
    resolveCursorIndex(document, anchor) <= resolveCursorIndex(document, focus)
      ? anchor
      : focus;
  const end = start === anchor ? focus : anchor;
  const startPosition = inlinePositionFromCursorPoint(document, start);
  const endPosition = inlinePositionFromCursorPoint(document, end);

  if (
    startPosition === null ||
    endPosition === null ||
    startPosition.blockIndex !== endPosition.blockIndex ||
    startPosition.unitOffset === endPosition.unitOffset
  ) {
    return null;
  }

  return {
    blockIndex: startPosition.blockIndex,
    startUnit: Math.min(startPosition.unitOffset, endPosition.unitOffset),
    endUnit: Math.max(startPosition.unitOffset, endPosition.unitOffset),
  };
}

export function textChildrenInInlineUnitRange(
  children: InlineNode[],
  startUnit: number,
  endUnit: number,
): Array<Extract<InlineNode, { type: "text" }>> {
  const selected: Array<Extract<InlineNode, { type: "text" }>> = [];
  let childStart = 0;

  for (const child of children) {
    const childLength = inlineUnitLength([child]);
    const childEnd = childStart + childLength;
    if (
      child.type === "text" &&
      Math.max(startUnit, childStart) < Math.min(endUnit, childEnd)
    ) {
      selected.push(child);
    }
    childStart = childEnd;
  }

  return selected;
}

export function cursorPointFromInlineUnitOffset(
  blockIndex: number,
  children: InlineNode[],
  unitOffset: number,
  bias: "forward" | "backward",
): CursorPoint {
  let offset = Math.max(0, unitOffset);

  for (const [childIndex, child] of children.entries()) {
    if (child.type === "text") {
      if (
        offset < child.text.length ||
        (offset === child.text.length && bias === "backward") ||
        (offset === 0 && bias === "forward")
      ) {
        return {
          path: textPath(blockIndex, childIndex),
          offset,
        };
      }

      offset -= child.text.length;
      continue;
    }

    if (offset <= 0) {
      return { path: inlinePath(blockIndex, childIndex), edge: "before" };
    }
    if (offset <= 1) {
      return { path: inlinePath(blockIndex, childIndex), edge: "after" };
    }

    offset -= 1;
  }

  return { path: `/root/children/${blockIndex}`, edge: "after" };
}

function inlinePositionFromCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
): InlinePosition | null {
  const text = /^\/root\/children\/(\d+)\/children\/(\d+)\/text$/.exec(
    point.path,
  );
  if (text !== null && point.offset !== undefined) {
    const blockIndex = Number(text[1]);
    const childIndex = Number(text[2]);
    const block = document.root.children[blockIndex];
    if (!isInlineTextBlock(block)) {
      return null;
    }

    return {
      blockIndex,
      unitOffset:
        inlineUnitLength(block.children.slice(0, childIndex)) + point.offset,
    };
  }

  const inline = /^\/root\/children\/(\d+)\/children\/(\d+)$/.exec(point.path);
  if (inline !== null && point.edge !== undefined) {
    const blockIndex = Number(inline[1]);
    const childIndex = Number(inline[2]);
    const block = document.root.children[blockIndex];
    if (!isInlineTextBlock(block)) {
      return null;
    }

    return {
      blockIndex,
      unitOffset:
        inlineUnitLength(block.children.slice(0, childIndex)) +
        (point.edge === "after" ? 1 : 0),
    };
  }

  const blockPath = /^\/root\/children\/(\d+)$/.exec(point.path);
  if (blockPath !== null && point.edge !== undefined) {
    const blockIndex = Number(blockPath[1]);
    const block = document.root.children[blockIndex];
    if (!isInlineTextBlock(block)) {
      return null;
    }

    return {
      blockIndex,
      unitOffset: point.edge === "after" ? inlineUnitLength(block.children) : 0,
    };
  }

  return null;
}
