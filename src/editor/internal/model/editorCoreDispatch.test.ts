import { describe, expect, it, vi } from "vitest";
import {
  createEditor,
  type EditorViewAdapter,
  type InsertableEditorNode,
} from "./editorCore";
import {
  documentWithInvalidLink,
  documentWithText,
  documentWithUnsupportedSchemaVersion,
  rect,
} from "./editorCoreTestUtils";

describe("editor core dispatch and validation", () => {
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
        type: "replaceDocument",
        document: documentWithInvalidLink(""),
      },
    ]);

    expect(result.ok).toBe(false);
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
  });

  it("keeps replaceDocument validation failures generic", () => {
    const editor = createEditor({ initial: documentWithText("AB") });

    const result = editor.dispatch({
      type: "replaceDocument",
      document: documentWithInvalidLink(""),
    });

    expect(result).toEqual({
      ok: false,
      reason: "Document is invalid.",
    });
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
  });

  it("does not migrate unsupported schema versions during replaceDocument", () => {
    const editor = createEditor({ initial: documentWithText("AB") });

    const result = editor.dispatch({
      type: "replaceDocument",
      document: documentWithUnsupportedSchemaVersion(),
    });

    expect(result).toEqual({
      ok: false,
      reason: "Document is invalid.",
    });
    expect(editor.query({ type: "document" }).root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
  });
});
