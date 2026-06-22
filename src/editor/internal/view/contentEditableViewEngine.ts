import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type ClipboardFormat,
  readClipboardTextFromTransfer,
} from "../model/clipboard";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import { selectionHasActiveTextMarks } from "../model/markCommands";
import {
  isCodeBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../model/noteDocument";
import { selectionIsCollapsed } from "../model/richSelection";
import { snapTextOffset } from "../model/textBoundaries";
import {
  type ContentEditableTextPoint,
  clamp,
  findElementByDataPath,
  readDocumentText,
  textPointFromDOMSelection,
  textPointFromSelection,
} from "./contentEditableSelection";

export {
  readContentEditableCursorPoint,
  readContentEditableSelection,
  scrollContentEditableSelectionIntoView,
  setContentEditableSelection,
} from "./contentEditableSelection";

type ContentEditableFlushResult =
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
      path: string;
      previousText: string;
      nextText: string;
      selectionAfter: SelectionSnap;
    };

type ContentEditableBeforeInput = {
  inputType: string;
  data?: string | null;
  format?: ClipboardFormat;
  isComposing?: boolean;
};

type ContentEditableBeforeInputDecision =
  | { kind: "history"; direction: "undo" | "redo" }
  | { kind: "commitComposition" }
  | { kind: "deferToContentEditable" }
  | { kind: "ignore" }
  | { kind: "runHeadless" };

type ContentEditableInputPhase =
  | "idle"
  | "native"
  | "composing"
  | "awaitingCommit";

export function contentEditableBeforeInputFromEvent(
  event: InputEvent,
): ContentEditableBeforeInput {
  const transferText = contentEditableTransferText(event);

  return {
    inputType: event.inputType,
    data: transferText?.text ?? event.data,
    format: transferText?.format,
    isComposing: event.isComposing,
  };
}

export function createContentEditableViewEngine() {
  let activePath: string | null = null;
  let phase: ContentEditableInputPhase = "idle";
  let compositionStartText: string | null = null;
  let compositionStartOffset: number | null = null;
  let lastCompositionText: string | null = null;
  let finalCompositionCommitText: string | null = null;

  const begin = (point: ContentEditableTextPoint) => {
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
  ): ContentEditableTextPoint | null => {
    if (root === null || !isContentEditableTextMutationInputType(inputType)) {
      return null;
    }

    const domPoint = textPointFromDOMSelection(root);
    if (
      !selectionIsCollapsed(selection) &&
      !canUseContentEditableCompositionPoint(inputType, domPoint)
    ) {
      return null;
    }
    if (
      selectionHasActiveTextMarks(selection) &&
      isContentEditableTextInsertionInputType(inputType)
    ) {
      return null;
    }

    const point = domPoint ?? textPointFromSelection(document, selection);
    if (point === null) {
      return null;
    }
    if (
      activePath !== null &&
      point.path !== activePath &&
      !(phase === "composing" && inputType === "insertCompositionText")
    ) {
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
    reset(root: HTMLElement | null, document: NoteDocument) {
      activePath = null;
      phase = "idle";
      compositionStartText = null;
      compositionStartOffset = null;
      lastCompositionText = null;
      finalCompositionCommitText = null;
      if (root !== null) {
        restoreDocumentText(root, document);
      }
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
        compositionStartText = readRootText(root, point.path);
        compositionStartOffset = point.offset;
        lastCompositionText = compositionStartText;
      }
    },
    planBeforeInput(
      root: HTMLElement | null,
      document: NoteDocument,
      selection: SelectionSnap,
      input: ContentEditableBeforeInput,
    ): ContentEditableBeforeInputDecision {
      if (
        (phase === "composing" || phase === "awaitingCommit") &&
        (input.inputType === "historyUndo" || input.inputType === "historyRedo")
      ) {
        return { kind: "ignore" };
      }

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
        if (
          phase === "composing" &&
          input.inputType === "insertCompositionText" &&
          point.path !== activePath
        ) {
          compositionStartText =
            readRootText(root, point.path) ??
            readDocumentText(document, point.path);
          compositionStartOffset = point.offset;
          lastCompositionText = compositionStartText;
        }
        begin(point);
        return { kind: "deferToContentEditable" };
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
      if (phase !== "awaitingCommit") {
        return false;
      }

      phase = activePath === null ? "idle" : "native";
      return true;
    },
    trackInput(
      root: HTMLElement | null,
      document: NoteDocument,
    ): ContentEditableTextPoint | null {
      const point = root === null ? null : textPointFromDOMSelection(root);
      if (point === null) {
        return null;
      }
      if (
        activePath !== null &&
        point.path !== activePath &&
        phase !== "composing"
      ) {
        return null;
      }

      activePath = point.path;
      if (phase === "idle") {
        phase = "native";
      }
      if (phase === "composing") {
        lastCompositionText =
          readRootText(root, point.path) ??
          readDocumentText(document, point.path);
      }
      return point;
    },
    flush(
      root: HTMLElement | null,
      document: NoteDocument,
    ): ContentEditableFlushResult {
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
        compositionStartText,
        compositionStartOffset,
        lastCompositionText,
        finalCompositionCommitText,
      );
      const nextText = normalized.text;
      const offset = normalized.offset;
      compositionStartText = null;
      compositionStartOffset = null;
      lastCompositionText = null;
      finalCompositionCommitText = null;
      if (nextText !== rawNextText) {
        textElement.textContent = nextText;
      }
      const selectionOffset = snapTextOffset(nextText, offset);
      const selectionAfter = selectionFromCursorPoint({
        path,
        offset: selectionOffset,
      });

      if (currentText === nextText) {
        return { ok: true, changed: false, selectionAfter };
      }

      return {
        ok: true,
        changed: true,
        patch: [{ op: "replace", path, value: nextText }],
        path,
        previousText: currentText,
        nextText,
        selectionAfter,
      };
    },
  };
}

