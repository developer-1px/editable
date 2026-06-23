import type { SelectionSnap } from "@interactive-os/json-document";
import { adjustSelectedListDepth } from "../blockCommands";
import { selectAll } from "../cursorCommands";
import { toggleLink, toggleMark } from "../markCommands";
import type { NoteDocument } from "../noteDocument";
import {
  type EditorKeyboardModifiers,
  type EditorPlatform,
  hasExactPlatformPrimaryModifier,
  hasNoShortcutModifier,
  hasOnlyAltModifier,
  hasPlatformPrimaryModifier,
} from "../platformModifier";
import {
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
  insertText,
  splitParagraph,
} from "../textCommands";
import { translateNavigationKeyDown } from "./inputAdapterNavigationKeyDown";
import {
  blockCommandResult,
  notHandled,
  selectionResult,
  textCommandResult,
} from "./inputAdapterResult";
import type {
  EditorInput,
  EditorInputAdapterOptions,
  EditorInputResult,
} from "./inputAdapterTypes";

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

export function translateKeyDown(
  document: NoteDocument,
  selection: SelectionSnap,
  input: Extract<EditorInput, { type: "keydown" }>,
  options: EditorInputAdapterOptions,
): EditorInputResult {
  const key = input.key;
  const modifiers = keyModifiers(input);
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

function isPrintableEditingKey(key: string): boolean {
  return (
    key.length === 1 ||
    key === "Dead" ||
    key === "Process" ||
    key === "Unidentified"
  );
}
