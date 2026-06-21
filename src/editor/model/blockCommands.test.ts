import { describe, expect, it } from "vitest";
import { adjustSelectedListDepth } from "./blockCommands";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Blocks",
    tags: [],
  });
}

function expectOk<T extends { ok: boolean }>(
  result: T | null,
): asserts result is Extract<T, { ok: true }> {
  expect(result?.ok).toBe(true);
}

describe("block commands", () => {
  it("indents and outdents a collapsed list item selection", () => {
    const document = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 1,
        children: [{ type: "text", text: "Item" }],
      },
    ]);
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });

    const indent = adjustSelectedListDepth(document, selection, "indent");
    const outdent = adjustSelectedListDepth(document, selection, "outdent");

    expectOk(indent);
    expectOk(outdent);
    expect(indent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/depth", value: 2 },
    ]);
    expect(outdent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/depth", value: 0 },
    ]);
    expect(indent.selectionAfter).toBe(selection);
  });

  it("adjusts every list item touched by an open range", () => {
    const document = documentWithBlocks([
      {
        id: "paragraph-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "B" }],
      },
      {
        id: "list-2",
        type: "listItem",
        ordered: false,
        depth: 2,
        children: [{ type: "text", text: "C" }],
      },
      {
        id: "paragraph-2",
        type: "paragraph",
        children: [{ type: "text", text: "D" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/3", edge: "before" },
    );

    const command = adjustSelectedListDepth(document, selection, "indent");

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/1/depth", value: 1 },
      { op: "replace", path: "/root/children/2/depth", value: 3 },
    ]);
    expect(command.selectionAfter).toBe(selection);
  });

  it("returns null when the selection does not touch a list item", () => {
    const document = documentWithBlocks([
      {
        id: "paragraph-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
    ]);

    expect(
      adjustSelectedListDepth(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: 1,
        }),
        "indent",
      ),
    ).toBe(null);
  });
});
