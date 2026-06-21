import { describe, expect, it, vi } from "vitest";
import {
  createEditor,
  type EditorViewAdapter,
  type InsertableEditorNode,
} from "./editorCore";
import { createNoteDocument, type NoteDocument } from "./noteDocument";

function documentWithText(text: string): NoteDocument {
  return createNoteDocument(
    [
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text }],
      },
    ],
    {
      id: "note-test",
      title: "Editor core",
      tags: [],
    },
  );
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return { left, top, width, height };
    },
  } as DOMRect;
}

describe("editor core public API", () => {
  it("keeps the editor.xxx public surface minimal", () => {
    const editor = createEditor({ initial: documentWithText("A") });

    expect(Object.keys(editor).sort()).toEqual([
      "can",
      "dispatch",
      "dispose",
      "query",
      "snapshot",
      "subscribe",
    ]);
  });

  it("dispatches text commands through one mutation entrypoint", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });
    const listener = vi.fn();
    editor.subscribe(listener);

    const result = editor.dispatch({ type: "insertText", text: "x" });

    expect(result.ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
    expect(editor.query({ type: "selection" })).toMatchObject({
      type: "caret",
      point: { path: "/root/children/0/children/0/text", offset: 2 },
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("answers can without committing the command", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    expect(editor.can({ type: "insertText", text: "x" })).toEqual({
      ok: true,
    });
    expect(
      editor.can({ type: "moveSelection", unit: "line", direction: "down" }),
    ).toEqual({
      ok: false,
      reason: "View geometry is required.",
    });
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
  });

  it("uses an attached view adapter for visual movement without exposing geometry methods", () => {
    const view: EditorViewAdapter = {
      geometry() {
        return {
          rectForPoint: () => rect(10, 10, 1, 20),
          pointFromCoordinates: () => ({
            path: "/root/children/0/children/0/text",
            offset: 2,
          }),
          pointForVerticalMovement: () => ({
            path: "/root/children/0/children/0/text",
            offset: 2,
          }),
        };
      },
    };
    const editor = createEditor({
      initial: documentWithText("ABC"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 0 },
      },
      view,
    });

    expect(
      editor.can({ type: "moveSelection", unit: "line", direction: "down" }),
    ).toEqual({ ok: true });

    const result = editor.dispatch({
      type: "moveSelection",
      unit: "line",
      direction: "down",
    });

    expect(result.ok).toBe(true);
    expect(editor.query({ type: "selection" })).toMatchObject({
      type: "caret",
      point: { path: "/root/children/0/children/0/text", offset: 2 },
    });
  });

  it("keeps schema-specific nodes in command payloads, not editor methods", () => {
    const editor = createEditor({
      initial: documentWithText("A"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });
    const mention: InsertableEditorNode = {
      type: "mention",
      id: "user-ada",
      label: "Ada",
    };

    const result = editor.dispatch({ type: "insertNode", node: mention });

    expect(result.ok).toBe(true);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [
        { type: "text", text: "A" },
        { type: "mention", id: "user-ada", label: "Ada" },
      ],
    });
  });

  it("stores active marks as selection state and exposes them through query", () => {
    const editor = createEditor({
      initial: documentWithText("A"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    const result = editor.dispatch({ type: "toggleMark", mark: "bold" });

    expect(result.ok).toBe(true);
    expect(editor.query({ type: "activeMarks" })).toEqual([{ type: "bold" }]);
  });

  it("keeps batch dispatch atomic when a later command fails", () => {
    const editor = createEditor({
      initial: documentWithText("AB"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    const result = editor.dispatch([
      { type: "insertText", text: "x" },
      {
        type: "applyPatch",
        patch: [{ op: "replace", path: "/missing", value: true }],
      },
    ]);

    expect(result.ok).toBe(false);
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
