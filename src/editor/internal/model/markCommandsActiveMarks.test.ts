import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "./cursorCommands";
import {
  activeMarksFromSelection,
  toggleLink,
  toggleMark,
} from "./markCommands";
import { documentWithBlocks, expectOk } from "./markCommandTestUtils";
import { NoteDocumentSchema } from "./noteDocument";
import { insertText } from "./textCommands";

describe("mark commands for active marks", () => {
  it("stores active marks on collapsed selections and inserts with those marks", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AD" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const toggle = toggleMark(document.value, selection, "italic");
    expectOk(toggle);
    document.selection?.restore(toggle.selectionAfter);
    expect(
      activeMarksFromSelection(document.selection?.snapshot() ?? selection),
    ).toEqual([{ type: "italic" }]);

    const insert = insertText(
      document.value,
      document.selection?.snapshot() ?? selection,
      "BC",
    );

    expectOk(insert);
    expect(insert.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "italic" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("normalizes active marks by type, href safety, and mark order", () => {
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 0,
      },
      {
        activeMarks: [
          { type: "link", href: " javascript:alert(1)" },
          { type: "code" },
          { type: "bold" },
          { type: "link", href: " https://openai.com/docs " },
          { type: "bold" },
          { type: "italic" },
        ],
      },
    );

    expect(activeMarksFromSelection(selection)).toEqual([
      { type: "bold" },
      { type: "italic" },
      { type: "code" },
      { type: "link", href: "https://openai.com/docs" },
    ]);
  });

  it("drops unsafe active link marks before inserting text", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AD" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
      {
        activeMarks: [
          { type: "link", href: "javascript:alert(1)" },
          { type: "bold" },
        ],
      },
    );

    expect(activeMarksFromSelection(selection)).toEqual([{ type: "bold" }]);

    const insert = insertText(document.value, selection, "BC");

    expectOk(insert);
    expect(insert.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "bold" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("stores active code and link marks on collapsed selections", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AD" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
      { pendingLinkHref: "https://openai.com" },
    );

    const code = toggleMark(document.value, selection, "code");
    expectOk(code);
    document.selection?.restore(code.selectionAfter);
    expect(
      activeMarksFromSelection(document.selection?.snapshot() ?? selection),
    ).toEqual([{ type: "code" }]);

    const link = toggleLink(document.value, selection);
    expectOk(link);
    document.selection?.restore(link.selectionAfter);
    expect(
      activeMarksFromSelection(document.selection?.snapshot() ?? selection),
    ).toEqual([{ type: "link", href: "https://openai.com" }]);

    const insert = insertText(
      document.value,
      document.selection?.snapshot() ?? selection,
      "BC",
    );

    expectOk(insert);
    expect(insert.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          {
            type: "text",
            text: "BC",
            marks: [{ type: "link", href: "https://openai.com" }],
          },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });
});
