import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "./cursorCommands";
import { importMarkdown } from "./markdown";
import { expectOk } from "./markdownTestUtils";
import { insertText } from "./textCommands";

describe("markdown command independence", () => {
  it("keeps editor commands independent from markdown delimiter offsets", () => {
    const note = importMarkdown("**bold**");

    const command = insertText(
      note,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
      "x",
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "boxld",
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });
});
