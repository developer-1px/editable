import { describe, expect, it } from "vitest";
import {
  type CursorPoint,
  cursorLength,
  firstCursorPoint,
  lastCursorPoint,
  moveCursor,
  resolveCursorIndex,
} from "./cursor";
import { documentWithBlocks } from "./cursorTestUtils";

describe("cursor stream boundaries", () => {
  it("keeps a raw empty inline block in the cursor stream", () => {
    const document = documentWithBlocks([
      { id: "empty", type: "paragraph", children: [] },
      {
        id: "next",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    expect(firstCursorPoint(document)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(lastCursorPoint(document)).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 1,
    });
  });

  it("collapses adjacent formatted text run boundaries into one cursor position", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "text", text: "B", marks: [{ type: "bold" }] },
          { type: "text", text: "C", marks: [{ type: "italic" }] },
        ],
      },
    ]);

    expect(cursorLength(document)).toBe(3);
    expect(
      resolveCursorIndex(document, {
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    ).toBe(
      resolveCursorIndex(document, {
        path: "/root/children/0/children/1/text",
        offset: 0,
      }),
    );
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 1,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/1/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("treats sss <bold>dd </bold> ddd mark edges as shared cursor boundaries", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "sss " },
          { type: "text", text: "dd ", marks: [{ type: "bold" }] },
          { type: "text", text: " ddd" },
        ],
      },
    ]);
    const beforeBold = {
      path: "/root/children/0/children/0/text",
      offset: 4,
    } satisfies CursorPoint;
    const boldStart = {
      path: "/root/children/0/children/1/text",
      offset: 0,
    } satisfies CursorPoint;
    const afterBold = {
      path: "/root/children/0/children/1/text",
      offset: 3,
    } satisfies CursorPoint;
    const afterBoldTextStart = {
      path: "/root/children/0/children/2/text",
      offset: 0,
    } satisfies CursorPoint;

    expect(resolveCursorIndex(document, beforeBold)).toBe(
      resolveCursorIndex(document, boldStart),
    );
    expect(resolveCursorIndex(document, afterBold)).toBe(
      resolveCursorIndex(document, afterBoldTextStart),
    );
    expect(moveCursor(document, beforeBold, "forward")).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 1,
    });
    expect(moveCursor(document, boldStart, "backward")).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(moveCursor(document, afterBold, "forward")).toMatchObject({
      path: "/root/children/0/children/2/text",
      offset: 1,
    });
    expect(moveCursor(document, afterBoldTextStart, "backward")).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 2,
    });
  });

  it("moves between text blocks without structural block-edge stops", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    expect(firstCursorPoint(document)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0", edge: "after" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/1", edge: "before" },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("keeps rich text blocks on the same cursor stream contract", () => {
    const document = documentWithBlocks([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "Hi" }],
      },
      {
        id: "quote-1",
        type: "quote",
        children: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "Item" }],
      },
      {
        id: "code-1",
        type: "codeBlock",
        text: "x = 1",
      },
    ]);

    expect(firstCursorPoint(document)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 2 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "before",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/1", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "before",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/1/children/0", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "after",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/2/children/0/text", offset: 4 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/3/text",
      offset: 0,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/3/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 4,
    });
    expect(lastCursorPoint(document)).toMatchObject({
      path: "/root/children/3/text",
      offset: 5,
    });
  });
});
