import { readFileSync } from "node:fs";
import { createJSONDocument } from "@interactive-os/json-document";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import {
  createEditor,
  type EditorViewAdapter,
  type InsertableEditorNode,
} from "./editorCore";
import { selectionForCommand } from "./editorSelection";
import {
  createNoteDocument,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";

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

function documentWithInvalidLink(href: string): NoteDocument {
  return {
    schemaVersion: 1,
    id: "invalid-note",
    title: "Invalid note",
    tags: [],
    root: {
      id: "root",
      kind: "element",
      type: "doc",
      flow: "block",
      children: [
        {
          id: "block-1",
          type: "paragraph",
          children: [
            {
              type: "text",
              text: "Invalid link",
              marks: [{ type: "link", href }],
            },
          ],
        },
      ],
    },
  } as unknown as NoteDocument;
}

function documentWithUnsupportedSchemaVersion(): NoteDocument {
  return {
    schemaVersion: 2,
    id: "future-note",
    title: "Future note",
    tags: [],
    root: {
      id: "root",
      kind: "element",
      type: "doc",
      flow: "block",
      children: [
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Future" }],
        },
      ],
    },
  } as unknown as NoteDocument;
}

function descriptorKeysFromSource(constName: string): string[] {
  const sourcePath = new URL("./editorCore.ts", import.meta.url);
  const sourceFile = ts.createSourceFile(
    "editorCore.ts",
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === constName &&
        declaration.initializer !== undefined &&
        ts.isObjectLiteralExpression(declaration.initializer)
      ) {
        return declaration.initializer.properties
          .map((property) =>
            ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)
              ? property.name.text
              : null,
          )
          .filter((name): name is string => name !== null);
      }
    }
  }

  throw new Error(`Could not find ${constName} descriptor object.`);
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

  it("keeps the command descriptor registry closed", () => {
    expect(descriptorKeysFromSource("commandDescriptors")).toEqual([
      "setSelection",
      "selectAll",
      "moveSelection",
      "insertText",
      "insertNode",
      "delete",
      "split",
      "toggleMark",
      "undo",
      "redo",
      "replaceDocument",
    ]);
  });

  it("keeps the query descriptor registry closed", () => {
    expect(descriptorKeysFromSource("queryDescriptors")).toEqual([
      "document",
      "selection",
      "activeMarks",
      "canUndo",
      "canRedo",
      "can",
    ]);
  });

  it("restores a default rich selection when no initial selection is provided", () => {
    const editor = createEditor({ initial: documentWithText("AB") });

    expect(editor.query({ type: "selection" })).toMatchObject({
      type: "caret",
      point: { path: "/root/children/0", edge: "before" },
    });
  });

  it("normalizes invalid low-level selection snapshots before commands", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithText("AB"),
      { history: 10, selection: true, trustedInitial: true },
    );
    document.selection?.restore({
      selectedPointers: ["/root/children/999"],
      selectionRanges: [],
      primaryIndex: 0,
      anchor: null,
      focus: null,
    });

    expect(selectionForCommand(document)).toMatchObject({
      selectedPointers: [],
      selectionRanges: [
        {
          anchor: {
            path: "/root/children/0",
            edge: "before",
          },
          focus: {
            path: "/root/children/0",
            edge: "before",
          },
        },
      ],
    });
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
