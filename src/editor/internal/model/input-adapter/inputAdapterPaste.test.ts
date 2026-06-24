import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { translateEditorInput } from "./inputAdapter";
import {
  blockPatchValue,
  documentWithBlocks,
  documentWithText,
  expectHandled,
} from "./inputAdapterTestUtils";

describe("translateEditorInput paste and transfer", () => {
  it("translates markdown transfer beforeinput paste and drop through the rich paste path", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    for (const inputType of ["insertFromPaste", "insertFromDrop"]) {
      const result = translateEditorInput(document, selection, {
        type: "beforeinput",
        inputType,
        data: "@[Ada](mention:user-ada)",
        format: "markdown",
      });

      expectHandled(result);
      expect(result.patch).toMatchObject([
        {
          op: "replace",
          path: "/root/children/0",
          value: {
            id: "block-1",
            type: "paragraph",
            children: [
              { type: "text", text: "A" },
              { type: "mention", id: "user-ada", label: "Ada" },
              { type: "text", text: "B" },
            ],
          },
        },
      ]);
      expect(result.selectionAfter.focus).toMatchObject({
        path: "/root/children/0/children/1",
        edge: "after",
      });
    }
  });

  it("translates plain text paste through the text insertion command", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "paste", text: " paste " },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "A paste B",
      },
    ]);
  });

  it("translates markdown-looking paste through the text insertion command", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      {
        type: "paste",
        text: "@[Ada](mention:user-ada)",
      },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "A@[Ada](mention:user-ada)B",
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 25,
    });
  });

  it("translates markdown paste of a mention into an inline atom", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      {
        type: "paste",
        text: "@[Ada](mention:user-ada)",
        format: "markdown",
      },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            { type: "mention", id: "user-ada", label: "Ada" },
            { type: "text", text: "B" },
          ],
        },
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
  });

  it("translates markdown paste of marked text and links into inline marks", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      {
        type: "paste",
        text: "**bold** _italic_ `code` [site](https://example.com)",
        format: "markdown",
      },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: " " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            { type: "text", text: " " },
            {
              type: "text",
              text: "site",
              marks: [{ type: "link", href: "https://example.com" }],
            },
            { type: "text", text: "B" },
          ],
        },
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/7/text",
      offset: 4,
    });
  });

  it("drops unsafe markdown paste link hrefs before writing marks", () => {
    const result = translateEditorInput(
      documentWithText(""),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
      {
        type: "paste",
        text: "[unsafe](javascript:alert) [safe](/docs/editor)",
        format: "markdown",
      },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
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
      },
    ]);
  });

  it("translates markdown paste of multiple blocks into document blocks", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      {
        type: "paste",
        text: "Alpha\n\nBeta",
        format: "markdown",
      },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { type: "paragraph", children: [{ type: "text", text: "A" }] },
          { type: "paragraph", children: [{ type: "text", text: "Alpha" }] },
          { type: "paragraph", children: [{ type: "text", text: "Beta" }] },
          { type: "paragraph", children: [{ type: "text", text: "B" }] },
        ],
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 4,
    });

    const blocks = blockPatchValue(result);
    expect(blocks.map((block) => block.id)).toHaveLength(
      new Set(blocks.map((block) => block.id)).size,
    );
    expect(
      blocks.slice(1, 3).every((block) => block.id.startsWith("md-")),
    ).toBe(false);
  });

  it("translates single fenced code markdown paste into a code block", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      {
        type: "paste",
        text: "```ts\nconst x = 1;\n```",
        format: "markdown",
      },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { type: "paragraph", children: [{ type: "text", text: "A" }] },
          { type: "codeBlock", language: "ts", text: "const x = 1;" },
          { type: "paragraph", children: [{ type: "text", text: "B" }] },
        ],
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/text",
      offset: "const x = 1;".length,
    });
  });

  it("translates paste over selected ranges to range replacement", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "AB" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "CD" },
        ],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/2/text", offset: 1 },
    );

    const result = translateEditorInput(document, selection, {
      type: "paste",
      text: "paste",
    });

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          children: [{ type: "text", text: "ApasteD" }],
        },
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 6,
    });
  });
});
