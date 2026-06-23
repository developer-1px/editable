import { describe, expect, it } from "vitest";
import {
  type CursorGeometryAdapter,
  selectionFromCursorPoint,
} from "../cursorCommands";
import { selectionForRender } from "../richSelection";
import { translateEditorInput } from "./inputAdapter";
import {
  documentWithBlocks,
  documentWithText,
  expectHandled,
  rect,
} from "./inputAdapterTestUtils";

describe("translateEditorInput navigation keys", () => {
  it("translates ArrowLeft and ArrowRight to horizontal cursor commands", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const left = translateEditorInput(document, selection, {
      type: "keydown",
      key: "ArrowLeft",
    });
    const right = translateEditorInput(document, selection, {
      type: "keydown",
      key: "ArrowRight",
    });

    expectHandled(left);
    expectHandled(right);
    expect(left.patch).toEqual([]);
    expect(left.selectionAfter.focus).toMatchObject({ offset: 0 });
    expect(right.selectionAfter.focus).toMatchObject({ offset: 2 });
  });

  it("keeps ArrowLeft and ArrowRight character-based even with geometry", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 1, 18),
      pointFromCoordinates: () => ({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
      lineStartPoint: () => ({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
      lineEndPoint: () => ({
        path: "/root/children/0/children/0/text",
        offset: 4,
      }),
    };

    const left = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowLeft" },
      { geometry },
    );
    const right = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowRight" },
      { geometry },
    );

    expectHandled(left);
    expectHandled(right);
    expect(left.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(right.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });

  it("translates Alt/Option+ArrowLeft and ArrowRight to word cursor commands", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "one two" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
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

    const right = translateEditorInput(document, start, {
      type: "keydown",
      key: "ArrowRight",
      altKey: true,
    });
    const left = translateEditorInput(document, textEnd, {
      type: "keydown",
      key: "ArrowLeft",
      altKey: true,
    });
    const shiftRight = translateEditorInput(document, textEnd, {
      type: "keydown",
      key: "ArrowRight",
      shiftKey: true,
      altKey: true,
    });

    expectHandled(right);
    expectHandled(left);
    expectHandled(shiftRight);
    expect(right.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(left.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 4,
    });
    expect(shiftRight.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });
    expect(shiftRight.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(
      selectionForRender(document, shiftRight.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/0/children/1"]);
  });

  it("translates Alt/Option+ArrowUp and ArrowDown to block boundary commands", () => {
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
    ]);
    const insideText = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const firstBlockEnd = selectionFromCursorPoint({
      path: "/root/children/0",
      edge: "after",
    });
    const afterFigure = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "after",
    });

    const up = translateEditorInput(document, insideText, {
      type: "keydown",
      key: "ArrowUp",
      altKey: true,
    });
    const down = translateEditorInput(document, insideText, {
      type: "keydown",
      key: "ArrowDown",
      altKey: true,
    });
    const nextBlockEnd = translateEditorInput(document, firstBlockEnd, {
      type: "keydown",
      key: "ArrowDown",
      altKey: true,
    });
    const shiftUp = translateEditorInput(document, afterFigure, {
      type: "keydown",
      key: "ArrowUp",
      shiftKey: true,
      altKey: true,
    });

    expectHandled(up);
    expectHandled(down);
    expectHandled(nextBlockEnd);
    expectHandled(shiftUp);
    expect(up.selectionAfter.focus).toMatchObject({
      path: "/root/children/0",
      edge: "before",
    });
    expect(down.selectionAfter.focus).toMatchObject({
      path: "/root/children/0",
      edge: "after",
    });
    expect(nextBlockEnd.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(shiftUp.selectionAfter.anchor).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(shiftUp.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(
      selectionForRender(document, shiftUp.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/1"]);
  });

  it("translates Home and End to document boundary cursor commands", () => {
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
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const home = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Home",
    });
    const shiftEnd = translateEditorInput(document, selection, {
      type: "keydown",
      key: "End",
      shiftKey: true,
    });

    expectHandled(home);
    expectHandled(shiftEnd);
    expect(home.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(shiftEnd.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftEnd.selectionAfter.focus).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 1,
    });
    expect(shiftEnd.selectionAfter.selectedPointers).toEqual([]);
    expect(
      selectionForRender(document, shiftEnd.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/1"]);
  });

  it("uses line geometry for Home and End when available", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(20, 10, 1, 18),
      pointFromCoordinates: () => null,
      lineStartPoint: () => ({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      lineEndPoint: () => ({
        path: "/root/children/0/children/0/text",
        offset: 3,
      }),
    };

    const home = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "Home" },
      { geometry },
    );
    const shiftEnd = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "End", shiftKey: true },
      { geometry },
    );

    expectHandled(home);
    expectHandled(shiftEnd);
    expect(home.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftEnd.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
    expect(shiftEnd.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });

  it("translates Ctrl/Meta+ArrowLeft and ArrowRight to line boundary cursor commands", () => {
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
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const lineGeometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 1, 18),
      pointFromCoordinates: () => ({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      lineStartPoint: () => ({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
      lineEndPoint: () => ({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    };

    const metaLeft = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "ArrowLeft",
        metaKey: true,
      },
      { geometry: lineGeometry, platform: "mac" },
    );
    const ctrlRight = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "ArrowRight",
        ctrlKey: true,
      },
      { geometry: lineGeometry, platform: "other" },
    );
    const shiftMetaRight = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "ArrowRight",
        shiftKey: true,
        metaKey: true,
      },
      { geometry: lineGeometry, platform: "mac" },
    );
    const shiftCtrlLeft = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "ArrowLeft",
        shiftKey: true,
        ctrlKey: true,
      },
      { geometry: lineGeometry, platform: "other" },
    );
    const metaUp = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "ArrowUp",
        metaKey: true,
      },
      {
        platform: "mac",
        geometry: {
          rectForPoint: () => rect(10, 20, 1, 18),
          pointFromCoordinates: () => ({
            path: "/root/children/2/children/0/text",
            offset: 1,
          }),
        },
      },
    );
    const shiftCtrlDown = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "ArrowDown",
        shiftKey: true,
        ctrlKey: true,
      },
      {
        platform: "other",
        geometry: {
          rectForPoint: () => rect(10, 20, 1, 18),
          pointFromCoordinates: () => ({
            path: "/root/children/0",
            edge: "before",
          }),
        },
      },
    );

    expectHandled(metaLeft);
    expectHandled(ctrlRight);
    expectHandled(shiftMetaRight);
    expectHandled(shiftCtrlLeft);
    expectHandled(metaUp);
    expectHandled(shiftCtrlDown);
    expect(metaLeft.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(ctrlRight.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftMetaRight.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftMetaRight.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftCtrlLeft.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftCtrlLeft.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(metaUp.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(shiftCtrlDown.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftCtrlDown.selectionAfter.focus).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 1,
    });
    expect(
      selectionForRender(document, shiftMetaRight.selectionAfter)
        ?.selectedPointers,
    ).toEqual([]);
    expect(
      selectionForRender(document, shiftCtrlDown.selectionAfter)
        ?.selectedPointers,
    ).toEqual(["/root/children/1"]);
  });

  it("translates Shift+Arrow into headless range selection", () => {
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
    const selection = selectionFromCursorPoint({
      path: "/root/children/1",
      edge: "before",
    });

    const result = translateEditorInput(document, selection, {
      type: "keydown",
      key: "ArrowRight",
      shiftKey: true,
    });

    expectHandled(result);
    expect(result.selectionAfter.anchor).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
    expect(result.selectionAfter.selectedPointers).toEqual([]);
    expect(
      selectionForRender(document, result.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/1"]);
  });

  it("translates Shift+ArrowDown into headless range selection through geometry", () => {
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

    const result = translateEditorInput(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0",
        edge: "before",
      }),
      { type: "keydown", key: "ArrowDown", shiftKey: true },
      { geometry },
    );

    expectHandled(result);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0",
      edge: "after",
    });
    expect(result.selectionAfter.selectedPointers).toEqual([]);
    expect(
      selectionForRender(document, result.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/0"]);
  });

  it("translates ArrowUp and ArrowDown through the geometry adapter", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 2, 18),
      pointFromCoordinates: (_x, y) => ({
        path: "/root/children/0/children/0/text",
        offset: y < 20 ? 0 : 2,
      }),
    };

    const up = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowUp" },
      { geometry },
    );
    const down = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowDown" },
      { geometry },
    );

    expectHandled(up);
    expectHandled(down);
    expect(up.selectionAfter.focus).toMatchObject({ offset: 0 });
    expect(down.selectionAfter.focus).toMatchObject({ offset: 2 });
  });

  it("translates PageUp and PageDown through page geometry", () => {
    const document = documentWithText("ABCDE");
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 2,
      },
      { preferredX: 20 },
    );
    const calls: Array<{ x: number; y: number }> = [];
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 100, 2, 20),
      pointFromCoordinates(x, y) {
        calls.push({ x, y });
        return {
          path: "/root/children/0/children/0/text",
          offset: y < 100 ? 0 : 5,
        };
      },
      pageStep: () => 300,
    };

    const up = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "PageUp" },
      { geometry },
    );
    const down = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "PageDown", shiftKey: true },
      { geometry },
    );

    expectHandled(up);
    expectHandled(down);
    expect(calls).toEqual([
      { x: 20, y: -200 },
      { x: 20, y: 420 },
    ]);
    expect(up.selectionAfter.focus).toMatchObject({ offset: 0 });
    expect(down.selectionAfter.anchor).toMatchObject({ offset: 2 });
    expect(down.selectionAfter.focus).toMatchObject({ offset: 5 });
  });

  it("falls back to document boundaries for PageUp and PageDown without geometry", () => {
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

    const up = translateEditorInput(document, selection, {
      type: "keydown",
      key: "PageUp",
    });
    const down = translateEditorInput(document, selection, {
      type: "keydown",
      key: "PageDown",
      shiftKey: true,
    });

    expectHandled(up);
    expectHandled(down);
    expect(up.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(down.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(down.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 1,
    });
  });
});
