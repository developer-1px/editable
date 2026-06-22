export type EditorPlatform = "mac" | "other";

export type EditorKeyboardModifiers = {
  altGraphKey?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export function hasPlatformPrimaryModifier(
  modifiers: EditorKeyboardModifiers,
  platform: EditorPlatform,
): boolean {
  if (modifiers.altKey === true || modifiers.altGraphKey === true) {
    return false;
  }

  return platform === "mac"
    ? modifiers.metaKey === true && modifiers.ctrlKey !== true
    : modifiers.ctrlKey === true && modifiers.metaKey !== true;
}

export function hasExactPlatformPrimaryModifier(
  modifiers: EditorKeyboardModifiers,
  platform: EditorPlatform,
  options: { shiftKey?: boolean } = {},
): boolean {
  return (
    hasPlatformPrimaryModifier(modifiers, platform) &&
    (modifiers.shiftKey === true) === (options.shiftKey === true)
  );
}

export function hasMacControlNavigationModifier(
  modifiers: EditorKeyboardModifiers,
  platform: EditorPlatform,
): boolean {
  return (
    platform === "mac" &&
    modifiers.ctrlKey === true &&
    modifiers.metaKey !== true &&
    modifiers.altKey !== true &&
    modifiers.altGraphKey !== true
  );
}

export function hasNoShortcutModifier(
  modifiers: EditorKeyboardModifiers,
): boolean {
  return (
    modifiers.altKey !== true &&
    modifiers.altGraphKey !== true &&
    modifiers.ctrlKey !== true &&
    modifiers.metaKey !== true
  );
}

export function hasOnlyAltModifier(
  modifiers: EditorKeyboardModifiers,
): boolean {
  return (
    modifiers.altKey === true &&
    modifiers.altGraphKey !== true &&
    modifiers.ctrlKey !== true &&
    modifiers.metaKey !== true
  );
}
