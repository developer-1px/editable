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

describe("translateEditorInput structural editing keys", () => {
  it("translates Tab and Shift+Tab to list depth commands", () => {
    const document = documentWithBlocks([
      {
        id: "list-1",
        type: "listItem",
        ordered: false,
        depth: 1,
        children: [{ type: "text", text: "Item" }],
      },
    ]);
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });

    const indent = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Tab",
    });
    const outdent = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Tab",
      shiftKey: true,
    });

    expectHandled(indent);
    expectHandled(outdent);
    expect(indent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/depth", value: 2 },
    ]);
    expect(outdent.patch).toMatchObject([
      { op: "replace", path: "/root/children/0/depth", value: 0 },
    ]);
    expect(indent.selectionAfter).toBe(selection);
  });

  it("translates Tab outside lists to text insertion instead of DOM focus movement", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "keydown", key: "Tab" },
    );

    expectHandled(result);
    expect(result.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "A\tB",
      },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("translates Shift+Tab outside lists to a selection-only no-op", () => {
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const result = translateEditorInput(documentWithText("AB"), selection, {
      type: "keydown",
      key: "Tab",
      shiftKey: true,
    });

    expectHandled(result);
    expect(result.patch).toEqual([]);
    expect(result.selectionAfter).toBe(selection);
  });

  it("translates structural editing keydown through headless commands", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const backspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
    });
    const del = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Delete",
    });
    const enter = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Enter",
    });

    expectHandled(backspace);
    expectHandled(del);
    expectHandled(enter);
    expect(backspace.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "B",
      },
    ]);
    expect(del.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "A",
      },
    ]);
    expect(enter.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0",
        value: { children: [{ type: "text", text: "A" }] },
      },
      {
        op: "add",
        path: "/root/children/1",
        value: { children: [{ type: "text", text: "B" }] },
      },
    ]);
  });

  it("uses Alt/Option, not Shift, for word deletion keydown", () => {
    const document = documentWithText("one two");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 7,
    });

    const shiftBackspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
      shiftKey: true,
    });
    const wordBackspace = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Backspace",
      altKey: true,
    });

    expectHandled(shiftBackspace);
    expectHandled(wordBackspace);
    expect(shiftBackspace.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one tw",
      },
    ]);
    expect(wordBackspace.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children/0/text",
        value: "one ",
      },
    ]);
  });

  it("blocks unsupported structural editing shortcuts as explicit no-ops", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const commandBackspace = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "Backspace",
        metaKey: true,
      },
      { platform: "mac" },
    );
    const commandDelete = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Delete",
      ctrlKey: true,
    });
    const altEnter = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Enter",
      altKey: true,
    });

    expectHandled(commandBackspace);
    expectHandled(commandDelete);
    expectHandled(altEnter);
    expect(commandBackspace.patch).toEqual([]);
    expect(commandDelete.patch).toEqual([]);
    expect(altEnter.patch).toEqual([]);
    expect(commandBackspace.selectionAfter).toBe(selection);
    expect(commandDelete.selectionAfter).toBe(selection);
    expect(altEnter.selectionAfter).toBe(selection);
  });

  it("keeps read-only input immutable while still moving the cursor", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const insert = translateEditorInput(
      document,
      selection,
      { type: "beforeinput", inputType: "insertText", data: "x" },
      { readOnly: true },
    );
    const paste = translateEditorInput(
      document,
      selection,
      { type: "paste", text: "x" },
      { readOnly: true },
    );
    const deleteBackward = translateEditorInput(
      document,
      selection,
      { type: "beforeinput", inputType: "deleteContentBackward" },
      { readOnly: true },
    );
    const backspace = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "Backspace" },
      { readOnly: true },
    );
    const printable = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "x" },
      { readOnly: true },
    );
    const imeStart = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "Process" },
      { readOnly: true },
    );
    const bold = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "b", metaKey: true },
      { platform: "mac", readOnly: true },
    );
    const tab = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "Tab" },
      { readOnly: true },
    );
    const right = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowRight" },
      { readOnly: true },
    );
    const shiftRight = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "ArrowRight", shiftKey: true },
      { readOnly: true },
    );
    const openRange = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 0 },
      { path: "/root/children/0/children/0/text", offset: 2 },
    );
    const collapseLeft = translateEditorInput(
      document,
      openRange,
      { type: "keydown", key: "ArrowLeft" },
      { readOnly: true },
    );
    const copy = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "c", metaKey: true },
      { readOnly: true },
    );

    expectHandled(insert);
    expectHandled(paste);
    expectHandled(deleteBackward);
    expectHandled(backspace);
    expectHandled(printable);
    expectHandled(imeStart);
    expectHandled(bold);
    expectHandled(tab);
    expectHandled(right);
    expectHandled(shiftRight);
    expectHandled(collapseLeft);
    expect(insert.patch).toEqual([]);
    expect(insert.selectionAfter).toBe(selection);
    expect(paste.patch).toEqual([]);
    expect(paste.selectionAfter).toBe(selection);
    expect(deleteBackward.patch).toEqual([]);
    expect(deleteBackward.selectionAfter).toBe(selection);
    expect(backspace.patch).toEqual([]);
    expect(backspace.selectionAfter).toBe(selection);
    expect(printable.patch).toEqual([]);
    expect(printable.selectionAfter).toBe(selection);
    expect(imeStart.patch).toEqual([]);
    expect(imeStart.selectionAfter).toBe(selection);
    expect(bold.patch).toEqual([]);
    expect(bold.selectionAfter).toBe(selection);
    expect(tab.patch).toEqual([]);
    expect(tab.selectionAfter).toBe(selection);
    expect(right.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
    expect(shiftRight.patch).toEqual([]);
    expect(shiftRight.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(shiftRight.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
    expect(collapseLeft.patch).toEqual([]);
    expect(collapseLeft.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(copy).toEqual({ ok: true, handled: false });
  });
});
