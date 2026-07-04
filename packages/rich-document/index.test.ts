import { describe, expect, it } from "vitest";
import * as RichDocumentPublic from "./index";
import {
  canonicalEditableAtomAttributes,
  canonicalEditableBlockAttributes,
  applyRichProjectionTextChange,
  createRichProjection,
  createRichBlock,
  createRichCursorFrame,
  createRichDocument,
  createRichVisualLineSeeds,
  EDITABLE_ATOM_ATTRIBUTE,
  EDITABLE_ATOM_TYPE_ATTRIBUTE,
  EDITABLE_BLOCK_ATTRIBUTE,
  EDITABLE_BLOCK_TYPE_ATTRIBUTE,
  EDITABLE_HEADING_LEVEL_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  insertRichAtom,
  mergeAdjacentRichBlocks,
  moveRichVirtualSelection,
  replaceRichTextRange,
  recoverRichVirtualSelection,
  richBlockStyleActive,
  richCursorSelectionAt,
  richInlineRangeActive,
  richModelOffsetToProjectionOffset,
  richProjectionBlockForTextPath,
  richProjectionOffsetToModelOffset,
  richProjectionTextToModelText,
  richTextFragmentFromRange,
  richTextSurfaceForBlock,
  richVirtualSelectionRange,
  RICH_TEXT_ATOM_REPLACEMENT,
  splitRichBlock,
  toggleRichBlockStyleForSelection,
  toggleRichInlineRange,
  toggleRichInlineRangeForSelection,
} from "./index";

function richFixture() {
  return createRichDocument({
    id: "note-1",
    blocks: [
      {
        ...createRichBlock({
          id: "b1",
          type: "heading",
          level: 1,
          text: `Hello ${RICH_TEXT_ATOM_REPLACEMENT} world`,
        }),
        atoms: {
          tag: {
            type: "tag",
            label: "#tag",
            offset: 6,
          },
        },
        ranges: {
          bold: {
            type: "bold",
            start: 0,
            end: 5,
          },
          link: {
            type: "link",
            href: "https://example.com",
            start: 8,
            end: 13,
          },
        },
      },
    ],
  });
}

