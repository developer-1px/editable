import { describe, expect, it } from "vitest";
import { editorKeymap, matchEditorKeymap } from "./editorKeymap";

describe("editorKeymap", () => {
  it("declares clipboard and history shortcuts as command routing entries", () => {
    expect(editorKeymap).toEqual([
      { command: "copy", key: "c", platformModifier: true },
      { command: "cut", key: "x", platformModifier: true },
      { command: "paste", key: "v", platformModifier: true },
      { command: "undo", key: "z", platformModifier: true },
      { command: "redo", key: "z", platformModifier: true, shiftKey: true },
      { command: "redo", key: "y", platformModifier: true },
    ]);
  });

  it("matches platform modifier clipboard and history shortcuts", () => {
    expect(keymap({ key: "c", metaKey: true })).toBe("copy");
    expect(keymap({ key: "x", ctrlKey: true })).toBe("cut");
    expect(keymap({ key: "v", metaKey: true })).toBe("paste");
    expect(keymap({ key: "z", metaKey: true })).toBe("undo");
    expect(keymap({ key: "z", metaKey: true, shiftKey: true })).toBe("redo");
    expect(keymap({ key: "y", ctrlKey: true })).toBe("redo");
  });

  it("does not claim text, deletion, enter, alt, or unmodified keys", () => {
    expect(keymap({ key: "a" })).toBe(null);
    expect(keymap({ key: "Backspace", metaKey: true })).toBe(null);
    expect(keymap({ key: "Enter", ctrlKey: true })).toBe(null);
    expect(keymap({ key: "v", altKey: true, metaKey: true })).toBe(null);
  });
});

function keymap(
  event: Partial<Parameters<typeof matchEditorKeymap>[0]>,
): ReturnType<typeof matchEditorKeymap> {
  return matchEditorKeymap({
    altKey: false,
    ctrlKey: false,
    key: "",
    metaKey: false,
    shiftKey: false,
    ...event,
  });
}
