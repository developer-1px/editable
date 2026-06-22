import {
  type EditorPlatform,
  hasExactPlatformPrimaryModifier,
} from "../model/platformModifier";

export type EditorKeymapCommand = "copy" | "cut" | "paste" | "redo" | "undo";

export type EditorKeymapEntry = {
  command: EditorKeymapCommand;
  key: string;
  platformModifier: true;
  shiftKey?: boolean;
};

export type EditorKeymapEvent = {
  altGraphKey?: boolean;
  altKey: boolean;
  code?: string;
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
  platform: EditorPlatform = "other",
): EditorKeymapCommand | null {
  const key = event.key.toLowerCase();
  const match = editorKeymap.find(
    (entry) =>
      entry.key === key &&
      entry.platformModifier &&
      hasExactPlatformPrimaryModifier(event, platform, {
        shiftKey: entry.shiftKey,
      }),
  );

  return match?.command ?? null;
}