function selection(start: number, end: number) {
  const anchor = { path: "/blocks/0/text", offset: start };
  const focus = { path: "/blocks/0/text", offset: end };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

describe("rich-document core model", () => {
  it("locks the runtime public API surface", () => {
    expect(Object.keys(RichDocumentPublic).sort()).toEqual([
      "EDITABLE_ATOM_ATTRIBUTE",
      "EDITABLE_ATOM_TYPE_ATTRIBUTE",
      "EDITABLE_BLOCK_ATTRIBUTE",
      "EDITABLE_BLOCK_TYPE_ATTRIBUTE",
      "EDITABLE_DOCUMENT_ATTRIBUTE",
      "EDITABLE_HEADING_LEVEL_ATTRIBUTE",
      "EDITABLE_MARK_ATTRIBUTE",
      "EDITABLE_TEXT_ATTRIBUTE",
      "RICH_DOCUMENT_SCHEMA",
      "RICH_TEXT_ATOM_REPLACEMENT",
      "RichBlockSchema",
      "RichDocumentSchema",
      "RichInlineAtomSchema",
      "RichInlineRangeSchema",
      "applyRichProjectionTextChange",
      "canonicalEditableAtomAttributes",
      "canonicalEditableBlockAttributes",
      "canonicalEditableDocumentAttributes",
      "canonicalEditableMarkAttributes",
      "createRichBlock",
      "createRichCursorFrame",
      "createRichDocument",
      "createRichProjection",
      "createRichVisualLineSeeds",
      "edit",
      "insertRichAtom",
      "mergeAdjacentRichBlocks",
      "moveRichVirtualSelection",
      "recoverRichVirtualSelection",
      "replaceRichTextRange",
      "richAtomsPathForTextPath",
      "richBlockIndexFromTextPath",
      "richBlockRangeFromSelection",
      "richBlockStyleActive",
      "richCursorPointAt",
      "richCursorSelectionAt",
      "richInlineRangeActive",
      "richModelOffsetToProjectionOffset",
      "richProjectionBlockForTextPath",
      "richProjectionOffsetToModelOffset",
      "richProjectionTextToModelText",
      "richRangesPathForTextPath",
      "richTextFragmentFromRange",
      "richTextPathForBlock",
      "richTextSurfaceForBlock",
      "richVirtualSelectionRange",
      "setRichBlockType",
      "splitRichBlock",
      "toggleRichBlockStyleForSelection",
      "toggleRichInlineRange",
      "toggleRichInlineRangeForSelection",
      "toggleRichTaskListItem",
    ]);
  });

  it("defines stable text surface paths for block-indexed json documents", () => {
    expect(richTextSurfaceForBlock(2)).toEqual({
      textPath: "/blocks/2/text",
      atomsPath: "/blocks/2/atoms",
      rangesPath: "/blocks/2/ranges",
    });
  });

  it("projects canonical editable HTML attributes without touching DOM APIs", () => {
    const block = createRichBlock({
      id: "title",
      type: "heading",
      level: 2,
      text: "Hello",
    });

    expect(canonicalEditableBlockAttributes(block, 0)).toEqual({
      [EDITABLE_BLOCK_ATTRIBUTE]: "title",
      [EDITABLE_BLOCK_TYPE_ATTRIBUTE]: "heading",
      [EDITABLE_HEADING_LEVEL_ATTRIBUTE]: "2",
      [EDITABLE_TEXT_ATTRIBUTE]: "/blocks/0/text",
    });
    expect(
      canonicalEditableAtomAttributes("tag-1", {
        type: "tag",
        label: "#core",
        offset: 0,
      }),
    ).toEqual({
      [EDITABLE_ATOM_ATTRIBUTE]: "tag-1",
      [EDITABLE_ATOM_TYPE_ATTRIBUTE]: "tag",
      contenteditable: "false",
    });
  });

  it("creates a Bear-style editable projection with syntax markers", () => {
    const projection = createRichProjection(richFixture(), selection(1, 3), {
      revealBlockSyntax: "selected",
      revealInlineSyntax: "selected",
    });
    const block = projection.blocks[0];

    expect(block?.text).toBe(`# **Hello** ${RICH_TEXT_ATOM_REPLACEMENT} world`);
    expect(block?.spans).toMatchObject([
      { kind: "syntax", marker: "# ", role: "blockPrefix" },
      { kind: "syntax", marker: "**", role: "rangeOpen" },
      { kind: "content", modelStart: 0, modelEnd: 5 },
      { kind: "syntax", marker: "**", role: "rangeClose" },
      { kind: "content", modelStart: 5, modelEnd: 6 },
      { kind: "atom", atomId: "tag", modelOffset: 6 },
      { kind: "content", modelStart: 7, modelEnd: 13 },
    ]);
    expect(block === undefined ? null : richProjectionOffsetToModelOffset(block, 2))
      .toBe(0);
    expect(block === undefined ? null : richModelOffsetToProjectionOffset(block, 0))
      .toBe(4);
  });

  it("creates visual line seeds before any DOM measurement", () => {
    const document = createRichDocument({
      id: "note-lines",
      blocks: [
        createRichBlock({
          id: "b1",
          text: `A\n\n${RICH_TEXT_ATOM_REPLACEMENT}`,
        }),
      ],
    });

    expect(createRichVisualLineSeeds(document)).toMatchObject([
      {
        blockId: "b1",
        kind: "text",
        path: "/blocks/0/text",
        startOffset: 0,
        endOffset: 1,
      },
      {
        blockId: "b1",
        kind: "empty",
        path: "/blocks/0/text",
        startOffset: 2,
        endOffset: 2,
      },
      {
        blockId: "b1",
        kind: "atom-only",
        path: "/blocks/0/text",
        startOffset: 3,
        endOffset: 4,
      },
    ]);
  });

  it("creates a headless cursor frame from rich model text", () => {
    const document = createRichDocument({
      id: "note-cursor",
      blocks: [
        {
          ...createRichBlock({
            id: "b1",
            text: `안녕\n${RICH_TEXT_ATOM_REPLACEMENT}Ada`,
          }),
          atoms: {
            tag: {
              type: "tag",
              label: "#core",
              offset: 3,
            },
          },
        },
      ],
    });

    const frame = createRichCursorFrame(document);

    expect(frame.lines.map((line) => ({
      path: line.path,
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      offsets: line.carets.map((caret) => caret.offset),
    }))).toEqual([
      {
        path: "/blocks/0/text",
        startOffset: 0,
        endOffset: 2,
        offsets: [0, 1, 2],
      },
      {
        path: "/blocks/0/text",
        startOffset: 3,
        endOffset: 7,
        offsets: [3, 4, 5, 6, 7],
      },
    ]);
    expect(
      frame.carets
        .filter((caret) => caret.atomId === "tag")
        .map((caret) => caret.offset),
    ).toEqual([3, 4]);
  });

  it("moves a virtual rich cursor by grapheme, word, line, and selection extension", () => {
    const document = createRichDocument({
      id: "note-cursor-move",
      blocks: [
        createRichBlock({
          id: "b1",
          text: "Hello world\nNext line",
        }),
      ],
    });
    const frame = createRichCursorFrame(document);
    const initial = richCursorSelectionAt(frame, "/blocks/0/text", 0);

    expect(initial).not.toBeNull();
    if (initial === null) return;

    const right = moveRichVirtualSelection(frame, initial, {
      unit: "grapheme",
      direction: "forward",
    });
    expect(right.focus.offset).toBe(1);

    const word = moveRichVirtualSelection(frame, initial, {
      unit: "word",
      direction: "forward",
    });
    expect(word.focus.offset).toBe(5);

    const lineEnd = moveRichVirtualSelection(frame, initial, {
      unit: "lineBoundary",
      direction: "forward",
    });
    expect(lineEnd.focus.offset).toBe(11);

    const down = moveRichVirtualSelection(frame, lineEnd, {
      unit: "visualLine",
      direction: "down",
    });
    expect(down.focus.offset).toBe(21);

    const extended = moveRichVirtualSelection(frame, initial, {
      unit: "grapheme",
      direction: "forward",
      extend: true,
    });
    expect(richVirtualSelectionRange(frame, extended)).toMatchObject({
      collapsed: false,
      direction: "forward",
      start: { offset: 0 },
      end: { offset: 1 },
    });
  });

  it("moves line boundaries using supplied visual line seeds", () => {
    const document = createRichDocument({
      id: "note-softwrap-cursor",
      blocks: [
        createRichBlock({
          id: "b1",
          text: "Soft wrapped inline rich text",
        }),
      ],
    });
    const frame = createRichCursorFrame(document, {
      lineSeeds: [
        {
          blockId: "b1",
          blockIndex: 0,
          endOffset: 12,
          id: "b1:visual:0:0-12",
          kind: "text",
          lineIndex: 0,
          path: "/blocks/0/text",
          startOffset: 0,
        },
        {
          blockId: "b1",
          blockIndex: 0,
          endOffset: 29,
          id: "b1:visual:1:13-29",
          kind: "text",
          lineIndex: 1,
          path: "/blocks/0/text",
          startOffset: 13,
        },
      ],
    });
    const initial = richCursorSelectionAt(frame, "/blocks/0/text", 2);

    expect(initial).not.toBeNull();
    if (initial === null) return;

    const lineEnd = moveRichVirtualSelection(frame, initial, {
      unit: "lineBoundary",
      direction: "forward",
    });
    expect(lineEnd.focus.offset).toBe(12);
  });

  it("keeps visual line affinity at shared soft-wrap boundaries", () => {
    const document = createRichDocument({
      id: "note-shared-softwrap-boundary",
      blocks: [
        createRichBlock({
          id: "b1",
          text: "abcdef",
        }),
      ],
    });
    const frame = createRichCursorFrame(document, {
      lineSeeds: [
        {
          blockId: "b1",
          blockIndex: 0,
          endOffset: 3,
          id: "b1:visual:0:0-3",
          kind: "text",
          lineIndex: 0,
          path: "/blocks/0/text",
          startOffset: 0,
        },
        {
          blockId: "b1",
          blockIndex: 0,
          endOffset: 6,
          id: "b1:visual:1:3-6",
          kind: "text",
          lineIndex: 1,
          path: "/blocks/0/text",
          startOffset: 3,
        },
      ],
    });
    const beforeBoundary = richCursorSelectionAt(
      frame,
      "/blocks/0/text",
      3,
      "before",
    );
    const afterBoundary = richCursorSelectionAt(
      frame,
      "/blocks/0/text",
      3,
      "after",
    );

    expect(beforeBoundary?.focus.visualAffinity).toMatchObject({
      edge: "end",
      lineOrder: 0,
    });
    expect(afterBoundary?.focus.visualAffinity).toMatchObject({
      edge: "start",
      lineOrder: 1,
    });

    const insideSecondLine = richCursorSelectionAt(frame, "/blocks/0/text", 4);
    expect(insideSecondLine).not.toBeNull();
    if (insideSecondLine === null) return;

    const secondLineStart = moveRichVirtualSelection(frame, insideSecondLine, {
      unit: "lineBoundary",
      direction: "backward",
    });
    expect(secondLineStart.focus).toMatchObject({
      offset: 3,
      visualAffinity: {
        edge: "start",
        lineOrder: 1,
      },
    });

    const secondLineEnd = moveRichVirtualSelection(frame, secondLineStart, {
      unit: "lineBoundary",
      direction: "forward",
    });
    expect(secondLineEnd.focus).toMatchObject({
      offset: 6,
      visualAffinity: {
        edge: "end",
        lineOrder: 1,
      },
    });
  });

  it("uses measured caret x as the vertical movement goal", () => {
    const document = createRichDocument({
      id: "note-measured-vertical-x",
      blocks: [
        createRichBlock({
          id: "b1",
          text: "abcdefgh",
        }),
      ],
    });
    const frame = createRichCursorFrame(document, {
      lineSeeds: [
        {
          blockId: "b1",
          blockIndex: 0,
          caretMetrics: [
            { offset: 0, x: 0 },
            { offset: 1, x: 20 },
            { offset: 2, x: 100 },
            { offset: 3, x: 130 },
            { offset: 4, x: 150 },
          ],
          endOffset: 4,
          id: "b1:visual:0:0-4",
          kind: "text",
          lineIndex: 0,
          path: "/blocks/0/text",
          startOffset: 0,
        },
        {
          blockId: "b1",
          blockIndex: 0,
          caretMetrics: [
            { offset: 4, x: 0 },
            { offset: 5, x: 30 },
            { offset: 6, x: 50 },
            { offset: 7, x: 98 },
            { offset: 8, x: 140 },
          ],
          endOffset: 8,
          id: "b1:visual:1:4-8",
          kind: "text",
          lineIndex: 1,
          path: "/blocks/0/text",
          startOffset: 4,
        },
      ],
    });
    const initial = richCursorSelectionAt(frame, "/blocks/0/text", 2);

    expect(initial).not.toBeNull();
    if (initial === null) return;

    const down = moveRichVirtualSelection(frame, initial, {
      unit: "visualLine",
      direction: "down",
    });

    expect(down.goalX).toBe(100);
    expect(down.focus).toMatchObject({
      offset: 7,
      visualAffinity: {
        lineOrder: 1,
      },
    });
  });

  it("restores cursor location through model changes without DOM Range", () => {
    const document = createRichDocument({
      id: "note-cursor-restore",
      blocks: [
        createRichBlock({ id: "b1", text: "안녕" }),
        createRichBlock({ id: "b2", text: "Second" }),
      ],
    });
    const frame = createRichCursorFrame(document);
    const koreanEnd = richCursorSelectionAt(frame, "/blocks/0/text", 2);

    expect(koreanEnd).not.toBeNull();
    if (koreanEnd === null) return;

    const inserted = replaceRichTextRange(document, "b1", 2, 2, "\n");

    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const insertedFrame = createRichCursorFrame(inserted.value);
    const afterEnter = richCursorSelectionAt(insertedFrame, "/blocks/0/text", 3);
    expect(afterEnter?.focus).toMatchObject({
      blockId: "b1",
      path: "/blocks/0/text",
      offset: 3,
    });

    const secondBlock = richCursorSelectionAt(frame, "/blocks/1/text", 3);
    expect(secondBlock).not.toBeNull();
    if (secondBlock === null) return;
    const shiftedDocument = createRichDocument({
      id: "note-cursor-restore",
      blocks: [
        createRichBlock({ id: "intro", text: "Intro" }),
        ...document.blocks,
      ],
    });
    const shiftedFrame = createRichCursorFrame(shiftedDocument);
    const recovered = recoverRichVirtualSelection(shiftedFrame, secondBlock);

    expect(recovered.focus).toMatchObject({
      blockId: "b2",
      path: "/blocks/2/text",
      offset: 3,
    });
  });

  it("applies projection marker edits back to the semantic document", () => {
    const document = richFixture();
    const projection = createRichProjection(document, selection(1, 3), {
      revealBlockSyntax: "selected",
      revealInlineSyntax: "selected",
    });
    const block = richProjectionBlockForTextPath(projection, "/blocks/0/text");

    expect(block === null ? null : richProjectionTextToModelText(block, "Hello world"))
      .toBe("Hello world");
    const result = applyRichProjectionTextChange(
      document,
      projection,
      "/blocks/0/text",
      "Hello world",
      selection(5, 5),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/blocks/0",
        value: {
          id: "b1",
          type: "paragraph",
          text: "Hello world",
          ranges: {},
        },
      },
    ]);
  });

  it("extracts a local text fragment with atom and range offsets rebased", () => {
    const fragment = richTextFragmentFromRange(richFixture(), "b1", 6, 13);

    expect(fragment).toEqual({
      schema: "interactive-os.rich-document@1",
      text: `${RICH_TEXT_ATOM_REPLACEMENT} world`,
      atoms: {
        tag: {
          type: "tag",
          label: "#tag",
          offset: 0,
        },
      },
      ranges: {
        link: {
          type: "link",
          href: "https://example.com",
          start: 2,
          end: 7,
        },
      },
    });
  });

  it("replaces text while rebasing atoms, ranges, and selectionAfter", () => {
    const result = replaceRichTextRange(richFixture(), "b1", 6, 7, {
      schema: "interactive-os.rich-document@1",
      text: RICH_TEXT_ATOM_REPLACEMENT,
      atoms: {
        tag: {
          type: "tag",
          label: "#next",
          offset: 0,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks[0]?.text).toBe(`Hello ${RICH_TEXT_ATOM_REPLACEMENT} world`);
    expect(result.value.blocks[0]?.atoms).toEqual({
      tag: {
        type: "tag",
        label: "#next",
        offset: 6,
      },
    });
    expect(result.selectionAfter?.focus).toMatchObject({
      path: "/blocks/0/text",
      offset: 7,
    });
  });

  it("inserts an atom as one model character", () => {
    const document = createRichDocument({
      id: "note",
      blocks: [createRichBlock({ id: "p1", text: "Hello" })],
    });
    const result = insertRichAtom(document, "p1", 5, "mention-ada", {
      type: "mention",
      label: "@Ada",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks[0]?.text).toBe(`Hello${RICH_TEXT_ATOM_REPLACEMENT}`);
    expect(result.value.blocks[0]?.atoms["mention-ada"]).toEqual({
      type: "mention",
      label: "@Ada",
      offset: 5,
    });
  });

  it("toggles an inline range on and off without changing text", () => {
    const document = createRichDocument({
      id: "note",
      blocks: [createRichBlock({ id: "p1", text: "Hello" })],
    });
    const added = toggleRichInlineRange(document, "p1", 0, 5, { type: "bold" });

    expect(added.ok).toBe(true);
    if (!added.ok) return;
    expect(Object.values(added.value.blocks[0]?.ranges ?? {})).toEqual([
      { type: "bold", start: 0, end: 5 },
    ]);

    const removed = toggleRichInlineRange(added.value, "p1", 1, 4, {
      type: "bold",
    });

    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(Object.values(removed.value.blocks[0]?.ranges ?? {})).toEqual([
      { type: "bold", start: 0, end: 1 },
      { type: "bold", start: 4, end: 5 },
    ]);
  });

  it("applies block style to a selected text range by splitting blocks", () => {
    const document = createRichDocument({
      id: "note",
      blocks: [createRichBlock({ id: "p1", text: "Hello world" })],
    });
    const result = toggleRichBlockStyleForSelection(document, selection(0, 5), {
      type: "heading",
      level: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks).toMatchObject([
      { id: "p1", type: "heading", level: 1, text: "Hello" },
      { id: "p1-after", type: "paragraph", text: " world" },
    ]);
    expect(richBlockStyleActive(result.value, result.selectionAfter, {
      type: "heading",
      level: 1,
    })).toBe(true);
  });

  it("toggles inline ranges from a headless selection", () => {
    const document = createRichDocument({
      id: "note",
      blocks: [createRichBlock({ id: "p1", text: "Hello world" })],
    });
    const result = toggleRichInlineRangeForSelection(
      document,
      selection(6, 11),
      { type: "underline" },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.values(result.value.blocks[0]?.ranges ?? {})).toEqual([
      { type: "underline", start: 6, end: 11 },
    ]);
    expect(richInlineRangeActive(result.value, result.selectionAfter, "underline"))
      .toBe(true);
  });

  it("splits a block while preserving sidecar offsets in both blocks", () => {
    const result = splitRichBlock(richFixture(), "b1", 7, "b2");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.blocks.map((block) => block.id)).toEqual(["b1", "b2"]);
    expect(result.value.blocks[0]?.text).toBe(`Hello ${RICH_TEXT_ATOM_REPLACEMENT}`);
    expect(result.value.blocks[0]?.atoms.tag?.offset).toBe(6);
    expect(result.value.blocks[1]?.text).toBe(" world");
    expect(result.value.blocks[1]?.ranges.link).toMatchObject({
      start: 1,
      end: 6,
    });
  });

  it("merges adjacent blocks while preserving the left block identity", () => {
    const split = splitRichBlock(richFixture(), "b1", 7, "b2");

    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const merged = mergeAdjacentRichBlocks(split.value, "b1", "b2");

    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.value.blocks).toHaveLength(1);
    expect(merged.value.blocks[0]?.id).toBe("b1");
    expect(merged.value.blocks[0]?.text).toBe(`Hello ${RICH_TEXT_ATOM_REPLACEMENT} world`);
    expect(merged.value.blocks[0]?.atoms.tag?.offset).toBe(6);
    expect(merged.value.blocks[0]?.ranges.link).toMatchObject({
      start: 8,
      end: 13,
    });
  });
});
