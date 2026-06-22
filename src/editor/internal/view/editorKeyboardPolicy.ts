type HeadlessKeyEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
};

export function isHeadlessKeyDown(event: HeadlessKeyEvent): boolean {
  if (event.key === "Tab") {
    return !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();

    return (
      isHeadlessEditingKey(event) ||
      (!event.altKey &&
        (key === "a" ||
          key === "b" ||
          key === "e" ||
          key === "i" ||
          key === "k" ||
          isHeadlessMovementKey(event.key)))
    );
  }

  return isHeadlessMovementKey(event.key) || isHeadlessEditingKey(event);
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

function isHeadlessEditingKey(event: HeadlessKeyEvent): boolean {
  return (
    event.key === "Backspace" || event.key === "Delete" || event.key === "Enter"
  );
}
