import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { insertFigure } from "./textCommands";
import { documentWithBlocks, expectOk } from "./textCommandTestUtils";

describe("text command figure insertion", () => {
  it("inserts a figure block between split paragraph sides", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertFigure(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { id: "figure-1", type: "figure", src: "/image.png" },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "A" }],
        },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: { id: "figure-1", type: "figure", src: "/image.png" },
      },
      {
        op: "add",
        path: "/root/children/2",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "B" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("rejects unsafe figure sources before writing command patches", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertFigure(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { id: "figure-1", type: "figure", src: "javascript:alert(1)" },
    );

    expect(command).toEqual({
      ok: false,
      reason: "Figure src is invalid.",
    });
  });

  it("normalizes safe figure sources before writing command patches", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertFigure(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { id: "figure-1", type: "figure", src: " /image.png " },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {},
      {
        value: { id: "figure-1", type: "figure", src: "/image.png" },
      },
      {},
    ]);
  });

  it("replaces a selected text range with a figure block", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = {
      selectedPointers: ["/root/children/0/children/0/text"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/0/children/0/text", offset: 3 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/0/text", offset: 3 },
    };

    const command = insertFigure(document, selection, {
      id: "figure-1",
      type: "figure",
      src: "/image.png",
    });

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "A" }],
        },
      },
      {
        value: { id: "figure-1", type: "figure", src: "/image.png" },
      },
      {
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "D" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("replaces multi-node selected ranges with a figure block", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "old-user", label: "Old" },
          { type: "text", text: "D" },
        ],
      },
    ]);

    const command = insertFigure(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/2/text", offset: 1 },
      ),
      { id: "figure-1", type: "figure", src: "/image.png" },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "" }],
          },
          { id: "figure-1", type: "figure", src: "/image.png" },
          {
            type: "paragraph",
            children: [{ type: "text", text: "" }],
          },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("inserts a figure before or after an existing figure edge", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/one.png",
      },
    ]);

    const before = insertFigure(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "before" }),
      { id: "figure-2", type: "figure", src: "/two.png" },
    );
    const after = insertFigure(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
      { id: "figure-3", type: "figure", src: "/three.png" },
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/0",
        value: { id: "figure-2", type: "figure", src: "/two.png" },
      },
    ]);
    expect(before.selectionAfter.focus).toMatchObject({
      path: "/root/children/0",
      edge: "after",
    });
    expect(after.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/1",
        value: { id: "figure-3", type: "figure", src: "/three.png" },
      },
    ]);
    expect(after.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });
});
