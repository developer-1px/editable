import { describe, expect, it } from "vitest";
import {
  moveLeft,
  moveRight,
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import { documentWithBlocks } from "./cursorCommandTestUtils";

describe("cursor horizontal movement commands", () => {
  it("moves left and right through text offsets", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(moveLeft(document, selection).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(moveRight(document, selection).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("collapses open ranges on plain horizontal movement without moving past the range edge", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );
    const reversedSelection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 3 },
      { path: "/root/children/0/children/0/text", offset: 1 },
    );

    expect(moveLeft(document, selection).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(moveRight(document, selection).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(
      moveLeft(document, reversedSelection).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(
      moveRight(document, reversedSelection).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });

  it("keeps movement affinity when collapsing an open range", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCDE" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    expect(moveRight(document, selection).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
      affinity: "backward",
    });
    expect(moveLeft(document, selection).selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
      affinity: "forward",
    });
  });

  it("collapses selected empty blocks to their own caret instead of skipping to the next block", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0", edge: "before" },
      { path: "/root/children/0", edge: "after" },
    );

    const right = moveRight(document, selection).selectionAfter;
    const left = moveLeft(document, selection).selectionAfter;

    expect(right.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(left.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("keeps movement direction as affinity while moving by character", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABC" }],
      },
    ]);

    const right = moveRight(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    ).selectionAfter;
    const left = moveLeft(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 3,
      }),
    ).selectionAfter;

    expect(right.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "backward",
    });
    expect(left.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "forward",
    });
  });

  it("keeps movement direction as affinity when entering a wrapped boundary", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const fromPreviousCharacter = moveRight(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    ).selectionAfter;
    const fromNextCharacter = moveLeft(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 3,
      }),
    ).selectionAfter;

    expect(fromPreviousCharacter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "backward",
    });
    expect(fromNextCharacter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "forward",
    });
  });

  it("moves through inline mention atoms as one unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B" },
        ],
      },
    ]);
    const beforeMention = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    const afterMention = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    expect(
      moveRight(document, beforeMention).selectionAfter.focus,
    ).toMatchObject({ path: "/root/children/0/children/1", edge: "after" });
    expect(moveLeft(document, afterMention).selectionAfter.focus).toMatchObject(
      {
        path: "/root/children/0/children/1",
        edge: "before",
      },
    );
  });

  it("moves through figure block atoms as one unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);
    const beforeFigure = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "before",
    });
    const afterFigure = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "after",
    });

    expect(
      moveRight(document, beforeFigure).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(moveLeft(document, afterFigure).selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
  });

  it("clears vertical movement context on horizontal commands", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const selection = selectionFromCursorPoint(
      { path: "/root/children/0/children/0/text", offset: 1 },
      { preferredX: 120 },
    );

    expect(
      moveLeft(document, selection).selectionAfter.context,
    ).toBeUndefined();
    expect(
      moveRight(document, selection).selectionAfter.context,
    ).toBeUndefined();
  });
});
