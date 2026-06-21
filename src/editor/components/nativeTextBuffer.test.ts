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
import { createNativeTextBuffer, setNativeSelection } from "./nativeTextBuffer";

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

describe("createNativeTextBuffer", () => {
  it("allows native input only inside the active text leaf", () => {
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
    const buffer = createNativeTextBuffer();

    setDOMSelection(first, 2);
    const point = buffer.pointForInput(
      root,
      note,
      selectionFromCursorPoint({ path: firstTextPath, offset: 2 }),
      "insertText",
    );

    expect(point).toEqual({ path: firstTextPath, offset: 2 });
    if (point === null) {
      throw new Error("Expected native point.");
    }
    buffer.begin(point);

    setDOMSelection(second, 1);

    expect(
      buffer.pointForInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 2 }),
        "insertText",
      ),
    ).toBeNull();
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
      createNativeTextBuffer().pointForInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 2 }),
        "insertReplacementText",
      ),
    ).toEqual({ path: firstTextPath, offset: 2 });
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
      createNativeTextBuffer().pointForInput(
        root,
        note,
        selectionFromCursorRange(
          note,
          { path: firstTextPath, offset: 1 },
          { path: firstTextPath, offset: 3 },
        ),
        "insertCompositionText",
      ),
    ).toEqual({ path: firstTextPath, offset: 2 });
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
      createNativeTextBuffer().pointForInput(
        root,
        note,
        selectionFromCursorPoint(
          { path: firstTextPath, offset: 2 },
          { activeMarks: [{ type: "bold" }] },
        ),
        "insertText",
      ),
    ).toBeNull();
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
    const buffer = createNativeTextBuffer();
    const point = { path: firstTextPath, offset: 5 };

    buffer.begin(point);
    first.textContent = "Alpha!";
    setDOMSelection(first, 6);

    const result = buffer.flush(root, note);

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
    expect(buffer.hasActiveEdit()).toBe(false);
  });

  it("consumes the final composition commit once after composition ends", () => {
    const buffer = createNativeTextBuffer();

    expect(buffer.consumeCompositionCommit("insertText")).toBe(false);

    buffer.begin({ path: firstTextPath, offset: 0 });
    buffer.markCompositionEnd();

    expect(buffer.consumeCompositionCommit("insertText")).toBe(true);
    expect(buffer.consumeCompositionCommit("insertText")).toBe(false);

    buffer.markCompositionEnd();
    expect(buffer.consumeCompositionCommit("insertFromComposition")).toBe(true);
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

    const point = createNativeTextBuffer().pointForInput(
      root,
      note,
      selectionFromCursorPoint({ path: "/root/children/0", edge: "after" }),
      "insertText",
    );

    expect(point).toEqual({ path: "/root/children/0/text", offset: 3 });
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

    setNativeSelection(root, note, { path: firstTextPath, offset: 0 });

    const selection = document.getSelection();
    expect(selection?.focusNode).toBeInstanceOf(Text);
    expect(selection?.focusNode?.parentElement).toBe(
      textRun(root, firstTextPath),
    );
    expect(selection?.focusOffset).toBe(0);
  });
});
