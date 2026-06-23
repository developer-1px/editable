import { describe, expect, it } from "vitest";
import { createEditor } from "./editorCore";
import { documentWithText } from "./editorCoreTestUtils";

describe("editor core history dispatch", () => {
  it("keeps selection-only dispatch out of document undo history", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    const result = editor.dispatch({
      type: "moveSelection",
      unit: "character",
      direction: "forward",
    });

    expect(result.ok).toBe(true);
    expect(editor.query({ type: "selection" })).toMatchObject({
      type: "caret",
      point: { path: "/root/children/0/children/0/text", offset: 2 },
    });
    expect(editor.query({ type: "canUndo" })).toBe(false);
  });

  it("treats batch dispatch as one undo unit", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    const insert = editor.dispatch([
      { type: "insertText", text: "x" },
      { type: "insertText", text: "y" },
    ]);

    expect(insert.ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxyB" }],
    });

    expect(editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });

    expect(editor.dispatch({ type: "redo" }).ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxyB" }],
    });
  });

  it("rejects history commands inside batch dispatch", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    expect(editor.dispatch({ type: "insertText", text: "x" }).ok).toBe(true);

    const result = editor.dispatch([
      { type: "insertText", text: "y" },
      { type: "undo" },
    ]);

    expect(result).toEqual({
      ok: false,
      reason: "History commands cannot be batched.",
    });
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
    expect(editor.query({ type: "canUndo" })).toBe(true);
  });

  it("treats successive single dispatch calls as separate undo units", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    expect(editor.dispatch({ type: "insertText", text: "x" }).ok).toBe(true);
    expect(editor.dispatch({ type: "insertText", text: "y" }).ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxyB" }],
    });

    expect(editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });

    expect(editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
  });

  it("routes undo and redo through commands", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    editor.dispatch({ type: "insertText", text: "x" });
    expect(editor.query({ type: "canUndo" })).toBe(true);

    expect(editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });

    expect(editor.dispatch({ type: "redo" }).ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
  });
});
