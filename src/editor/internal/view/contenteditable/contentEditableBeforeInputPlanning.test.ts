// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../../model/cursorCommands";
import { createContentEditableViewEngine } from "./contentEditableViewEngine";
import {
  documentWithBlocks,
  firstTextPath,
  installContentEditableViewTestCleanup,
  secondTextPath,
  setDOMBoundarySelection,
  setDOMRangeSelection,
  setDOMSelection,
  setupInlineAtomTextRoot,
  setupTextRoot,
} from "./contentEditableViewEngineTestUtils";

installContentEditableViewTestCleanup();

describe("contenteditable beforeinput native edit planning", () => {
  it("allows browser editing only inside the active text leaf", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Beta" }],
      },
    ]);
    const { root, first, second } = setupTextRoot();
    const session = createContentEditableViewEngine();

    setDOMSelection(first, 2);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 2 }),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });

    setDOMSelection(second, 1);

    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 2 }),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "runHeadless" });
  });

  it("allows composition text input from the native caret even if model selection is open", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();

    setDOMSelection(first, 2);

    expect(
      createContentEditableViewEngine().planBeforeInput(
        root,
        note,
        selectionFromCursorRange(
          note,
          { path: firstTextPath, offset: 1 },
          { path: firstTextPath, offset: 3 },
        ),
        { inputType: "insertCompositionText", isComposing: true },
      ),
    ).toEqual({ kind: "deferToContentEditable" });
  });

  it("does not defer composition text over ranges spanning multiple text leaves", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Beta" }],
      },
    ]);
    const { root, first, second } = setupTextRoot();

    setDOMRangeSelection(first, 1, second, 1);

    expect(
      createContentEditableViewEngine().planBeforeInput(
        root,
        note,
        selectionFromCursorRange(
          note,
          { path: firstTextPath, offset: 1 },
          { path: secondTextPath, offset: 1 },
        ),
        { inputType: "insertCompositionText", isComposing: true },
      ),
    ).toEqual({ kind: "runHeadless" });
  });

  it("keeps open range text insertion on the headless command path", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();

    setDOMSelection(first, 2);

    expect(
      createContentEditableViewEngine().planBeforeInput(
        root,
        note,
        selectionFromCursorRange(
          note,
          { path: firstTextPath, offset: 1 },
          { path: firstTextPath, offset: 3 },
        ),
        { inputType: "insertText", data: "x" },
      ),
    ).toEqual({ kind: "runHeadless" });
  });

  it("does not hand active-mark text insertion to native DOM editing", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();

    setDOMSelection(first, 2);

    expect(
      createContentEditableViewEngine().planBeforeInput(
        root,
        note,
        selectionFromCursorPoint(
          { path: firstTextPath, offset: 2 },
          { activeMarks: [{ type: "bold" }] },
        ),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "runHeadless" });
  });

  it("does not start a native dirty range from contenteditable false widgets", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "Alpha" },
          { type: "mention", id: "user-ada", label: "Ada" },
          { type: "text", text: "Beta" },
        ],
      },
    ]);
    const { root, mention } = setupInlineAtomTextRoot();
    const session = createContentEditableViewEngine();

    setDOMBoundarySelection(mention, 0);

    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({
          path: "/root/children/0/children/1",
          edge: "before",
        }),
        { inputType: "insertText", data: "x" },
      ),
    ).toEqual({ kind: "runHeadless" });
    expect(session.hasActiveEdit()).toBe(false);
  });

  it("maps browser history inputTypes to editor history decisions", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root } = setupTextRoot();
    const session = createContentEditableViewEngine();

    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "historyUndo" },
      ),
    ).toEqual({ kind: "history", direction: "undo" });
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "historyRedo" },
      ),
    ).toEqual({ kind: "history", direction: "redo" });
  });

  it("maps code block edges to the backing text leaf", () => {
    const note = documentWithBlocks([
      {
        id: "code-1",
        type: "codeBlock",
        text: "abc",
        language: "ts",
      },
    ]);
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">abc</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    expect(
      createContentEditableViewEngine().planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });
  });
});
