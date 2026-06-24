import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../cursorCommands";
import { insertText } from "./textCommands";
import { documentWithBlocks, expectOk } from "./textCommandTestUtils";

describe("text command edge insertion", () => {
  it("inserts before and after inline atoms using neighboring text runs", () => {
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

    const before = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "before",
      }),
      "x",
    );
    const after = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
      "y",
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "Ax" },
    ]);
    expect(after.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/2/text", value: "yB" },
    ]);
  });

  it("creates an inline text run when an atom has no neighboring text run", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
    ]);

    const command = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0",
        edge: "after",
      }),
      "x",
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/0/children/1",
        value: { type: "text", text: "x" },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 1,
    });
  });

  it("targets neighboring paragraphs around a figure", () => {
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

    const before = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "before" }),
      "x",
    );
    const after = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "after" }),
      "y",
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "Ax" },
    ]);
    expect(after.patch).toMatchObject([
      { op: "replace", path: "/root/children/2/children/0/text", value: "yB" },
    ]);
  });

  it("creates paragraphs when inserting text before or after an isolated figure", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const before = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "before" }),
      "x",
    );
    const after = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
      "y",
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "x" }],
        },
      },
    ]);
    expect(after.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/1",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "y" }],
        },
      },
    ]);
  });
});
