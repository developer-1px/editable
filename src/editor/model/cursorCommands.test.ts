import { describe, expect, it } from "vitest";
import {
  type CursorGeometryAdapter,
  moveBlockEnd,
  moveBlockStart,
  moveDown,
  moveEnd,
  moveLeft,
  movePageDown,
  movePageUp,
  moveRight,
  moveStart,
  moveUp,
  moveVisualLeft,
  moveVisualRight,
  moveWordLeft,
  moveWordRight,
  selectAll,
  selectionFromCursorPoint,
} from "./cursorCommands";
import type { NoteDocument } from "./noteDocument";
import { selectionForRender } from "./richSelection";

function documentWithBlocks(blocks: NoteDocument["blocks"]): NoteDocument {
  return {
    id: "note-test",
    title: "Cursor",
    tags: [],
    blocks,
  };
}

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return { left, top, width, height };
    },
  } as DOMRect;
}

describe("cursor commands", () => {
  it("moves left and right through text offsets", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const selection = selectionFromCursorPoint({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });

    expect(moveLeft(document, selection).selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 0,
    });
    expect(moveRight(document, selection).selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 2,
    });
  });

  it("uses visual horizontal geometry before advancing the logical offset", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABC" }],
      },
    ]);
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(30, 10, 1, 20),
      pointFromCoordinates: () => null,
      pointForHorizontalMovement: (_origin, direction) => ({
        path: "/blocks/0/children/0/text",
        offset: 2,
        affinity: direction === "forward" ? "forward" : "backward",
      }),
    };

    const right = moveVisualRight(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 2,
        affinity: "backward",
      }),
      geometry,
    ).selectionAfter;
    const left = moveVisualLeft(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 2,
        affinity: "forward",
      }),
      geometry,
    ).selectionAfter;

    expect(right.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 2,
      affinity: "forward",
    });
    expect(left.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 2,
      affinity: "backward",
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
      path: "/blocks/0/children/1",
      edge: "before",
    });
    const afterMention = selectionFromCursorPoint({
      path: "/blocks/0/children/1",
      edge: "after",
    });

    expect(
      moveRight(document, beforeMention).selectionAfter.focus,
    ).toMatchObject({ path: "/blocks/0/children/1", edge: "after" });
    expect(moveLeft(document, afterMention).selectionAfter.focus).toMatchObject(
      {
        path: "/blocks/0/children/1",
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
      path: "/blocks/1",
      edge: "before",
    });
    const afterFigure = selectionFromCursorPoint({
      path: "/blocks/1",
      edge: "after",
    });

    expect(
      moveRight(document, beforeFigure).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
    expect(moveLeft(document, afterFigure).selectionAfter.focus).toMatchObject({
      path: "/blocks/1",
      edge: "before",
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
      path: "/blocks/0",
      edge: "before",
    });
    const textEnd = selectionFromCursorPoint({
      path: "/blocks/0/children/0/text",
      offset: 7,
    });
    const beforeFigure = selectionFromCursorPoint({
      path: "/blocks/1",
      edge: "before",
    });

    expect(moveWordRight(document, start).selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 3,
    });
    expect(moveWordLeft(document, textEnd).selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 4,
    });
    expect(moveWordRight(document, textEnd).selectionAfter.focus).toMatchObject(
      {
        path: "/blocks/0/children/1",
        edge: "after",
      },
    );
    expect(
      moveWordRight(document, beforeFigure).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
  });

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
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
    const firstBlockEnd = selectionFromCursorPoint({
      path: "/blocks/0",
      edge: "after",
    });
    const figureAfter = selectionFromCursorPoint({
      path: "/blocks/1",
      edge: "after",
    });

    expect(
      moveBlockStart(document, insideText).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/0",
      edge: "before",
    });
    expect(
      moveBlockEnd(document, insideText).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/0",
      edge: "after",
    });
    expect(
      moveBlockEnd(document, firstBlockEnd).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
    expect(
      moveBlockStart(document, figureAfter).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/1",
      edge: "before",
    });
    expect(
      moveBlockEnd(document, figureAfter).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/2",
      edge: "after",
    });
  });

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
      path: "/blocks/1",
      edge: "before",
    });

    const selected = moveRight(document, beforeFigure, {
      extend: true,
    }).selectionAfter;
    const collapsed = moveLeft(document, selected, {
      extend: true,
    }).selectionAfter;

    expect(selected.anchor).toMatchObject({
      path: "/blocks/1",
      edge: "before",
    });
    expect(selected.focus).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
    expect(selected.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selected)?.selectedPointers).toEqual([
      "/blocks/1",
    ]);
    expect(collapsed.focus).toMatchObject({
      path: "/blocks/1",
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
      path: "/blocks/0/children/1",
      edge: "after",
    });

    const selected = moveLeft(document, afterMention, {
      extend: true,
    }).selectionAfter;

    expect(selected.anchor).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
    expect(selected.focus).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "before",
    });
    expect(selected.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selected)?.selectedPointers).toEqual([
      "/blocks/0/children/1",
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
      path: "/blocks/0/children/1",
      edge: "before",
    });
    const beforeFigure = selectionFromCursorPoint({
      path: "/blocks/1",
      edge: "before",
    });

    const mentionSelection = moveWordRight(document, beforeMention, {
      extend: true,
    }).selectionAfter;
    const figureSelection = moveWordRight(document, beforeFigure, {
      extend: true,
    }).selectionAfter;

    expect(mentionSelection.anchor).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "before",
    });
    expect(mentionSelection.focus).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
    expect(
      selectionForRender(document, mentionSelection)?.selectedPointers,
    ).toEqual(["/blocks/0/children/1"]);
    expect(figureSelection.anchor).toMatchObject({
      path: "/blocks/1",
      edge: "before",
    });
    expect(figureSelection.focus).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
    expect(
      selectionForRender(document, figureSelection)?.selectedPointers,
    ).toEqual(["/blocks/1"]);
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
      path: "/blocks/1",
      edge: "after",
    });

    const selected = moveBlockStart(document, afterFigure, {
      extend: true,
    }).selectionAfter;

    expect(selected.anchor).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
    expect(selected.focus).toMatchObject({
      path: "/blocks/1",
      edge: "before",
    });
    expect(selectionForRender(document, selected)?.selectedPointers).toEqual([
      "/blocks/1",
    ]);
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
      path: "/blocks/0/children/0/text",
      offset: 1,
    });

    const toStart = moveStart(document, selection, {
      extend: true,
    }).selectionAfter;
    const toEnd = moveEnd(document, selection, {
      extend: true,
    }).selectionAfter;

    expect(toStart.anchor).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
    expect(toStart.focus).toMatchObject({
      path: "/blocks/0",
      edge: "before",
    });
    expect(toStart.selectedPointers).toEqual([]);
    expect(toEnd.focus).toMatchObject({
      path: "/blocks/2",
      edge: "after",
    });
    expect(selectionForRender(document, toEnd)?.selectedPointers).toEqual([
      "/blocks/0/children/1",
      "/blocks/1",
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
      path: "/blocks/0",
      edge: "before",
    });
    expect(selection.focus).toMatchObject({
      path: "/blocks/2",
      edge: "after",
    });
    expect(selection.selectedPointers).toEqual([]);
    expect(selectionForRender(document, selection)?.selectedPointers).toEqual([
      "/blocks/0/children/1",
      "/blocks/1",
    ]);
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
      { path: "/blocks/0/children/0/text", offset: 1 },
      { preferredX: 120 },
    );

    expect(
      moveLeft(document, selection).selectionAfter.context,
    ).toBeUndefined();
    expect(
      moveRight(document, selection).selectionAfter.context,
    ).toBeUndefined();
  });

  it("moves vertically to geometry-selected text offsets and preserves preferredX", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "wrapped text" }],
      },
    ]);
    const calls: Array<{ x: number; y: number }> = [];
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 4, 18),
      pointFromCoordinates(x, y) {
        calls.push({ x, y });
        return { path: "/blocks/0/children/0/text", offset: 6 };
      },
    };
    const selection = selectionFromCursorPoint(
      { path: "/blocks/0/children/0/text", offset: 2 },
      { preferredX: 42 },
    );

    const result = moveDown(document, selection, geometry).selectionAfter;

    expect(calls).toEqual([{ x: 42, y: 39 }]);
    expect(result.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 6,
    });
    expect(result.context).toEqual({ preferredX: 42 });
  });

  it("uses directional line geometry so ArrowDown does not land on the current line again", () => {
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
    const selection = selectionFromCursorPoint({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
    const geometry = {
      rectForPoint: () => rect(10, 20, 1, 18),
      pointFromCoordinates: () => ({
        path: "/blocks/0/children/0/text",
        offset: 1,
      }),
      pointForVerticalMovement: () => ({
        path: "/blocks/1/children/0/text",
        offset: 1,
      }),
    };

    const result = moveDown(document, selection, geometry).selectionAfter;

    expect(result.focus).toMatchObject({
      path: "/blocks/1/children/0/text",
      offset: 1,
    });
  });

  it("moves page up and down by the geometry page step", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "wrapped text" }],
      },
    ]);
    const calls: Array<{ x: number; y: number }> = [];
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 100, 4, 18),
      pointFromCoordinates(x, y) {
        calls.push({ x, y });
        return {
          path: "/blocks/0/children/0/text",
          offset: y < 100 ? 0 : 10,
        };
      },
      pageStep: () => 240,
    };
    const selection = selectionFromCursorPoint(
      { path: "/blocks/0/children/0/text", offset: 5 },
      { preferredX: 42 },
    );

    const up = movePageUp(document, selection, geometry).selectionAfter;
    const down = movePageDown(document, selection, geometry).selectionAfter;

    expect(calls).toEqual([
      { x: 42, y: -140 },
      { x: 42, y: 358 },
    ]);
    expect(up.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 0,
    });
    expect(down.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 10,
    });
    expect(down.context).toEqual({ preferredX: 42 });
  });

  it("starts vertical movement with the current caret x when preferredX is absent", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const calls: Array<{ x: number; y: number }> = [];
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 6, 18),
      pointFromCoordinates(x, y) {
        calls.push({ x, y });
        return { path: "/blocks/0/children/0/text", offset: 0 };
      },
    };

    const result = moveUp(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 1,
      }),
      geometry,
    ).selectionAfter;

    expect(calls).toEqual([{ x: 13, y: 19 }]);
    expect(result.context).toEqual({ preferredX: 13 });
  });

  it("moves vertically across mention chips as one cursor unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 1, 18),
      pointFromCoordinates: () => ({
        path: "/blocks/0/children/1",
        edge: "after",
      }),
    };

    const result = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 1,
      }),
      geometry,
    ).selectionAfter;

    expect(result.focus).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
  });

  it("moves vertically across figures before or after the block atom", () => {
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
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 1, 18),
      pointFromCoordinates: () => ({ path: "/blocks/1", edge: "before" }),
    };

    const result = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 1,
      }),
      geometry,
    ).selectionAfter;

    expect(result.focus).toMatchObject({
      path: "/blocks/1",
      edge: "before",
    });
  });

  it("extends vertical selection through figures when geometry lands after the atom", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 100, 1),
      pointFromCoordinates: () => ({ path: "/blocks/0", edge: "after" }),
    };

    const result = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0",
        edge: "before",
      }),
      geometry,
      { extend: true },
    ).selectionAfter;

    expect(result.anchor).toMatchObject({
      path: "/blocks/0",
      edge: "before",
    });
    expect(result.focus).toMatchObject({
      path: "/blocks/0",
      edge: "after",
    });
    expect(result.selectedPointers).toEqual([]);
    expect(selectionForRender(document, result)?.selectedPointers).toEqual([
      "/blocks/0",
    ]);
  });

  it("clamps vertical movement beyond document bounds", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
    ]);
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 1, 18),
      pointFromCoordinates: () => null,
    };
    const selection = selectionFromCursorPoint({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });

    expect(
      moveUp(document, selection, geometry).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/0",
      edge: "before",
    });
    expect(
      moveDown(document, selection, geometry).selectionAfter.focus,
    ).toMatchObject({
      path: "/blocks/0",
      edge: "after",
    });
  });
});
