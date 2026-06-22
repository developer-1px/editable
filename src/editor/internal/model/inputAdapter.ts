import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  adjustSelectedListDepth,
  type BlockCommandResult,
} from "./blockCommands";
import type { ClipboardFormat } from "./clipboard";
import {
  type CursorGeometryAdapter,
  moveBlockEnd,
  moveBlockStart,
  moveDown,
  moveEnd,
  moveLeft,
  moveLineEnd,
  moveLineStart,
  movePageDown,
  movePageUp,
  moveRight,
  moveStart,
  moveUp,
  moveWordLeft,
  moveWordRight,
  selectAll,
} from "./cursorCommands";
import { toggleLink, toggleMark } from "./markCommands";
import { importMarkdown } from "./markdown";
import {
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";
import { selectionIsCollapsed } from "./richSelection";
import {
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
  insertBlockFragment,
  insertFigure,
  insertInlineFragment,
  insertText,
  splitParagraph,
  type TextCommandResult,
} from "./textCommands";

export type EditorInput =
  | {
      type: "keydown";
      key: string;
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
      altKey?: boolean;
      isComposing?: boolean;
    }
  | {
      type: "beforeinput";
      inputType: string;
      data?: string | null;
      format?: ClipboardFormat;
      isComposing?: boolean;
    }
  | {
      type: "paste";
      text: string;
      format?: ClipboardFormat;
    };

export type EditorInputAdapterOptions = {
  geometry?: CursorGeometryAdapter;
  readOnly?: boolean;
};

export type EditorInputResult =
  | {
      ok: true;
      handled: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: true;
      handled: false;
    }
  | {
      ok: false;
      reason: string;
    };

export function isReadOnlyEditingKeyDown(
  input: Extract<EditorInput, { type: "keydown" }>,
): boolean {
  return isReadOnlyEditingKey(
    input.key,
    input.metaKey === true || input.ctrlKey === true,
    input.altKey === true,
  );
}

export function translateEditorInput(
  document: NoteDocument,
  selection: SelectionSnap,
  input: EditorInput,
  options: EditorInputAdapterOptions = {},
): EditorInputResult {
  if (options.readOnly === true && input.type !== "keydown") {
    return selectionResult(selection);
  }

  if ("isComposing" in input && input.isComposing === true) {
    return notHandled();
  }

  if (input.type === "keydown") {
    return translateKeyDown(
      document,
      selection,
      input.key,
      input.shiftKey === true,
      input.metaKey === true || input.ctrlKey === true,
      input.altKey === true,
      options,
    );
  }

  if (input.type === "beforeinput") {
    return translateBeforeInput(document, selection, input);
  }

  if (input.type === "paste") {
    return translatePaste(document, selection, input);
  }

  return notHandled();
}

function translatePaste(
  document: NoteDocument,
  selection: SelectionSnap,
  input: Extract<EditorInput, { type: "paste" }>,
): EditorInputResult {
  if (input.format === "markdown") {
    const result = translateMarkdownPaste(document, selection, input.text);
    if (result !== null) {
      return textCommandResult(result);
    }
  }

  return textCommandResult(insertText(document, selection, input.text));
}

function translateMarkdownPaste(
  document: NoteDocument,
  selection: SelectionSnap,
  markdown: string,
): TextCommandResult | null {
  const fragment = importMarkdown(markdown).root.children;
  if (fragment.length !== 1) {
    return insertBlockFragment(document, selection, fragment);
  }

  const block = fragment[0];
  if (isInlineTextBlock(block) && block.type === "paragraph") {
    return insertInlineFragment(document, selection, block.children);
  }
  if (isFigureBlock(block)) {
    return insertFigure(document, selection, block);
  }

  return insertBlockFragment(document, selection, fragment);
}

function translateKeyDown(
  document: NoteDocument,
  selection: SelectionSnap,
  key: string,
  shiftKey: boolean,
  commandKey: boolean,
  altKey: boolean,
  options: EditorInputAdapterOptions,
): EditorInputResult {
  if (commandKey && !altKey && key.toLowerCase() === "a") {
    return selectionResult(selectAll(document).selectionAfter);
  }
  if (options.readOnly === true) {
    const navigationResult = translateNavigationKeyDown(
      document,
      selection,
      key,
      shiftKey,
      commandKey,
      altKey,
      options,
    );

    return (
      navigationResult ??
      readOnlyBlockedKeyResult(selection, key, commandKey, altKey)
    );
  }

  if (commandKey && !altKey && key.toLowerCase() === "b") {
    return textCommandResult(toggleMark(document, selection, "bold"));
  }
  if (commandKey && !altKey && key.toLowerCase() === "i") {
    return textCommandResult(toggleMark(document, selection, "italic"));
  }
  if (commandKey && !altKey && key.toLowerCase() === "e") {
    return textCommandResult(toggleMark(document, selection, "code"));
  }
  if (commandKey && !altKey && key.toLowerCase() === "k") {
    return textCommandResult(toggleLink(document, selection));
  }

  if (!commandKey && !altKey && key === "Tab") {
    const listDepth = adjustSelectedListDepth(
      document,
      selection,
      shiftKey ? "outdent" : "indent",
    );
    if (listDepth !== null) {
      return blockCommandResult(listDepth);
    }

    return shiftKey
      ? selectionResult(selection)
      : textCommandResult(insertText(document, selection, "\t"));
  }
  if (key === "Backspace") {
    if (commandKey) {
      return selectionResult(selection);
    }

    return textCommandResult(
      altKey
        ? deleteWordBackward(document, selection)
        : deleteBackward(document, selection),
    );
  }
  if (key === "Delete") {
    if (commandKey) {
      return selectionResult(selection);
    }

    return textCommandResult(
      altKey
        ? deleteWordForward(document, selection)
        : deleteForward(document, selection),
    );
  }
  if (key === "Enter") {
    return commandKey || altKey
      ? selectionResult(selection)
      : textCommandResult(splitParagraph(document, selection));
  }

  return (
    translateNavigationKeyDown(
      document,
      selection,
      key,
      shiftKey,
      commandKey,
      altKey,
      options,
    ) ?? notHandled()
  );
}

function translateNavigationKeyDown(
  document: NoteDocument,
  selection: SelectionSnap,
  key: string,
  shiftKey: boolean,
  commandKey: boolean,
  altKey: boolean,
  options: EditorInputAdapterOptions,
): EditorInputResult | null {
  if (!commandKey && !altKey && key === "Escape") {
    return selectionResult(selectionWithoutTransientContext(selection));
  }

  if (commandKey && !altKey && key === "ArrowLeft") {
    return selectionResult(
      options.geometry === undefined
        ? moveBlockStart(document, selection, { extend: shiftKey })
            .selectionAfter
        : moveLineStart(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (commandKey && !altKey && key === "ArrowRight") {
    return selectionResult(
      options.geometry === undefined
        ? moveBlockEnd(document, selection, { extend: shiftKey }).selectionAfter
        : moveLineEnd(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (commandKey && !altKey && key === "ArrowUp") {
    return selectionResult(
      moveStart(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (commandKey && !altKey && key === "ArrowDown") {
    return selectionResult(
      moveEnd(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (!altKey && key === "PageUp") {
    return selectionResult(
      commandKey || options.geometry === undefined
        ? moveStart(document, selection, { extend: shiftKey }).selectionAfter
        : movePageUp(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (!altKey && key === "PageDown") {
    return selectionResult(
      commandKey || options.geometry === undefined
        ? moveEnd(document, selection, { extend: shiftKey }).selectionAfter
        : movePageDown(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (!commandKey && altKey && key === "ArrowLeft") {
    return selectionResult(
      moveWordLeft(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (!commandKey && altKey && key === "ArrowRight") {
    return selectionResult(
      moveWordRight(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (!commandKey && altKey && key === "ArrowUp") {
    return selectionResult(
      moveBlockStart(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (!commandKey && altKey && key === "ArrowDown") {
    return selectionResult(
      moveBlockEnd(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (key === "ArrowLeft") {
    return selectionResult(
      moveLeft(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (key === "ArrowRight") {
    return selectionResult(
      moveRight(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (key === "ArrowUp" && options.geometry !== undefined) {
    return selectionResult(
      moveUp(document, selection, options.geometry, {
        extend: shiftKey,
      }).selectionAfter,
    );
  }
  if (key === "ArrowDown" && options.geometry !== undefined) {
    return selectionResult(
      moveDown(document, selection, options.geometry, {
        extend: shiftKey,
      }).selectionAfter,
    );
  }
  if (key === "Home") {
    return selectionResult(
      options.geometry === undefined
        ? moveStart(document, selection, { extend: shiftKey }).selectionAfter
        : moveLineStart(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (key === "End") {
    return selectionResult(
      options.geometry === undefined
        ? moveEnd(document, selection, { extend: shiftKey }).selectionAfter
        : moveLineEnd(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  return null;
}

function readOnlyBlockedKeyResult(
  selection: SelectionSnap,
  key: string,
  commandKey: boolean,
  altKey: boolean,
): EditorInputResult {
  if (isReadOnlyEditingKey(key, commandKey, altKey)) {
    return selectionResult(selection);
  }

  return notHandled();
}

function isReadOnlyEditingKey(
  key: string,
  commandKey: boolean,
  altKey: boolean,
): boolean {
  if (
    commandKey &&
    !altKey &&
    ["b", "e", "i", "k", "u"].includes(key.toLowerCase())
  ) {
    return true;
  }

  if (
    key === "Backspace" ||
    key === "Delete" ||
    key === "Enter" ||
    key === "Tab"
  ) {
    return true;
  }

  return !commandKey && !altKey && isPrintableEditingKey(key);
}

function isPrintableEditingKey(key: string): boolean {
  return (
    key.length === 1 ||
    key === "Dead" ||
    key === "Process" ||
    key === "Unidentified"
  );
}

function translateBeforeInput(
  document: NoteDocument,
  selection: SelectionSnap,
  input: Extract<EditorInput, { type: "beforeinput" }>,
): EditorInputResult {
  if (
    isTransferInsertionInput(input.inputType) &&
    input.data !== undefined &&
    input.data !== null
  ) {
    return translatePaste(document, selection, {
      type: "paste",
      text: input.data,
      format: input.format,
    });
  }
  if (
    isTextInsertionInput(input.inputType) &&
    input.data !== undefined &&
    input.data !== null
  ) {
    return textCommandResult(insertText(document, selection, input.data));
  }
  if (input.inputType === "deleteContentBackward") {
    return textCommandResult(deleteBackward(document, selection));
  }
  if (input.inputType === "deleteContentForward") {
    return textCommandResult(deleteForward(document, selection));
  }
  if (input.inputType === "deleteWordBackward") {
    return textCommandResult(deleteWordBackward(document, selection));
  }
  if (input.inputType === "deleteWordForward") {
    return textCommandResult(deleteWordForward(document, selection));
  }
  if (
    input.inputType === "deleteContent" ||
    input.inputType === "deleteByCut"
  ) {
    return selectionIsCollapsed(selection)
      ? selectionResult(selection)
      : textCommandResult(deleteForward(document, selection));
  }
  if (
    input.inputType === "insertParagraph" ||
    input.inputType === "insertLineBreak"
  ) {
    return textCommandResult(splitParagraph(document, selection));
  }

  return notHandled();
}

function isTextInsertionInput(inputType: string): boolean {
  return (
    inputType === "insertText" ||
    inputType === "insertReplacementText" ||
    inputType === "insertFromPaste" ||
    inputType === "insertFromDrop"
  );
}

function isTransferInsertionInput(inputType: string): boolean {
  return inputType === "insertFromPaste" || inputType === "insertFromDrop";
}

function textCommandResult(result: TextCommandResult): EditorInputResult {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    handled: true,
    patch: result.patch,
    selectionAfter: result.selectionAfter,
  };
}

function blockCommandResult(result: BlockCommandResult): EditorInputResult {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    handled: true,
    patch: result.patch,
    selectionAfter: result.selectionAfter,
  };
}

function selectionResult(selectionAfter: SelectionSnap): EditorInputResult {
  return {
    ok: true,
    handled: true,
    patch: [],
    selectionAfter,
  };
}

function selectionWithoutTransientContext(
  selection: SelectionSnap,
): SelectionSnap {
  const { context: _context, ...selectionWithoutContext } = selection;

  return selectionWithoutContext;
}

function notHandled(): EditorInputResult {
  return {
    ok: true,
    handled: false,
  };
}
