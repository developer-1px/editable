import { describe, expect, it } from "vitest";
import {
  createGeneratedBlockId,
  createNoteDocument,
  createParagraphBlock,
  initialNoteDocument,
  NoteDocumentSchema,
  readBlockText,
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

  it("creates local generated block ids monotonically", () => {
    const initialBlockIds = new Set(
      initialNoteDocument.root.children.map((block) => block.id),
    );
    const first = createGeneratedBlockId();
    const second = createGeneratedBlockId();
    const firstNumber = Number(/^block-(\d+)$/.exec(first)?.[1]);
    const secondNumber = Number(/^block-(\d+)$/.exec(second)?.[1]);

    expect(first).toMatch(/^block-\d+$/);
    expect(second).toMatch(/^block-\d+$/);
    expect(initialBlockIds.has(first)).toBe(false);
    expect(initialBlockIds.has(second)).toBe(false);
    expect(secondNumber).toBe(firstNumber + 1);
  });

  it("accepts duplicate block ids as schema-valid local document data", () => {
    expect(
      NoteDocumentSchema.safeParse({
        schemaVersion: 1,
        id: "note-1",
        title: "Duplicate ids",
        tags: [],
        root: {
          id: "root",
          kind: "element",
          type: "doc",
          flow: "block",
          children: [
            {
              id: "block-1",
              type: "paragraph",
              children: [{ type: "text", text: "First" }],
            },
            {
              id: "block-1",
              type: "paragraph",
              children: [{ type: "text", text: "Second" }],
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("validates document metadata fields without imposing product title or tag policy", () => {
    const withEmptyTitleAndTags = NoteDocumentSchema.safeParse({
      schemaVersion: 1,
      id: "note-1",
      title: "",
      tags: ["draft", "draft"],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [],
      },
    });
    const withEmptyId = NoteDocumentSchema.safeParse({
      schemaVersion: 1,
      id: "",
      title: "Untitled",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [],
      },
    });

    expect(withEmptyTitleAndTags.success).toBe(true);
    expect(
      withEmptyTitleAndTags.success
        ? {
            title: withEmptyTitleAndTags.data.title,
            tags: withEmptyTitleAndTags.data.tags,
          }
        : null,
    ).toEqual({ title: "", tags: ["draft", "draft"] });
    expect(withEmptyId.success).toBe(false);
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

  it("rejects unsupported schema versions instead of migrating them", () => {
    expect(
      NoteDocumentSchema.safeParse({
        schemaVersion: 2,
        id: "note-1",
        title: "Future note",
        tags: [],
        root: {
          id: "root",
          kind: "element",
          type: "doc",
          flow: "block",
          children: [
            {
              id: "block-1",
              type: "paragraph",
              children: [{ type: "text", text: "Future" }],
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe persisted link hrefs", () => {
    expect(
      NoteDocumentSchema.safeParse({
        schemaVersion: 1,
        id: "note-1",
        title: "Unsafe link",
        tags: [],
        root: {
          id: "root",
          kind: "element",
          type: "doc",
          flow: "block",
          children: [
            {
              id: "block-1",
              type: "paragraph",
              children: [
                {
                  type: "text",
                  text: "Unsafe",
                  marks: [{ type: "link", href: "javascript:alert(1)" }],
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);
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

  it("rejects figure blocks without a source", () => {
    expect(
      NoteDocumentSchema.safeParse({
        schemaVersion: 1,
        id: "note-1",
        title: "Figure",
        tags: [],
        root: {
          id: "root",
          kind: "element",
          type: "doc",
          flow: "block",
          children: [
            {
              id: "figure-1",
              kind: "atom",
              type: "figure",
              flow: "block",
              src: "",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects unsafe persisted figure sources", () => {
    for (const src of [
      "javascript:alert(1)",
      "data:image/svg+xml,<svg></svg>",
      "blob:https://example.com/id",
      "//example.com/image.png",
      "https://example.com/image.svg",
    ]) {
      expect(
        NoteDocumentSchema.safeParse({
          schemaVersion: 1,
          id: "note-1",
          title: "Figure",
          tags: [],
          root: {
            id: "root",
            kind: "element",
            type: "doc",
            flow: "block",
            children: [
              {
                id: "figure-1",
                kind: "atom",
                type: "figure",
                flow: "block",
                src,
              },
            ],
          },
        }).success,
      ).toBe(false);
    }
  });

  it("accepts relative and http persisted figure sources", () => {
    for (const src of [
      "/sample-figure.svg",
      "./image.png",
      "https://example.com/image.png",
    ]) {
      expect(
        NoteDocumentSchema.safeParse({
          schemaVersion: 1,
          id: "note-1",
          title: "Figure",
          tags: [],
          root: {
            id: "root",
            kind: "element",
            type: "doc",
            flow: "block",
            children: [
              {
                id: "figure-1",
                kind: "atom",
                type: "figure",
                flow: "block",
                src,
              },
            ],
          },
        }).success,
      ).toBe(true);
    }
  });

  it("reads figure blocks as empty block text", () => {
    const note = createNoteDocument(
      [{ id: "figure-1", type: "figure", src: "/image.png", alt: "Image" }],
      { id: "note-1", title: "Figure", tags: [] },
    );

    expect(readBlockText(note.root.children[0])).toBe("");
  });

  it("keeps code block children as compatibility data while reading canonical text", () => {
    const note = NoteDocumentSchema.parse({
      schemaVersion: 1,
      id: "note-1",
      title: "Code compatibility",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [
          {
            id: "code-1",
            kind: "element",
            type: "codeBlock",
            flow: "block",
            language: "ts",
            text: "const current = 1;",
            children: [{ kind: "text", type: "text", text: "legacy child" }],
          },
        ],
      },
    });
    const codeBlock = note.root.children[0];

    expect(codeBlock).toMatchObject({
      type: "codeBlock",
      text: "const current = 1;",
      children: [{ type: "text", text: "legacy child" }],
    });
    expect(readBlockText(codeBlock)).toBe("const current = 1;");
  });

  it("defaults missing code block text and compatibility children", () => {
    const note = NoteDocumentSchema.parse({
      schemaVersion: 1,
      id: "note-1",
      title: "Code defaults",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [
          {
            id: "code-1",
            kind: "element",
            type: "codeBlock",
            flow: "block",
          },
        ],
      },
    });
    const codeBlock = note.root.children[0];

    expect(codeBlock).toMatchObject({
      type: "codeBlock",
      text: "",
      children: [],
    });
    expect(readBlockText(codeBlock)).toBe("");
  });
});
