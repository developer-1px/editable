import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { translateEditorInput } from "./inputAdapter";
import {
  documentWithBlocks,
  documentWithText,
  expectHandled,
} from "./inputAdapterTestUtils";

describe("translateEditorInput beforeinput mutations", () => {
  it("translates plain text beforeinput to insertText", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "beforeinput", inputType: "insertText", data: "x" },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
  });

  it("translates browser text insertion beforeinput variants to insertText", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const replacement = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertReplacementText",
      data: "x",
    });
    const paste = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertFromPaste",
      data: "paste",
    });
    const drop = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertFromDrop",
      data: "drop",
    });

    expectHandled(replacement);
    expectHandled(paste);
    expectHandled(drop);
    expect(replacement.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AxB" },
    ]);
    expect(paste.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "ApasteB",
      },
    ]);
    expect(drop.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "AdropB",
      },
    ]);
  });

  it("translates line break beforeinput through the block-specific split policy", () => {
    const paragraph = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "beforeinput", inputType: "insertLineBreak" },
    );
    const codeBlock = translateEditorInput(
      documentWithBlocks([{ id: "code-1", type: "codeBlock", text: "AB" }]),
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
      { type: "beforeinput", inputType: "insertLineBreak" },
    );

    expectHandled(paragraph);
    expect(paragraph.patch).toMatchObject([
      { op: "replace", path: "/root/children/0" },
      { op: "add", path: "/root/children/1" },
    ]);
    expect(paragraph.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });

    expectHandled(codeBlock);
    expect(codeBlock.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "A\nB" },
    ]);
    expect(codeBlock.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
  });

  it("translates paragraph beforeinput through the same block-specific split policy", () => {
    const paragraph = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "beforeinput", inputType: "insertParagraph" },
    );
    const codeBlock = translateEditorInput(
      documentWithBlocks([{ id: "code-1", type: "codeBlock", text: "AB" }]),
      selectionFromCursorPoint({ path: "/root/children/0/text", offset: 1 }),
      { type: "beforeinput", inputType: "insertParagraph" },
    );

    expectHandled(paragraph);
    expect(paragraph.patch).toMatchObject([
      { op: "replace", path: "/root/children/0" },
      { op: "add", path: "/root/children/1" },
    ]);
    expect(paragraph.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });

    expectHandled(codeBlock);
    expect(codeBlock.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/text", value: "A\nB" },
    ]);
    expect(codeBlock.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
  });

  it("routes empty typed block Enter through the block type exit policy", () => {
    const emptyHeading = documentWithBlocks([
      {
        id: "heading-1",
        type: "heading",
        level: 2,
        children: [{ type: "text", text: "" }],
      },
    ]);
    const whitespaceListItem = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 0,
        children: [{ type: "text", text: "  " }],
      },
    ]);

    const heading = translateEditorInput(
      emptyHeading,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
      { type: "keydown", key: "Enter" },
    );
    const list = translateEditorInput(
      whitespaceListItem,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
      { type: "beforeinput", inputType: "insertParagraph" },
    );

    expectHandled(heading);
    expectHandled(list);
    expect(heading.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: { id: "heading-1", type: "paragraph" },
      },
    ]);
    expect(list.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: { id: "list-1", type: "paragraph" },
      },
    ]);
    expect(heading.patch).toHaveLength(1);
    expect(list.patch).toHaveLength(1);
    expect(heading.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(list.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("translates generic delete and cut beforeinput over selections", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const deleteContent = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteContent",
    });
    const deleteByCut = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteByCut",
    });

    expectHandled(deleteContent);
    expectHandled(deleteByCut);
    expect(deleteContent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "AD" },
    ]);
    expect(deleteByCut.patch).toEqual(deleteContent.patch);
    expect(deleteByCut.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("translates text input over multi-node selections to range replacement", () => {
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
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/2/text", offset: 1 },
    );

    const result = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertText",
      data: "x",
    });

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          children: [{ type: "text", text: "AxD" }],
        },
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("translates browser character deletion and paragraph insertion beforeinput", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const backspace = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteContentBackward",
    });
    const deleteKey = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteContentForward",
    });
    const enter = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertParagraph",
    });

    expectHandled(backspace);
    expectHandled(deleteKey);
    expectHandled(enter);
    expect(backspace.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "B" },
    ]);
    expect(deleteKey.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/children/0/text", value: "A" },
    ]);
    expect(enter.patch).toMatchObject([
      { op: "replace", path: "/root/children/0" },
      { op: "add", path: "/root/children/1" },
    ]);
  });

  it("translates browser word deletion beforeinput to word delete commands", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "one two" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);
    const textEnd = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });
    const textStart = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    const beforeMention = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "before",
    });

    const backward = translateEditorInput(document, textEnd, {
      type: "beforeinput",
      inputType: "deleteWordBackward",
    });
    const forward = translateEditorInput(document, textStart, {
      type: "beforeinput",
      inputType: "deleteWordForward",
    });
    const atom = translateEditorInput(document, beforeMention, {
      type: "beforeinput",
      inputType: "deleteWordForward",
    });

    expectHandled(backward);
    expectHandled(forward);
    expectHandled(atom);
    expect(backward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one ",
      },
    ]);
    expect(forward.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: " two",
      },
    ]);
    expect(atom.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "one two" }],
        },
      },
    ]);
  });

  it("translates deletion over selected block ranges before applying key direction", () => {
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
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/2", edge: "before" },
    );

    const result = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "deleteContentForward",
    });

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { children: [{ type: "text", text: "A" }] },
          { children: [{ type: "text", text: "CD" }] },
        ],
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("translates Enter over selected ranges to delete then split at the range start", () => {
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
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/2/text", offset: 1 },
    );

    const result = translateEditorInput(document, selection, {
      type: "beforeinput",
      inputType: "insertParagraph",
    });

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children",
        value: [
          { children: [{ type: "text", text: "A" }] },
          { children: [{ type: "text", text: "D" }] },
        ],
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("does not mutate selection from beforeinput while composition is active", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(
      translateEditorInput(document, selection, {
        type: "beforeinput",
        inputType: "insertText",
        data: "x",
        isComposing: true,
      }),
    ).toEqual({ ok: true, handled: false });
  });
});
