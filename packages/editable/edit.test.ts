import { describe, expect, it } from "vitest";
import type { SelectionSnap } from "@interactive-os/json-document";
import {
  createRichBlock,
  createRichDocument,
  edit,
  type EditIntent,
  type EditState,
  richInlineRangeActive,
  richTextPathForBlock,
  type RichVisualLineSeed,
  RICH_FRAGMENT_SCHEMA,
  ATOM_REPLACEMENT,
} from "./index";

function documentFixture() {
  return createRichDocument({
    id: "doc",
    blocks: [
      createRichBlock({ id: "b1", type: "paragraph", text: "Hello world" }),
      createRichBlock({ id: "b2", type: "paragraph", text: "Second block" }),
    ],
  });
}

function stateAt(
  document = documentFixture(),
  anchor: { block: number; offset: number } = { block: 0, offset: 0 },
  focus: { block: number; offset: number } = anchor,
): EditState {
  const result = edit(
    { document, selection: null },
    {
      type: "setBaseAndExtent",
      anchor: { path: richTextPathForBlock(anchor.block), offset: anchor.offset },
      focus: { path: richTextPathForBlock(focus.block), offset: focus.offset },
    },
  );
  if (!result.ok || result.kind === "history") {
    throw new Error("Fixture selection did not resolve.");
  }
  return {
    document,
    selection: result.selectionAfter,
    goalX: result.goalX,
  };
}

function caretOf(selection: SelectionSnap | null): {
  path: string;
  offset: number;
} {
  const focus = selection?.focus;
  if (focus == null || typeof focus === "string" || typeof focus.offset !== "number") {
    throw new Error("Selection has no resolvable focus.");
  }
  return { path: focus.path, offset: focus.offset };
}

function editedDocument(state: EditState, intent: EditIntent) {
  const result = edit(state, intent);
  if (!result.ok || result.kind === "history") {
    throw new Error(`Edit failed: ${JSON.stringify(result)}`);
  }
  return result;
}

describe("edit: text intents", () => {
  it("insertText inserts at a caret and reports selectionAfter", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 5 });
    const result = editedDocument(state, { type: "insertText", text: "!!" });
    expect(result.kind).toBe("text");
    expect(result.value.blocks[0]?.text).toBe("Hello!! world");
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(0),
      offset: 7,
    });
    expect(result.patch.length).toBeGreaterThan(0);
  });

  it("insertText replaces a non-collapsed range", () => {
    const state = stateAt(
      documentFixture(),
      { block: 0, offset: 0 },
      { block: 0, offset: 5 },
    );
    const result = editedDocument(state, { type: "insertText", text: "Goodbye" });
    expect(result.value.blocks[0]?.text).toBe("Goodbye world");
    expect(caretOf(result.selectionAfter).offset).toBe(7);
  });

  it("insertReplacementText replaces a non-collapsed range", () => {
    const state = stateAt(
      documentFixture(),
      { block: 0, offset: 6 },
      { block: 0, offset: 11 },
    );
    const result = editedDocument(state, {
      type: "insertReplacementText",
      text: "there",
    });
    expect(result.value.blocks[0]?.text).toBe("Hello there");
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(0),
      offset: 11,
    });
  });

  it("insertText replaces a cross-block range by merging blocks", () => {
    const state = stateAt(
      documentFixture(),
      { block: 0, offset: 5 },
      { block: 1, offset: 6 },
    );
    const result = editedDocument(state, { type: "insertText", text: "," });
    expect(result.value.blocks).toHaveLength(1);
    expect(result.value.blocks[0]?.text).toBe("Hello, block");
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(0),
      offset: 6,
    });
  });

  it("insertLineBreak inserts a soft line break inside the block", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 5 });
    const result = editedDocument(state, { type: "insertLineBreak" });
    expect(result.value.blocks[0]?.text).toBe("Hello\n world");
    expect(result.value.blocks).toHaveLength(2);
  });

  it("insertParagraph splits the block and moves the caret to the new block", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 5 });
    const result = editedDocument(state, { type: "insertParagraph" });
    expect(result.value.blocks.map((block) => block.text)).toEqual([
      "Hello",
      " world",
      "Second block",
    ]);
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(1),
      offset: 0,
    });
  });

  it("insertFromPaste inserts a fragment carrying an atom", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 5 });
    const result = editedDocument(state, {
      type: "insertFromPaste",
      data: {
        schema: RICH_FRAGMENT_SCHEMA,
        text: ` ${ATOM_REPLACEMENT}`,
        atoms: { m1: { type: "mention", offset: 1, label: "@user" } },
      },
    });
    expect(result.value.blocks[0]?.text).toBe(
      `Hello ${ATOM_REPLACEMENT} world`,
    );
    const atoms = Object.values(result.value.blocks[0]?.atoms ?? {});
    expect(atoms).toHaveLength(1);
    expect(atoms[0]).toMatchObject({ type: "mention", offset: 6 });
  });

  it("insertFromDrop follows paste insertion semantics", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 5 });
    const result = editedDocument(state, {
      type: "insertFromDrop",
      data: " dropped",
    });
    expect(result.value.blocks[0]?.text).toBe("Hello dropped world");
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(0),
      offset: 13,
    });
  });
});

