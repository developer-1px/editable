import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  editableBlockIndexFromTextPath,
  editableTextPath,
  type EditableDocumentValue,
} from "../model";
import {
  EDITABLE_BLOCK_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  editableBlockFromNode,
  editableSurfaceFromNode,
  textFromSurface,
  textNodes,
} from "./editableDOM";

export type DOMSelectionPoint = {
  blockId: string;
  blockIndex: number;
  offset: number;
};

export function readDOMSelection(
  root: HTMLElement,
  value: EditableDocumentValue,
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

  const anchor = readDOMPoint(
    root,
    value,
    selection.anchorNode,
    selection.anchorOffset,
  );
  const focus = readDOMPoint(
    root,
    value,
    selection.focusNode,
    selection.focusOffset,
  );
  if (anchor === null || focus === null) {
    return null;
  }

  const anchorPoint = {
    path: editableTextPath(anchor.blockIndex),
    offset: anchor.offset,
  };
  const focusPoint = {
    path: editableTextPath(focus.blockIndex),
    offset: focus.offset,
  };

  return {
    selectedPointers: [],
    selectionRanges: [{ anchor: anchorPoint, focus: focusPoint }],
    primaryIndex: 0,
    anchor: anchorPoint,
    focus: focusPoint,
  };
}

export function readDOMPoint(
  root: HTMLElement,
  value: EditableDocumentValue,
  node: Node,
  offset: number,
): DOMSelectionPoint | null {
  const resolved = resolveOwnedSurfacePoint(root, node, offset);
  const block = editableBlockFromNode(root, resolved?.surface ?? node);
  if (resolved === null || block === null) {
    return null;
  }

  const blockId = block.getAttribute(EDITABLE_BLOCK_ATTRIBUTE);
  if (blockId === null) {
    return null;
  }
  const blockIndex = value.blocks.findIndex((candidate) => candidate.id === blockId);
  if (blockIndex < 0) {
    return null;
  }

  const textLength = textFromSurface(resolved.surface).length;
  return {
    blockId,
    blockIndex,
    offset: Math.min(Math.max(resolved.offset, 0), textLength),
  };
}

export function restoreDOMSelection(
  root: HTMLElement,
  value: EditableDocumentValue,
  snapshot: SelectionSnap | null,
): boolean {
  const range =
    snapshot === null
      ? undefined
      : snapshot.selectionRanges[snapshot.primaryIndex];
  if (range === undefined) {
    return false;
  }

  const anchor = selectionPointToDOM(root, value, range.anchor);
  const focus = selectionPointToDOM(root, value, range.focus);
  if (anchor === null || focus === null) {
    return false;
  }

  root.focus({ preventScroll: true });
  const selection = root.ownerDocument.getSelection();
  if (selection === null) {
    return false;
  }

  if (typeof selection.setBaseAndExtent === "function") {
    selection.setBaseAndExtent(
      anchor.node,
      anchor.offset,
      focus.node,
      focus.offset,
    );
    return true;
  }

  const domRange = root.ownerDocument.createRange();
  domRange.setStart(anchor.node, anchor.offset);
  domRange.setEnd(focus.node, focus.offset);
  selection.removeAllRanges();
  selection.addRange(domRange);
  return true;
}

function selectionPointToDOM(
  root: HTMLElement,
  value: EditableDocumentValue,
  point: SelectionPoint,
): { node: Node; offset: number } | null {
  if (typeof point === "string") {
    return null;
  }
  const blockIndex = editableBlockIndexFromTextPath(point.path);
  const block = blockIndex === null ? undefined : value.blocks[blockIndex];
  if (block === undefined) {
    return null;
  }
  const element = Array.from(
    root.querySelectorAll<HTMLElement>(`[${EDITABLE_BLOCK_ATTRIBUTE}]`),
  ).find(
    (candidate) => candidate.getAttribute(EDITABLE_BLOCK_ATTRIBUTE) === block.id,
  );
  const surface = element?.querySelector<HTMLElement>(
    `[${EDITABLE_TEXT_ATTRIBUTE}]`,
  );
  if (surface === null || surface === undefined) {
    return null;
  }
  return domPointAtOffset(surface, point.offset ?? 0);
}

function domOffsetWithin(
  surface: HTMLElement,
  node: Node,
  offset: number,
): number {
  try {
    const range = surface.ownerDocument.createRange();
    range.setStart(surface, 0);
    range.setEnd(node, offset);
    return range.toString().length;
  } catch {
    return 0;
  }
}

function resolveOwnedSurfacePoint(
  root: HTMLElement,
  node: Node,
  offset: number,
): { surface: HTMLElement; offset: number } | null {
  const directSurface = editableSurfaceFromNode(root, node);
  if (directSurface !== null) {
    return {
      surface: directSurface,
      offset: domOffsetWithin(directSurface, node, offset),
    };
  }


  const containingBlock = editableBlockFromNode(root, node);
  const blockSurface = containingBlock?.querySelector<HTMLElement>(
    `[${EDITABLE_TEXT_ATTRIBUTE}]`,
  );
  if (blockSurface !== null && blockSurface !== undefined) {
    const blockRange = root.ownerDocument.createRange();
    blockRange.selectNodeContents(blockSurface);
    try {
      const relation = blockRange.comparePoint(node, offset);
      if (relation < 0) {
        return { surface: blockSurface, offset: 0 };
      }
      if (relation > 0) {
        return {
          surface: blockSurface,
          offset: textFromSurface(blockSurface).length,
        };
      }
      return {
        surface: blockSurface,
        offset: domOffsetWithin(blockSurface, node, offset),
      };
    } catch {
      return null;
    }
  }

  let previous: HTMLElement | null = null;
  for (const surface of root.querySelectorAll<HTMLElement>(
    `[${EDITABLE_TEXT_ATTRIBUTE}]`,
  )) {
    const range = root.ownerDocument.createRange();
    range.selectNodeContents(surface);
    try {
      const relation = range.comparePoint(node, offset);
      if (relation < 0) {
        return { surface, offset: 0 };
      }
      if (relation === 0) {
        return {
          surface,
          offset: domOffsetWithin(surface, node, offset),
        };
      }
    } catch {
      return null;
    }
    previous = surface;
  }
  return previous === null
    ? null
    : { surface: previous, offset: textFromSurface(previous).length };
}

function domPointAtOffset(
  surface: HTMLElement,
  requestedOffset: number,
): { node: Node; offset: number } {
  const nodes = textNodes(surface);
  if (nodes.length === 0) {
    return { node: surface, offset: 0 };
  }

  let remaining = Math.max(requestedOffset, 0);
  for (const node of nodes) {
    if (remaining <= node.data.length) {
      return { node, offset: remaining };
    }
    remaining -= node.data.length;
  }
  const last = nodes[nodes.length - 1] as Text;
  return { node: last, offset: last.data.length };
}
