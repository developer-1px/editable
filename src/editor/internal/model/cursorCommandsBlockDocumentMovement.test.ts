import { describe, expect, it } from "vitest";
import {
  moveBlockEnd,
  moveBlockStart,
  moveEnd,
  moveLeft,
  moveRight,
  moveStart,
  selectAll,
  selectionFromCursorPoint,
} from "./cursorCommands";
import { documentWithBlocks } from "./cursorCommandTestUtils";
import { selectionForRender } from "./richSelection";

describe("cursor block and document movement commands", () => {
  it("moves to block boundaries without view geometry", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
      {
        id: "code-1",
        type: "codeBlock",
        text: "const value = 1;",
      },
    ]);
    const insideText = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const firstBlockEnd = selectionFromCursorPoint({
      path: "/root/children/0",
      edge: "after",
    });
    const figureAfter = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "after",
    });

    expect(
      moveBlockStart(document, insideText).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0",
      edge: "before",
    });
    expect(
      moveBlockEnd(document, insideText).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0",
      edge: "after",
    });
    expect(
      moveBlockEnd(document, firstBlockEnd).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(
      moveBlockStart(document, figureAfter).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(
      moveBlockEnd(document, figureAfter).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/2",
      edge: "after",
    });
  });

  it("keeps the same caret at document boundaries", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
    ]);
    const start = moveStart(document).selectionAfter;
    const end = moveEnd(document).selectionAfter;

    expect(moveLeft(document, start).selectionAfter.focus).toEqual(start.focus);
    expect(moveRight(document, end).selectionAfter.focus).toEqual(end.focus);
  });

  it("extends selection to document start and end", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
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
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const toStart = moveStart(document, selection, {
      extend: true,
    }).selectionAfter;
    const toEnd = moveEnd(document, selection, {
      extend: true,
    }).selectionAfter;

    expect(toStart.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(toStart.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(toStart.selectedPointers).toEqual([]);
    expect(toEnd.focus).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 1,
    });
    expect(selectionForRender(document, toEnd)?.selectedPointers).toEqual([
      "/root/children/0/children/1",
      "/root/children/1",
    ]);
  });

  it("selects the whole document without source selected pointers", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
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

    const selection = selectAll(document).selectionAfter;

    expect(selection.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(selection.focus).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 1,
    });
    expect(selection.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selection)?.selectedPointers).toEqual([
      "/root/children/0/children/1",
      "/root/children/1",
    ]);
  });
});
