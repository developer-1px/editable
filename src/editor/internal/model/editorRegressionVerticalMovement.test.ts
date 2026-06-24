import { describe, expect, it } from "vitest";
import {
  type CursorGeometryAdapter,
  moveDown,
  selectionFromCursorPoint,
} from "./cursorCommands";
import { documentWithBlocks, rect } from "./editorRegressionTestUtils";

describe("editor vertical movement regressions", () => {
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
          return { path: "/root/children/0/children/0/text", offset: 6 };
        }
        return { path: "/root/children/0/children/1", edge: "after" };
      },
    };

    const secondLine = moveDown(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
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
      path: "/root/children/0/children/0/text",
      offset: 6,
    });
    expect(afterMention.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(afterMention.context).toEqual({ preferredX: 11 });
  });
});