describe("edit: delete intents", () => {
  it("deleteContentBackward removes one grapheme before the caret", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 5 });
    const result = editedDocument(state, { type: "deleteContentBackward" });
    expect(result.value.blocks[0]?.text).toBe("Hell world");
    expect(caretOf(result.selectionAfter).offset).toBe(4);
  });

  it("deleteContentBackward removes a whole emoji grapheme cluster", () => {
    const document = createRichDocument({
      id: "doc",
      blocks: [createRichBlock({ id: "b1", type: "paragraph", text: "a👍🏽b" })],
    });
    const emojiEnd = 1 + "👍🏽".length;
    const state = stateAt(document, { block: 0, offset: emojiEnd });
    const result = editedDocument(state, { type: "deleteContentBackward" });
    expect(result.value.blocks[0]?.text).toBe("ab");
  });

  it("deleteContentBackward at block start merges with the previous block", () => {
    const state = stateAt(documentFixture(), { block: 1, offset: 0 });
    const result = editedDocument(state, { type: "deleteContentBackward" });
    expect(result.value.blocks).toHaveLength(1);
    expect(result.value.blocks[0]?.text).toBe("Hello worldSecond block");
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(0),
      offset: 11,
    });
  });

  it("deleteContentForward at document end reports no-change", () => {
    const state = stateAt(documentFixture(), { block: 1, offset: 12 });
    const result = editedDocument(state, { type: "deleteContentForward" });
    expect(result.kind).toBe("no-change");
    expect(result.value.blocks[1]?.text).toBe("Second block");
    expect(result.patch).toEqual([]);
  });

  it("deleteWordForward removes the next word", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 0 });
    const result = editedDocument(state, { type: "deleteWordForward" });
    expect(result.value.blocks[0]?.text).toBe(" world");
  });

  it("deleteSoftLineBackward removes text back to the line start", () => {
    const document = createRichDocument({
      id: "doc",
      blocks: [
        createRichBlock({ id: "b1", type: "paragraph", text: "line one\nline two" }),
      ],
    });
    const state = stateAt(document, { block: 0, offset: 13 });
    const result = editedDocument(state, { type: "deleteSoftLineBackward" });
    expect(result.value.blocks[0]?.text).toBe("line one\n two");
  });

  it("deleteByCut removes the selected range without expanding a caret", () => {
    const state = stateAt(
      documentFixture(),
      { block: 0, offset: 6 },
      { block: 0, offset: 11 },
    );
    const result = editedDocument(state, { type: "deleteByCut" });
    expect(result.value.blocks[0]?.text).toBe("Hello ");
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(0),
      offset: 6,
    });

    const collapsed = edit(stateAt(documentFixture(), { block: 0, offset: 6 }), {
      type: "deleteByCut",
    });
    expect(collapsed).toMatchObject({
      ok: false,
      code: "empty_selection",
    });
  });
});

