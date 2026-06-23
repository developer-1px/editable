import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../../fixtures/unicodeGraphemeCorpus";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { NoteDocumentSchema } from "../noteDocument";
import { deleteBackward, deleteForward } from "./textCommands";
import {
  atomSelection,
  documentWithBlocks,
  expectOk,
} from "./textCommandTestUtils";

describe("text command deletion", () => {
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
});
