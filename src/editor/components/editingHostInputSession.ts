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

export type EditingHostTextPoint = {
  path: string;
  offset: number;
};

export type EditingHostFlushResult =
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

export type EditingHostBeforeInput = {
  inputType: string;
  data?: string | null;
  isComposing?: boolean;
  targetRanges?: readonly StaticRange[];
};

export type EditingHostBeforeInputDecision =
  | { kind: "history"; direction: "undo" | "redo" }
  | { kind: "commitComposition" }
  | { kind: "deferToEditingHost" }
  | { kind: "runHeadless" };

export type EditingHostInputSession = ReturnType<
  typeof createEditingHostInputSession
>;

type EditingHostInputPhase = "idle" | "native" | "composing" | "awaitingCommit";

export function createEditingHostInputSession() {
  let activePath: string | null = null;
  let phase: EditingHostInputPhase = "idle";
  let lastCompositionText: string | null = null;
  let finalCompositionCommitText: string | null = null;

  const begin = (point: EditingHostTextPoint) => {
    activePath = point.path;
    if (phase === "idle") {
      phase = "native";
    }
  };

  const consumeCompositionCommit = (
    inputType: string,
    data?: string | null,
  ) => {
    if (phase !== "awaitingCommit" || !isCompositionCommitInput(inputType)) {
      return false;
    }

    finalCompositionCommitText = data ?? null;
    phase = activePath === null ? "idle" : "native";
    return true;
  };

  const pointForInput = (
    root: HTMLElement | null,
    document: NoteDocument,
    selection: SelectionSnap,
    inputType: string,
  ): EditingHostTextPoint | null => {
    if (root === null || !isEditingHostTextMutationInputType(inputType)) {
      return null;
    }

    const domPoint = textPointFromDOMSelection(root);
    if (
      !selectionIsCollapsed(selection) &&
      !canUseEditingHostCompositionPoint(inputType, domPoint)
    ) {
      return null;
    }
    if (
      selectionHasActiveTextMarks(selection) &&
      isEditingHostTextInsertionInputType(inputType)
    ) {
      return null;
    }

    const point = domPoint ?? textPointFromSelection(document, selection);
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
  };

  return {
    hasActiveEdit() {
      return activePath !== null || phase !== "idle";
    },
    beginComposition(
      root: HTMLElement | null,
      document: NoteDocument,
      selection: SelectionSnap,
    ) {
      phase = "composing";
      const point =
        root === null
          ? null
          : (textPointFromDOMSelection(root) ??
            textPointFromSelection(document, selection));
      if (point !== null) {
        activePath = point.path;
        lastCompositionText = readRootText(root, point.path);
      }
    },
    planBeforeInput(
      root: HTMLElement | null,
      document: NoteDocument,
      selection: SelectionSnap,
      input: EditingHostBeforeInput,
    ): EditingHostBeforeInputDecision {
      if (input.inputType === "historyUndo") {
        return { kind: "history", direction: "undo" };
      }
      if (input.inputType === "historyRedo") {
        return { kind: "history", direction: "redo" };
      }

      if (consumeCompositionCommit(input.inputType, input.data)) {
        return { kind: "commitComposition" };
      }

      const point = pointForInput(root, document, selection, input.inputType);
      if (point !== null) {
        begin(point);
        return { kind: "deferToEditingHost" };
      }

      return { kind: "runHeadless" };
    },
    shouldIgnoreKeyDown() {
      return phase === "composing" || phase === "awaitingCommit";
    },
    endComposition() {
      if (phase === "composing" || activePath !== null) {
        phase = "awaitingCommit";
      }
    },
    clearCompositionCommit() {
      if (phase === "awaitingCommit") {
        phase = activePath === null ? "idle" : "native";
      }
    },
    trackInput(root: HTMLElement | null): EditingHostTextPoint | null {
      const point = root === null ? null : textPointFromDOMSelection(root);
      if (point === null) {
        return null;
      }
      if (activePath !== null && point.path !== activePath) {
        return null;
      }

      activePath = point.path;
      if (phase === "idle") {
        phase = "native";
      }
      if (phase === "composing") {
        lastCompositionText = readRootText(root, point.path);
      }
      return point;
    },
    flush(
      root: HTMLElement | null,
      document: NoteDocument,
    ): EditingHostFlushResult {
      const path = activePath;
      activePath = null;
      phase = "idle";

      if (path === null || root === null) {
        return { ok: false };
      }

      const textElement = findElementByDataPath(root, path);
      if (textElement === null) {
        return { ok: false };
      }

      const rawNextText = textElement.textContent ?? "";
      const currentText = readDocumentText(document, path);
      const domPoint = textPointFromDOMSelection(root);
      const rawOffset =
        domPoint?.path === path ? domPoint.offset : rawNextText.length;
      const normalized = normalizeCompositionCommitText(
        rawNextText,
        rawOffset,
        lastCompositionText,
        finalCompositionCommitText,
      );
      const nextText = normalized.text;
      const offset = normalized.offset;
      lastCompositionText = null;
      finalCompositionCommitText = null;
      if (nextText !== rawNextText) {
        textElement.textContent = nextText;
      }
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

export function setEditingHostSelection(
  root: HTMLElement,
  document: NoteDocument,
  point: CursorPoint,
) {
  const editingHostTextPoint = editingHostTextPointFromCursorPoint(
    document,
    point,
  );
  const editingHostPoint = editingHostTextPoint ?? point;
  const element = findElementByDataPath(root, editingHostPoint.path);
  if (element === null) {
    return;
  }

  const selection = root.ownerDocument.getSelection();
  if (selection === null) {
    return;
  }

  const range = root.ownerDocument.createRange();
  if (editingHostPoint.offset !== undefined) {
    const position = textPositionForOffset(element, editingHostPoint.offset);
    if (position === null) {
      return;
    }
    range.setStart(position.node, position.offset);
  } else if (editingHostPoint.edge === "before") {
    range.setStartBefore(element);
  } else {
    range.setStartAfter(element);
  }
  range.collapse(true);

  selection.removeAllRanges();
  selection.addRange(range);
}

function isEditingHostTextMutationInputType(inputType: string): boolean {
  return (
    inputType === "insertText" ||
    inputType === "insertReplacementText" ||
    inputType === "insertCompositionText" ||
    inputType === "insertFromComposition" ||
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward"
  );
}

function isEditingHostTextInsertionInputType(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertReplacementText";
}

function isCompositionCommitInput(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertFromComposition";
}

function canUseEditingHostCompositionPoint(
  inputType: string,
  point: EditingHostTextPoint | null,
): boolean {
  return inputType === "insertCompositionText" && point !== null;
}

function normalizeCompositionCommitText(
  text: string,
  offset: number,
  lastComposedText: string | null,
  finalCommitText: string | null,
): { text: string; offset: number } {
  if (
    lastComposedText === null ||
    finalCommitText === null ||
    finalCommitText.length === 0 ||
    text === lastComposedText
  ) {
    return { text, offset };
  }

  for (
    let index = 0;
    index <= text.length - finalCommitText.length;
    index += 1
  ) {
    if (text.slice(index, index + finalCommitText.length) !== finalCommitText) {
      continue;
    }

    const withoutCommit =
      text.slice(0, index) + text.slice(index + finalCommitText.length);
    if (withoutCommit !== lastComposedText) {
      continue;
    }

    return {
      text: lastComposedText,
      offset:
        offset > index
          ? Math.max(index, offset - finalCommitText.length)
          : offset,
    };
  }

  return { text, offset };
}

function readRootText(root: ParentNode | null, path: string): string | null {
  return root === null
    ? null
    : (findElementByDataPath(root, path)?.textContent ?? null);
}

function textPointFromSelection(
  document: NoteDocument,
  selection: SelectionSnap,
): EditingHostTextPoint | null {
  const point = selection.focus;
  if (point === null || typeof point === "string") {
    return null;
  }

  if (point.offset !== undefined) {
    return { path: point.path, offset: point.offset };
  }

  return editingHostTextPointFromCursorPoint(document, {
    path: point.path,
    edge: point.edge === "after" ? "after" : "before",
  });
}

function textPointFromDOMSelection(
  root: HTMLElement,
): EditingHostTextPoint | null {
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

function editingHostTextPointFromCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
): EditingHostTextPoint | null {
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

function textPath(blockIndex: number, childIndex: number): string {
  return `/root/children/${blockIndex}/children/${childIndex}/text`;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
