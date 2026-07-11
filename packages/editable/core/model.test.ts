import { describe, expect, it } from "vitest";
import {
  EditableDocumentSchema,
  createEditableDocument,
  createInitialEditableValue,
  editableBlockIndexFromTextPath,
  editableTextPath,
  findEditableBlockIndex,
  orderedEditableSelection,
  primaryEditablePoint,
} from "./model";

describe("EditableDocumentSchema", () => {
  it("accepts the editor document shape and rejects duplicate block ids", () => {
    const value = createInitialEditableValue();

    expect(EditableDocumentSchema.safeParse(value).success).toBe(true);
    expect(
      EditableDocumentSchema.safeParse({
        ...value,
        blocks: [
          value.blocks[0],
          { ...value.blocks[1], id: value.blocks[0].id },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("createInitialEditableValue", () => {
  it("creates four fresh blocks with Korean and Japanese IME guidance", () => {
    const first = createInitialEditableValue();
    const second = createInitialEditableValue();

    expect(first.schema).toBe("interactive-os.editable-document@2");
    expect(first.blocks).toHaveLength(4);
    expect(first.blocks.map((block) => block.type)).toEqual([
      "heading",
      "paragraph",
      "quote",
      "code",
    ]);
    expect(first.blocks.some((block) => /[가-힣]/u.test(block.text))).toBe(true);
    expect(first.blocks.some((block) => /[ぁ-んァ-ヶ一-龯]/u.test(block.text))).toBe(
      true,
    );
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.blocks).not.toBe(first.blocks);
  });
});

describe("editable text paths", () => {
  it("round-trips exact block text paths", () => {
    expect(editableTextPath(12)).toBe("/blocks/12/text");
    expect(editableBlockIndexFromTextPath("/blocks/12/text")).toBe(12);
  });

  it("rejects paths that do not point exactly to a block's text", () => {
    expect(editableBlockIndexFromTextPath("/blocks/12")).toBeNull();
    expect(editableBlockIndexFromTextPath("/blocks/12/text/0")).toBeNull();
    expect(editableBlockIndexFromTextPath("/blocks/01/text")).toBeNull();
    expect(editableBlockIndexFromTextPath("/blocks/-1/text")).toBeNull();
  });
});

describe("editable selection helpers", () => {
  it("resolves the primary focus with stable identity and a clamped offset", () => {
    const document = createEditableDocument();
    const selection = document.selection;
    const block = document.value.blocks[1];
    if (selection === undefined || block === undefined) {
      throw new Error("Expected the editable document defaults.");
    }

    selection.setBaseAndExtent(
      { path: editableTextPath(0), offset: 1 },
      { path: editableTextPath(1), offset: block.text.length + 100 },
    );

    expect(primaryEditablePoint(document.value, selection)).toEqual({
      blockId: block.id,
      blockIndex: 1,
      offset: block.text.length,
    });
  });

  it("orders forward, backward, and same-block selections in document order", () => {
    const document = createEditableDocument();
    const selection = document.selection;
    const first = document.value.blocks[0];
    const last = document.value.blocks[3];
    if (selection === undefined || first === undefined || last === undefined) {
      throw new Error("Expected the editable document defaults.");
    }

    selection.setBaseAndExtent(
      { path: editableTextPath(3), offset: 4 },
      { path: editableTextPath(0), offset: 2 },
    );
    expect(orderedEditableSelection(document.value, selection)).toEqual({
      start: { blockId: first.id, blockIndex: 0, offset: 2 },
      end: { blockId: last.id, blockIndex: 3, offset: 4 },
    });

    selection.setBaseAndExtent(
      { path: editableTextPath(1), offset: 8 },
      { path: editableTextPath(1), offset: 3 },
    );
    expect(orderedEditableSelection(document.value, selection)).toEqual({
      start: {
        blockId: document.value.blocks[1]?.id,
        blockIndex: 1,
        offset: 3,
      },
      end: {
        blockId: document.value.blocks[1]?.id,
        blockIndex: 1,
        offset: 8,
      },
    });
  });

  it("returns null for empty or non-text selections", () => {
    const document = createEditableDocument();
    const selection = document.selection;
    if (selection === undefined) {
      throw new Error("Expected selection support.");
    }

    expect(primaryEditablePoint(document.value, selection)).toBeNull();
    expect(orderedEditableSelection(document.value, selection)).toBeNull();

    selection.collapse("/blocks/0");
    expect(primaryEditablePoint(document.value, selection)).toBeNull();
    expect(orderedEditableSelection(document.value, selection)).toBeNull();
  });
});

describe("createEditableDocument", () => {
  it("validates and clones caller-owned initial state", () => {
    const initial = createInitialEditableValue();
    const originalText = initial.blocks[0]?.text;
    const document = createEditableDocument(initial);

    if (initial.blocks[0] === undefined) {
      throw new Error("Expected an initial block.");
    }
    initial.blocks[0].text = "mutated outside the document";

    expect(document.value.blocks[0]?.text).toBe(originalText);
    expect(() =>
      createEditableDocument({
        ...initial,
        blocks: [
          { id: "duplicate", type: "paragraph", text: "one" },
          { id: "duplicate", type: "paragraph", text: "two" },
        ],
      }),
    ).toThrow();
  });

  it("uses the supplied value, extended selection, and a 100-entry history", () => {
    const initial = createInitialEditableValue();
    const document = createEditableDocument(initial);
    const selection = document.selection;
    if (selection === undefined) {
      throw new Error("Expected selection support.");
    }

    expect(document.value).toEqual(initial);
    selection.collapse({ path: editableTextPath(0), offset: 0 });
    selection.extend({ path: editableTextPath(1), offset: 1 });
    expect(selection.primaryRange).toEqual({
      anchor: { path: editableTextPath(0), offset: 0 },
      focus: { path: editableTextPath(1), offset: 1 },
    });

    for (let index = 0; index < 101; index += 1) {
      expect(document.replace(editableTextPath(0), `edit-${index}`).ok).toBe(
        true,
      );
    }
    for (let index = 0; index < 100; index += 1) {
      expect(document.undo().ok).toBe(true);
    }
    expect(document.value.blocks[0]?.text).toBe("edit-0");
    expect(document.canUndo().ok).toBe(false);
  });
});

describe("findEditableBlockIndex", () => {
  it("finds block ids and preserves Array.findIndex missing semantics", () => {
    const value = createInitialEditableValue();

    expect(findEditableBlockIndex(value, value.blocks[2]?.id ?? "")).toBe(2);
    expect(findEditableBlockIndex(value, "missing")).toBe(-1);
  });
});
