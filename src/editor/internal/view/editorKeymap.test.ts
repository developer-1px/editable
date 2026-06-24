import { describe, expect, it } from "vitest";
import type { EditorPlatform } from "../model/platformModifier";
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
    expect(keymap({ key: "c", metaKey: true }, "mac")).toBe("copy");
    expect(keymap({ key: "x", ctrlKey: true }, "other")).toBe("cut");
    expect(keymap({ key: "v", metaKey: true }, "mac")).toBe("paste");
    expect(keymap({ key: "z", metaKey: true }, "mac")).toBe("undo");
    expect(keymap({ key: "z", metaKey: true, shiftKey: true }, "mac")).toBe(
      "redo",
    );
    expect(keymap({ key: "y", ctrlKey: true }, "other")).toBe("redo");
  });

  it("does not claim text, deletion, enter, alt, opposite-primary, or unmodified keys", () => {
    expect(keymap({ key: "a" })).toBe(null);
    expect(keymap({ key: "Backspace", metaKey: true }, "mac")).toBe(null);
    expect(keymap({ key: "Enter", ctrlKey: true }, "other")).toBe(null);
    expect(keymap({ key: "v", altKey: true, metaKey: true }, "mac")).toBe(null);
    expect(keymap({ key: "c", ctrlKey: true }, "mac")).toBe(null);
    expect(keymap({ key: "c", metaKey: true }, "other")).toBe(null);
    expect(keymap({ key: "c", ctrlKey: true, metaKey: true }, "other")).toBe(
      null,
    );
    expect(keymap({ key: "c", ctrlKey: true, shiftKey: true }, "other")).toBe(
      null,
    );
    expect(
      keymap(
        { key: "c", ctrlKey: true, altKey: true, altGraphKey: true },
        "other",
      ),
    ).toBe(null);
    expect(keymap({ key: ";", code: "KeyC", ctrlKey: true }, "other")).toBe(
      null,
    );
  });
});

function keymap(
  event: Partial<Parameters<typeof matchEditorKeymap>[0]>,
  platform: EditorPlatform = "other",
): ReturnType<typeof matchEditorKeymap> {
  return matchEditorKeymap(
    {
      altKey: false,
      ctrlKey: false,
      key: "",
      metaKey: false,
      shiftKey: false,
      ...event,
    },
    platform,
  );
}
