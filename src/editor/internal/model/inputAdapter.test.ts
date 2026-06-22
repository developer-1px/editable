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

function blockPatchValue(
  result: Extract<EditorInputResult, { handled: true }>,
): Array<{ id: string }> {
  const operation = result.patch.find(
    (patch) => patch.path === "/root/children",
  ) as { value?: unknown } | undefined;
  expect(Array.isArray(operation?.value)).toBe(true);

  return operation?.value as Array<{ id: string }>;
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
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(ctrl.selectionAfter.focus).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 1,
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

  it("does not create link marks without a pending href", () => {
    const document = documentWithText("AB");
    const result = translateEditorInput(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/0/text", offset: 2 },
      ),
      { type: "keydown", key: "k", ctrlKey: true },
    );

    expect(result).toEqual({
      ok: false,
      reason: "Link href is required.",
    });
  });

  it("does not create link marks from unsafe pending hrefs", () => {
    const document = documentWithText("AB");
    const result = translateEditorInput(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/0/text", offset: 2 },
        { pendingLinkHref: "javascript:alert(1)" },
      ),
      { type: "keydown", key: "k", ctrlKey: true },
    );

    expect(result).toEqual({
      ok: false,
      reason: "Link href is invalid.",
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

  it("translates Shift+Tab outside lists to a selection-only no-op", () => {
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const result = translateEditorInput(documentWithText("AB"), selection, {
      type: "keydown",
      key: "Tab",
      shiftKey: true,
    });

    expectHandled(result);
    expect(result.patch).toEqual([]);
    expect(result.selectionAfter).toBe(selection);
  });

  it("translates structural editing keydown through headless commands", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const backspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
    });
    const del = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Delete",
    });
    const enter = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Enter",
    });

    expectHandled(backspace);
    expectHandled(del);
    expectHandled(enter);
    expect(backspace.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "B",
      },
    ]);
    expect(del.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "A",
      },
    ]);
    expect(enter.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: { children: [{ type: "text", text: "A" }] },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: { children: [{ type: "text", text: "B" }] },
      },
    ]);
  });

  it("uses Alt/Option, not Shift, for word deletion keydown", () => {
    const document = documentWithText("one two");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });

    const shiftBackspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
      shiftKey: true,
    });
    const wordBackspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
      altKey: true,
    });

    expectHandled(shiftBackspace);
    expectHandled(wordBackspace);
    expect(shiftBackspace.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one tw",
      },
    ]);
    expect(wordBackspace.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one ",
      },
    ]);
  });

  it("blocks unsupported structural editing shortcuts as explicit no-ops", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const commandBackspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
      metaKey: true,
    });
    const commandDelete = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Delete",
      ctrlKey: true,
    });
    const altEnter = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Enter",
      altKey: true,
    });

    expectHandled(commandBackspace);
    expectHandled(commandDelete);
    expectHandled(altEnter);
    expect(commandBackspace.patch).toEqual([]);
    expect(commandDelete.patch).toEqual([]);
    expect(altEnter.patch).toEqual([]);
    expect(commandBackspace.selectionAfter).toBe(selection);
    expect(commandDelete.selectionAfter).toBe(selection);
    expect(altEnter.selectionAfter).toBe(selection);
  });

  it("keeps read-only input immutable while still moving the cursor", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const insert = translateEditorInput(
      document,
      selection,
      { type: "beforeinput", inputType: "insertText", data: "x" },
      { readOnly: true },
    );
    const paste = translateEditorInput(
      document,
      selection,
      { type: "paste", text: "x" },
      { readOnly: true },
    );
    const deleteBackward = translateEditorInput(
      document,
      selection,
      { type: "beforeinput", inputType: "deleteContentBackward" },
      { readOnly: true },
    );
    const backspace = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "Backspace" },
      { readOnly: true },
    );
    const printable = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "x" },
      { readOnly: true },
    );
    const imeStart = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "Process" },
      { readOnly: true },
    );
    const bold = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "b", metaKey: true },
      { readOnly: true },
    );
    const tab = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "Tab" },
      { readOnly: true },
    );
    const right = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowRight" },
      { readOnly: true },
    );
    const shiftRight = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowRight", shiftKey: true },
      { readOnly: true },
    );
    const openRange = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 0 },
      { path: "/root/children/0/children/0/text", offset: 2 },
    );
    const collapseLeft = translateEditorInput(
      document,
      openRange,
      { type: "keydown", key: "ArrowLeft" },
      { readOnly: true },
    );
    const copy = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "c", metaKey: true },
      { readOnly: true },
    );

    expectHandled(insert);
    expectHandled(paste);
    expectHandled(deleteBackward);
    expectHandled(backspace);
    expectHandled(printable);
    expectHandled(imeStart);
    expectHandled(bold);
    expectHandled(tab);
    expectHandled(right);
    expectHandled(shiftRight);
    expectHandled(collapseLeft);
    expect(insert.patch).toEqual([]);
    expect(insert.selectionAfter).toBe(selection);
    expect(paste.patch).toEqual([]);
    expect(paste.selectionAfter).toBe(selection);
    expect(deleteBackward.patch).toEqual([]);
    expect(deleteBackward.selectionAfter).toBe(selection);
    expect(backspace.patch).toEqual([]);
    expect(backspace.selectionAfter).toBe(selection);
    expect(printable.patch).toEqual([]);
    expect(printable.selectionAfter).toBe(selection);
    expect(imeStart.patch).toEqual([]);
    expect(imeStart.selectionAfter).toBe(selection);
    expect(bold.patch).toEqual([]);
    expect(bold.selectionAfter).toBe(selection);
    expect(tab.patch).toEqual([]);
    expect(tab.selectionAfter).toBe(selection);
    expect(right.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
    expect(shiftRight.patch).toEqual([]);
    expect(shiftRight.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftRight.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
    expect(collapseLeft.patch).toEqual([]);
    expect(collapseLeft.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(copy).toEqual({ ok: true, handled: false });
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

  it("translates line break beforeinput through the block-specific split policy", () => {
    const paragraph = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "beforeinput", inputType: "insertLineBreak" },
    );
    const codeBlock = translateEditorInput(
      documentWithBlocks([{ id: "code-1", type: "codeBlock", text: "AB" }]),
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
      { type: "beforeinput", inputType: "insertLineBreak" },
    );

    expectHandled(paragraph);
    expect(paragraph.patch).toMatchObject([
      { op: "replace", path: "/root/children/0" },
      { op: "add", path: "/root/children/1" },
    ]);
    expect(paragraph.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });

    expectHandled(codeBlock);
    expect(codeBlock.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "A\nB" },
    ]);
    expect(codeBlock.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
  });

  it("translates paragraph beforeinput through the same block-specific split policy", () => {
    const paragraph = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "beforeinput", inputType: "insertParagraph" },
    );
    const codeBlock = translateEditorInput(
      documentWithBlocks([{ id: "code-1", type: "codeBlock", text: "AB" }]),
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
      { type: "beforeinput", inputType: "insertParagraph" },
    );

    expectHandled(paragraph);
    expect(paragraph.patch).toMatchObject([
      { op: "replace", path: "/root/children/0" },
      { op: "add", path: "/root/children/1" },
    ]);
    expect(paragraph.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });

    expectHandled(codeBlock);
    expect(codeBlock.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "A\nB" },
    ]);
    expect(codeBlock.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
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

  it("translates browser character deletion and paragraph insertion beforeinput", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const backspace = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteContentBackward",
    });
    const deleteKey = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteContentForward",
    });
    const enter = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertParagraph",
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

  it("translates browser word deletion beforeinput to word delete commands", () => {
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
      type: "beforeinput",
      inputType: "deleteWordBackward",
    });
    const forward = translateEditorInput(document, textStart, {
      type: "beforeinput",
      inputType: "deleteWordForward",
    });
    const atom = translateEditorInput(document, beforeMention, {
      type: "beforeinput",
      inputType: "deleteWordForward",
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
      type: "beforeinput",
      inputType: "deleteContentForward",
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
      type: "beforeinput",
      inputType: "insertParagraph",
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

  it("does not mutate selection from beforeinput while composition is active", () => {
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
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "u",
        metaKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "Tab",
        altKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
  });
});
