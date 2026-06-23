import { describe, expect, it } from "vitest";
import { exportMarkdown, importMarkdown } from "./markdown";
import { createNoteDocument, type NoteDocument } from "./noteDocument";

describe("markdown export adapter", () => {
  it("exports supported rich model shapes to stable markdown", () => {
    const note = createNoteDocument(
      [
        {
          id: "heading-1",
          type: "heading",
          level: 2,
          children: [{ type: "text", text: "Heading" }],
        },
        {
          id: "paragraph-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Hello " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "mention", id: "user-ada", label: "Ada" },
            { type: "text", text: " " },
            {
              type: "text",
              text: "site",
              marks: [{ type: "link", href: "https://example.com" }],
            },
          ],
        },
        {
          id: "list-1",
          type: "listItem",
          ordered: true,
          depth: 1,
          children: [{ type: "text", text: "Nested" }],
        },
        {
          id: "code-1",
          type: "codeBlock",
          language: "ts",
          text: "const value = 1;",
        },
        {
          id: "figure-1",
          type: "figure",
          src: "https://example.com/figure.png",
          alt: "Figure",
        },
      ],
      { id: "note-1", title: "Export", tags: [] },
    );

    const markdown = exportMarkdown(note);

    expect(markdown).toBe(
      [
        "## Heading",
        "",
        "Hello **bold** @[Ada](mention:user-ada) [site](https://example.com)",
        "",
        "  1. Nested",
        "",
        "```ts",
        "const value = 1;",
        "```",
        "",
        "![Figure](https://example.com/figure.png)",
      ].join("\n"),
    );
    expect(exportMarkdown(importMarkdown(markdown))).toBe(markdown);
  });

  it("uses deterministic markdown fallback syntax for mention and figure atoms", () => {
    expect(
      exportMarkdown(
        createNoteDocument(
          [
            {
              id: "paragraph-1",
              type: "paragraph",
              children: [{ type: "mention", id: "user-ada", label: "Ada" }],
            },
            {
              id: "figure-1",
              type: "figure",
              src: "/sample-figure.svg",
              alt: "Figure",
            },
          ],
          { id: "note-1", title: "Atoms", tags: [] },
        ),
      ),
    ).toBe("@[Ada](mention:user-ada)\n\n![Figure](/sample-figure.svg)");
  });

  it("does not encode attrs as markdown extension data", () => {
    const note: NoteDocument = {
      schemaVersion: 1,
      id: "note-1",
      title: "Extension data",
      tags: [],
      attrs: { owner: "attrs-document" },
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        attrs: { outline: "attrs-root" },
        children: [
          {
            id: "paragraph-1",
            kind: "element",
            type: "paragraph",
            flow: "block",
            attrs: { section: "attrs-block" },
            children: [
              {
                kind: "text",
                type: "text",
                text: "Hello",
                marks: [{ type: "bold", attrs: { source: "attrs-mark" } }],
              },
              { kind: "text", type: "text", text: " " },
              {
                id: "user-ada",
                kind: "atom",
                type: "mention",
                flow: "inline",
                label: "Ada",
                attrs: { source: "attrs-mention" },
              },
            ],
          },
          {
            id: "figure-1",
            kind: "atom",
            type: "figure",
            flow: "block",
            src: "/sample-figure.svg",
            alt: "Figure",
            attrs: { source: "attrs-figure" },
          },
        ],
      },
    };

    const markdown = exportMarkdown(note);

    expect(markdown).toBe(
      "**Hello** @[Ada](mention:user-ada)\n\n![Figure](/sample-figure.svg)",
    );
    expect(markdown).not.toContain("attrs-document");
    expect(markdown).not.toContain("attrs-root");
    expect(markdown).not.toContain("attrs-block");
    expect(markdown).not.toContain("attrs-mark");
    expect(markdown).not.toContain("attrs-mention");
    expect(markdown).not.toContain("attrs-figure");

    const imported = importMarkdown(markdown, {
      id: "note-1",
      title: "Extension data",
      tags: [],
    });
    const paragraph = imported.root.children[0];
    const figure = imported.root.children[1];

    expect(JSON.stringify(imported)).not.toContain("attrs-");
    expect("attrs" in imported).toBe(false);
    expect("attrs" in imported.root).toBe(false);
    expect(paragraph).toMatchObject({ type: "paragraph" });
    expect(paragraph === undefined || "attrs" in paragraph).toBe(false);
    expect(figure).toMatchObject({ type: "figure" });
    expect(figure === undefined || "attrs" in figure).toBe(false);
    if (paragraph?.type === "paragraph") {
      const [text, space, mention] = paragraph.children;
      expect(text).toMatchObject({
        type: "text",
        text: "Hello",
        marks: [{ type: "bold" }],
      });
      expect(text === undefined || "attrs" in text).toBe(false);
      expect(text?.type === "text" && "attrs" in (text.marks?.[0] ?? {})).toBe(
        false,
      );
      expect(space).toMatchObject({ type: "text", text: " " });
      expect(mention).toMatchObject({
        type: "mention",
        id: "user-ada",
        label: "Ada",
        attrs: { label: "Ada" },
      });
    }
  });

  it("exports code blocks from the canonical text field", () => {
    const note = createNoteDocument(
      [
        {
          id: "code-1",
          type: "codeBlock",
          language: "ts",
          text: "const current = 1;",
          children: [{ type: "text", text: "legacy child" }],
        },
      ],
      { id: "note-1", title: "Fence", tags: [] },
    );

    expect(exportMarkdown(note)).toBe(
      ["```ts", "const current = 1;", "```"].join("\n"),
    );
  });
});
