import type { SelectionSnap } from "@interactive-os/json-document";
import {
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
} from "../cursorCommands";
import type { NoteDocument } from "../noteDocument";
import {
  type EditorKeyboardModifiers,
  type EditorPlatform,
  hasMacControlNavigationModifier,
  hasNoShortcutModifier,
  hasOnlyAltModifier,
  hasPlatformPrimaryModifier,
} from "../platformModifier";
import {
  selectionResult,
  selectionWithoutTransientContext,
} from "./inputAdapterResult";
import type {
  EditorInputAdapterOptions,
  EditorInputResult,
} from "./inputAdapterTypes";

export function translateNavigationKeyDown(
  document: NoteDocument,
  selection: SelectionSnap,
  key: string,
  modifiers: EditorKeyboardModifiers,
  options: EditorInputAdapterOptions,
): EditorInputResult | null {
  const platform = options.platform ?? "other";
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
