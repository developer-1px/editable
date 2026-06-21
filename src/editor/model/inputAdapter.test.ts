import { describe, expect, it } from "vitest";
import {
  type CursorGeometryAdapter,
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import { type EditorInputResult, translateEditorInput } from "./inputAdapter";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";
import { selectionForRender } from "./richSelection";

function documentWithText(text: string): NoteDocument {
  return createNoteDocument(
    [
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text }],
      },
    ],
    {
      id: "note-test",
      title: "Input",
      tags: [],
    },
  );
}

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Input",
    tags: [],
  });
}

function expectHandled(
  result: EditorInputResult,
): asserts result is Extract<EditorInputResult, { handled: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected handled input result.");
  }
  expect(result.handled).toBe(true);
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

describe("translateEditorInput", () => {
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
      path: "/root/children/0",
      edge: "before",
    });
    expect(shiftEnd.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftEnd.selectionAfter.focus).toMatchObject({
      path: "/root/children/2",
      edge: "after",
    });
    expect(shiftEnd.selectionAfter.selectedPointers).toEqual([]);
    expect(
      selectionForRender(document, shiftEnd.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/1"]);
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
      { geometry: lineGeometry },
    );
    const ctrlRight = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "ArrowRight",
        ctrlKey: true,
      },
      { geometry: lineGeometry },
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
      { geometry: lineGeometry },
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
      { geometry: lineGeometry },
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
      path: "/root/children/0",
      edge: "before",
    });
    expect(shiftCtrlDown.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftCtrlDown.selectionAfter.focus).toMatchObject({
      path: "/root/children/2",
      edge: "after",
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

  it("translates Ctrl+A and Meta+A to headless select-all", () => {
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

    const ctrl = translateEditorInput(document, selection, {
      type: "keydown",
      key: "a",
      ctrlKey: true,
    });
    const meta = translateEditorInput(document, selection, {
      type: "keydown",
      key: "a",
      metaKey: true,
    });

    expectHandled(ctrl);
    expectHandled(meta);
    expect(ctrl.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0",
      edge: "before",
    });
    expect(ctrl.selectionAfter.focus).toMatchObject({
      path: "/root/children/2",
      edge: "after",
    });
    expect(ctrl.selectionAfter.selectedPointers).toEqual([]);
    expect(
      selectionForRender(document, ctrl.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/0/children/1", "/root/children/1"]);
    expect(meta.selectionAfter).toEqual(ctrl.selectionAfter);
  });

  it("translates Ctrl/Meta+B and I to headless mark commands", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const bold = translateEditorInput(document, selection, {
      type: "keydown",
      key: "b",
      ctrlKey: true,
    });
    const italic = translateEditorInput(document, selection, {
      type: "keydown",
      key: "i",
      metaKey: true,
    });

    expectHandled(bold);
    expectHandled(italic);
    expect(bold.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "bold" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
    expect(italic.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "italic" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("translates Ctrl/Meta+E and K to headless code and link mark commands", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: "https://openai.com" },
    );

    const code = translateEditorInput(document, selection, {
      type: "keydown",
      key: "e",
      ctrlKey: true,
    });
    const link = translateEditorInput(document, selection, {
      type: "keydown",
      key: "k",
      metaKey: true,
    });

    expectHandled(code);
    expectHandled(link);
    expect(code.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "code" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
    expect(link.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          {
            type: "text",
            text: "BC",
            marks: [{ type: "link", href: "https://openai.com" }],
          },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("translates collapsed Ctrl+B to active mark selection context", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "keydown", key: "b", ctrlKey: true },
    );

    expectHandled(result);
    expect(result.patch).toEqual([]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(result.selectionAfter.context).toEqual({
      activeMarks: [{ type: "bold" }],
    });
  });

  it("translates collapsed Ctrl+E and K to active mark selection context", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
      { pendingLinkHref: "https://openai.com" },
    );

    const code = translateEditorInput(document, selection, {
      type: "keydown",
      key: "e",
      ctrlKey: true,
    });
    const link = translateEditorInput(document, selection, {
      type: "keydown",
      key: "k",
      ctrlKey: true,
    });

    expectHandled(code);
    expectHandled(link);
    expect(code.patch).toEqual([]);
    expect(link.patch).toEqual([]);
    expect(code.selectionAfter.context).toEqual({
      pendingLinkHref: "https://openai.com",
      activeMarks: [{ type: "code" }],
    });
    expect(link.selectionAfter.context).toEqual({
      pendingLinkHref: "https://openai.com",
      activeMarks: [{ type: "link", href: "https://openai.com" }],
    });
  });

  it("translates Tab and Shift+Tab to list depth commands", () => {
    const document = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 1,
        children: [{ type: "text", text: "Item" }],
      },
    ]);
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });

    const indent = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Tab",
    });
    const outdent = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Tab",
      shiftKey: true,
    });

    expectHandled(indent);
    expectHandled(outdent);
    expect(indent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/depth", value: 2 },
    ]);
    expect(outdent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/depth", value: 0 },
    ]);
    expect(indent.selectionAfter).toBe(selection);
  });

  it("translates Tab outside lists to text insertion instead of DOM focus movement", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "keydown", key: "Tab" },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "A\tB",
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
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
      path: "/root/children/0",
      edge: "before",
    });
    expect(down.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(down.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("translates plain text beforeinput to insertText", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "beforeinput", inputType: "insertText", data: "x" },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
  });

  it("translates browser text insertion beforeinput variants to insertText", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const replacement = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertReplacementText",
      data: "x",
    });
    const paste = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertFromPaste",
      data: "paste",
    });
    const drop = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertFromDrop",
      data: "drop",
    });

    expectHandled(replacement);
    expectHandled(paste);
    expectHandled(drop);
    expect(replacement.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
    expect(paste.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "ApasteB",
      },
    ]);
    expect(drop.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "AdropB",
      },
    ]);
  });

  it("translates line break beforeinput through the split command", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "beforeinput", inputType: "insertLineBreak" },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      { op: "replace", path: "/root/children/0" },
      { op: "add", path: "/root/children/1" },
    ]);
  });

  it("translates generic delete and cut beforeinput over selections", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const deleteContent = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteContent",
    });
    const deleteByCut = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteByCut",
    });

    expectHandled(deleteContent);
    expectHandled(deleteByCut);
    expect(deleteContent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AD" },
    ]);
    expect(deleteByCut.patch).toEqual(deleteContent.patch);
    expect(deleteByCut.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("translates text input over multi-node selections to range replacement", () => {
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
      type: "beforeinput",
      inputType: "insertText",
      data: "x",
    });

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          children: [{ type: "text", text: "AxD" }],
        },
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("translates Backspace, Delete, and Enter to edit commands", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const backspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
    });
    const deleteKey = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Delete",
    });
    const enter = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Enter",
    });

    expectHandled(backspace);
    expectHandled(deleteKey);
    expectHandled(enter);
    expect(backspace.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "B" },
    ]);
    expect(deleteKey.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "A" },
    ]);
    expect(enter.patch).toMatchObject([
      { op: "replace", path: "/root/children/0" },
      { op: "add", path: "/root/children/1" },
    ]);
  });

  it("translates Alt/Option+Backspace and Delete to word delete commands", () => {
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
    const textEnd = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });
    const textStart = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    const beforeMention = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "before",
    });

    const backward = translateEditorInput(document, textEnd, {
      type: "keydown",
      key: "Backspace",
      altKey: true,
    });
    const forward = translateEditorInput(document, textStart, {
      type: "keydown",
      key: "Delete",
      altKey: true,
    });
    const atom = translateEditorInput(document, beforeMention, {
      type: "keydown",
      key: "Delete",
      altKey: true,
    });

    expectHandled(backward);
    expectHandled(forward);
    expectHandled(atom);
    expect(backward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one ",
      },
    ]);
    expect(forward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: " two",
      },
    ]);
    expect(atom.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "one two" }],
        },
      },
    ]);
  });

  it("translates deleteWord beforeinput variants to word delete commands", () => {
    const document = documentWithText("one two");
    const textEnd = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });
    const textStart = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });

    const backward = translateEditorInput(document, textEnd, {
      type: "beforeinput",
      inputType: "deleteWordBackward",
    });
    const forward = translateEditorInput(document, textStart, {
      type: "beforeinput",
      inputType: "deleteWordForward",
    });

    expectHandled(backward);
    expectHandled(forward);
    expect(backward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one ",
      },
    ]);
    expect(forward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: " two",
      },
    ]);
  });

  it("translates deletion over selected block ranges before applying key direction", () => {
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
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "CD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/2", edge: "before" },
    );

    const result = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Delete",
    });

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { children: [{ type: "text", text: "A" }] },
          { children: [{ type: "text", text: "CD" }] },
        ],
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("translates Enter over selected ranges to delete then split at the range start", () => {
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
      type: "keydown",
      key: "Enter",
    });

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { children: [{ type: "text", text: "A" }] },
          { children: [{ type: "text", text: "D" }] },
        ],
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
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

  it("does not mutate selection while composition is active", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(
      translateEditorInput(document, selection, {
        type: "beforeinput",
        inputType: "insertText",
        data: "x",
        isComposing: true,
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "compositionupdate",
      }),
    ).toEqual({ ok: true, handled: false });
  });

  it("clears transient selection context on Escape without document mutation", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
      {
        activeMarks: [{ type: "bold" }],
        pendingLinkHref: "https://openai.com",
        preferredX: 120,
      },
    );

    const result = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Escape",
    });

    expectHandled(result);
    expect(result.patch).toEqual([]);
    expect(result.selectionAfter.focus).toEqual(selection.focus);
    expect(result.selectionAfter.selectionRanges).toEqual(
      selection.selectionRanges,
    );
    expect(result.selectionAfter.context).toBeUndefined();
  });

  it("passes F-keys and unsupported command shortcuts through", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "F1",
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "F12",
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "s",
        ctrlKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "p",
        metaKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
  });
});
