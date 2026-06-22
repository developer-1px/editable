import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../fixtures/unicodeGraphemeCorpus";
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
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Cursor",
    tags: [],
  });
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

    expect(cursor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(cursorLength(document)).toBe(4);
    expect(resolveCursorIndex(document, lastCursorPoint(document))).toBe(4);
  });

  it("moves through emoji as a single grapheme boundary", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A😀B" }],
      },
    ]);

    expect(cursorLength(document)).toBe(3);
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 3 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(
      normalizeCursorPoint(document, {
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });

  it("moves through the Unicode grapheme corpus as single cursor units", () => {
    for (const fixture of unicodeGraphemeCorpus) {
      const document = documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: unicodeFixtureText(fixture) }],
        },
      ]);
      const start = unicodeFixtureClusterStart();
      const end = unicodeFixtureClusterEnd(fixture);

      expect(cursorLength(document), fixture.id).toBe(3);
      expect(
        moveCursor(
          document,
          { path: "/root/children/0/children/0/text", offset: start },
          "forward",
        ),
        fixture.id,
      ).toMatchObject({
        path: "/root/children/0/children/0/text",
        offset: end,
      });
      expect(
        moveCursor(
          document,
          { path: "/root/children/0/children/0/text", offset: end },
          "backward",
        ),
        fixture.id,
      ).toMatchObject({
        path: "/root/children/0/children/0/text",
        offset: start,
      });

      for (let offset = start + 1; offset < end; offset += 1) {
        const normalized = normalizeCursorPoint(document, {
          path: "/root/children/0/children/0/text",
          offset,
        });
        expect([start, end], fixture.id).toContain(normalized.offset);
        expect(
          normalizeCursorPoint(document, {
            path: "/root/children/0/children/0/text",
            offset,
            affinity: "backward",
          }),
          fixture.id,
        ).toMatchObject({
          path: "/root/children/0/children/0/text",
          offset: start,
        });
        expect(
          normalizeCursorPoint(document, {
            path: "/root/children/0/children/0/text",
            offset,
            affinity: "forward",
          }),
          fixture.id,
        ).toMatchObject({
          path: "/root/children/0/children/0/text",
          offset: end,
        });
      }
    }
  });

  it("treats decomposed letter graphemes as word characters", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "e\u0301 y" }],
      },
    ]);

    expect(
      moveCursorByWord(
        document,
        {
          path: "/root/children/0/children/0/text",
          offset: 0,
        },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("keeps a raw empty inline block in the cursor stream", () => {
    const document = documentWithBlocks([
      { id: "empty", type: "paragraph", children: [] },
      {
        id: "next",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    expect(firstCursorPoint(document)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(lastCursorPoint(document)).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 1,
    });
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

    expect(cursorLength(document)).toBe(3);
    expect(
      resolveCursorIndex(document, {
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    ).toBe(
      resolveCursorIndex(document, {
        path: "/root/children/0/children/1/text",
        offset: 0,
      }),
    );
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 1,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/1/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("treats sss <bold>dd </bold> ddd mark edges as shared cursor boundaries", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "sss " },
          { type: "text", text: "dd ", marks: [{ type: "bold" }] },
          { type: "text", text: " ddd" },
        ],
      },
    ]);
    const beforeBold = {
      path: "/root/children/0/children/0/text",
      offset: 4,
    } satisfies CursorPoint;
    const boldStart = {
      path: "/root/children/0/children/1/text",
      offset: 0,
    } satisfies CursorPoint;
    const afterBold = {
      path: "/root/children/0/children/1/text",
      offset: 3,
    } satisfies CursorPoint;
    const afterBoldTextStart = {
      path: "/root/children/0/children/2/text",
      offset: 0,
    } satisfies CursorPoint;

    expect(resolveCursorIndex(document, beforeBold)).toBe(
      resolveCursorIndex(document, boldStart),
    );
    expect(resolveCursorIndex(document, afterBold)).toBe(
      resolveCursorIndex(document, afterBoldTextStart),
    );
    expect(moveCursor(document, beforeBold, "forward")).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 1,
    });
    expect(moveCursor(document, boldStart, "backward")).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(moveCursor(document, afterBold, "forward")).toMatchObject({
      path: "/root/children/0/children/2/text",
      offset: 1,
    });
    expect(moveCursor(document, afterBoldTextStart, "backward")).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 2,
    });
  });

  it("moves between text blocks without structural block-edge stops", () => {
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
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0", edge: "after" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/1", edge: "before" },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
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

    expect(cursorLength(document)).toBe(7);
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/1", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/1", edge: "after" },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
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
        { path: "/root/children/0/children/1", edge: "before" },
        { path: "/root/children/0/children/1", edge: "after" },
      ),
    ).toEqual(["/root/children/0/children/1"]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/1", edge: "before" },
        { path: "/root/children/1", edge: "after" },
      ),
    ).toEqual(["/root/children/1"]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/1", edge: "before" },
        { path: "/root/children/1", edge: "before" },
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
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/1", edge: "before" },
      ),
    ).toEqual([]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/1", edge: "after" },
      ),
    ).toEqual(["/root/children/0/children/1"]);
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

    let cursor: CursorPoint = {
      path: "/root/children/0/children/0/text",
      offset: 1,
    };

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/2/text",
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

    let cursor: CursorPoint = {
      path: "/root/children/0/children/0/text",
      offset: 1,
    };

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({ path: "/root/children/1", edge: "before" });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({ path: "/root/children/1", edge: "after" });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 0,
    });

    cursor = moveCursor(document, cursor, "backward");
    expect(cursor).toMatchObject({ path: "/root/children/1", edge: "after" });
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
        { path: "/root/children/0", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0/children/0/text", offset: 7 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 4,
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0/children/0/text", offset: 7 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0/children/2/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0", edge: "after" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1",
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
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 2 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "before",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/1", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "before",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/1/children/0", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "after",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/2/children/0/text", offset: 4 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/3/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/3/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 4,
    });
    expect(lastCursorPoint(document)).toMatchObject({
      path: "/root/children/3/text",
      offset: 5,
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
        path: "/root/children/0/children/0/text",
        offset: -10,
      }),
    ).toMatchObject({ path: "/root/children/0/children/0/text", offset: 0 });
    expect(
      normalizeCursorPoint(document, {
        path: "/root/children/0/children/0/text",
        offset: 99,
      }),
    ).toMatchObject({ path: "/root/children/0/children/0/text", offset: 3 });
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

    expect(
      normalizeCursorPoint(document, { path: "/root/children/0" }),
    ).toMatchObject({ path: "/root/children/0", edge: "before" });
    expect(
      normalizeCursorPoint(document, {
        path: "/root/children/0",
        edge: "after",
      }),
    ).toMatchObject({ path: "/root/children/0", edge: "after" });
    expect(
      normalizeCursorPoint(document, { path: "/root/children/0/children/0" }),
    ).toMatchObject({ path: "/root/children/0/children/0", edge: "before" });
    expect(
      normalizeCursorPoint(document, {
        path: "/root/children/1",
        edge: "after",
      }),
    ).toMatchObject({ path: "/root/children/1", edge: "after" });
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
      path: "/root/children/0/children/1",
      edge: "after",
    });

    jsonDocument.selection?.collapse(toSelectionPoint(point));

    expect(jsonDocument.selection?.caret).toEqual(point);
    expect(
      JSON.parse(JSON.stringify(jsonDocument.selection?.snapshot())),
    ).toEqual(jsonDocument.selection?.snapshot());
  });
});
