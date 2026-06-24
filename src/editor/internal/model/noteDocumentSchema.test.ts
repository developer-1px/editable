import { describe, expect, it } from "vitest";
import { createNoteDocument, NoteDocumentSchema } from "./noteDocument";

describe("note document schema", () => {
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
});
