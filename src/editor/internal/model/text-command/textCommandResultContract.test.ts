import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../cursorCommands";
import { deleteBackward, insertText, splitParagraph } from "./textCommands";
import { documentWithBlocks, expectOk } from "./textCommandTestUtils";

describe("text command result contract", () => {
  it("returns patches and selection without mutating the input document", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const before = structuredClone(document);

    const insert = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      "x",
    );
    const remove = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );
    const split = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(insert);
    expectOk(remove);
    expectOk(split);
    expect(insert.patch.length).toBeGreaterThan(0);
    expect(remove.patch.length).toBeGreaterThan(0);
    expect(split.patch.length).toBeGreaterThan(0);
    expect(document).toEqual(before);
  });
});
