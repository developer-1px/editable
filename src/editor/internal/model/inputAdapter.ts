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
import {
  type EditorKeyboardModifiers,
  type EditorPlatform,
  hasExactPlatformPrimaryModifier,
  hasMacControlNavigationModifier,
  hasNoShortcutModifier,
  hasOnlyAltModifier,
  hasPlatformPrimaryModifier,
} from "./platformModifier";
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
      altGraphKey?: boolean;
      code?: string;
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
  platform?: EditorPlatform;
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
  options: { platform?: EditorPlatform } = {},
): boolean {
  return isReadOnlyEditingKey(
    input.key,
    keyModifiers(input),
    editorPlatform(options),
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
      keyModifiers(input),
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
  modifiers: EditorKeyboardModifiers,
  options: EditorInputAdapterOptions,
): EditorInputResult {
  const platform = editorPlatform(options);
  if (
    hasExactPlatformPrimaryModifier(modifiers, platform) &&
    key.toLowerCase() === "a"
  ) {
    return selectionResult(selectAll(document).selectionAfter);
  }
  if (options.readOnly === true) {
    const navigationResult = translateNavigationKeyDown(
      document,
      selection,
      key,
      modifiers,
      options,
    );

    return (
      navigationResult ??
      readOnlyBlockedKeyResult(selection, key, modifiers, platform)
    );
  }

  if (
    hasExactPlatformPrimaryModifier(modifiers, platform) &&
    key.toLowerCase() === "b"
  ) {
    return textCommandResult(toggleMark(document, selection, "bold"));
  }
  if (
    hasExactPlatformPrimaryModifier(modifiers, platform) &&
    key.toLowerCase() === "i"
  ) {
    return textCommandResult(toggleMark(document, selection, "italic"));
  }
  if (
    hasExactPlatformPrimaryModifier(modifiers, platform) &&
    key.toLowerCase() === "e"
  ) {
    return textCommandResult(toggleMark(document, selection, "code"));
  }
  if (
    hasExactPlatformPrimaryModifier(modifiers, platform) &&
    key.toLowerCase() === "k"
  ) {
    return textCommandResult(toggleLink(document, selection));
  }

  if (hasNoShortcutModifier(modifiers) && key === "Tab") {
    const listDepth = adjustSelectedListDepth(
      document,
      selection,
      modifiers.shiftKey === true ? "outdent" : "indent",
    );
    if (listDepth !== null) {
      return blockCommandResult(listDepth);
    }

    return modifiers.shiftKey === true
      ? selectionResult(selection)
      : textCommandResult(insertText(document, selection, "\t"));
  }
  if (key === "Backspace") {
    if (hasPlatformPrimaryModifier(modifiers, platform)) {
      return selectionResult(selection);
    }

    if (hasOnlyAltModifier(modifiers)) {
      return textCommandResult(deleteWordBackward(document, selection));
    }
    if (hasNoShortcutModifier(modifiers)) {
      return textCommandResult(deleteBackward(document, selection));
    }
    return notHandled();
  }
  if (key === "Delete") {
    if (hasPlatformPrimaryModifier(modifiers, platform)) {
      return selectionResult(selection);
    }

    if (hasOnlyAltModifier(modifiers)) {
      return textCommandResult(deleteWordForward(document, selection));
    }
    if (hasNoShortcutModifier(modifiers)) {
      return textCommandResult(deleteForward(document, selection));
    }
    return notHandled();
  }
  if (key === "Enter") {
    return hasPlatformPrimaryModifier(modifiers, platform) ||
      hasOnlyAltModifier(modifiers)
      ? selectionResult(selection)
      : hasNoShortcutModifier(modifiers)
        ? textCommandResult(splitParagraph(document, selection))
        : notHandled();
  }

  return (
    translateNavigationKeyDown(document, selection, key, modifiers, options) ??
    notHandled()
  );
}

function translateNavigationKeyDown(
  document: NoteDocument,
  selection: SelectionSnap,
  key: string,
  modifiers: EditorKeyboardModifiers,
  options: EditorInputAdapterOptions,
): EditorInputResult | null {
  const platform = editorPlatform(options);
  const primaryModifier = hasPlatformPrimaryModifier(modifiers, platform);
  const shiftKey = modifiers.shiftKey === true;
  const altKey = modifiers.altKey === true;
  const macControlNavigation = macControlNavigationKey(
    key,
    modifiers,
    platform,
  );

  if (hasNoShortcutModifier(modifiers) && key === "Escape") {
    return selectionResult(selectionWithoutTransientContext(selection));
  }

  if (macControlNavigation === "left") {
    return selectionResult(
      moveLeft(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (macControlNavigation === "right") {
    return selectionResult(
      moveRight(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (macControlNavigation === "up" && options.geometry !== undefined) {
    return selectionResult(
      moveUp(document, selection, options.geometry, {
        extend: shiftKey,
      }).selectionAfter,
    );
  }
  if (macControlNavigation === "down" && options.geometry !== undefined) {
    return selectionResult(
      moveDown(document, selection, options.geometry, {
        extend: shiftKey,
      }).selectionAfter,
    );
  }

  if (primaryModifier && key === "ArrowLeft") {
    return selectionResult(
      options.geometry === undefined
        ? moveBlockStart(document, selection, { extend: shiftKey })
            .selectionAfter
        : moveLineStart(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (primaryModifier && key === "ArrowRight") {
    return selectionResult(
      options.geometry === undefined
        ? moveBlockEnd(document, selection, { extend: shiftKey }).selectionAfter
        : moveLineEnd(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (primaryModifier && key === "ArrowUp") {
    return selectionResult(
      moveStart(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (primaryModifier && key === "ArrowDown") {
    return selectionResult(
      moveEnd(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  const noShortcutModifier = hasNoShortcutModifier(modifiers);
  const altOnlyModifier = hasOnlyAltModifier(modifiers);

  if (!altKey && (primaryModifier || noShortcutModifier) && key === "PageUp") {
    return selectionResult(
      primaryModifier || options.geometry === undefined
        ? moveStart(document, selection, { extend: shiftKey }).selectionAfter
        : movePageUp(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (
    !altKey &&
    (primaryModifier || noShortcutModifier) &&
    key === "PageDown"
  ) {
    return selectionResult(
      primaryModifier || options.geometry === undefined
        ? moveEnd(document, selection, { extend: shiftKey }).selectionAfter
        : movePageDown(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (altOnlyModifier && key === "ArrowLeft") {
    return selectionResult(
      moveWordLeft(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (altOnlyModifier && key === "ArrowRight") {
    return selectionResult(
      moveWordRight(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (altOnlyModifier && key === "ArrowUp") {
    return selectionResult(
      moveBlockStart(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (altOnlyModifier && key === "ArrowDown") {
    return selectionResult(
      moveBlockEnd(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (noShortcutModifier && key === "ArrowLeft") {
    return selectionResult(
      moveLeft(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (noShortcutModifier && key === "ArrowRight") {
    return selectionResult(
      moveRight(document, selection, { extend: shiftKey }).selectionAfter,
    );
  }
  if (
    noShortcutModifier &&
    key === "ArrowUp" &&
    options.geometry !== undefined
  ) {
    return selectionResult(
      moveUp(document, selection, options.geometry, {
        extend: shiftKey,
      }).selectionAfter,
    );
  }
  if (
    noShortcutModifier &&
    key === "ArrowDown" &&
    options.geometry !== undefined
  ) {
    return selectionResult(
      moveDown(document, selection, options.geometry, {
        extend: shiftKey,
      }).selectionAfter,
    );
  }
  if (noShortcutModifier && key === "Home") {
    return selectionResult(
      options.geometry === undefined
        ? moveStart(document, selection, { extend: shiftKey }).selectionAfter
        : moveLineStart(document, selection, options.geometry, {
            extend: shiftKey,
          }).selectionAfter,
    );
  }
  if (noShortcutModifier && key === "End") {
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
  modifiers: EditorKeyboardModifiers,
  platform: EditorPlatform,
): EditorInputResult {
  if (isReadOnlyEditingKey(key, modifiers, platform)) {
    return selectionResult(selection);
  }

  return notHandled();
}

function isReadOnlyEditingKey(
  key: string,
  modifiers: EditorKeyboardModifiers,
  platform: EditorPlatform,
): boolean {
  if (
    hasExactPlatformPrimaryModifier(modifiers, platform) &&
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

  return hasNoShortcutModifier(modifiers) && isPrintableEditingKey(key);
}

function keyModifiers(
  input: Extract<EditorInput, { type: "keydown" }>,
): EditorKeyboardModifiers {
  return {
    altGraphKey: input.altGraphKey === true,
    altKey: input.altKey === true,
    ctrlKey: input.ctrlKey === true,
    metaKey: input.metaKey === true,
    shiftKey: input.shiftKey === true,
  };
}

function editorPlatform(options: {
  platform?: EditorPlatform;
}): EditorPlatform {
  return options.platform ?? "other";
}

function macControlNavigationKey(
  key: string,
  modifiers: EditorKeyboardModifiers,
  platform: EditorPlatform,
): "left" | "right" | "up" | "down" | null {
  if (!hasMacControlNavigationModifier(modifiers, platform)) {
    return null;
  }

  const normalizedKey = key.toLowerCase();
  if (normalizedKey === "b") {
    return "left";
  }
  if (normalizedKey === "f") {
    return "right";
  }
  if (normalizedKey === "p") {
    return "up";
  }
  return normalizedKey === "n" ? "down" : null;
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
