import { describe, expect, it } from "vitest";
import {
  moveWordLeft,
  moveWordRight,
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import { documentWithBlocks } from "./cursorCommandTestUtils";

describe("cursor word movement commands", () => {
  it("collapses open ranges on plain word movement without moving by word", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "one two three" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 4 },
      { path: "/root/children/0/children/0/text", offset: 7 },
    );

    expect(
      moveWordLeft(document, selection).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 4,
    });
    expect(
      moveWordRight(document, selection).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });
  });

  it("moves by word boundaries and treats atom nodes as one word unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "one two" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const start = selectionFromCursorPoint({
      path: "/root/children/0",
      edge: "before",
    });
    const textEnd = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });
    const beforeFigure = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "before",
    });

    expect(moveWordRight(document, start).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(moveWordLeft(document, textEnd).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 4,
    });
    expect(moveWordRight(document, textEnd).selectionAfter.focus).toMatchObject(
      {
        path: "/root/children/0/children/1",
        edge: "after",
      },
    );
    expect(
      moveWordRight(document, beforeFigure).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("moves by word across punctuation and marked text run boundaries", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "one," },
          { type: "text", text: "two", marks: [{ type: "bold" }] },
          { type: "text", text: " three" },
        ],
      },
    ]);

    expect(
      moveWordRight(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: 0,
        }),
      ).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(
      moveWordRight(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: 3,
        }),
      ).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 3,
    });
    expect(
      moveWordLeft(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/1/text",
          offset: 0,
        }),
      ).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      moveWordRight(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/1/text",
          offset: 3,
        }),
      ).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/2/text",
      offset: 6,
    });
  });
});
