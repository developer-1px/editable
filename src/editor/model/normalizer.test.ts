import { describe, expect, it } from "vitest";
import {
  mergeAdjacentText,
  normalizeDocument,
  normalizeInlineChildren,
} from "./normalizer";
import type { NoteDocument } from "./noteDocument";

function documentWithBlocks(blocks: NoteDocument["blocks"]): NoteDocument {
  return {
    id: "note-test",
    title: "Normalize",
    tags: [],
    blocks,
  };
}

describe("document normalizer", () => {
  it("creates an empty paragraph when the document has no blocks", () => {
    const normalized = normalizeDocument(documentWithBlocks([]));

    expect(normalized.blocks).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "" }],
      },
    ]);
  });

  it("keeps text blocks anchored with one empty text child", () => {
    const normalized = normalizeDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [],
        },
      ]),
    );

    expect(normalized.blocks[0]).toEqual({
      id: "block-1",
      type: "paragraph",
      children: [{ type: "text", text: "" }],
    });
  });

  it("normalizes rich inline text block children", () => {
    const normalized = normalizeDocument(
      documentWithBlocks([
        {
          id: "heading-1",
          type: "heading",
          level: 2,
          children: [],
        },
        {
          id: "quote-1",
          type: "quote",
          children: [
            { type: "text", text: "A" },
            { type: "text", text: "B" },
          ],
        },
        {
          id: "list-1",
          type: "listItem",
          ordered: false,
          depth: 0,
          children: [],
        },
      ]),
    );

    expect(normalized.blocks).toMatchObject([
      {
        type: "heading",
        children: [{ type: "text", text: "" }],
      },
      {
        type: "quote",
        children: [{ type: "text", text: "AB" }],
      },
      {
        type: "listItem",
        children: [{ type: "text", text: "" }],
      },
    ]);
  });

  it("removes empty non-placeholder text runs", () => {
    expect(
      normalizeInlineChildren([
        { type: "text", text: "" },
        { type: "mention", id: "user-1", label: "Ada" },
        { type: "text", text: "" },
      ]),
    ).toEqual([{ type: "mention", id: "user-1", label: "Ada" }]);
  });

  it("merges adjacent text runs without inserting atom sentinels", () => {
    expect(
      normalizeInlineChildren([
        { type: "text", text: "A" },
        { type: "text", text: "B" },
        { type: "mention", id: "user-1", label: "Ada" },
        { type: "text", text: "" },
        { type: "text", text: "C" },
      ]),
    ).toEqual([
      { type: "text", text: "AB" },
      { type: "mention", id: "user-1", label: "Ada" },
      { type: "text", text: "C" },
    ]);
  });

  it("sorts marks and merges adjacent text only when marks match", () => {
    expect(
      normalizeInlineChildren([
        {
          type: "text",
          text: "A",
          marks: [{ type: "italic" }, { type: "bold" }],
        },
        {
          type: "text",
          text: "B",
          marks: [{ type: "bold" }, { type: "italic" }],
        },
        {
          type: "text",
          text: "C",
          marks: [{ type: "code" }],
        },
      ]),
    ).toEqual([
      {
        type: "text",
        text: "AB",
        marks: [{ type: "bold" }, { type: "italic" }],
      },
      { type: "text", text: "C", marks: [{ type: "code" }] },
    ]);
  });

  it("keeps link runs separate when their targets differ", () => {
    expect(
      normalizeInlineChildren([
        {
          type: "text",
          text: "A",
          marks: [{ type: "link", href: "https://a.example" }],
        },
        {
          type: "text",
          text: "B",
          marks: [{ type: "link", href: "https://b.example" }],
        },
      ]),
    ).toEqual([
      {
        type: "text",
        text: "A",
        marks: [{ type: "link", href: "https://a.example" }],
      },
      {
        type: "text",
        text: "B",
        marks: [{ type: "link", href: "https://b.example" }],
      },
    ]);
  });

  it("canonicalizes marks when merging text directly", () => {
    expect(
      mergeAdjacentText([
        {
          type: "text",
          text: "A",
          marks: [{ type: "italic" }, { type: "bold" }],
        },
        {
          type: "text",
          text: "B",
          marks: [{ type: "bold" }, { type: "italic" }],
        },
      ]),
    ).toEqual([
      {
        type: "text",
        text: "AB",
        marks: [{ type: "bold" }, { type: "italic" }],
      },
    ]);
  });
});
