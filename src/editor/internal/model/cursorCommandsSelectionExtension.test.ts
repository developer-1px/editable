import { describe, expect, it } from "vitest";
import {
  moveBlockStart,
  moveLeft,
  moveRight,
  moveWordRight,
  selectionFromCursorPoint,
} from "./cursorCommands";
import { documentWithBlocks } from "./cursorCommandTestUtils";
import { selectionForRender } from "./richSelection";

describe("cursor selection extension commands", () => {
  it("extends selection through figure block atoms as one selected unit", () => {
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
    ]);
    const beforeFigure = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "before",
    });

    const selected = moveRight(document, beforeFigure, {
      extend: true,
    }).selectionAfter;
    const collapsed = moveLeft(document, selected, {
      extend: true,
    }).selectionAfter;

    expect(selected.anchor).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(selected.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(selected.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selected)?.selectedPointers).toEqual([
      "/root/children/1",
    ]);
    expect(collapsed.focus).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(collapsed.selectedPointers).toEqual([]);
  });

  it("extends selection through inline mention atoms as one selected unit", () => {
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
    const afterMention = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    const selected = moveLeft(document, afterMention, {
      extend: true,
    }).selectionAfter;

    expect(selected.anchor).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(selected.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    expect(selected.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selected)?.selectedPointers).toEqual([
      "/root/children/0/children/1",
    ]);
  });

  it("keeps the range anchor while extending through inline and block atoms", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "link" },
          { type: "text", text: " " },
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
        children: [{ type: "text", text: "After" }],
      },
    ]);
    let selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });

    for (let index = 0; index < 7; index += 1) {
      selection = moveRight(document, selection, {
        extend: true,
      }).selectionAfter;
    }

    expect(selection.selectionRanges[0]).toMatchObject({
      anchor: {
        path: "/root/children/0/children/0/text",
        offset: 3,
      },
      focus: {
        path: "/root/children/2/children/0/text",
        offset: 0,
      },
    });
    expect(selection.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selection)?.selectedPointers).toEqual([
      "/root/children/0/children/2",
      "/root/children/1",
    ]);

    selection = moveLeft(document, selection, { extend: true }).selectionAfter;

    expect(selection.selectionRanges[0]).toMatchObject({
      anchor: {
        path: "/root/children/0/children/0/text",
        offset: 3,
      },
      focus: {
        path: "/root/children/1",
        edge: "after",
      },
    });
    expect(selectionForRender(document, selection)?.selectedPointers).toEqual([
      "/root/children/0/children/2",
      "/root/children/1",
    ]);
  });

  it("extends word selection through atom nodes as selected units", () => {
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
    const beforeMention = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    const beforeFigure = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "before",
    });

    const mentionSelection = moveWordRight(document, beforeMention, {
      extend: true,
    }).selectionAfter;
    const figureSelection = moveWordRight(document, beforeFigure, {
      extend: true,
    }).selectionAfter;

    expect(mentionSelection.anchor).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    expect(mentionSelection.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(
      selectionForRender(document, mentionSelection)?.selectedPointers,
    ).toEqual(["/root/children/0/children/1"]);
    expect(figureSelection.anchor).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(figureSelection.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(
      selectionForRender(document, figureSelection)?.selectedPointers,
    ).toEqual(["/root/children/1"]);
  });

  it("extends block boundary selection through block atoms", () => {
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
    ]);
    const afterFigure = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "after",
    });

    const selected = moveBlockStart(document, afterFigure, {
      extend: true,
    }).selectionAfter;

    expect(selected.anchor).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(selected.focus).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(selectionForRender(document, selected)?.selectedPointers).toEqual([
      "/root/children/1",
    ]);
  });
});
