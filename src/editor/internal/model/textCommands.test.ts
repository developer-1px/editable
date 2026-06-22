import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../fixtures/unicodeGraphemeCorpus";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";
import {
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
  insertFigure,
  insertMention,
  insertText,
  splitParagraph,
} from "./textCommands";

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Text",
    tags: [],
  });
}

function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
}

function atomSelection(path: string) {
  return {
    selectedPointers: [path],
    selectionRanges: [
      {
        anchor: { path, edge: "before" as const },
        focus: { path, edge: "after" as const },
      },
    ],
    primaryIndex: 0,
    anchor: { path, edge: "before" as const },
    focus: { path, edge: "after" as const },
  };
}

describe("text commands", () => {
  it("inserts inside text by replacing only the affected text path", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const command = insertText(document, selection, "x");

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("returns patches and selection without mutating the input document", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const before = structuredClone(document);

    const insert = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      "x",
    );
    const remove = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );
    const split = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(insert);
    expectOk(remove);
    expectOk(split);
    expect(insert.patch.length).toBeGreaterThan(0);
    expect(remove.patch.length).toBeGreaterThan(0);
    expect(split.patch.length).toBeGreaterThan(0);
    expect(document).toEqual(before);
  });

  it("edits rich text block leaves through the same text command path", () => {
    const headingDocument = documentWithBlocks([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const listDocument = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const heading = insertText(
      headingDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      "x",
    );
    const list = insertText(
      listDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      "y",
    );

    expectOk(heading);
    expectOk(list);
    expect(heading.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
    expect(list.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AyB" },
    ]);
  });

  it("edits code block text through a block text leaf", () => {
    const document = documentWithBlocks([
      {
        id: "code-1",
        type: "codeBlock",
        text: "ab",
      },
    ]);

    const insert = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
      "x",
    );
    const newline = splitParagraph(
      document,
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
    );

    expectOk(insert);
    expectOk(newline);
    expect(insert.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "axb" },
    ]);
    expect(insert.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
    expect(newline.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "a\nb" },
    ]);
    expect(newline.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
  });

  it("preserves structured marks while editing text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
      },
    ]);

    const insert = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
      "x",
    );
    const deleteText = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
    );

    expectOk(insert);
    expectOk(deleteText);
    expect(insert.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "boxld",
      },
    ]);
    expect(insert.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(deleteText.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "bld" },
    ]);
    expect(deleteText.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("replaces a selected range inside one text node", () => {
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

    const command = insertText(document, selection, "x");

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxD" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("replaces a selected range across inline text and mention nodes", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "AB" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "CD" },
        ],
      },
    ]);
    const selection = {
      selectedPointers: ["/root/children/0/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/0/children/2/text", offset: 1 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/2/text", offset: 1 },
    };

    const command = insertText(document, selection, "x");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AxD" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("inserts before and after inline atoms using neighboring text runs", () => {
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

    const before = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "before",
      }),
      "x",
    );
    const after = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
      "y",
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "Ax" },
    ]);
    expect(after.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/2/text", value: "yB" },
    ]);
  });

  it("creates an inline text run when an atom has no neighboring text run", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
    ]);

    const command = insertText(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0",
        edge: "after",
      }),
      "x",
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/0/children/1",
        value: { type: "text", text: "x" },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/1/text",
      offset: 1,
    });
  });

  it("targets neighboring paragraphs around a figure", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    const before = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "before" }),
      "x",
    );
    const after = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "after" }),
      "y",
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "Ax" },
    ]);
    expect(after.patch).toMatchObject([
      { op: "replace", path: "/root/children/2/children/0/text", value: "yB" },
    ]);
  });

  it("creates paragraphs when inserting text before or after an isolated figure", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const before = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "before" }),
      "x",
    );
    const after = insertText(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
      "y",
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "x" }],
        },
      },
    ]);
    expect(after.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/1",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "y" }],
        },
      },
    ]);
  });

  it("restores value and selection through json-document undo and redo", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const jsonDocument = createJSONDocument(NoteDocumentSchema, document, {
      history: 10,
      selection: true,
      trustedInitial: true,
    });
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    jsonDocument.selection?.restore(selection);

    const command = insertText(jsonDocument.value, selection, "x");
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });

    jsonDocument.undo();

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    jsonDocument.redo();

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("deletes one text character backward and forward", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const backward = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
    );
    const forward = deleteForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expectOk(backward);
    expectOk(forward);
    expect(backward.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "A" },
    ]);
    expect(backward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(forward.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "B" },
    ]);
    expect(forward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("deletes one grapheme cluster backward and forward", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A😀B" }],
      },
    ]);

    const backward = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 3,
      }),
    );
    const forward = deleteForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(backward);
    expectOk(forward);
    expect(backward.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AB" },
    ]);
    expect(backward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(forward.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AB" },
    ]);
    expect(forward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("deletes one Unicode grapheme corpus cluster backward and forward", () => {
    for (const fixture of unicodeGraphemeCorpus) {
      const document = documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: unicodeFixtureText(fixture) }],
        },
      ]);
      const start = unicodeFixtureClusterStart();
      const end = unicodeFixtureClusterEnd(fixture);

      const backward = deleteBackward(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: end,
        }),
      );
      const forward = deleteForward(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: start,
        }),
      );

      expectOk(backward);
      expectOk(forward);
      expect(backward.patch, fixture.id).toMatchObject([
        {
          op: "replace",
          path: "/root/children/0/children/0/text",
          value: "AB",
        },
      ]);
      expect(backward.selectionAfter.focus, fixture.id).toMatchObject({
        path: "/root/children/0/children/0/text",
        offset: start,
      });
      expect(forward.patch, fixture.id).toMatchObject([
        {
          op: "replace",
          path: "/root/children/0/children/0/text",
          value: "AB",
        },
      ]);
      expect(forward.selectionAfter.focus, fixture.id).toMatchObject({
        path: "/root/children/0/children/0/text",
        offset: start,
      });
    }
  });

  it("deletes word ranges backward and forward through the same text leaf", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "one two" }],
      },
      {
        id: "code-1",
        type: "codeBlock",
        text: "alpha beta",
      },
    ]);

    const backward = deleteWordBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 7,
      }),
    );
    const forward = deleteWordForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );
    const code = deleteWordBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/1/text",
        offset: 10,
      }),
    );

    expectOk(backward);
    expectOk(forward);
    expectOk(code);
    expect(backward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one ",
      },
    ]);
    expect(backward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 4,
    });
    expect(forward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: " two",
      },
    ]);
    expect(forward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(code.patch).toMatchObject([
      { op: "replace", path: "/root/children/1/text", value: "alpha " },
    ]);
    expect(code.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/text",
      offset: 6,
    });
  });

  it("deletes atom units with word deletion commands", () => {
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
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const mentionForward = deleteWordForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );
    const mentionBackward = deleteWordBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/2/text",
        offset: 0,
      }),
    );
    const figureForward = deleteWordForward(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "before" }),
    );

    expectOk(mentionForward);
    expectOk(mentionBackward);
    expectOk(figureForward);
    expect(mentionForward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: { children: [{ type: "text", text: "AB" }] },
      },
    ]);
    expect(mentionBackward.patch).toEqual(mentionForward.patch);
    expect(figureForward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            id: "block-1",
            type: "paragraph",
            children: [
              { type: "text", text: "A" },
              { type: "mention", id: "user-1", label: "Ada" },
              { type: "text", text: "B" },
            ],
          },
        ],
      },
    ]);
  });

  it("deletes selected text ranges", () => {
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

    const command = deleteBackward(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AD" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("deletes selected ranges across inline atoms", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "AB" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "CD" },
        ],
      },
    ]);
    const selection = {
      selectedPointers: ["/root/children/0/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/0/children/2/text", offset: 1 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/2/text", offset: 1 },
    };

    const command = deleteBackward(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AD" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("deletes selected ranges through block atoms without deleting the following paragraph", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "CD" }],
      },
    ]);
    const selection = {
      selectedPointers: ["/root/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/2", edge: "before" as const },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/2", edge: "before" as const },
    };

    const command = deleteBackward(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            id: "block-1",
            type: "paragraph",
            children: [{ type: "text", text: "A" }],
          },
          {
            id: "block-2",
            type: "paragraph",
            children: [{ type: "text", text: "CD" }],
          },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("deletes selected ranges from code block interiors without falling back to focus-only edits", () => {
    const document = documentWithBlocks([
      {
        id: "code-1",
        type: "codeBlock",
        text: "abc",
      },
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "def" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/text", offset: 1 },
      { path: "/root/children/1/children/0/text", offset: 1 },
    );

    const command = deleteBackward(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { id: "code-1", type: "codeBlock", text: "a" },
          {
            id: "block-1",
            type: "paragraph",
            children: [{ type: "text", text: "ef" }],
          },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 1,
    });
  });

  it("inserts text over ranges ending inside code blocks without falling back to focus-only edits", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
      {
        id: "code-1",
        type: "codeBlock",
        text: "xy",
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/1/text", offset: 1 },
    );

    const command = insertText(document, selection, "Z");

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            id: "block-1",
            type: "paragraph",
            children: [{ type: "text", text: "AZ" }],
          },
          { id: "code-1", type: "codeBlock", text: "y" },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("deletes inline mention atoms from before or after edges", () => {
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

    const backward = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
    );
    const forward = deleteForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "before",
      }),
    );

    expectOk(backward);
    expectOk(forward);
    expect(backward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "AB" }],
      },
    ]);
    expect(forward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "AB" }],
      },
    ]);
    expect(backward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(forward.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("deletes figure blocks as whole atoms", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    const command = deleteForward(
      document,
      selectionFromCursorPoint({ path: "/root/children/1", edge: "before" }),
    );

    expectOk(command);
    expect(command.patch).toEqual([{ op: "remove", path: "/root/children/1" }]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("deletes selected figure blocks before applying key direction", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    const backward = deleteBackward(
      document,
      atomSelection("/root/children/1"),
    );
    const forward = deleteForward(document, atomSelection("/root/children/1"));

    expectOk(backward);
    expectOk(forward);
    expect(backward.patch).toEqual([
      { op: "remove", path: "/root/children/1" },
    ]);
    expect(forward.patch).toEqual([{ op: "remove", path: "/root/children/1" }]);
  });

  it("normalizes empty text runs after deletion", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);
    const onlyTextDocument = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
    ]);

    const removeRun = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );
    const keepEmptyAnchor = deleteBackward(
      onlyTextDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(removeRun);
    expectOk(keepEmptyAnchor);
    expect(removeRun.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
    ]);
    expect(removeRun.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0",
      edge: "before",
    });
    expect(keepEmptyAnchor.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "" },
    ]);
    expect(keepEmptyAnchor.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("normalizes an entire selected text run when deleting it next to an inline atom", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);

    const command = deleteBackward(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/0/text", offset: 1 },
      ),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
    ]);
  });

  it("splits a paragraph at a text cursor", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "A" }],
        },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "B" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("keeps insertion on the empty paragraph created before existing text", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Plain" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );

    const splitAfterP = splitParagraph(
      document.value,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );
    expectOk(splitAfterP);
    document.commit(splitAfterP.patch, {
      selectionAfter: splitAfterP.selectionAfter,
    });

    const splitAtStartOfRest = splitParagraph(
      document.value,
      splitAfterP.selectionAfter,
    );
    expectOk(splitAtStartOfRest);
    document.commit(splitAtStartOfRest.patch, {
      selectionAfter: splitAtStartOfRest.selectionAfter,
    });

    const insertIntoEmptyParagraph = insertText(
      document.value,
      splitAtStartOfRest.selectionAfter,
      "d",
    );
    expectOk(insertIntoEmptyParagraph);
    document.commit(insertIntoEmptyParagraph.patch, {
      selectionAfter: insertIntoEmptyParagraph.selectionAfter,
    });

    expect(document.value.root.children).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "P" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "d" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "lain" }],
      },
    ]);
    expect(document.selection?.snapshot()?.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 1,
    });
  });

  it("splits an empty paragraph into two empty paragraphs", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "" }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("exits an empty heading to an empty paragraph on split", () => {
    const document = documentWithBlocks([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "" }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "heading-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(command.patch).toHaveLength(1);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("exits empty quote and list item blocks to empty paragraphs on split", () => {
    const quoteDocument = documentWithBlocks([
      {
        id: "quote-1",
        type: "quote",
        children: [{ type: "text", text: "" }],
      },
    ]);
    const listDocument = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "" }],
      },
    ]);

    const quote = splitParagraph(
      quoteDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );
    const list = splitParagraph(
      listDocument,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expectOk(quote);
    expectOk(list);
    expect(quote.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "quote-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(list.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "list-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(quote.patch).toHaveLength(1);
    expect(list.patch).toHaveLength(1);
    expect(quote.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(list.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("treats whitespace-only list items as empty when splitting", () => {
    const document = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "   " }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 3,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "list-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      },
    ]);
    expect(command.patch).toHaveLength(1);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("replaces selected code text with a newline when splitting", () => {
    const document = documentWithBlocks([
      { id: "code-1", type: "codeBlock", text: "abc" },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/text", offset: 1 },
        { path: "/root/children/0/text", offset: 2 },
      ),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "a\nc" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
  });

  it("splits at the start of a selected inline range after deleting the selection", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "AB" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "CD" },
        ],
      },
    ]);
    const selection = {
      selectedPointers: ["/root/children/0/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/0/children/2/text", offset: 1 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/2/text", offset: 1 },
    };

    const command = splitParagraph(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { type: "paragraph", children: [{ type: "text", text: "A" }] },
          { type: "paragraph", children: [{ type: "text", text: "D" }] },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("preserves marks when splitting a paragraph", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB", marks: [{ type: "bold" }] }],
      },
    ]);

    const command = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        value: {
          children: [{ type: "text", text: "A", marks: [{ type: "bold" }] }],
        },
      },
      {
        value: {
          children: [{ type: "text", text: "B", marks: [{ type: "bold" }] }],
        },
      },
    ]);
  });

  it("applies active marks when inserting at a collapsed text caret", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertText(
      document,
      selectionFromCursorPoint(
        {
          path: "/root/children/0/children/0/text",
          offset: 1,
        },
        { activeMarks: [{ type: "bold" }] },
      ),
      "x",
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "x", marks: [{ type: "bold" }] },
          { type: "text", text: "B" },
        ],
      },
    ]);
  });

  it("splits before and after inline mention atoms on the expected side", () => {
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

    const beforeMention = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "before",
      }),
    );
    const afterMention = splitParagraph(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
    );

    expectOk(beforeMention);
    expectOk(afterMention);
    expect(beforeMention.patch).toMatchObject([
      {
        value: { children: [{ type: "text", text: "A" }] },
      },
      {
        value: {
          children: [
            { type: "mention", id: "user-1", label: "Ada" },
            { type: "text", text: "B" },
          ],
        },
      },
    ]);
    expect(beforeMention.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0",
      edge: "before",
    });
    expect(afterMention.patch).toMatchObject([
      {
        value: {
          children: [
            { type: "text", text: "A" },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
      },
      {
        value: { children: [{ type: "text", text: "B" }] },
      },
    ]);
    expect(afterMention.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("creates a paragraph before or after a figure on split", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const before = splitParagraph(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "before" }),
    );
    const after = splitParagraph(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      { op: "add", path: "/root/children/0", value: { type: "paragraph" } },
    ]);
    expect(after.patch).toMatchObject([
      { op: "add", path: "/root/children/1", value: { type: "paragraph" } },
    ]);
  });

  it("merges with the previous paragraph on Backspace at paragraph start", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    const command = deleteBackward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/1/children/0/text",
        offset: 0,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "AB" }],
      },
      { op: "remove", path: "/root/children/1" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("merges with the next paragraph on Delete at paragraph end", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    const command = deleteForward(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "AB" }],
      },
      { op: "remove", path: "/root/children/1" },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("commits split selectionAfter with the patch", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const jsonDocument = createJSONDocument(NoteDocumentSchema, document, {
      history: 10,
      selection: true,
      trustedInitial: true,
    });
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    jsonDocument.selection?.restore(selection);

    const command = splitParagraph(jsonDocument.value, selection);
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.value.root.children).toHaveLength(2);
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

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

  it("replaces selected atoms with typed text", () => {
    const inlineDocument = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "mention", id: "user-1", label: "Ada" }],
      },
    ]);
    const figureDocument = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    const inline = insertText(
      inlineDocument,
      atomSelection("/root/children/0/children/0"),
      "x",
    );
    const figure = insertText(
      figureDocument,
      atomSelection("/root/children/0"),
      "y",
    );

    expectOk(inline);
    expectOk(figure);
    expect(inline.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "x" }],
      },
    ]);
    expect(inline.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(figure.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "y" }],
        },
      },
    ]);
    expect(figure.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
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

  it("inserts a figure block between split paragraph sides", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertFigure(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { id: "figure-1", type: "figure", src: "/image.png" },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "A" }],
        },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: { id: "figure-1", type: "figure", src: "/image.png" },
      },
      {
        op: "add",
        path: "/root/children/2",
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "B" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("rejects unsafe figure sources before writing command patches", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertFigure(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { id: "figure-1", type: "figure", src: "javascript:alert(1)" },
    );

    expect(command).toEqual({
      ok: false,
      reason: "Figure src is invalid.",
    });
  });

  it("normalizes safe figure sources before writing command patches", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);

    const command = insertFigure(
      document,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { id: "figure-1", type: "figure", src: " /image.png " },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {},
      {
        value: { id: "figure-1", type: "figure", src: "/image.png" },
      },
      {},
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

  it("replaces a selected text range with a figure block", () => {
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

    const command = insertFigure(document, selection, {
      id: "figure-1",
      type: "figure",
      src: "/image.png",
    });

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "A" }],
        },
      },
      {
        value: { id: "figure-1", type: "figure", src: "/image.png" },
      },
      {
        value: {
          type: "paragraph",
          children: [{ type: "text", text: "D" }],
        },
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
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

  it("replaces multi-node selected ranges with a figure block", () => {
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

    const command = insertFigure(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/2/text", offset: 1 },
      ),
      { id: "figure-1", type: "figure", src: "/image.png" },
    );

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          {
            type: "paragraph",
            children: [{ type: "text", text: "" }],
          },
          { id: "figure-1", type: "figure", src: "/image.png" },
          {
            type: "paragraph",
            children: [{ type: "text", text: "" }],
          },
        ],
      },
    ]);
    expect(command.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("normalizes adjacent text after deleting an inline atom", () => {
    const jsonDocument = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            { type: "mention", id: "user-1", label: "Ada" },
            { type: "text", text: "B" },
          ],
        },
      ]),
      { history: 0, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    const command = deleteBackward(jsonDocument.value, selection);
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
  });

  it("normalizes adjacent text after replacing an inline atom with text", () => {
    const jsonDocument = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            { type: "mention", id: "user-1", label: "Ada" },
            { type: "text", text: "B" },
          ],
        },
      ]),
      { history: 0, selection: true, trustedInitial: true },
    );

    const command = insertText(
      jsonDocument.value,
      atomSelection("/root/children/0/children/1"),
      "x",
    );
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AxB" }],
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

  it("inserts a figure before or after an existing figure edge", () => {
    const document = documentWithBlocks([
      {
        id: "figure-1",
        type: "figure",
        src: "/one.png",
      },
    ]);

    const before = insertFigure(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "before" }),
      { id: "figure-2", type: "figure", src: "/two.png" },
    );
    const after = insertFigure(
      document,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
      { id: "figure-3", type: "figure", src: "/three.png" },
    );

    expectOk(before);
    expectOk(after);
    expect(before.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/0",
        value: { id: "figure-2", type: "figure", src: "/two.png" },
      },
    ]);
    expect(before.selectionAfter.focus).toMatchObject({
      path: "/root/children/0",
      edge: "after",
    });
    expect(after.patch).toMatchObject([
      {
        op: "add",
        path: "/root/children/1",
        value: { id: "figure-3", type: "figure", src: "/three.png" },
      },
    ]);
    expect(after.selectionAfter.focus).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("restores previous selection across atom insert undo and redo", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    const jsonDocument = createJSONDocument(NoteDocumentSchema, document, {
      history: 10,
      selection: true,
      trustedInitial: true,
    });
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    jsonDocument.selection?.restore(selection);

    const command = insertMention(jsonDocument.value, selection, {
      type: "mention",
      id: "user-1",
      label: "Ada",
    });
    expectOk(command);
    jsonDocument.commit(command.patch, {
      selectionAfter: command.selectionAfter,
    });

    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    jsonDocument.undo();

    expect(jsonDocument.value.root.children[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", text: "AB" }],
    });
    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    jsonDocument.redo();

    expect(jsonDocument.selection?.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
  });
});
