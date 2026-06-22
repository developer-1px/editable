export type EditorKeymapCommand = "copy" | "cut" | "paste" | "redo" | "undo";

export type EditorKeymapEntry = {
  command: EditorKeymapCommand;
  key: string;
  platformModifier: true;
  shiftKey?: boolean;
};

export type EditorKeymapEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
};

export const editorKeymap: readonly EditorKeymapEntry[] = [
  { command: "copy", key: "c", platformModifier: true },
  { command: "cut", key: "x", platformModifier: true },
  { command: "paste", key: "v", platformModifier: true },
  { command: "undo", key: "z", platformModifier: true },
  { command: "redo", key: "z", platformModifier: true, shiftKey: true },
  { command: "redo", key: "y", platformModifier: true },
];

export function matchEditorKeymap(
  event: EditorKeymapEvent,
): EditorKeymapCommand | null {
  if (event.altKey || (!event.metaKey && !event.ctrlKey)) {
    return null;
  }

  const key = event.key.toLowerCase();
  const match = editorKeymap.find(
    (entry) =>
      entry.key === key &&
      (entry.shiftKey === true) === event.shiftKey &&
      entry.platformModifier,
  );

  return match?.command ?? null;
}
