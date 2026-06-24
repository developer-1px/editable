import { describe, expect, it } from "vitest";
import { initialNoteDocument } from "./initialNoteDocument";
import { NoteDocumentSchema } from "./noteDocument";

describe("note document initial seed", () => {
  it("accepts the initial paragraph document", () => {
    expect(NoteDocumentSchema.safeParse(initialNoteDocument).success).toBe(
      true,
    );
  });

  it("seeds the demo with rich inline and block fragments", () => {
    expect(initialNoteDocument.root.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "heading",
          level: 2,
        }),
        expect.objectContaining({
          type: "paragraph",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              text: "bold",
              marks: [{ type: "bold" }],
            }),
            expect.objectContaining({
              type: "text",
              text: "italic",
              marks: [{ type: "italic" }],
            }),
            expect.objectContaining({
              type: "text",
              text: "code",
              marks: [{ type: "code" }],
            }),
            expect.objectContaining({
              type: "mention",
              id: "user-ada",
              label: "Ada",
            }),
          ]),
        }),
        expect.objectContaining({
          type: "figure",
          src: "/sample-figure.svg",
        }),
        expect.objectContaining({
          type: "quote",
        }),
        expect.objectContaining({
          type: "listItem",
          ordered: false,
          depth: 0,
        }),
        expect.objectContaining({
          type: "codeBlock",
          text: "const value = 1;",
        }),
      ]),
    );
  });
});
