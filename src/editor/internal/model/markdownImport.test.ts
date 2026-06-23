import { describe, expect, it } from "vitest";
import { importMarkdown } from "./markdown";

describe("markdown import adapter", () => {
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

  it("drops unsafe markdown figure sources while preserving alt text", () => {
    expect(
      importMarkdown(
        [
          "![Unsafe javascript](javascript:alert)",
          "![Unsafe data](data:image/png;base64,AAAA)",
          "![](blob:https://example.com/id)",
          "![Unsafe external svg](https://example.com/icon.svg)",
          "![Safe relative](/sample-figure.svg)",
          "![Safe remote](https://example.com/image.png)",
        ].join("\n\n"),
      ),
    ).toMatchObject({
      root: {
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "Unsafe javascript" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Unsafe data" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", text: "Unsafe external svg" }],
          },
          {
            type: "figure",
            src: "/sample-figure.svg",
            alt: "Safe relative",
          },
          {
            type: "figure",
            src: "https://example.com/image.png",
            alt: "Safe remote",
          },
        ],
      },
    });
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
});
