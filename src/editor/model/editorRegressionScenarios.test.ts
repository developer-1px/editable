import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { selectionForView } from "../components/BlockEditor";
import {
  type CursorGeometryAdapter,
  moveDown,
  selectionFromCursorPoint,
} from "./cursorCommands";
import { type EditorInputResult, translateEditorInput } from "./inputAdapter";
import { type NoteDocument, NoteDocumentSchema } from "./noteDocument";
import {
  deleteBackward,
  insertMention,
  insertText,
  splitParagraph,
} from "./textCommands";

function documentWithBlocks(blocks: NoteDocument["blocks"]): NoteDocument {
  return {
    id: "note-test",
    title: "Regression",
    tags: [],
    blocks,
  };
}

function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
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

describe("editor regression scenarios", () => {
  it("keeps text insertion and deletion deterministic around a mention", () => {
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

    const insertAfterMention = insertText(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/1",
        edge: "after",
      }),
      "x",
    );
    const removeMention = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/1",
        edge: "after",
      }),
    );

    expectOk(insertAfterMention);
    expectOk(removeMention);
    expect(insertAfterMention.patch).toEqual([
      { op: "replace", path: "/blocks/0/children/2/text", value: "xB" },
    ]);
    expect(insertAfterMention.selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/2/text",
      offset: 1,
    });
    expect(removeMention.patch).toEqual([
      { op: "remove", path: "/blocks/0/children/1" },
    ]);
    expect(removeMention.selectionAfter.focus).toMatchObject({
      path: "/blocks/0/children/1/text",
      offset: 0,
    });
  });

  it("keeps text insertion deterministic around a figure", () => {
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

    const beforeFigure = insertText(
      document,
      selectionFromCursorPoint({ path: "/blocks/1", edge: "before" }),
      "x",
    );
    const afterFigure = insertText(
      document,
      selectionFromCursorPoint({ path: "/blocks/1", edge: "after" }),
      "y",
    );

    expectOk(beforeFigure);
    expectOk(afterFigure);
    expect(beforeFigure.patch).toEqual([
      { op: "replace", path: "/blocks/0/children/0/text", value: "Ax" },
    ]);
    expect(afterFigure.patch).toEqual([
      { op: "replace", path: "/blocks/2/children/0/text", value: "yB" },
    ]);
  });

  it("splits and merges paragraphs with stored selections", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AB" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
    document.selection?.restore(selection);

    const split = splitParagraph(document.value, selection);
    expectOk(split);
    document.commit(split.patch, { selectionAfter: split.selectionAfter });

    const merge = deleteBackward(document.value, split.selectionAfter);
    expectOk(merge);
    document.commit(merge.patch, { selectionAfter: merge.selectionAfter });

    expect(document.value.blocks).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
  });

  it("moves vertically across wrapped text and atom points", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "wrapped text" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);
    const geometry: CursorGeometryAdapter = {
      rectForPoint(point) {
        if (point.offset !== undefined && point.offset < 6) {
          return rect(10, 10, 2, 18);
        }
        if (point.offset !== undefined) {
          return rect(10, 34, 2, 18);
        }
        return rect(10, 58, 40, 18);
      },
      pointFromCoordinates(_x, y) {
        if (y < 53) {
          return { path: "/blocks/0/children/0/text", offset: 6 };
        }
        return { path: "/blocks/0/children/1", edge: "after" };
      },
    };

    const secondLine = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 1,
      }),
      geometry,
    ).selectionAfter;
    const afterMention = moveDown(
      document,
      secondLine,
      geometry,
    ).selectionAfter;

    expect(secondLine.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 6,
    });
    expect(afterMention.focus).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
    expect(afterMention.context).toEqual({ preferredX: 11 });
  });

  it("restores selection across undo and redo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AB" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
    document.selection?.restore(selection);

    const command = insertMention(document.value, selection, {
      type: "mention",
      id: "user-1",
      label: "Ada",
    });
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    expect(document.selection?.focus).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });

    document.undo();

    expect(document.selection?.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });

    document.redo();

    expect(document.selection?.focus).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
  });

  it("restores an open range selection across undo and redo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "AB" },
            { type: "mention", id: "user-1", label: "Ada" },
            { type: "text", text: "CD" },
          ],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = {
      selectedPointers: ["/blocks/0/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/blocks/0/children/0/text", offset: 1 },
          focus: { path: "/blocks/0/children/2/text", offset: 1 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/blocks/0/children/0/text", offset: 1 },
      focus: { path: "/blocks/0/children/2/text", offset: 1 },
    };
    document.selection?.restore(selection);

    const command = insertText(document.value, selection, "x");
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    expect(document.value.blocks).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "AxD" }],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 2,
    });

    document.undo();

    expect(document.value.blocks).toMatchObject([
      {
        type: "paragraph",
        children: [
          { type: "text", text: "AB" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "CD" },
        ],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/blocks/0/children/2/text",
      offset: 1,
    });
    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/blocks/0/children/0/text", offset: 1 },
      focus: { path: "/blocks/0/children/2/text", offset: 1 },
    });
    expect(
      selectionForView(document.value, document.selection?.snapshot())
        ?.selectedPointers,
    ).toEqual(["/blocks/0/children/1"]);

    document.redo();

    expect(document.value.blocks).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "AxD" }],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 2,
    });
  });

  it("restores an open range selection across mention, figure, and paragraph after undo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Plain " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: " " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            { type: "text", text: " " },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", href: "https://example.com" }],
            },
            { type: "text", text: " " },
            { type: "mention", id: "user-ada", label: "Ada" },
          ],
        },
        {
          id: "figure-1",
          type: "figure",
          src: "/logo192.png",
          alt: "Figure",
        },
        {
          id: "block-2",
          type: "paragraph",
          children: [{ type: "text", text: "After figure." }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = {
      selectedPointers: ["/blocks/0/children/9", "/blocks/1"],
      selectionRanges: [
        {
          anchor: { path: "/blocks/0/children/0/text", offset: 3 },
          focus: { path: "/blocks/2", edge: "before" as const },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/blocks/0/children/0/text", offset: 3 },
      focus: { path: "/blocks/2", edge: "before" as const },
    };
    document.selection?.restore(selection);

    const command = insertText(document.value, selection, "x");
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    expect(document.value.blocks).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "Plax" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "After figure." }],
      },
    ]);

    document.undo();

    expect(document.value.blocks).toHaveLength(3);
    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/blocks/0/children/0/text", offset: 3 },
      focus: { path: "/blocks/2", edge: "before" },
    });
    expect(
      selectionForView(document.value, document.selection?.snapshot())
        ?.selectedPointers,
    ).toEqual(["/blocks/0/children/9", "/blocks/1"]);
  });

  it("restores an open range selection built by repeated Shift+ArrowRight after undo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Plain " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: " " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            { type: "text", text: " " },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", href: "https://example.com" }],
            },
            { type: "text", text: " " },
            { type: "mention", id: "user-ada", label: "Ada" },
          ],
        },
        {
          id: "figure-1",
          type: "figure",
          src: "/logo192.png",
          alt: "Figure",
        },
        {
          id: "block-2",
          type: "paragraph",
          children: [{ type: "text", text: "After figure." }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    document.selection?.restore(
      selectionFromCursorPoint({
        path: "/blocks/0/children/0/text",
        offset: 3,
      }),
    );

    for (let count = 0; count < 31; count += 1) {
      const move = translateEditorInput(
        document.value,
        document.selection?.snapshot() ??
          selectionFromCursorPoint({
            path: "/blocks/0/children/0/text",
            offset: 3,
          }),
        { type: "keydown", key: "ArrowRight", shiftKey: true },
      );
      expectHandled(move);
      document.selection?.restore(move.selectionAfter);
    }

    const selection = document.selection?.snapshot();
    expect(
      selectionForView(document.value, selection)?.selectedPointers,
    ).toEqual(["/blocks/0/children/9", "/blocks/1"]);

    const command = insertText(
      document.value,
      selection ??
        selectionFromCursorPoint({
          path: "/blocks/0/children/0/text",
          offset: 3,
        }),
      "x",
    );
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    document.undo();

    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/blocks/0/children/0/text", offset: 3 },
      focus: { path: "/blocks/2", edge: "before" },
    });
    expect(
      selectionForView(document.value, document.selection?.snapshot())
        ?.selectedPointers,
    ).toEqual(["/blocks/0/children/9", "/blocks/1"]);
  });
});