function restoreDocumentText(root: HTMLElement, document: NoteDocument) {
  document.root.children.forEach((block, blockIndex) => {
    if (isInlineTextBlock(block)) {
      block.children.forEach((child, childIndex) => {
        if (child.type !== "text") {
          return;
        }

        restoreTextElement(
          root,
          `/root/children/${blockIndex}/children/${childIndex}/text`,
          child.text,
        );
      });
      return;
    }

    if (isCodeBlock(block)) {
      restoreTextElement(root, `/root/children/${blockIndex}/text`, block.text);
    }
  });
}

function restoreTextElement(root: HTMLElement, path: string, text: string) {
  const element = findElementByDataPath(root, path);
  if (element === null) {
    return;
  }

  const onlyChild = element.childNodes.length === 1 ? element.firstChild : null;
  if (!(onlyChild instanceof Text) || onlyChild.data !== text) {
    element.textContent = text;
  }
}

function contentEditableTransferText(
  event: InputEvent,
): { text: string; format: ClipboardFormat } | null {
  if (
    event.inputType !== "insertFromPaste" &&
    event.inputType !== "insertFromDrop"
  ) {
    return null;
  }

  const transfer = event.dataTransfer;
  return transfer === null || transfer === undefined
    ? null
    : readClipboardTextFromTransfer(transfer);
}

function isContentEditableTextMutationInputType(inputType: string): boolean {
  return (
    inputType === "insertText" ||
    inputType === "insertReplacementText" ||
    inputType === "insertCompositionText" ||
    inputType === "insertFromComposition" ||
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward"
  );
}

function isContentEditableTextInsertionInputType(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertReplacementText";
}

function isCompositionCommitInput(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertFromComposition";
}

function canUseContentEditableCompositionPoint(
  inputType: string,
  point: ContentEditableTextPoint | null,
): boolean {
  return inputType === "insertCompositionText" && point !== null;
}

