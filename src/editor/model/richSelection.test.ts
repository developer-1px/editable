import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";
import {
  selectionForRender,
  selectionFromCursorPoint,
  selectionFromCursorRange,
  selectionFromNodeTarget,
} from "./richSelection";
import { insertText } from "./textCommands";

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Selection",
    tags: [],
  });
}

function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
}

describe("rich selection mapping", () => {
  it("serializes collapsed carets without selected pointers", () => {
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(selection.selectedPointers).toEqual([]);
    expect(selection.selectionRanges[0]).toMatchObject({
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/0/text", offset: 1 },
    });
  });

  it("serializes ranges without selected pointers and derives atoms for render", () => {
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
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "C" }],
      },
    ]);

    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/2", edge: "before" },
    );

    expect(selection.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selection)?.selectedPointers).toEqual([
      "/root/children/0/children/1",
      "/root/children/1",
    ]);
  });

  it("uses node selection as the only source selection with selected pointers", () => {
    const selection = selectionFromNodeTarget("/root/children/1");

    expect(selection.selectedPointers).toEqual(["/root/children/1"]);
    expect(selection.selectionRanges[0]).toMatchObject({
      anchor: { path: "/root/children/1", edge: "before" },
      focus: { path: "/root/children/1", edge: "after" },
    });
  });

  it("restores open range shape across undo without source selected pointers", () => {
    const document = createJSONDocument(
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
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorRange(
      document.value,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/2/text", offset: 0 },
    );
    document.selection?.restore(selection);

    const command = insertText(document.value, selection, "x");
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });
    document.undo();

    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/2/text", offset: 0 },
    });
    expect(
      selectionForRender(document.value, document.selection?.snapshot())
        ?.selectedPointers,
    ).toEqual(["/root/children/0/children/1"]);
  });
});
