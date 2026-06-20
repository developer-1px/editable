import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "./cursorCommands";
import { exportMarkdown, importMarkdown } from "./markdown";
import type { NoteDocument } from "./noteDocument";
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
      blocks: [
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
    });
  });

  it("exports supported rich model shapes to stable markdown", () => {
    const note: NoteDocument = {
      id: "note-1",
      title: "Export",
      tags: [],
      blocks: [
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
    };

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
      exportMarkdown({
        id: "note-1",
        title: "Atoms",
        tags: [],
        blocks: [
          {
            id: "paragraph-1",
            type: "paragraph",
            children: [{ type: "mention", id: "user-ada", label: "Ada" }],
          },
          {
            id: "figure-1",
            type: "figure",
            src: "/logo192.png",
            alt: "Figure",
          },
        ],
      }),
    ).toBe("@[Ada](mention:user-ada)\n\n![Figure](/logo192.png)");
  });

  it("keeps editor commands independent from markdown delimiter offsets", () => {
    const note = importMarkdown("**bold**");

    const command = insertText(
      note,
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 2,
      }),
      "x",
    );

    expectOk(command);
    expect(command.patch).toEqual([
      { op: "replace", path: "/blocks/0/children/0/text", value: "boxld" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 3,
    });
  });
});
