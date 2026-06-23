import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "./cursorCommands";
import { documentWithBlocks, expectOk } from "./editorRegressionTestUtils";
import { deleteBackward, insertText } from "./textCommands";

describe("editor atom text command regressions", () => {
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
        path: "/root/children/0/children/1",
        edge: "after",
      }),
      "x",
    );
    const removeMention = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
    );

    expectOk(insertAfterMention);
    expectOk(removeMention);
    expect(insertAfterMention.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/2/text", value: "xB" },
    ]);
    expect(insertAfterMention.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/2/text",
      offset: 1,
    });
    expect(removeMention.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "AB" }],
      },
    ]);
    expect(removeMention.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
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
      selectionFromCursorPoint({ path: "/root/children/1", edge: "before" }),
      "x",
    );
    const afterFigure = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "after" }),
      "y",
    );

    expectOk(beforeFigure);
    expectOk(afterFigure);
    expect(beforeFigure.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "Ax" },
    ]);
    expect(afterFigure.patch).toMatchObject([
      { op: "replace", path: "/root/children/2/children/0/text", value: "yB" },
    ]);
  });
});
