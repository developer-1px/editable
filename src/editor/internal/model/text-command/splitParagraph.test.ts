import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { NoteDocumentSchema } from "../noteDocument";
import { insertText, splitParagraph } from "./textCommands";
import { documentWithBlocks, expectOk } from "./textCommandTestUtils";

describe("split paragraph command", () => {
  it("splits a paragraph at a text cursor", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "A" }],
        },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "B" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("keeps insertion on the empty paragraph created before existing text", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Plain" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );

    const splitAfterP = splitParagraph(
      document.value,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );
    expectOk(splitAfterP);
    document.commit(splitAfterP.patch, {
      selectionAfter: splitAfterP.selectionAfter,
    });

    const splitAtStartOfRest = splitParagraph(
      document.value,
      splitAfterP.selectionAfter,
    );
    expectOk(splitAtStartOfRest);
    document.commit(splitAtStartOfRest.patch, {
      selectionAfter: splitAtStartOfRest.selectionAfter,
    });

    const insertIntoEmptyParagraph = insertText(
      document.value,
      splitAtStartOfRest.selectionAfter,
      "d",
    );
    expectOk(insertIntoEmptyParagraph);
    document.commit(insertIntoEmptyParagraph.patch, {
      selectionAfter: insertIntoEmptyParagraph.selectionAfter,
    });

    expect(document.value.root.children).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "P" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "d" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "lain" }],
      },
    ]);
    expect(document.selection?.snapshot()?.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 1,
    });
  });

  it("splits an empty paragraph into two empty paragraphs", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "" }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("exits an empty heading to an empty paragraph on split", () => {
    const document = documentWithBlocks([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "" }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "heading-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(command.patch).toHaveLength(1);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("exits empty quote and list item blocks to empty paragraphs on split", () => {
    const quoteDocument = documentWithBlocks([
      {
        id: "quote-1",
        type: "quote",
        children: [{ type: "text", text: "" }],
      },
    ]);
    const listDocument = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "" }],
      },
    ]);

    const quote = splitParagraph(
      quoteDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );
    const list = splitParagraph(
      listDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expectOk(quote);
    expectOk(list);
    expect(quote.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "quote-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(list.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "list-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(quote.patch).toHaveLength(1);
    expect(list.patch).toHaveLength(1);
    expect(quote.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(list.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("treats whitespace-only list items as empty when splitting", () => {
    const document = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "   " }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 3,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "list-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(command.patch).toHaveLength(1);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("replaces selected code text with a newline when splitting", () => {
    const document = documentWithBlocks([
      { id: "code-1", type: "codeBlock", text: "abc" },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/text", offset: 1 },
        { path: "/root/children/0/text", offset: 2 },
      ),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "a\nc" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
  });

  it("splits at the start of a selected inline range after deleting the selection", () => {
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

    const command = splitParagraph(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { type: "paragraph", children: [{ type: "text", text: "A" }] },
          { type: "paragraph", children: [{ type: "text", text: "D" }] },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("preserves marks when splitting a paragraph", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB", marks: [{ type: "bold" }] }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        value: {
          children: [{ type: "text", text: "A", marks: [{ type: "bold" }] }],
        },
      },
      {
        value: {
          children: [{ type: "text", text: "B", marks: [{ type: "bold" }] }],
        },
      },
    ]);
  });

  it("splits before and after inline mention atoms on the expected side", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B" },
        ],
      },
    ]);

    const beforeMention = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "before",
      }),
    );
    const afterMention = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
    );

    expectOk(beforeMention);
    expectOk(afterMention);
    expect(beforeMention.patch).toMatchObject([
      {
        value: { children: [{ type: "text", text: "A" }] },
      },
      {
        value: {
          children: [
            { type: "mention", id: "user-1", label: "Ada" },
            { type: "text", text: "B" },
          ],
        },
      },
    ]);
    expect(beforeMention.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "before",
    });
    expect(afterMention.patch).toMatchObject([
      {
        value: {
          children: [
            { type: "text", text: "A" },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
      },
      {
        value: { children: [{ type: "text", text: "B" }] },
      },
    ]);
    expect(afterMention.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("creates a paragraph before or after a figure on split", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const before = splitParagraph(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "before" }),
    );
    const after = splitParagraph(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      { op: "add", path: "/root/children/0", value: { type: "paragraph" } },
    ]);
    expect(after.patch).toMatchObject([
      { op: "add", path: "/root/children/1", value: { type: "paragraph" } },
    ]);
  });

  it("commits split selectionAfter with the patch", () => {
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

    const command = splitParagraph(jsonDocument.value, selection);
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.value.root.children).toHaveLength(2);
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });
});
