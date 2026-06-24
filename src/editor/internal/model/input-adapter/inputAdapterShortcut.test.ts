import { describe, expect, it } from "vitest";
import {
  type CursorGeometryAdapter,
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../cursorCommands";
import { selectionForRender } from "../richSelection";
import { translateEditorInput } from "./inputAdapter";
import {
  documentWithBlocks,
  documentWithText,
  expectHandled,
  rect,
} from "./inputAdapterTestUtils";

describe("translateEditorInput shortcuts", () => {
  it("translates platform primary A to headless select-all", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
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
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    const ctrl = translateEditorInput(document, selection, {
      type: "keydown",
      key: "a",
      ctrlKey: true,
    });
    const meta = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "a",
        metaKey: true,
      },
      { platform: "mac" },
    );

    expectHandled(ctrl);
    expectHandled(meta);
    expect(ctrl.selectionAfter.anchor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(ctrl.selectionAfter.focus).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 1,
    });
    expect(ctrl.selectionAfter.selectedPointers).toEqual([]);
    expect(
      selectionForRender(document, ctrl.selectionAfter)?.selectedPointers,
    ).toEqual(["/root/children/0/children/1", "/root/children/1"]);
    expect(meta.selectionAfter).toEqual(ctrl.selectionAfter);
  });

  it("translates platform primary B and I to headless mark commands", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
    );

    const bold = translateEditorInput(document, selection, {
      type: "keydown",
      key: "b",
      ctrlKey: true,
    });
    const italic = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "i",
        metaKey: true,
      },
      { platform: "mac" },
    );

    expectHandled(bold);
    expectHandled(italic);
    expect(bold.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "bold" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
    expect(italic.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "italic" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("translates platform primary E and K to headless code and link mark commands", () => {
    const document = documentWithText("ABCD");
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: "https://openai.com" },
    );

    const code = translateEditorInput(document, selection, {
      type: "keydown",
      key: "e",
      ctrlKey: true,
    });
    const link = translateEditorInput(
      document,
      selection,
      {
        type: "keydown",
        key: "k",
        metaKey: true,
      },
      { platform: "mac" },
    );

    expectHandled(code);
    expectHandled(link);
    expect(code.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          { type: "text", text: "BC", marks: [{ type: "code" }] },
          { type: "text", text: "D" },
        ],
      },
    ]);
    expect(link.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          {
            type: "text",
            text: "BC",
            marks: [{ type: "link", href: "https://openai.com" }],
          },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("translates collapsed Ctrl+B to active mark selection context", () => {
    const result = translateEditorInput(
      documentWithText("AB"),
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 1,
      }),
      { type: "keydown", key: "b", ctrlKey: true },
    );

    expectHandled(result);
    expect(result.patch).toEqual([]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(result.selectionAfter.context).toEqual({
      activeMarks: [{ type: "bold" }],
    });
  });

  it("translates collapsed Ctrl+E and K to active mark selection context", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
      { pendingLinkHref: "https://openai.com" },
    );

    const code = translateEditorInput(document, selection, {
      type: "keydown",
      key: "e",
      ctrlKey: true,
    });
    const link = translateEditorInput(document, selection, {
      type: "keydown",
      key: "k",
      ctrlKey: true,
    });

    expectHandled(code);
    expectHandled(link);
    expect(code.patch).toEqual([]);
    expect(link.patch).toEqual([]);
    expect(code.selectionAfter.context).toEqual({
      pendingLinkHref: "https://openai.com",
      activeMarks: [{ type: "code" }],
    });
    expect(link.selectionAfter.context).toEqual({
      pendingLinkHref: "https://openai.com",
      activeMarks: [{ type: "link", href: "https://openai.com" }],
    });
  });

  it("uses macOS Ctrl-B/F/P/N as navigation, not formatting commands", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const geometry: CursorGeometryAdapter = {
      rectForPoint: () => rect(10, 20, 2, 18),
      pointFromCoordinates: (_x, y) => ({
        path: "/root/children/0/children/0/text",
        offset: y < 20 ? 0 : 2,
      }),
    };

    const backward = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "b", ctrlKey: true },
      { platform: "mac" },
    );
    const forward = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "f", ctrlKey: true },
      { platform: "mac" },
    );
    const up = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "p", ctrlKey: true },
      { geometry, platform: "mac" },
    );
    const down = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "n", ctrlKey: true },
      { geometry, platform: "mac" },
    );

    expectHandled(backward);
    expectHandled(forward);
    expectHandled(up);
    expectHandled(down);
    expect(backward.patch).toEqual([]);
    expect(forward.patch).toEqual([]);
    expect(up.patch).toEqual([]);
    expect(down.patch).toEqual([]);
    expect(backward.selectionAfter.focus).toMatchObject({ offset: 0 });
    expect(forward.selectionAfter.focus).toMatchObject({ offset: 2 });
    expect(up.selectionAfter.focus).toMatchObject({ offset: 0 });
    expect(down.selectionAfter.focus).toMatchObject({ offset: 2 });
    expect(backward.selectionAfter.context).toBeUndefined();
  });

  it("does not treat opposite primary, extra modifiers, AltGraph, or physical code as mark commands", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    const macControlB = translateEditorInput(
      document,
      selection,
      { type: "keydown", key: "b", ctrlKey: true },
      { platform: "mac" },
    );

    expectHandled(macControlB);
    expect(macControlB.selectionAfter.focus).toMatchObject({ offset: 0 });
    expect(macControlB.selectionAfter.context).toBeUndefined();
    expect(
      translateEditorInput(
        document,
        selection,
        { type: "keydown", key: "b", metaKey: true },
        { platform: "other" },
      ),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(
        document,
        selection,
        { type: "keydown", key: "b", ctrlKey: true, metaKey: true },
        { platform: "other" },
      ),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(
        document,
        selection,
        { type: "keydown", key: "b", ctrlKey: true, shiftKey: true },
        { platform: "other" },
      ),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(
        document,
        selection,
        { type: "keydown", key: "b", ctrlKey: true, altKey: true },
        { platform: "other" },
      ),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(
        document,
        selection,
        {
          type: "keydown",
          key: "b",
          ctrlKey: true,
          altKey: true,
          altGraphKey: true,
        },
        { platform: "other" },
      ),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(
        document,
        selection,
        { type: "keydown", key: ";", code: "KeyB", ctrlKey: true },
        { platform: "other" },
      ),
    ).toEqual({ ok: true, handled: false });
  });

  it("does not create link marks without a pending href", () => {
    const document = documentWithText("AB");
    const result = translateEditorInput(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/0/text", offset: 2 },
      ),
      { type: "keydown", key: "k", ctrlKey: true },
    );

    expect(result).toEqual({
      ok: false,
      reason: "Link href is required.",
    });
  });

  it("does not create link marks from unsafe pending hrefs", () => {
    const document = documentWithText("AB");
    const result = translateEditorInput(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/0/text", offset: 2 },
        { pendingLinkHref: "javascript:alert(1)" },
      ),
      { type: "keydown", key: "k", ctrlKey: true },
    );

    expect(result).toEqual({
      ok: false,
      reason: "Link href is invalid.",
    });
  });

  it("clears transient selection context on Escape without document mutation", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint(
      {
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
      {
        activeMarks: [{ type: "bold" }],
        pendingLinkHref: "https://openai.com",
        preferredX: 120,
      },
    );

    const result = translateEditorInput(document, selection, {
      type: "keydown",
      key: "Escape",
    });

    expectHandled(result);
    expect(result.patch).toEqual([]);
    expect(result.selectionAfter.focus).toEqual(selection.focus);
    expect(result.selectionAfter.selectionRanges).toEqual(
      selection.selectionRanges,
    );
    expect(result.selectionAfter.context).toBeUndefined();
  });

  it("passes F-keys and unsupported command shortcuts through", () => {
    const document = documentWithText("AB");
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "F1",
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "F12",
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "s",
        ctrlKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "p",
        metaKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "u",
        metaKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
    expect(
      translateEditorInput(document, selection, {
        type: "keydown",
        key: "Tab",
        altKey: true,
      }),
    ).toEqual({ ok: true, handled: false });
  });
});
