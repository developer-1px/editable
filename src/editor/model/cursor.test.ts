import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  type CursorPoint,
  cursorLength,
  firstCursorPoint,
  lastCursorPoint,
  moveCursor,
  moveCursorByWord,
  normalizeCursorPoint,
  resolveCursorIndex,
  selectedAtomPointersBetween,
  toSelectionPoint,
} from "./cursor";
import { type NoteDocument, NoteDocumentSchema } from "./noteDocument";

function documentWithBlocks(blocks: NoteDocument["blocks"]): NoteDocument {
  return {
    id: "note-test",
    title: "Cursor",
    tags: [],
    blocks,
  };
}

describe("cursor model", () => {
  it("moves through marked text by visible characters", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
      },
    ]);

    let cursor: CursorPoint = firstCursorPoint(document);

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 0,
    });

    expect(cursorLength(document)).toBe(6);
    expect(resolveCursorIndex(document, lastCursorPoint(document))).toBe(6);
  });

  it("collapses adjacent formatted text run boundaries into one cursor position", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "text", text: "B", marks: [{ type: "bold" }] },
          { type: "text", text: "C", marks: [{ type: "italic" }] },
        ],
      },
    ]);

    expect(cursorLength(document)).toBe(5);
    expect(
      resolveCursorIndex(document, {
        path: "/blocks/0/children/0/text",
        offset: 1,
      }),
    ).toBe(
      resolveCursorIndex(document, {
        path: "/blocks/0/children/1/text",
        offset: 0,
      }),
    );
    expect(
      moveCursor(
        document,
        { path: "/blocks/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/1/text",
      offset: 1,
    });
    expect(
      moveCursor(
        document,
        { path: "/blocks/0/children/1/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 0,
    });
  });

  it("moves through block edges before entering and after leaving paragraph text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    expect(firstCursorPoint(document)).toMatchObject({
      path: "/blocks/0",
      edge: "before",
    });
    expect(
      moveCursor(
        document,
        { path: "/blocks/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({ path: "/blocks/0", edge: "after" });
    expect(
      moveCursor(document, { path: "/blocks/0", edge: "after" }, "forward"),
    ).toMatchObject({ path: "/blocks/1", edge: "before" });
    expect(
      moveCursor(document, { path: "/blocks/1", edge: "before" }, "forward"),
    ).toMatchObject({
      path: "/blocks/1/children/0/text",
      offset: 0,
    });
  });

  it("keeps an inline atom as one cursor unit between marked text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "bo", marks: [{ type: "bold" }] },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "ld", marks: [{ type: "bold" }] },
        ],
      },
    ]);

    expect(cursorLength(document)).toBe(9);
    expect(
      moveCursor(
        document,
        { path: "/blocks/0/children/1", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
    expect(
      moveCursor(
        document,
        { path: "/blocks/0/children/1", edge: "after" },
        "backward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "before",
    });
  });

  it("reports atom pointers fully covered by a cursor range", () => {
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
    ]);

    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/blocks/0/children/1", edge: "before" },
        { path: "/blocks/0/children/1", edge: "after" },
      ),
    ).toEqual(["/blocks/0/children/1"]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/blocks/1", edge: "before" },
        { path: "/blocks/1", edge: "after" },
      ),
    ).toEqual(["/blocks/1"]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/blocks/1", edge: "before" },
        { path: "/blocks/1", edge: "before" },
      ),
    ).toEqual([]);
  });

  it("does not report an atom pointer until both atom edges are covered", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);

    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/blocks/0/children/0/text", offset: 0 },
        { path: "/blocks/0/children/1", edge: "before" },
      ),
    ).toEqual([]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/blocks/0/children/0/text", offset: 0 },
        { path: "/blocks/0/children/1", edge: "after" },
      ),
    ).toEqual(["/blocks/0/children/1"]);
  });

  it("treats an inline mention chip as one cursor unit", () => {
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

    let cursor: CursorPoint = { path: "/blocks/0/children/0/text", offset: 1 };

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "before",
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/blocks/0/children/2/text",
      offset: 0,
    });
  });

  it("treats a figure block as one cursor unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
        alt: "Image",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    let cursor: CursorPoint = { path: "/blocks/0/children/0/text", offset: 1 };

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({ path: "/blocks/0", edge: "after" });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({ path: "/blocks/1", edge: "before" });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({ path: "/blocks/1", edge: "after" });

    cursor = moveCursor(document, cursor, "backward");
    expect(cursor).toMatchObject({ path: "/blocks/1", edge: "before" });
  });

  it("moves by word boundaries and treats atoms as one word unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "one two" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "셋" },
        ],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    expect(
      moveCursorByWord(
        document,
        { path: "/blocks/0", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 3,
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/blocks/0/children/0/text", offset: 7 },
        "backward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 4,
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/blocks/0/children/0/text", offset: 7 },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/blocks/0/children/2/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "before",
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/blocks/0", edge: "after" },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
  });

  it("keeps rich text blocks on the same cursor stream contract", () => {
    const document = documentWithBlocks([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "Hi" }],
      },
      {
        id: "quote-1",
        type: "quote",
        children: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "Item" }],
      },
      {
        id: "code-1",
        type: "codeBlock",
        text: "x = 1",
      },
    ]);

    expect(firstCursorPoint(document)).toMatchObject({
      path: "/blocks/0",
      edge: "before",
    });
    expect(
      moveCursor(document, { path: "/blocks/0", edge: "before" }, "forward"),
    ).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/blocks/0/children/0/text", offset: 2 },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/0",
      edge: "after",
    });
    expect(
      moveCursor(document, { path: "/blocks/1", edge: "before" }, "forward"),
    ).toMatchObject({
      path: "/blocks/1/children/0",
      edge: "before",
    });
    expect(
      moveCursor(
        document,
        { path: "/blocks/1/children/0", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/1/children/0",
      edge: "after",
    });
    expect(
      moveCursor(
        document,
        { path: "/blocks/2/children/0/text", offset: 4 },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/2",
      edge: "after",
    });
    expect(
      moveCursor(document, { path: "/blocks/3", edge: "before" }, "forward"),
    ).toMatchObject({
      path: "/blocks/3/text",
      offset: 0,
    });
    expect(lastCursorPoint(document)).toMatchObject({
      path: "/blocks/3",
      edge: "after",
    });
  });

  it("normalizes text offsets to valid document boundaries", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABC" }],
      },
    ]);

    expect(
      normalizeCursorPoint(document, {
        path: "/blocks/0/children/0/text",
        offset: -10,
      }),
    ).toMatchObject({ path: "/blocks/0/children/0/text", offset: 0 });
    expect(
      normalizeCursorPoint(document, {
        path: "/blocks/0/children/0/text",
        offset: 99,
      }),
    ).toMatchObject({ path: "/blocks/0/children/0/text", offset: 3 });
  });

  it("normalizes edge points to before or after edges only", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    expect(normalizeCursorPoint(document, { path: "/blocks/0" })).toMatchObject(
      { path: "/blocks/0", edge: "before" },
    );
    expect(
      normalizeCursorPoint(document, {
        path: "/blocks/0",
        edge: "after",
      }),
    ).toMatchObject({ path: "/blocks/0", edge: "after" });
    expect(
      normalizeCursorPoint(document, { path: "/blocks/0/children/0" }),
    ).toMatchObject({ path: "/blocks/0/children/0", edge: "before" });
    expect(
      normalizeCursorPoint(document, {
        path: "/blocks/1",
        edge: "after",
      }),
    ).toMatchObject({ path: "/blocks/1", edge: "after" });
  });

  it("serializes cursor points into json-document selection state", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);
    const jsonDocument = createJSONDocument(NoteDocumentSchema, document, {
      selection: true,
      trustedInitial: true,
    });
    const point = normalizeCursorPoint(document, {
      path: "/blocks/0/children/1",
      edge: "after",
    });

    jsonDocument.selection?.collapse(toSelectionPoint(point));

    expect(jsonDocument.selection?.caret).toEqual(point);
    expect(
      JSON.parse(JSON.stringify(jsonDocument.selection?.snapshot())),
    ).toEqual(jsonDocument.selection?.snapshot());
  });
});
