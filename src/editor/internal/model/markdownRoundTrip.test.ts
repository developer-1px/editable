import { describe, expect, it } from "vitest";
import { exportMarkdown, importMarkdown } from "./markdown";
import { createNoteDocument } from "./noteDocument";

describe("markdown round-trip escaping", () => {
  it("round-trips inline code punctuation without adding escapes to model text", () => {
    const note = createNoteDocument(
      [
        {
          id: "paragraph-1",
          type: "paragraph",
          children: [
            { type: "text", text: "a_b*[]()", marks: [{ type: "code" }] },
          ],
        },
      ],
      { id: "note-1", title: "Code", tags: [] },
    );

    const imported = importMarkdown(exportMarkdown(note));

    expect(imported.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "a_b*[]()", marks: [{ type: "code" }] }],
    });
  });

  it("round-trips pasted paragraph newlines through markdown", () => {
    const note = createNoteDocument(
      [
        {
          id: "paragraph-1",
          type: "paragraph",
          children: [{ type: "text", text: "Alpha\nBeta" }],
        },
      ],
      { id: "note-1", title: "Newlines", tags: [] },
    );

    const imported = importMarkdown(exportMarkdown(note));

    expect(imported.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "Alpha\nBeta" }],
    });
  });

  it("round-trips leading and trailing paragraph spaces", () => {
    const note = createNoteDocument(
      [
        {
          id: "paragraph-1",
          type: "paragraph",
          children: [{ type: "text", text: " lead trail " }],
        },
      ],
      { id: "note-1", title: "Spaces", tags: [] },
    );

    const imported = importMarkdown(exportMarkdown(note));

    expect(imported.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: " lead trail " }],
    });
  });

  it("round-trips paragraph text that looks like markdown block syntax", () => {
    for (const text of [
      "# Not a heading",
      "> Not a quote",
      "- Not a list item",
      "1. Not an ordered item",
      "![Not a figure](/image.png)",
    ]) {
      const note = createNoteDocument(
        [
          {
            id: "paragraph-1",
            type: "paragraph",
            children: [{ type: "text", text }],
          },
        ],
        { id: "note-1", title: "Roundtrip", tags: [] },
      );

      const imported = importMarkdown(exportMarkdown(note));

      expect(imported.root.children[0]).toMatchObject({
        type: "paragraph",
        children: [{ type: "text", text }],
      });
    }
  });

  it("round-trips fenced code containing internal backtick fences", () => {
    const text = ["before", "```", "after"].join("\n");
    const note = createNoteDocument(
      [
        {
          id: "code-1",
          type: "codeBlock",
          language: "md",
          text,
        },
      ],
      { id: "note-1", title: "Fence", tags: [] },
    );

    const imported = importMarkdown(exportMarkdown(note));

    expect(imported.root.children).toHaveLength(1);
    expect(imported.root.children[0]).toMatchObject({
      type: "codeBlock",
      language: "md",
      text,
    });
  });

  it("round-trips link titles containing escaped quotes", () => {
    const note = createNoteDocument(
      [
        {
          id: "paragraph-1",
          type: "paragraph",
          children: [
            {
              type: "text",
              text: "quoted link",
              marks: [
                {
                  type: "link",
                  href: "https://example.com",
                  title: 'say "hello"',
                },
              ],
            },
          ],
        },
      ],
      { id: "note-1", title: "Link title", tags: [] },
    );

    const imported = importMarkdown(exportMarkdown(note));

    expect(imported.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [
        {
          type: "text",
          text: "quoted link",
          marks: [
            {
              type: "link",
              href: "https://example.com",
              title: 'say "hello"',
            },
          ],
        },
      ],
    });
  });

  it("round-trips figure alt text and escaped image sources", () => {
    const note = createNoteDocument(
      [
        {
          id: "figure-1",
          type: "figure",
          src: "/assets/image).png",
          alt: "Figure [A]",
        },
      ],
      { id: "note-1", title: "Figure", tags: [] },
    );

    expect(exportMarkdown(note)).toBe(
      String.raw`![Figure \[A\]](/assets/image%29.png)`,
    );
    expect(importMarkdown(exportMarkdown(note)).root.children[0]).toMatchObject(
      {
        type: "figure",
        src: "/assets/image).png",
        alt: "Figure [A]",
      },
    );
  });
});