describe("edit: selection intents", () => {
  it("modifySelection moves the caret by character", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 0 });
    const result = editedDocument(state, {
      type: "modifySelection",
      alter: "move",
      direction: "forward",
      granularity: "character",
    });
    expect(result.kind).toBe("selection");
    expect(result.patch).toEqual([]);
    expect(caretOf(result.selectionAfter).offset).toBe(1);
  });

  it("modifySelection extends by word", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 0 });
    const result = editedDocument(state, {
      type: "modifySelection",
      alter: "extend",
      direction: "forward",
      granularity: "word",
    });
    const selection = result.selectionAfter;
    expect(selection?.anchor).toMatchObject({ offset: 0 });
    expect(caretOf(selection).offset).toBe(5);
  });

  it("modifySelection moves across soft lines with line granularity", () => {
    const document = createRichDocument({
      id: "doc",
      blocks: [
        createRichBlock({ id: "b1", type: "paragraph", text: "line one\nline two" }),
      ],
    });
    const state = stateAt(document, { block: 0, offset: 2 });
    const result = editedDocument(state, {
      type: "modifySelection",
      alter: "move",
      direction: "forward",
      granularity: "line",
    });
    const caret = caretOf(result.selectionAfter);
    expect(caret.offset).toBeGreaterThanOrEqual(9);
    expect(result.goalX).not.toBeNull();
  });

  it("modifySelection moves to the line boundary", () => {
    const document = createRichDocument({
      id: "doc",
      blocks: [
        createRichBlock({ id: "b1", type: "paragraph", text: "line one\nline two" }),
      ],
    });
    const state = stateAt(document, { block: 0, offset: 13 });
    const result = editedDocument(state, {
      type: "modifySelection",
      alter: "move",
      direction: "backward",
      granularity: "lineboundary",
    });
    expect(caretOf(result.selectionAfter).offset).toBe(9);
  });

  it("modifySelection moves to the document boundary", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 3 });
    const result = editedDocument(state, {
      type: "modifySelection",
      alter: "move",
      direction: "forward",
      granularity: "documentboundary",
    });
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(1),
      offset: 12,
    });
  });

  it("keeps the caret on the soft-wrapped line end across snap round trips", () => {
    const document = createRichDocument({
      id: "doc",
      blocks: [
        createRichBlock({ id: "b1", type: "paragraph", text: "line one line two" }),
      ],
    });
    const path = richTextPathForBlock(0);
    const lineSeeds: RichVisualLineSeed[] = [
      {
        id: "b1:0",
        blockId: "b1",
        blockIndex: 0,
        path,
        startOffset: 0,
        endOffset: 8,
        kind: "text",
        lineIndex: 0,
      },
      {
        id: "b1:1",
        blockId: "b1",
        blockIndex: 0,
        path,
        startOffset: 8,
        endOffset: 17,
        kind: "text",
        lineIndex: 1,
      },
    ];
    const env = { lineSeeds };
    const lineEnd: EditIntent = {
      type: "modifySelection",
      alter: "move",
      direction: "forward",
      granularity: "lineboundary",
    };

    const state = stateAt(document, { block: 0, offset: 2 });
    const first = edit(state, lineEnd, env);
    if (!first.ok || first.kind === "history") {
      throw new Error("Line boundary move failed.");
    }
    expect(caretOf(first.selectionAfter).offset).toBe(8);

    const second = edit(
      { document, selection: first.selectionAfter, goalX: first.goalX },
      lineEnd,
      env,
    );
    if (!second.ok || second.kind === "history") {
      throw new Error("Line boundary move failed.");
    }
    expect(caretOf(second.selectionAfter).offset).toBe(8);
  });

  it("setBaseAndExtent normalizes both selection endpoints", () => {
    const result = edit(
      { document: documentFixture(), selection: null },
      {
        type: "setBaseAndExtent",
        anchor: { path: richTextPathForBlock(0), offset: 2 },
        focus: { path: richTextPathForBlock(1), offset: 4 },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.kind === "history") {
      return;
    }
    expect(result.kind).toBe("selection");
    expect(caretOf(result.selectionAfter)).toEqual({
      path: richTextPathForBlock(1),
      offset: 4,
    });
  });
});

describe("edit: format and history intents", () => {
  it("formatBold toggles an inline range over the selection", () => {
    const state = stateAt(
      documentFixture(),
      { block: 0, offset: 0 },
      { block: 0, offset: 5 },
    );
    const bolded = editedDocument(state, { type: "formatBold" });
    expect(richInlineRangeActive(bolded.value, bolded.selectionAfter, "bold")).toBe(
      true,
    );

    const unbolded = editedDocument(
      { document: bolded.value, selection: bolded.selectionAfter },
      { type: "formatBold" },
    );
    expect(
      richInlineRangeActive(unbolded.value, unbolded.selectionAfter, "bold"),
    ).toBe(false);
  });

  it("formatBold on a collapsed selection reports empty_selection", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 3 });
    const result = edit(state, { type: "formatBold" });
    expect(result).toMatchObject({ ok: false, code: "empty_selection" });
  });

  it("formatRemove strips all inline ranges in the selected span", () => {
    const document = documentFixture();
    document.blocks[0] = {
      ...createRichBlock({
        id: "b1",
        type: "paragraph",
        text: "Hello world",
      }),
      ranges: {
        bold: { type: "bold", start: 0, end: 5 },
        underline: { type: "underline", start: 3, end: 8 },
      },
    };
    const state = stateAt(
      document,
      { block: 0, offset: 1 },
      { block: 0, offset: 7 },
    );
    const result = editedDocument(state, { type: "formatRemove" });

    expect(Object.values(result.value.blocks[0]?.ranges ?? {})).toEqual([
      { type: "bold", start: 0, end: 1 },
      { type: "underline", start: 7, end: 8 },
    ]);
    expect(result.selectionAfter).toEqual(state.selection);
  });

  it("history intents resolve to host instructions", () => {
    const state = stateAt(documentFixture(), { block: 0, offset: 0 });
    expect(edit(state, { type: "historyUndo" })).toEqual({
      ok: true,
      kind: "history",
      command: "undo",
    });
    expect(edit(state, { type: "historyRedo" })).toEqual({
      ok: true,
      kind: "history",
      command: "redo",
    });
  });

  it("edit intents without a selection report no_selection", () => {
    const result = edit(
      { document: documentFixture(), selection: null },
      { type: "insertText", text: "x" },
    );
    expect(result).toMatchObject({ ok: false, code: "no_selection" });
  });
});
