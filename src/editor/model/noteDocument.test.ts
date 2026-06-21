import { describe, expect, it } from "vitest";
import {
  createNoteDocument,
  createParagraphBlock,
  initialNoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";

describe("note document schema", () => {
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
          src: "/logo192.png",
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

  it("creates paragraph blocks for editor inserts", () => {
    const initialBlockIds = new Set(
      initialNoteDocument.root.children.map((block) => block.id),
    );
    const block = createParagraphBlock("hello");

    expect(block).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "hello" }],
    });
    expect(initialBlockIds.has(block.id)).toBe(false);
  });

  it("creates paragraph block ids that do not collide with the initial demo", () => {
    const initialBlockIds = new Set(
      initialNoteDocument.root.children.map((block) => block.id),
    );

    expect(initialBlockIds.has(createParagraphBlock("").id)).toBe(false);
  });

  it("accepts structured text marks", () => {
    expect(
      NoteDocumentSchema.safeParse(
        createNoteDocument(
          [
            {
              id: "block-1",
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "OpenAI",
                  marks: [
                    { type: "bold" },
                    { type: "link", href: "https://openai.com" },
                  ],
                },
              ],
            },
          ],
          { id: "note-1", title: "Marked", tags: [] },
        ),
      ).success,
    ).toBe(true);
  });

  it("accepts rich text block variants", () => {
    expect(
      NoteDocumentSchema.safeParse(
        createNoteDocument(
          [
            {
              id: "heading-1",
              type: "heading",
              level: 2,
              children: [{ type: "text", text: "Heading" }],
            },
            {
              id: "quote-1",
              type: "quote",
              children: [{ type: "text", text: "Quote" }],
            },
            {
              id: "list-1",
              type: "listItem",
              ordered: true,
              depth: 1,
              children: [{ type: "text", text: "Item" }],
            },
            {
              id: "code-1",
              type: "codeBlock",
              language: "ts",
              text: "const value = 1;",
            },
          ],
          { id: "note-1", title: "Blocks", tags: [] },
        ),
      ).success,
    ).toBe(true);
  });
});
