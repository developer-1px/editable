import { describe, expect, it } from "vitest";
import { initialNoteDocument } from "./initialNoteDocument";
import { createGeneratedBlockId, createParagraphBlock } from "./noteDocument";

describe("note document factories", () => {
  it("creates paragraph blocks for editor inserts", () => {
    const initialBlockIds = new Set(
      initialNoteDocument.root.children.map((block) => block.id),
    );
    const block = createParagraphBlock("hello");

    expect(block).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "hello" }],
    });
    expect(initialBlockIds.has(block.id)).toBe(false);
  });

  it("creates paragraph block ids that do not collide with the initial demo", () => {
    const initialBlockIds = new Set(
      initialNoteDocument.root.children.map((block) => block.id),
    );

    expect(initialBlockIds.has(createParagraphBlock("").id)).toBe(false);
  });

  it("creates local generated block ids monotonically", () => {
    const initialBlockIds = new Set(
      initialNoteDocument.root.children.map((block) => block.id),
    );
    const first = createGeneratedBlockId();
    const second = createGeneratedBlockId();
    const firstNumber = Number(/^block-(\d+)$/.exec(first)?.[1]);
    const secondNumber = Number(/^block-(\d+)$/.exec(second)?.[1]);

    expect(first).toMatch(/^block-\d+$/);
    expect(second).toMatch(/^block-\d+$/);
    expect(initialBlockIds.has(first)).toBe(false);
    expect(initialBlockIds.has(second)).toBe(false);
    expect(secondNumber).toBe(firstNumber + 1);
  });
});
