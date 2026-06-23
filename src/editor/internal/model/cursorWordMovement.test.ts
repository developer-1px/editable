import { describe, expect, it } from "vitest";
import { moveCursorByWord } from "./cursor";
import { documentWithBlocks } from "./cursorTestUtils";

describe("cursor word movement", () => {
  it("treats decomposed letter graphemes as word characters", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "e\u0301 y" }],
      },
    ]);

    expect(
      moveCursorByWord(
        document,
        {
          path: "/root/children/0/children/0/text",
          offset: 0,
        },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("moves by word boundaries and treats atoms as one word unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "one two" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "셋" },
        ],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0/children/0/text", offset: 7 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 4,
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0/children/0/text", offset: 7 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0/children/2/text", offset: 0 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    expect(
      moveCursorByWord(
        document,
        { path: "/root/children/0", edge: "after" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });
});
