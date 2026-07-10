import type { SelectionSnap } from "@interactive-os/json-document";
import { describe, expect, it, vi } from "vitest";
import type { EditableDocumentValue } from "../model";
import { planEditorCommand } from "./editorCommands";

const value: EditableDocumentValue = {
  schema: "interactive-os.editable-document@2",
  id: "command-test",
  blocks: [
    { id: "alpha", type: "paragraph", text: "first" },
    { id: "beta", type: "quote", text: "second" },
  ],
};

describe("editor command planning", () => {
  it("clamps text replacement ranges and preserves remote metadata", () => {
    expect(
      planEditorCommand(
        value,
        null,
        {
          type: "replaceText",
          blockId: "alpha",
          from: 99,
          to: 2,
          text: "X",
          label: "remote edit",
          origin: "remote",
        },
        unusedBlockId,
      ),
    ).toEqual({
      kind: "commit",
      patch: [{ op: "replace", path: "/blocks/0/text", value: "fiX" }],
      label: "remote edit",
      source: "remote",
    });
  });

  it("replaces a multi-block selection and removes covered blocks", () => {
    expect(
      planEditorCommand(
        value,
        selectionBetween(0, 2, 1, 3),
        { type: "replaceSelection", text: "X" },
        unusedBlockId,
      ),
    ).toEqual({
      kind: "commit",
      patch: [
        { op: "replace", path: "/blocks/0/text", value: "fiXond" },
        { op: "remove", path: "/blocks/1" },
      ],
      label: "replace selection",
      source: "app",
      selectionAfter: selectionBetween(0, 3, 0, 3),
    });
  });

  it("allocates a paragraph only after resolving a valid selection", () => {
    const allocateBlockId = vi.fn(() => "new-block");

    expect(
      planEditorCommand(
        value,
        selectionBetween(0, 2, 1, 1),
        { type: "insertParagraph" },
        allocateBlockId,
      ),
    ).toEqual({
      kind: "commit",
      patch: [
        { op: "replace", path: "/blocks/0/text", value: "fi" },
        { op: "remove", path: "/blocks/1" },
        {
          op: "add",
          path: "/blocks/1",
          value: { id: "new-block", type: "paragraph", text: "econd" },
        },
      ],
      label: "insert paragraph",
      source: "app",
      selectionAfter: selectionBetween(1, 0, 1, 0),
    });
    expect(allocateBlockId).toHaveBeenCalledOnce();

    expect(
      planEditorCommand(value, null, { type: "insertParagraph" }, allocateBlockId),
    ).toMatchObject({ kind: "failure", code: "selection_unavailable" });
    expect(allocateBlockId).toHaveBeenCalledOnce();
  });

  it("deletes one grapheme instead of one UTF-16 code unit", () => {
    const family = "👨‍👩‍👧‍👦";
    const emojiValue: EditableDocumentValue = {
      ...value,
      blocks: [{ id: "alpha", type: "paragraph", text: `A${family}B` }],
    };

    expect(
      planEditorCommand(
        emojiValue,
        selectionBetween(0, 1 + family.length, 0, 1 + family.length),
        { type: "deleteBackward" },
        unusedBlockId,
      ),
    ).toEqual({
      kind: "commit",
      patch: [{ op: "replace", path: "/blocks/0/text", value: "AB" }],
      label: "delete backward",
      source: "app",
      selectionAfter: selectionBetween(0, 1, 0, 1),
    });
  });

  it("plans backward and forward joins with the original caret semantics", () => {
    expect(
      planEditorCommand(
        value,
        selectionBetween(1, 0, 1, 0),
        { type: "joinBackward" },
        unusedBlockId,
      ),
    ).toEqual({
      kind: "commit",
      patch: [
        { op: "replace", path: "/blocks/0/text", value: "firstsecond" },
        { op: "remove", path: "/blocks/1" },
      ],
      label: "join backward",
      source: "app",
      selectionAfter: selectionBetween(0, 5, 0, 5),
    });

    expect(
      planEditorCommand(
        value,
        selectionBetween(0, 5, 0, 5),
        { type: "joinForward" },
        unusedBlockId,
      ),
    ).toMatchObject({
      kind: "commit",
      label: "join forward",
      selectionAfter: selectionBetween(0, 5, 0, 5),
    });
  });

  it("targets an explicit block type or the primary focus block", () => {
    const selection = selectionBetween(0, 0, 1, 2);
    expect(
      planEditorCommand(
        value,
        selection,
        { type: "setBlockType", blockType: "code" },
        unusedBlockId,
      ),
    ).toEqual({
      kind: "commit",
      patch: [{ op: "replace", path: "/blocks/1/type", value: "code" }],
      label: "set block type: code",
      source: "app",
      selectionAfter: selection,
    });

    expect(
      planEditorCommand(
        value,
        selection,
        {
          type: "setBlockType",
          blockId: "alpha",
          blockType: "paragraph",
        },
        unusedBlockId,
      ),
    ).toEqual({ kind: "none" });
  });
});

function selectionBetween(
  anchorBlock: number,
  anchorOffset: number,
  focusBlock: number,
  focusOffset: number,
): SelectionSnap {
  const anchor = { path: `/blocks/${anchorBlock}/text`, offset: anchorOffset };
  const focus = { path: `/blocks/${focusBlock}/text`, offset: focusOffset };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

function unusedBlockId(): string {
  throw new Error("This command must not allocate a block id.");
}
