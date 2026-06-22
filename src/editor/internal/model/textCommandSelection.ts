import type { SelectionSnap } from "@interactive-os/json-document";
import { selectionFromCursorPoint } from "./cursorCommands";
import {
  type InlineNode,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";
import {
  codeTextPath,
  inlinePath,
  type TextLocation,
  textPath,
} from "./textCommandAddressing";

export function selectionAfterInlineRemoval(
  document: NoteDocument,
  blockIndex: number,
  removedChildIndex: number,
): SelectionSnap {
  const block = document.root.children[blockIndex];
  if (!isInlineTextBlock(block)) {
    return selectionFromCursorPoint({
      path: `/root/children/${blockIndex}`,
      edge: "before",
    });
  }

  const next = block.children[removedChildIndex + 1];
  if (next?.type === "text") {
    return selectionFromCursorPoint({
      path: textPath(blockIndex, removedChildIndex),
      offset: 0,
    });
  }
  if (next?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(blockIndex, removedChildIndex),
      edge: "before",
    });
  }

  const previousIndex = removedChildIndex - 1;
  const previous = block.children[previousIndex];
  if (previous?.type === "text") {
    return selectionFromCursorPoint({
      path: textPath(blockIndex, previousIndex),
      offset: previous.text.length,
    });
  }
  if (previous?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(blockIndex, previousIndex),
      edge: "after",
    });
  }

  return selectionFromCursorPoint({
    path: textPath(blockIndex, 0),
    offset: 0,
  });
}

export function selectionAfterBlockRemoval(
  document: NoteDocument,
  removedBlockIndex: number,
): SelectionSnap {
  const next = document.root.children[removedBlockIndex + 1];
  if (next !== undefined) {
    return selectionAtBlockStart(
      document,
      removedBlockIndex + 1,
      removedBlockIndex,
    );
  }

  const previousIndex = removedBlockIndex - 1;
  const previous = document.root.children[previousIndex];
  if (previous !== undefined) {
    return selectionAtBlockEnd(document, previousIndex);
  }

  return selectionFromCursorPoint({
    path: "/root/children/0/children/0/text",
    offset: 0,
  });
}

export function selectionAtBlockStart(
  document: NoteDocument,
  sourceBlockIndex: number,
  targetBlockIndex: number,
): SelectionSnap {
  const block = document.root.children[sourceBlockIndex];
  if (isFigureBlock(block)) {
    return selectionFromCursorPoint({
      path: `/root/children/${targetBlockIndex}`,
      edge: "before",
    });
  }

  if (isCodeBlock(block)) {
    return selectionFromCursorPoint({
      path: codeTextPath(targetBlockIndex),
      offset: 0,
    });
  }

  const child = isInlineTextBlock(block) ? block.children[0] : undefined;
  if (child?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(targetBlockIndex, 0),
      edge: "before",
    });
  }

  return selectionFromCursorPoint({
    path: textPath(targetBlockIndex, 0),
    offset: 0,
  });
}

export function selectionAtChildrenStart(
  blockIndex: number,
  children: InlineNode[],
): SelectionSnap {
  const child = children[0];
  if (child?.type === "mention") {
    return selectionFromCursorPoint({
      path: inlinePath(blockIndex, 0),
      edge: "before",
    });
  }

  return selectionFromCursorPoint({
    path: textPath(blockIndex, 0),
    offset: 0,
  });
}

export function selectionAtBlockEnd(
  document: NoteDocument,
  blockIndex: number,
): SelectionSnap {
  const block = document.root.children[blockIndex];
  if (isFigureBlock(block)) {
    return selectionFromCursorPoint({
      path: `/root/children/${blockIndex}`,
      edge: "after",
    });
  }

  if (isCodeBlock(block)) {
    return selectionFromCursorPoint({
      path: codeTextPath(blockIndex),
      offset: block.text.length,
    });
  }

  if (isInlineTextBlock(block)) {
    const childIndex = block.children.length - 1;
    const child = block.children[childIndex];
    if (child?.type === "mention") {
      return selectionFromCursorPoint({
        path: inlinePath(blockIndex, childIndex),
        edge: "after",
      });
    }
    if (child?.type === "text") {
      return selectionFromCursorPoint({
        path: textPath(blockIndex, childIndex),
        offset: child.text.length,
      });
    }
  }

  return selectionFromCursorPoint({
    path: textPath(blockIndex, 0),
    offset: 0,
  });
}

export function isTextLocationAtBlockStart(
  document: NoteDocument,
  location: TextLocation,
): boolean {
  if (location.kind === "code") {
    return true;
  }

  const block = document.root.children[location.blockIndex];

  return isInlineTextBlock(block) && location.childIndex === 0;
}

export function isTextLocationAtBlockEnd(
  document: NoteDocument,
  location: TextLocation,
): boolean {
  if (location.kind === "code") {
    return true;
  }

  const block = document.root.children[location.blockIndex];

  return (
    isInlineTextBlock(block) &&
    location.childIndex === block.children.length - 1
  );
}
