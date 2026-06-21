export type EditorKeymapEvent = {
  key: string;
  shiftKey?: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
};

export type EditorKeyBinding =
  | {
      kind: "history";
      direction: "undo" | "redo";
      preventDefault: true;
    }
  | {
      kind: "clipboard";
      action: "copy" | "cut";
      preventDefault: true;
    }
  | {
      kind: "clipboard";
      action: "paste";
      preventDefault: false;
    };

type EditorKeymapEntry = {
  key: string;
  shiftKey: boolean;
  binding: EditorKeyBinding;
};

const editorKeymapEntries: readonly EditorKeymapEntry[] = [
  {
    key: "z",
    shiftKey: false,
    binding: { kind: "history", direction: "undo", preventDefault: true },
  },
  {
    key: "z",
    shiftKey: true,
    binding: { kind: "history", direction: "redo", preventDefault: true },
  },
  {
    key: "y",
    shiftKey: false,
    binding: { kind: "history", direction: "redo", preventDefault: true },
  },
  {
    key: "c",
    shiftKey: false,
    binding: { kind: "clipboard", action: "copy", preventDefault: true },
  },
  {
    key: "x",
    shiftKey: false,
    binding: { kind: "clipboard", action: "cut", preventDefault: true },
  },
  {
    key: "v",
    shiftKey: false,
    binding: { kind: "clipboard", action: "paste", preventDefault: false },
  },
];

export function resolveEditorKeyBinding(
  event: EditorKeymapEvent,
): EditorKeyBinding | null {
  if (event.isComposing === true || event.altKey === true) {
    return null;
  }

  if (event.metaKey !== true && event.ctrlKey !== true) {
    return null;
  }

  const key = event.key.toLowerCase();
  const shiftKey = event.shiftKey === true;

  return (
    editorKeymapEntries.find(
      (entry) => entry.key === key && entry.shiftKey === shiftKey,
    )?.binding ?? null
  );
}
