import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "./cursorCommands";
import {
  documentWithBlocks,
  expectHandled,
  expectOk,
} from "./editorRegressionTestUtils";
import { translateEditorInput } from "./inputAdapter";
import { NoteDocumentSchema } from "./noteDocument";
import { selectionForRender } from "./richSelection";
import { insertMention, insertText } from "./textCommands";

describe("editor undo selection regressions", () => {
  it("restores selection across undo and redo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AB" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    document.selection?.restore(selection);

    const command = insertMention(document.value, selection, {
      type: "mention",
      id: "user-1",
      label: "Ada",
    });
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    expect(document.selection?.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    document.undo();

    expect(document.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    document.redo();

    expect(document.selection?.focus).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
  });

  it("restores an open range selection across undo and redo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "AB" },
            { type: "mention", id: "user-1", label: "Ada" },
            { type: "text", text: "CD" },
          ],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
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
    document.selection?.restore(selection);

    const command = insertText(document.value, selection, "x");
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    expect(document.value.root.children).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "AxD" }],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });

    document.undo();

    expect(document.value.root.children).toMatchObject([
      {
        type: "paragraph",
        children: [
          { type: "text", text: "AB" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "CD" },
        ],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/root/children/0/children/2/text",
      offset: 1,
    });
    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/2/text", offset: 1 },
    });
    expect(
      selectionForRender(document.value, document.selection?.snapshot())
        ?.selectedPointers,
    ).toEqual(["/root/children/0/children/1"]);

    document.redo();

    expect(document.value.root.children).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "AxD" }],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("restores an open range selection across mention, figure, and paragraph after undo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Plain " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: " " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            { type: "text", text: " " },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", href: "https://example.com" }],
            },
            { type: "text", text: " " },
            { type: "mention", id: "user-ada", label: "Ada" },
          ],
        },
        {
          id: "figure-1",
          type: "figure",
          src: "/sample-figure.svg",
          alt: "Figure",
        },
        {
          id: "block-2",
          type: "paragraph",
          children: [{ type: "text", text: "After figure." }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = {
      selectedPointers: ["/root/children/0/children/9", "/root/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 3 },
          focus: { path: "/root/children/2", edge: "before" as const },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/root/children/0/children/0/text", offset: 3 },
      focus: { path: "/root/children/2", edge: "before" as const },
    };
    document.selection?.restore(selection);

    const command = insertText(document.value, selection, "x");
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    expect(document.value.root.children).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "Plax" }],
      },
      {
        type: "paragraph",
        children: [{ type: "text", text: "After figure." }],
      },
    ]);

    document.undo();

    expect(document.value.root.children).toHaveLength(3);
    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/root/children/0/children/0/text", offset: 3 },
      focus: { path: "/root/children/2", edge: "before" },
    });
    expect(
      selectionForRender(document.value, document.selection?.snapshot())
        ?.selectedPointers,
    ).toEqual(["/root/children/0/children/9", "/root/children/1"]);
  });

  it("restores an open range selection built by repeated Shift+ArrowRight after undo", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Plain " },
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "text", text: "italic", marks: [{ type: "italic" }] },
            { type: "text", text: " " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
            { type: "text", text: " " },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", href: "https://example.com" }],
            },
            { type: "text", text: " " },
            { type: "mention", id: "user-ada", label: "Ada" },
          ],
        },
        {
          id: "figure-1",
          type: "figure",
          src: "/sample-figure.svg",
          alt: "Figure",
        },
        {
          id: "block-2",
          type: "paragraph",
          children: [{ type: "text", text: "After figure." }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    document.selection?.restore(
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 3,
      }),
    );

    for (let count = 0; count < 31; count += 1) {
      const move = translateEditorInput(
        document.value,
        document.selection?.snapshot() ??
          selectionFromCursorPoint({
            path: "/root/children/0/children/0/text",
            offset: 3,
          }),
        { type: "keydown", key: "ArrowRight", shiftKey: true },
      );
      expectHandled(move);
      document.selection?.restore(move.selectionAfter);
    }

    const selection = document.selection?.snapshot();
    expect(
      selectionForRender(document.value, selection)?.selectedPointers,
    ).toEqual(["/root/children/0/children/9", "/root/children/1"]);

    const command = insertText(
      document.value,
      selection ??
        selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: 3,
        }),
      "x",
    );
    expectOk(command);
    document.commit(command.patch, { selectionAfter: command.selectionAfter });

    document.undo();

    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/root/children/0/children/0/text", offset: 3 },
      focus: { path: "/root/children/2/children/0/text", offset: 1 },
    });
    expect(
      selectionForRender(document.value, document.selection?.snapshot())
        ?.selectedPointers,
    ).toEqual(["/root/children/0/children/9", "/root/children/1"]);
  });
});
