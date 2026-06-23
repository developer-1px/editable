import type { SelectionSnap } from "@interactive-os/json-document";
import { importMarkdown } from "../markdown";
import {
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../noteDocument";
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
} from "../textCommands";
import {
  isReadOnlyEditingKeyDown,
  translateKeyDown,
} from "./inputAdapterKeyDown";
import {
  deletionResult,
  notHandled,
  selectionResult,
  textCommandResult,
} from "./inputAdapterResult";
import type {
  EditorInput,
  EditorInputAdapterOptions,
  EditorInputResult,
} from "./inputAdapterTypes";

export { isReadOnlyEditingKeyDown };
export type {
  EditorInput,
  EditorInputAdapterOptions,
  EditorInputResult,
} from "./inputAdapterTypes";

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
    return translateKeyDown(document, selection, input, options);
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
    return deletionResult(deleteForward(document, selection), selection);
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
