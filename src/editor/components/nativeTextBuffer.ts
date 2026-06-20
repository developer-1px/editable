import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { CursorPoint } from "../model/cursor";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import { selectionHasActiveTextMarks } from "../model/markCommands";
import {
  isCodeBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../model/noteDocument";
import { selectionIsCollapsed } from "../model/richSelection";

export type NativeTextPoint = {
  path: string;
  offset: number;
};

export type NativeTextFlushResult =
  | {
      ok: false;
    }
  | {
      ok: true;
      changed: false;
      selectionAfter: SelectionSnap;
    }
  | {
      ok: true;
      changed: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    };

export type NativeTextBuffer = ReturnType<typeof createNativeTextBuffer>;

export function createNativeTextBuffer() {
  let activePath: string | null = null;
  let pendingCompositionCommit = false;

  return {
    hasActiveEdit() {
      return activePath !== null;
    },
    begin(point: NativeTextPoint) {
      activePath = point.path;
    },
    markCompositionEnd() {
      pendingCompositionCommit = activePath !== null;
    },
    clearCompositionCommit() {
      pendingCompositionCommit = false;
    },
    consumeCompositionCommit(inputType: string) {
      if (!pendingCompositionCommit || !isCompositionCommitInput(inputType)) {
        return false;
      }

      pendingCompositionCommit = false;
      return true;
    },
    pointForInput(
      root: HTMLElement | null,
      document: NoteDocument,
      selection: SelectionSnap,
      inputType: string,
    ): NativeTextPoint | null {
      if (root === null || !isNativeTextInputType(inputType)) {
        return null;
      }
      if (!selectionIsCollapsed(selection)) {
        return null;
      }
      if (
        selectionHasActiveTextMarks(selection) &&
        isNativeTextInsertionType(inputType)
      ) {
        return null;
      }

      const point =
        textPointFromNativeSelection(root) ??
        textPointFromSelection(document, selection);
      if (point === null) {
        return null;
      }
      if (activePath !== null && point.path !== activePath) {
        return null;
      }

      const textLength =
        findElementByDataPath(root, point.path)?.textContent?.length ??
        readDocumentText(document, point.path).length;

      if (inputType === "deleteContentBackward" && point.offset <= 0) {
        return null;
      }
      if (inputType === "deleteContentForward" && point.offset >= textLength) {
        return null;
      }

      return point;
    },
    trackInput(root: HTMLElement | null): NativeTextPoint | null {
      const point = root === null ? null : textPointFromNativeSelection(root);
      if (point === null) {
        return null;
      }
      if (activePath !== null && point.path !== activePath) {
        return null;
      }

      activePath = point.path;
      return point;
    },
    flush(
      root: HTMLElement | null,
      document: NoteDocument,
    ): NativeTextFlushResult {
      const path = activePath;
      activePath = null;

      if (path === null || root === null) {
        return { ok: false };
      }

      const textElement = findElementByDataPath(root, path);
      if (textElement === null) {
        return { ok: false };
      }

      const nextText = textElement.textContent ?? "";
      const currentText = readDocumentText(document, path);
      const domPoint = textPointFromNativeSelection(root);
      const offset =
        domPoint?.path === path ? domPoint.offset : nextText.length;
      const selectionAfter = selectionFromCursorPoint({
        path,
        offset: clamp(offset, 0, nextText.length),
      });

      if (currentText === nextText) {
        return { ok: true, changed: false, selectionAfter };
      }

      return {
        ok: true,
        changed: true,
        patch: [{ op: "replace", path, value: nextText }],
        selectionAfter,
      };
    },
  };
}

export function setNativeSelection(
  root: HTMLElement,
  document: NoteDocument,
  point: CursorPoint,
) {
  const nativeTextPoint = nativeTextPointFromCursorPoint(document, point);
  const nativePoint = nativeTextPoint ?? point;
  const element = findElementByDataPath(root, nativePoint.path);
  if (element === null) {
    return;
  }

  const selection = root.ownerDocument.getSelection();
  if (selection === null) {
    return;
  }

  const range = root.ownerDocument.createRange();
  if (nativePoint.offset !== undefined) {
    const position = textPositionForOffset(element, nativePoint.offset);
    if (position === null) {
      return;
    }
    range.setStart(position.node, position.offset);
  } else if (nativePoint.edge === "before") {
    range.setStartBefore(element);
  } else {
    range.setStartAfter(element);
  }
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function isNativeTextInputType(inputType: string): boolean {
  return (
    inputType === "insertText" ||
    inputType === "insertReplacementText" ||
    inputType === "insertCompositionText" ||
    inputType === "insertFromComposition" ||
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward"
  );
}

function isNativeTextInsertionType(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertReplacementText";
}

function isCompositionCommitInput(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertFromComposition";
}

function textPointFromSelection(
  document: NoteDocument,
  selection: SelectionSnap,
): NativeTextPoint | null {
  const point = selection.focus;
  if (point === null || typeof point === "string") {
    return null;
  }

  if (point.offset !== undefined) {
    return { path: point.path, offset: point.offset };
  }

  return nativeTextPointFromCursorPoint(document, {
    path: point.path,
    edge: point.edge === "after" ? "after" : "before",
  });
}

function textPointFromNativeSelection(
  root: HTMLElement,
): NativeTextPoint | null {
  const selection = root.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.focusNode === null ||
    !root.contains(selection.focusNode)
  ) {
    return null;
  }

  const textRun = closestTextRun(selection.focusNode);
  if (textRun === null) {
    return null;
  }

  const path = textRun.getAttribute("data-path");
  if (path === null) {
    return null;
  }

  return {
    path,
    offset: textOffsetInElement(
      textRun,
      selection.focusNode,
      selection.focusOffset,
    ),
  };
}

function closestTextRun(node: Node): Element | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return element?.closest(".text-run[data-path]") ?? null;
}

function nativeTextPointFromCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
): NativeTextPoint | null {
  if (point.offset !== undefined) {
    return { path: point.path, offset: point.offset };
  }

  const match = /^\/blocks\/(\d+)$/.exec(point.path);
  if (match === null) {
    return null;
  }

  const blockIndex = Number(match[1]);
  const block = document.blocks[blockIndex];
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

  return element.textContent?.length ?? 0;
}

function findElementByDataPath(root: ParentNode, path: string): Element | null {
  for (const element of Array.from(root.querySelectorAll("[data-path]"))) {
    if (element.getAttribute("data-path") === path) {
      return element;
    }
  }

  return null;
}

function readDocumentText(document: NoteDocument, path: string) {
  const match = /^\/blocks\/(\d+)\/children\/(\d+)\/text$/.exec(path);
  if (match !== null) {
    const block = document.blocks[Number(match[1])];
    if (!isInlineTextBlock(block)) {
      return "";
    }

    const child = block.children[Number(match[2])];
    return child?.type === "text" ? child.text : "";
  }

  const codeMatch = /^\/blocks\/(\d+)\/text$/.exec(path);
  if (codeMatch !== null) {
    const block = document.blocks[Number(codeMatch[1])];
    return isCodeBlock(block) ? block.text : "";
  }

  return "";
}

function textPath(blockIndex: number, childIndex: number): string {
  return `/blocks/${blockIndex}/children/${childIndex}/text`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