function normalizeCompositionCommitText(
  text: string,
  offset: number,
  compositionStartText: string | null,
  compositionStartOffset: number | null,
  lastComposedText: string | null,
  finalCommitText: string | null,
): { text: string; offset: number } {
  if (
    lastComposedText === null ||
    finalCommitText === null ||
    finalCommitText.length === 0
  ) {
    return { text, offset };
  }

  if (
    compositionStartText !== null &&
    lastComposedText !== compositionStartText
  ) {
    return replaceComposedTextWithFinalCommit(
      compositionStartText,
      compositionStartOffset,
      lastComposedText,
      finalCommitText,
    );
  }

  if (
    text === lastComposedText ||
    (compositionStartText !== null && lastComposedText === compositionStartText)
  ) {
    return { text, offset };
  }

  const duplicateCommitIndexes: number[] = [];
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

    duplicateCommitIndexes.push(index);
  }

  const duplicateCommitIndex =
    duplicateCommitIndexes.find(
      (index) =>
        compositionStartOffset === null || index >= compositionStartOffset,
    ) ?? duplicateCommitIndexes[0];
  if (duplicateCommitIndex !== undefined) {
    return {
      text: lastComposedText,
      offset:
        offset > duplicateCommitIndex
          ? Math.max(duplicateCommitIndex, offset - finalCommitText.length)
          : offset,
    };
  }

  return { text, offset };
}

function replaceComposedTextWithFinalCommit(
  compositionStartText: string,
  compositionStartOffset: number | null,
  lastComposedText: string,
  finalCommitText: string,
): { text: string; offset: number } {
  const anchoredRange = changedRangeAroundCompositionStart(
    compositionStartText,
    lastComposedText,
    compositionStartOffset,
  );
  if (anchoredRange !== null) {
    return {
      text:
        compositionStartText.slice(0, anchoredRange.start) +
        finalCommitText +
        compositionStartText.slice(anchoredRange.end),
      offset: anchoredRange.start + finalCommitText.length,
    };
  }

  const prefixLength = commonPrefixLength(
    compositionStartText,
    lastComposedText,
  );
  const suffixLength = commonSuffixLength(
    compositionStartText,
    lastComposedText,
    prefixLength,
  );

  if (
    prefixLength === compositionStartText.length &&
    prefixLength === lastComposedText.length
  ) {
    const insertAt = clamp(
      compositionStartOffset ?? compositionStartText.length,
      0,
      compositionStartText.length,
    );

    return {
      text:
        compositionStartText.slice(0, insertAt) +
        finalCommitText +
        compositionStartText.slice(insertAt),
      offset: insertAt + finalCommitText.length,
    };
  }

  const suffixStart = compositionStartText.length - suffixLength;

  return {
    text:
      compositionStartText.slice(0, prefixLength) +
      finalCommitText +
      compositionStartText.slice(suffixStart),
    offset: prefixLength + finalCommitText.length,
  };
}

function changedRangeAroundCompositionStart(
  before: string,
  after: string,
  compositionStartOffset: number | null,
): { start: number; end: number } | null {
  if (compositionStartOffset === null) {
    return null;
  }

  const anchor = clamp(compositionStartOffset, 0, before.length);
  let best: { start: number; end: number; score: number } | null = null;

  for (let start = 0; start <= before.length; start += 1) {
    for (let end = start; end <= before.length; end += 1) {
      if (anchor < start || anchor > end) {
        continue;
      }

      const prefix = before.slice(0, start);
      const suffix = before.slice(end);
      if (
        prefix.length + suffix.length > after.length ||
        !after.startsWith(prefix) ||
        !after.endsWith(suffix)
      ) {
        continue;
      }

      const score =
        Math.abs(start - anchor) * 2 +
        Math.abs(end - anchor) * 2 +
        (end - start);
      if (best === null || score < best.score) {
        best = { start, end, score };
      }
    }
  }

  return best === null ? null : { start: best.start, end: best.end };
}

function commonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function commonSuffixLength(
  left: string,
  right: string,
  prefixLength: number,
): number {
  let length = 0;
  const maxLength = Math.min(left.length, right.length) - prefixLength;
  while (
    length < maxLength &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }

  return length;
}

function readRootText(root: ParentNode | null, path: string): string | null {
  return root === null
    ? null
    : (findElementByDataPath(root, path)?.textContent ?? null);
}
