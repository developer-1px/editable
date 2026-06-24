import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { NoteDocumentSchema } from "../noteDocument";
import { deleteBackward, insertText, splitParagraph } from "./textCommands";
import {
  atomSelection,
  documentWithBlocks,
  expectOk,
} from "./textCommandTestUtils";

describe("text command insertion", () => {
  it("inserts inside text by replacing only the affected text path", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const command = insertText(document, selection, "x");

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("edits rich text block leaves through the same text command path", () => {
    const headingDocument = documentWithBlocks([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const listDocument = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const heading = insertText(
      headingDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      "x",
    );
    const list = insertText(
      listDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      "y",
    );

    expectOk(heading);
    expectOk(list);
    expect(heading.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
    expect(list.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AyB" },
    ]);
  });

  it("edits code block text through a block text leaf", () => {
    const document = documentWithBlocks([
      {
        id: "code-1",
        type: "codeBlock",
        text: "ab",
      },
    ]);

    const insert = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
      "x",
    );
    const newline = splitParagraph(
      document,
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
    );

    expectOk(insert);
    expectOk(newline);
    expect(insert.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "axb" },
    ]);
    expect(insert.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
    expect(newline.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "a\nb" },
    ]);
    expect(newline.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
  });

  it("preserves structured marks while editing text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
      },
    ]);

    const insert = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
      "x",
    );
    const deleteText = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
    );

    expectOk(insert);
    expectOk(deleteText);
    expect(insert.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "boxld",
      },
    ]);
    expect(insert.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(deleteText.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "bld" },
    ]);
    expect(deleteText.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("replaces a selected range inside one text node", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = {
      selectedPointers: ["/root/children/0/children/0/text"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/0/children/0/text", offset: 3 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/0/text", offset: 3 },
    };

    const command = insertText(document, selection, "x");

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxD" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("replaces a selected range across inline text and mention nodes", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "AB" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "CD" },
        ],
      },
    ]);
    const selection = {
      selectedPointers: ["/root/children/0/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/0/children/2/text", offset: 1 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/2/text", offset: 1 },
    };

    const command = insertText(document, selection, "x");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AxD" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("inserts text over ranges ending inside code blocks without falling back to focus-only edits", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
      {
        id: "code-1",
        type: "codeBlock",
        text: "xy",
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/1/text", offset: 1 },
    );

    const command = insertText(document, selection, "Z");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            id: "block-1",
            type: "paragraph",
            children: [{ type: "text", text: "AZ" }],
          },
          { id: "code-1", type: "codeBlock", text: "y" },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("applies active marks when inserting at a collapsed text caret", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertText(
      document,
      selectionFromCursorPoint(
        {
          path: "/root/children/0/children/0/text",
          offset: 1,
        },
        { activeMarks: [{ type: "bold" }] },
      ),
      "x",
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "x", marks: [{ type: "bold" }] },
          { type: "text", text: "B" },
        ],
      },
    ]);
  });

  it("replaces selected atoms with typed text", () => {
    const inlineDocument = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
    ]);
    const figureDocument = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const inline = insertText(
      inlineDocument,
      atomSelection("/root/children/0/children/0"),
      "x",
    );
    const figure = insertText(
      figureDocument,
      atomSelection("/root/children/0"),
      "y",
    );

    expectOk(inline);
    expectOk(figure);
    expect(inline.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "x" }],
      },
    ]);
    expect(inline.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(figure.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "y" }],
        },
      },
    ]);
    expect(figure.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("normalizes adjacent text after replacing an inline atom with text", () => {
    const jsonDocument = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            { type: "mention", id: "user-1", label: "Ada" },
            { type: "text", text: "B" },
          ],
        },
      ]),
      { history: 0, selection: true, trustedInitial: true },
    );

    const command = insertText(
      jsonDocument.value,
      atomSelection("/root/children/0/children/1"),
      "x",
    );
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
  });
});
