import { describe, expect, it } from "vitest";
import {
  type CursorGeometryAdapter,
  moveDown,
  movePageDown,
  movePageUp,
  moveUp,
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import { documentWithBlocks, rect } from "./cursorCommandTestUtils";
import { selectionForRender } from "./richSelection";

describe("cursor vertical and page movement commands", () => {
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
        return { path: "/root/children/0/children/0/text", offset: 6 };
      },
    };
    const selection = selectionFromCursorPoint(
      { path: "/root/children/0/children/0/text", offset: 2 },
      { preferredX: 42 },
    );

    const result = moveDown(document, selection, geometry).selectionAfter;

    expect(calls).toEqual([{ x: 42, y: 39 }]);
    expect(result.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 6,
    });
    expect(result.context).toEqual({ preferredX: 42 });
  });

  it("does not carry collapsed active marks through vertical movement", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "CD" }],
      },
    ]);
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 4, 18),
      pointFromCoordinates: () => ({
        path: "/root/children/1/children/0/text",
        offset: 1,
      }),
    };
    const selection = selectionFromCursorPoint(
      { path: "/root/children/0/children/0/text", offset: 1 },
      { activeMarks: [{ type: "bold" }] },
    );

    const result = moveDown(document, selection, geometry).selectionAfter;

    expect(result.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 1,
    });
    expect(result.context).toEqual({ preferredX: 12 });
  });

  it("collapses open ranges on plain vertical movement without moving past the range edge", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "abcdef" }],
      },
    ]);
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 4, 18),
      pointFromCoordinates: () => ({
        path: "/root/children/0/children/0/text",
        offset: 5,
      }),
    };
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const down = moveDown(document, selection, geometry).selectionAfter;
    const up = moveUp(document, selection, geometry).selectionAfter;

    expect(down.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(up.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
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
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const geometry = {
      rectForPoint: () => rect(10, 20, 1, 18),
      pointFromCoordinates: () => ({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      pointForVerticalMovement: () => ({
        path: "/root/children/1/children/0/text",
        offset: 1,
      }),
    };

    const result = moveDown(document, selection, geometry).selectionAfter;

    expect(result.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
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
          path: "/root/children/0/children/0/text",
          offset: y < 100 ? 0 : 10,
        };
      },
      pageStep: () => 240,
    };
    const selection = selectionFromCursorPoint(
      { path: "/root/children/0/children/0/text", offset: 5 },
      { preferredX: 42 },
    );

    const up = movePageUp(document, selection, geometry).selectionAfter;
    const down = movePageDown(document, selection, geometry).selectionAfter;

    expect(calls).toEqual([
      { x: 42, y: -140 },
      { x: 42, y: 358 },
    ]);
    expect(up.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(down.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
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
        return { path: "/root/children/0/children/0/text", offset: 0 };
      },
    };

    const result = moveUp(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
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
        path: "/root/children/0/children/1",
        edge: "after",
      }),
    };

    const result = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      geometry,
    ).selectionAfter;

    expect(result.focus).toMatchObject({
      path: "/root/children/0/children/1",
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
      pointFromCoordinates: () => ({
        path: "/root/children/1",
        edge: "before",
      }),
    };

    const result = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      geometry,
    ).selectionAfter;

    expect(result.focus).toMatchObject({
      path: "/root/children/1",
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
      pointFromCoordinates: () => ({ path: "/root/children/0", edge: "after" }),
    };

    const result = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0",
        edge: "before",
      }),
      geometry,
      { extend: true },
    ).selectionAfter;

    expect(result.anchor).toMatchObject({
      path: "/root/children/0",
      edge: "before",
    });
    expect(result.focus).toMatchObject({
      path: "/root/children/0",
      edge: "after",
    });
    expect(result.selectedPointers).toEqual([]);
    expect(selectionForRender(document, result)?.selectedPointers).toEqual([
      "/root/children/0",
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
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(
      moveUp(document, selection, geometry).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      moveDown(document, selection, geometry).selectionAfter.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });
});
