import {
  type EditorPlatform,
  hasMacControlNavigationModifier,
  hasNoShortcutModifier,
  hasOnlyAltModifier,
  hasPlatformPrimaryModifier,
} from "../model/platformModifier";

type HeadlessKeyEvent = {
  altGraphKey?: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey?: boolean;
};

export function isHeadlessKeyDown(
  event: HeadlessKeyEvent,
  platform: EditorPlatform = "other",
): boolean {
  if (event.key === "Tab") {
    return hasNoShortcutModifier(event);
  }

  if (hasPlatformPrimaryModifier(event, platform)) {
    const key = event.key.toLowerCase();

    return (
      isHeadlessEditingKey(event) ||
      isHeadlessMovementKey(event.key) ||
      (event.shiftKey !== true &&
        (key === "a" ||
          key === "b" ||
          key === "e" ||
          key === "i" ||
          key === "k"))
    );
  }

  if (isMacControlNavigationKey(event, platform)) {
    return true;
  }

  if (hasNoShortcutModifier(event)) {
    return isHeadlessMovementKey(event.key) || isHeadlessEditingKey(event);
  }

  return (
    hasOnlyAltModifier(event) &&
    (isHeadlessAltMovementKey(event.key) || isHeadlessEditingKey(event))
  );
}

function isHeadlessMovementKey(key: string): boolean {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key === "Home" ||
    key === "End" ||
    key === "Escape"
  );
}

function isHeadlessAltMovementKey(key: string): boolean {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
  );
}

function isHeadlessEditingKey(event: HeadlessKeyEvent): boolean {
  return (
    event.key === "Backspace" || event.key === "Delete" || event.key === "Enter"
  );
}

function isMacControlNavigationKey(
  event: HeadlessKeyEvent,
  platform: EditorPlatform,
): boolean {
  if (!hasMacControlNavigationModifier(event, platform)) {
    return false;
  }

  return ["b", "f", "n", "p"].includes(event.key.toLowerCase());
}
