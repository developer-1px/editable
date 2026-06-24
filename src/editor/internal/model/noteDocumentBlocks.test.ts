import { describe, expect, it } from "vitest";
import {
  createNoteDocument,
  NoteDocumentSchema,
  readBlockText,
} from "./noteDocument";

describe("note document block schema", () => {
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
