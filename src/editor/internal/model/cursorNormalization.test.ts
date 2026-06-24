import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { normalizeCursorPoint, toSelectionPoint } from "./cursor";
import { documentWithBlocks } from "./cursorTestUtils";
import { NoteDocumentSchema } from "./noteDocument";

describe("cursor normalization and serialization", () => {
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
