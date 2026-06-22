import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "./cursorCommands";
import { exportMarkdown, importMarkdown } from "./markdown";
import { createNoteDocument, type NoteDocument } from "./noteDocument";
import { insertText } from "./textCommands";

function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
}

describe("markdown adapter", () => {
  it("imports markdown into rich block and inline model nodes", () => {
    const note = importMarkdown(
      [
        "# Title",
        "",
        "A **bold** _italic_ `code` [link](https://example.com) @[Ada](mention:user-ada)",
        "",
        "> Quote",
        "",
        "- Item",
        "",
        "```ts",
        "const value = 1;",
        "```",
        "",
        "![Figure](https://example.com/figure.png)",
      ].join("\n"),
      { title: "Imported" },
    );

    expect(note).toMatchObject({
      title: "Imported",
      root: {
        children: [
          {
            type: "heading",
            level: 1,
            children: [{ type: "text", text: "Title" }],
          },
          {
            type: "paragraph",
            children: [
              { type: "text", text: "A " },
              { type: "text", text: "bold", marks: [{ type: "bold" }] },
              { type: "text", text: " " },
              { type: "text", text: "italic", marks: [{ type: "italic" }] },
              { type: "text", text: " " },
              { type: "text", text: "code", marks: [{ type: "code" }] },
              { type: "text", text: " " },
              {
                type: "text",
                text: "link",
                marks: [{ type: "link", href: "https://example.com" }],
              },
              { type: "text", text: " " },
              { type: "mention", id: "user-ada", label: "Ada" },
            ],
          },
          {
            type: "quote",
            children: [{ type: "text", text: "Quote" }],
          },
          {
            type: "listItem",
            ordered: false,
            depth: 0,
            children: [{ type: "text", text: "Item" }],
          },
          {
            type: "codeBlock",
            language: "ts",
            text: "const value = 1;",
          },
          {
            type: "figure",
            src: "https://example.com/figure.png",
            alt: "Figure",
          },
        ],
      },
    });
  });

  it("keeps import metadata options separate from heading content", () => {
    const note = importMarkdown("# Heading", {
      id: "custom-note",
      title: "Document title",
      tags: ["imported", "draft"],
    });

    expect(note).toMatchObject({
      id: "custom-note",
      title: "Document title",
      tags: ["imported", "draft"],
      root: {
        children: [
          {
            type: "heading",
            level: 1,
            children: [{ type: "text", text: "Heading" }],
          },
        ],
      },
    });
  });

  it("drops unsafe markdown link hrefs while preserving safe links", () => {
    expect(
      importMarkdown("[unsafe](javascript:alert) [safe](/docs/editor)"),
    ).toMatchObject({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", text: "unsafe " },
              {
                type: "text",
                text: "safe",
                marks: [{ type: "link", href: "/docs/editor" }],
              },
            ],
          },
        ],
      },
    });
  });

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

  it("keeps editor commands independent from markdown delimiter offsets", () => {
    const note = importMarkdown("**bold**");

    const command = insertText(
      note,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
      "x",
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "boxld",
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });

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

  it("keeps malformed percent escapes as literal link and mention targets", () => {
    expect(() => importMarkdown("[x](https://example.com/%zz)")).not.toThrow();
    expect(() => importMarkdown("@[Ada](mention:user-%zz)")).not.toThrow();

    expect(importMarkdown("[x](https://example.com/%zz)")).toMatchObject({
      root: {
        children: [
          {
            type: "paragraph",
            children: [
              {
                type: "text",
                text: "x",
                marks: [{ type: "link", href: "https://example.com/%zz" }],
              },
            ],
          },
        ],
      },
    });
    expect(importMarkdown("@[Ada](mention:user-%zz)")).toMatchObject({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "mention", id: "user-%zz", label: "Ada" }],
          },
        ],
      },
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
