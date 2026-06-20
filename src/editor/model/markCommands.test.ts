import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import {
  activeMarksFromSelection,
  toggleLink,
  toggleMark,
} from "./markCommands";
import type { NoteDocument } from "./noteDocument";
import { NoteDocumentSchema } from "./noteDocument";
import { insertText } from "./textCommands";

function documentWithBlocks(blocks: NoteDocument["blocks"]): NoteDocument {
  return {
    id: "note-test",
    title: "Marks",
    tags: [],
    blocks,
  };
}

function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
}

describe("mark commands", () => {
  it("toggles a mark over a selected text range and keeps the range selected", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/blocks/0/children/0/text", offset: 1 },
      { path: "/blocks/0/children/0/text", offset: 3 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toEqual([
      {
        op: "replace",
        path: "/blocks/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "bold" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
    expect(command.selectionAfter.anchor).toMatchObject({
      path: "/blocks/0/children/1/text",
      offset: 0,
    });
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/1/text",
      offset: 2,
    });
  });

  it("removes a mark when the whole selected text already has it", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "bold" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/blocks/0/children/1/text", offset: 0 },
      { path: "/blocks/0/children/1/text", offset: 2 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toEqual([
      {
        op: "replace",
        path: "/blocks/0/children",
        value: [{ type: "text", text: "ABCD" }],
      },
    ]);
    expect(command.selectionAfter.anchor).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 3,
    });
  });

  it("toggles inline code over selected text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/blocks/0/children/0/text", offset: 1 },
      { path: "/blocks/0/children/0/text", offset: 3 },
    );

    const command = toggleMark(document, selection, "code");

    expectOk(command);
    expect(command.patch).toEqual([
      {
        op: "replace",
        path: "/blocks/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "code" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("toggles links over selected text with deterministic href policy", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/blocks/0/children/0/text", offset: 1 },
      { path: "/blocks/0/children/0/text", offset: 3 },
      { pendingLinkHref: "https://openai.com" },
    );

    const command = toggleLink(document, selection);

    expectOk(command);
    expect(command.patch).toEqual([
      {
        op: "replace",
        path: "/blocks/0/children",
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

    const linkedDocument: NoteDocument = {
      ...document,
      blocks: [
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            {
              type: "text",
              text: "BC",
              marks: [{ type: "link", href: "https://openai.com" }],
            },
            { type: "text", text: "D" },
          ],
        },
      ],
    };
    const remove = toggleLink(
      linkedDocument,
      selectionFromCursorRange(
        linkedDocument,
        { path: "/blocks/0/children/1/text", offset: 0 },
        { path: "/blocks/0/children/1/text", offset: 2 },
      ),
    );

    expectOk(remove);
    expect(remove.patch).toEqual([
      {
        op: "replace",
        path: "/blocks/0/children",
        value: [{ type: "text", text: "ABCD" }],
      },
    ]);
  });

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
      path: "/blocks/0/children/0/text",
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
    expect(insert.patch).toEqual([
      {
        op: "replace",
        path: "/blocks/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "italic" }] },
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
        path: "/blocks/0/children/0/text",
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
    expect(insert.patch).toEqual([
      {
        op: "replace",
        path: "/blocks/0/children",
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
