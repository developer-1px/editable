import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../cursorCommands";
import { NoteDocumentSchema } from "../noteDocument";
import { insertMention, insertText } from "./textCommands";
import { documentWithBlocks, expectOk } from "./textCommandTestUtils";

describe("text command history integration", () => {
  it("restores value and selection through json-document undo and redo", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const jsonDocument = createJSONDocument(NoteDocumentSchema, document, {
      history: 10,
      selection: true,
      trustedInitial: true,
    });
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    jsonDocument.selection?.restore(selection);

    const command = insertText(jsonDocument.value, selection, "x");
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });

    jsonDocument.undo();

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    jsonDocument.redo();

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("restores previous selection across atom insert undo and redo", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const jsonDocument = createJSONDocument(NoteDocumentSchema, document, {
      history: 10,
      selection: true,
      trustedInitial: true,
    });
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    jsonDocument.selection?.restore(selection);

    const command = insertMention(jsonDocument.value, selection, {
      type: "mention",
      id: "user-1",
      label: "Ada",
    });
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    jsonDocument.undo();

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    jsonDocument.redo();

    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
  });
});
