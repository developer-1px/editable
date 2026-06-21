// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../model/cursorCommands";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "../model/noteDocument";
import {
  createEditingHostInputSession,
  setEditingHostSelection,
} from "./editingHostInputSession";

const firstTextPath = "/root/children/0/children/0/text";
const secondTextPath = "/root/children/1/children/0/text";

afterEach(() => {
  document.body.innerHTML = "";
  document.getSelection()?.removeAllRanges();
});

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Native",
    tags: [],
  });
}

function setupTextRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="text-block" data-path="/root/children/0">',
    `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
    "</p>",
    '<p class="text-block" data-path="/root/children/1">',
    `<span class="text-run" data-path="${secondTextPath}">Beta</span>`,
    "</p>",
  ].join("");
  document.body.append(root);

  return {
    root,
    first: textRun(root, firstTextPath),
    second: textRun(root, secondTextPath),
  };
}

function textRun(root: ParentNode, path: string): HTMLElement {
  const element = root.querySelector(`[data-path="${path}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing text run for ${path}.`);
  }

  return element;
}

function setDOMSelection(element: HTMLElement, offset: number) {
  const textNode = element.firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error("Text run must contain a text node.");
  }

  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

describe("createEditingHostInputSession", () => {
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
    const session = createEditingHostInputSession();

    setDOMSelection(first, 2);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 2 }),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "deferToEditingHost" });

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

  it("allows replacement text input inside a collapsed text leaf", () => {
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
      createEditingHostInputSession().planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 2 }),
        { inputType: "insertReplacementText" },
      ),
    ).toEqual({ kind: "deferToEditingHost" });
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
      createEditingHostInputSession().planBeforeInput(
        root,
        note,
        selectionFromCursorRange(
          note,
          { path: firstTextPath, offset: 1 },
          { path: firstTextPath, offset: 3 },
        ),
        { inputType: "insertCompositionText", isComposing: true },
      ),
    ).toEqual({ kind: "deferToEditingHost" });
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
      createEditingHostInputSession().planBeforeInput(
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

  it("flushes native text mutations into one replace patch", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createEditingHostInputSession();

    setDOMSelection(first, 5);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 5 }),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "deferToEditingHost" });
    first.textContent = "Alpha!";
    setDOMSelection(first, 6);

    const result = session.flush(root, note);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toMatchObject([
      { op: "replace", path: firstTextPath, value: "Alpha!" },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 6,
    });
    expect(session.hasActiveEdit()).toBe(false);
  });

  it("consumes the final composition commit once after composition ends", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createEditingHostInputSession();

    setDOMSelection(first, 0);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "insertText", data: "A" },
      ),
    ).toEqual({ kind: "deferToEditingHost" });

    session.endComposition();

    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "insertText", data: "한" },
      ),
    ).toEqual({ kind: "commitComposition" });
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "insertText", data: "한" },
      ),
    ).toEqual({ kind: "deferToEditingHost" });

    session.endComposition();
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "insertFromComposition", data: "한" },
      ),
    ).toEqual({ kind: "commitComposition" });
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
    const session = createEditingHostInputSession();

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
      createEditingHostInputSession().planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "deferToEditingHost" });
  });

  it("places the native caret inside an empty text run", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "" }],
      },
    ]);
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="text-block" data-path="/root/children/0">',
      `<span class="text-run" data-path="${firstTextPath}"></span>`,
      "</p>",
    ].join("");
    document.body.append(root);

    setEditingHostSelection(root, note, { path: firstTextPath, offset: 0 });

    const selection = document.getSelection();
    expect(selection?.focusNode).toBeInstanceOf(Text);
    expect(selection?.focusNode?.parentElement).toBe(
      textRun(root, firstTextPath),
    );
    expect(selection?.focusOffset).toBe(0);
  });
});
