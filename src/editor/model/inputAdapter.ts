import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  adjustSelectedListDepth,
  type BlockCommandResult,
} from "./blockCommands";
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
  moveVisualLeft,
  moveVisualRight,
  moveWordLeft,
  moveWordRight,
  selectAll,
} from "./cursorCommands";
import { toggleLink, toggleMark } from "./markCommands";
import type { NoteDocument } from "./noteDocument";
import { selectionIsCollapsed } from "./richSelection";
import {
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
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
      isComposing?: boolean;
    }
  | {
      type: "paste";
      text: string;
    }
  | {
      type: "compositionstart" | "compositionupdate" | "compositionend";
    };

export type EditorInputAdapterOptions = {
  geometry?: CursorGeometryAdapter;
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

export function translateEditorInput(
  document: NoteDocument,
  selection: SelectionSnap,
  input: EditorInput,
  options: EditorInputAdapterOptions = {},
): EditorInputResult {
  if ("isComposing" in input && input.isComposing === true) {
    return notHandled();
  }

  if (input.type.startsWith("composition")) {
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
    return textCommandResult(insertText(document, selection, input.text));
  }

  return notHandled();
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
      options.geometry === undefined
        ? moveLeft(document, selection, { extend: shiftKey }).selectionAfter
        : moveVisualLeft(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (key === "ArrowRight") {
    return selectionResult(
      options.geometry === undefined
        ? moveRight(document, selection, { extend: shiftKey }).selectionAfter
        : moveVisualRight(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
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
      moveStart(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (key === "End") {
    return selectionResult(
      moveEnd(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  return notHandled();
}

function translateBeforeInput(
  document: NoteDocument,
  selection: SelectionSnap,
  input: Extract<EditorInput, { type: "beforeinput" }>,
): EditorInputResult {
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
