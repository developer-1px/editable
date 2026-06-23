import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { insertMention } from "./textCommands";
import { documentWithBlocks, expectOk } from "./textCommandTestUtils";

describe("text command mention insertion", () => {
  it("inserts a mention inline atom inside a paragraph", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertMention(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "mention", id: "user-1", label: "Ada" },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B" },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
  });

  it("preserves marks around inserted inline atoms", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB", marks: [{ type: "bold" }] }],
      },
    ]);

    const command = insertMention(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "mention", id: "user-1", label: "Ada" },
    );

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

  it("replaces a selected text range with a mention atom", () => {
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

    const command = insertMention(document, selection, {
      type: "mention",
      id: "user-1",
      label: "Ada",
    });

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "D" },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
  });

  it("replaces multi-node selected ranges with a mention atom", () => {
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

    const command = insertMention(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/2/text", offset: 1 },
      ),
      { type: "mention", id: "new-user", label: "New" },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "mention", id: "new-user", label: "New" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0",
      edge: "after",
    });
  });

  it("places the caret after a mention that replaces whole block atoms", () => {
    const document = documentWithBlocks([
      { id: "figure-1", type: "figure", src: "/one.png" },
      { id: "figure-2", type: "figure", src: "/two.png" },
    ]);

    const command = insertMention(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0", edge: "before" },
        { path: "/root/children/1", edge: "after" },
      ),
      { type: "mention", id: "user-1", label: "Ada" },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            type: "paragraph",
            children: [{ type: "mention", id: "user-1", label: "Ada" }],
          },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0",
      edge: "after",
    });
  });

  it("inserts mention around figure edges by creating or targeting paragraphs", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const before = insertMention(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "before" }),
      { type: "mention", id: "user-1", label: "Ada" },
    );
    const after = insertMention(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
      { type: "mention", id: "user-2", label: "Grace" },
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "mention", id: "user-1", label: "Ada" }],
        },
      },
    ]);
    expect(after.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/1",
        value: {
          type: "paragraph",
          children: [{ type: "mention", id: "user-2", label: "Grace" }],
        },
      },
    ]);
  });
});
