import { describe, expect, it } from "vitest";
import { selectionFromCursorRange } from "./cursorCommands";
import { toggleMark } from "./markCommands";
import { documentWithBlocks, expectOk } from "./markCommandTestUtils";

describe("mark commands over selected ranges", () => {
  it("toggles a mark over a selected text range and keeps the range selected", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toMatchObject([
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
    expect(command.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 0,
    });
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 2,
    });
  });

  it("removes a mark when the whole selected text already has it", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "bold" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/1/text", offset: 0 },
      { path: "/root/children/0/children/1/text", offset: 2 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "ABCD" }],
      },
    ]);
    expect(command.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });

  it("toggles inline code over selected text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const command = toggleMark(document, selection, "code");

    expectOk(command);
    expect(command.patch).toMatchObject([
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
  });

  it("applies marks across inline atoms without marking the atom", () => {
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
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 0 },
      { path: "/root/children/0/children/2/text", offset: 1 },
    );

    const command = toggleMark(document, selection, "bold");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A", marks: [{ type: "bold" }] },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B", marks: [{ type: "bold" }] },
        ],
      },
    ]);
  });
});
