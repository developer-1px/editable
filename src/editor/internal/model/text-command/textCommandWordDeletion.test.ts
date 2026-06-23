import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../cursorCommands";
import { deleteWordBackward, deleteWordForward } from "./textCommands";
import { documentWithBlocks, expectOk } from "./textCommandTestUtils";

describe("text command word deletion", () => {
  it("deletes word ranges backward and forward through the same text leaf", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "one two" }],
      },
      {
        id: "code-1",
        type: "codeBlock",
        text: "alpha beta",
      },
    ]);

    const backward = deleteWordBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 7,
      }),
    );
    const forward = deleteWordForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );
    const code = deleteWordBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/1/text",
        offset: 10,
      }),
    );

    expectOk(backward);
    expectOk(forward);
    expectOk(code);
    expect(backward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one ",
      },
    ]);
    expect(backward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 4,
    });
    expect(forward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: " two",
      },
    ]);
    expect(forward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(code.patch).toMatchObject([
      { op: "replace", path: "/root/children/1/text", value: "alpha " },
    ]);
    expect(code.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/text",
      offset: 6,
    });
  });

  it("deletes atom units with word deletion commands", () => {
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
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const mentionForward = deleteWordForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );
    const mentionBackward = deleteWordBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/2/text",
        offset: 0,
      }),
    );
    const figureForward = deleteWordForward(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "before" }),
    );

    expectOk(mentionForward);
    expectOk(mentionBackward);
    expectOk(figureForward);
    expect(mentionForward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: { children: [{ type: "text", text: "AB" }] },
      },
    ]);
    expect(mentionBackward.patch).toEqual(mentionForward.patch);
    expect(figureForward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            id: "block-1",
            type: "paragraph",
            children: [
              { type: "text", text: "A" },
              { type: "mention", id: "user-1", label: "Ada" },
              { type: "text", text: "B" },
            ],
          },
        ],
      },
    ]);
  });
});
