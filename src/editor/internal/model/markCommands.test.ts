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
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";
import { insertText } from "./textCommands";

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Marks",
    tags: [],
  });
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
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toMatchObject([
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
    expect(command.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 0,
    });
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1/text",
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
      { path: "/root/children/0/children/1/text", offset: 0 },
      { path: "/root/children/0/children/1/text", offset: 2 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "ABCD" }],
      },
    ]);
    expect(command.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
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
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const command = toggleMark(document, selection, "code");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "code" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("applies marks across inline atoms without marking the atom", () => {
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
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 0 },
      { path: "/root/children/0/children/2/text", offset: 1 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A", marks: [{ type: "bold" }] },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B", marks: [{ type: "bold" }] },
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
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: "https://openai.com" },
    );

    const command = toggleLink(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
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

    const linkedDocument = createNoteDocument(
      [
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
      { id: document.id, title: document.title, tags: document.tags },
    );
    const remove = toggleLink(
      linkedDocument,
      selectionFromCursorRange(
        linkedDocument,
        { path: "/root/children/0/children/1/text", offset: 0 },
        { path: "/root/children/0/children/1/text", offset: 2 },
      ),
    );

    expectOk(remove);
    expect(remove.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "ABCD" }],
      },
    ]);
  });

  it("normalizes pending hrefs before writing link marks", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: " https://openai.com/docs " },
    );

    const command = toggleLink(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          {
            type: "text",
            text: "BC",
            marks: [{ type: "link", href: "https://openai.com/docs" }],
          },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("rejects unsafe pending hrefs before writing link marks", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: " javascript:alert(1)" },
    );

    expect(toggleLink(document, selection)).toEqual({
      ok: false,
      reason: "Link href is invalid.",
    });
  });

  it("requires a pending href before adding link marks", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);

    const command = toggleLink(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        { path: "/root/children/0/children/0/text", offset: 3 },
      ),
    );

    expect(command).toEqual({
      ok: false,
      reason: "Link href is required.",
    });
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
