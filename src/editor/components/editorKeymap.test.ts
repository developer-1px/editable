import { describe, expect, it } from "vitest";
import { resolveEditorKeyBinding } from "./editorKeymap";

describe("resolveEditorKeyBinding", () => {
  it("maps undo and redo command shortcuts", () => {
    expect(resolveEditorKeyBinding({ key: "z", metaKey: true })).toEqual({
      kind: "history",
      direction: "undo",
      preventDefault: true,
    });
    expect(
      resolveEditorKeyBinding({ key: "z", metaKey: true, shiftKey: true }),
    ).toEqual({
      kind: "history",
      direction: "redo",
      preventDefault: true,
    });
    expect(resolveEditorKeyBinding({ key: "y", ctrlKey: true })).toEqual({
      kind: "history",
      direction: "redo",
      preventDefault: true,
    });
  });

  it("maps copy and cut shortcuts to explicit clipboard commands", () => {
    expect(resolveEditorKeyBinding({ key: "c", metaKey: true })).toEqual({
      kind: "clipboard",
      action: "copy",
      preventDefault: true,
    });
    expect(resolveEditorKeyBinding({ key: "x", ctrlKey: true })).toEqual({
      kind: "clipboard",
      action: "cut",
      preventDefault: true,
    });
  });

  it("lets paste keep flowing to the paste event for payload access", () => {
    expect(resolveEditorKeyBinding({ key: "v", metaKey: true })).toEqual({
      kind: "clipboard",
      action: "paste",
      preventDefault: false,
    });
  });

  it("ignores composing, alt-modified, and non-command key events", () => {
    expect(
      resolveEditorKeyBinding({
        key: "z",
        metaKey: true,
        isComposing: true,
      }),
    ).toBe(null);
    expect(
      resolveEditorKeyBinding({ key: "z", metaKey: true, altKey: true }),
    ).toBe(null);
    expect(resolveEditorKeyBinding({ key: "z" })).toBe(null);
  });
});
