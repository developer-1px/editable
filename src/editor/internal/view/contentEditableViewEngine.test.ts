// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { EDITABLE_CLIPBOARD_MIME } from "../model/clipboard";
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
  contentEditableBeforeInputFromEvent,
  createContentEditableViewEngine,
  readContentEditableSelection,
  scrollContentEditableSelectionIntoView,
  setContentEditableSelection,
} from "./contentEditableViewEngine";

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

function setupShadowTextRoot() {
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="text-block" data-path="/root/children/0">',
    `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
    "</p>",
  ].join("");
  shadowRoot.append(root);
  document.body.append(host);

  return {
    root,
    shadowRoot,
    first: textRun(root, firstTextPath),
  };
}

function installShadowSelection(shadowRoot: ShadowRoot) {
  let range: Range | null = null;
  const selection = {
    get anchorNode() {
      return range?.startContainer ?? null;
    },
    get anchorOffset() {
      return range?.startOffset ?? 0;
    },
    get focusNode() {
      return range?.endContainer ?? null;
    },
    get focusOffset() {
      return range?.endOffset ?? 0;
    },
    removeAllRanges() {
      range = null;
    },
    addRange(nextRange: Range) {
      range = nextRange.cloneRange();
    },
  };

  Object.defineProperty(shadowRoot, "getSelection", {
    configurable: true,
    value: () => selection as Selection,
  });

  return selection;
}

function setupInlineAtomTextRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="text-block" data-path="/root/children/0">',
    `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
    '<span class="mention-chip" contenteditable="false" data-path="/root/children/0/children/1">@Ada</span>',
    '<span class="text-run" data-path="/root/children/0/children/2/text">Beta</span>',
    "</p>",
  ].join("");
  document.body.append(root);

  const block = root.querySelector('[data-path="/root/children/0"]');
  const mention = root.querySelector(
    '[data-path="/root/children/0/children/1"]',
  );
  if (!(block instanceof HTMLElement) || !(mention instanceof HTMLElement)) {
    throw new Error("Fixture failed to render inline atom root.");
  }

  return {
    root,
    block,
    first: textRun(root, firstTextPath),
    mention,
    second: textRun(root, "/root/children/0/children/2/text"),
  };
}

function textRun(root: ParentNode, path: string): HTMLElement {
  const element = root.querySelector(`[data-path="${path}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing text run for ${path}.`);
  }

  return element;
}

function firstTextNodeInside(element: HTMLElement): Text {
  const textWalker = element.ownerDocument.createTreeWalker(element, 4);
  const textNode = textWalker.nextNode();
  if (!(textNode instanceof Text)) {
    throw new Error("Element must contain a text node.");
  }

  return textNode;
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

function setDOMRangeSelection(
  anchor: HTMLElement,
  anchorOffset: number,
  focus: HTMLElement,
  focusOffset: number,
) {
  const anchorText = anchor.firstChild;
  const focusText = focus.firstChild;
  if (!(anchorText instanceof Text) || !(focusText instanceof Text)) {
    throw new Error("Text run must contain a text node.");
  }

  const range = document.createRange();
  range.setStart(anchorText, anchorOffset);
  range.setEnd(focusText, focusOffset);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

function setDOMBoundarySelection(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

function beforeInputTransferEvent(
  inputType: string,
  data: Record<string, string>,
) {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType,
  });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      getData(type: string) {
        return data[type] ?? "";
      },
    },
  });

  return event;
}

describe("createContentEditableViewEngine", () => {
  it("reads structured transfer text from paste and drop beforeinput events", () => {
    const structured = JSON.stringify({
      schema: "editable-clipboard@1",
      plainText: "structured",
    });

    expect(
      contentEditableBeforeInputFromEvent(
        beforeInputTransferEvent("insertFromPaste", {
          [EDITABLE_CLIPBOARD_MIME]: structured,
        }),
      ),
    ).toMatchObject({ data: "structured", format: "plain" });
    expect(
      contentEditableBeforeInputFromEvent(
        beforeInputTransferEvent("insertFromDrop", {
          "text/markdown": "**markdown**",
        }),
      ),
    ).toMatchObject({ data: "**markdown**", format: "markdown" });
  });

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

  it("flushes native text mutations into one replace patch", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createContentEditableViewEngine();

    setDOMSelection(first, 5);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 5 }),
        { inputType: "insertText" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });
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

  it("limits dirty reparse to the marked active text leaf", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha", marks: [{ type: "bold" }] }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createContentEditableViewEngine();
    first.innerHTML = '<strong class="rich-strong">Alpha</strong>';

    setDOMBoundarySelection(firstTextNodeInside(first), 5);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 5 }),
        { inputType: "insertText", data: "!" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });

    const strong = first.querySelector("strong");
    if (strong === null) {
      throw new Error("Fixture must contain a mark wrapper.");
    }
    strong.textContent = "Alpha!";
    setDOMBoundarySelection(firstTextNodeInside(first), 6);

    const result = session.flush(root, note);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.path).toBe(firstTextPath);
    expect(result.patch).toEqual([
      { op: "replace", path: firstTextPath, value: "Alpha!" },
    ]);
    expect(first.querySelector("strong")).not.toBe(null);
  });

  it("restores same-text native formatting wrapper drift without creating a patch", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createContentEditableViewEngine();

    setDOMSelection(first, 5);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 5 }),
        { inputType: "insertText", data: "!" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });

    first.innerHTML = '<strong data-native-format="true">Alpha</strong>';
    setDOMBoundarySelection(firstTextNodeInside(first), 5);

    const result = session.flush(root, note);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected flush result.");
    }
    expect(result.changed).toBe(false);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 5,
    });
    expect(first.querySelector("[data-native-format]")).toBe(null);
    expect(first.childNodes).toHaveLength(1);
    expect(first.firstChild).toBeInstanceOf(Text);
    expect(first.textContent).toBe("Alpha");
  });

  it("keeps offset zero insertText native at editable text starts after inline boundaries", () => {
    const afterBoldTextPath = "/root/children/0/children/2/text";
    const afterLinkTextPath = "/root/children/0/children/4/text";
    const afterMentionTextPath = "/root/children/0/children/6/text";
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "Plain" },
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          { type: "text", text: "AfterBold" },
          {
            type: "text",
            text: "Link",
            marks: [{ type: "link", href: "https://example.com" }],
          },
          { type: "text", text: "AfterLink" },
          { type: "mention", id: "user-ada", label: "Ada" },
          { type: "text", text: "AfterMention" },
        ],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "BlockStart" }],
      },
    ]);
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="text-block" data-path="/root/children/0">',
      `<span class="text-run" data-path="${firstTextPath}">Plain</span>`,
      '<span class="text-run" data-path="/root/children/0/children/1/text"><strong>Bold</strong></span>',
      `<span class="text-run" data-path="${afterBoldTextPath}">AfterBold</span>`,
      '<span class="text-run" data-path="/root/children/0/children/3/text"><a class="rich-link" href="https://example.com">Link</a></span>',
      `<span class="text-run" data-path="${afterLinkTextPath}">AfterLink</span>`,
      '<span class="mention-chip" contenteditable="false" data-path="/root/children/0/children/5">@Ada</span>',
      `<span class="text-run" data-path="${afterMentionTextPath}">AfterMention</span>`,
      "</p>",
      '<p class="text-block" data-path="/root/children/1">',
      `<span class="text-run" data-path="${secondTextPath}">BlockStart</span>`,
      "</p>",
    ].join("");
    document.body.append(root);

    const cases: Array<{
      label: string;
      select: () => void;
      selectionPath: string;
    }> = [
      {
        label: "paragraph start",
        select: () => setDOMSelection(textRun(root, firstTextPath), 0),
        selectionPath: firstTextPath,
      },
      {
        label: "after bold mark",
        select: () => setDOMSelection(textRun(root, afterBoldTextPath), 0),
        selectionPath: afterBoldTextPath,
      },
      {
        label: "after link mark",
        select: () => setDOMSelection(textRun(root, afterLinkTextPath), 0),
        selectionPath: afterLinkTextPath,
      },
      {
        label: "after contenteditable=false mention",
        select: () => setDOMSelection(textRun(root, afterMentionTextPath), 0),
        selectionPath: afterMentionTextPath,
      },
      {
        label: "block start edge",
        select: () => {
          const secondBlock = root.querySelector(
            '[data-path="/root/children/1"]',
          );
          if (!(secondBlock instanceof HTMLElement)) {
            throw new Error("Fixture failed to render second block.");
          }
          setDOMBoundarySelection(secondBlock, 0);
        },
        selectionPath: secondTextPath,
      },
    ];

    for (const current of cases) {
      const session = createContentEditableViewEngine();
      current.select();

      expect(
        session.planBeforeInput(
          root,
          note,
          selectionFromCursorPoint({
            path: current.selectionPath,
            offset: 0,
          }),
          { inputType: "insertText", data: "x" },
        ),
      ).toEqual({ kind: "deferToContentEditable" });
      expect(session.hasActiveEdit(), current.label).toBe(true);
    }
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

  it("diffs only the active text leaf and leaves sibling block repair to reset", () => {
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

    setDOMSelection(first, 5);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 5 }),
        { inputType: "insertText", data: "!" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });
    first.textContent = "Alpha!";
    second.textContent = "Browser changed sibling";
    setDOMSelection(first, 6);

    const result = session.flush(root, note);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toEqual([
      { op: "replace", path: firstTextPath, value: "Alpha!" },
    ]);
    expect(second.textContent).toBe("Browser changed sibling");

    session.reset(root, note);

    expect(first.textContent).toBe("Alpha");
    expect(second.textContent).toBe("Beta");
  });

  it("resets foreign DOM even when textContent already matches the model", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createContentEditableViewEngine();

    first.innerHTML = '<em data-foreign="true">Alpha</em>';
    session.reset(root, note);

    expect(first.querySelector("[data-foreign]")).toBe(null);
    expect(first.childNodes).toHaveLength(1);
    expect(first.firstChild).toBeInstanceOf(Text);
    expect(first.textContent).toBe("Alpha");
  });

  it("snaps collapsed DOM selection to grapheme boundaries", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A😀B" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    first.textContent = "A😀B";

    setDOMSelection(first, 2);

    expect(readContentEditableSelection(root, note)?.focus).toMatchObject({
      path: firstTextPath,
      offset: 3,
    });
  });

  it("ignores native selections outside the editor root", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root } = setupTextRoot();
    const outside = document.createElement("p");
    outside.textContent = "outside";
    document.body.append(outside);
    const outsideText = outside.firstChild;
    if (!(outsideText instanceof Text)) {
      throw new Error("Fixture failed to render outside text.");
    }

    const range = document.createRange();
    range.setStart(outsideText, 1);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(readContentEditableSelection(root, note)).toBe(null);
  });

  it("maps native text ranges to canonical cursor ranges", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();

    setDOMRangeSelection(first, 1, first, 4);

    expect(readContentEditableSelection(root, note)).toMatchObject({
      anchor: { path: firstTextPath, offset: 1 },
      focus: { path: firstTextPath, offset: 4 },
    });
  });

  it("maps equivalent DOM boundary positions to stable text points without crossing atoms", () => {
    const afterMentionTextPath = "/root/children/0/children/2/text";
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
    const { root, block, first, second } = setupInlineAtomTextRoot();
    const firstText = first.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Text run must contain a text node.");
    }

    const cases: Array<{
      label: string;
      node: Node;
      offset: number;
      expected: { path: string; offset: number };
    }> = [
      {
        label: "text node end",
        node: firstText,
        offset: 5,
        expected: { path: firstTextPath, offset: 5 },
      },
      {
        label: "text-run child boundary end",
        node: first,
        offset: 1,
        expected: { path: firstTextPath, offset: 5 },
      },
      {
        label: "block child boundary before first text",
        node: block,
        offset: 0,
        expected: { path: firstTextPath, offset: 0 },
      },
      {
        label: "block child boundary before atom",
        node: block,
        offset: 1,
        expected: { path: firstTextPath, offset: 5 },
      },
      {
        label: "block child boundary after atom",
        node: block,
        offset: 2,
        expected: { path: afterMentionTextPath, offset: 0 },
      },
      {
        label: "block child boundary after last text",
        node: block,
        offset: 3,
        expected: { path: afterMentionTextPath, offset: 4 },
      },
    ];

    for (const current of cases) {
      setDOMBoundarySelection(current.node, current.offset);

      expect(readContentEditableSelection(root, note)?.focus).toMatchObject(
        current.expected,
      );
    }

    setDOMBoundarySelection(second, 0);
    expect(readContentEditableSelection(root, note)?.focus).toMatchObject({
      path: afterMentionTextPath,
      offset: 0,
    });
  });

  it("does not map DOM positions inside contenteditable false atoms as text points", () => {
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

    setDOMBoundarySelection(mention, 0);

    expect(readContentEditableSelection(root, note)).toBe(null);
  });

  it("reads and writes selection through ShadowRoot selection when mounted in shadow DOM", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, shadowRoot, first } = setupShadowTextRoot();
    const shadowSelection = installShadowSelection(shadowRoot);
    const firstText = first.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Text run must contain a text node.");
    }

    const range = document.createRange();
    range.setStart(firstText, 1);
    range.setEnd(firstText, 4);
    shadowSelection.removeAllRanges();
    shadowSelection.addRange(range);

    expect(readContentEditableSelection(root, note)).toMatchObject({
      anchor: { path: firstTextPath, offset: 1 },
      focus: { path: firstTextPath, offset: 4 },
    });

    setContentEditableSelection(root, note, {
      path: firstTextPath,
      offset: 2,
    });

    expect(readContentEditableSelection(root, note)?.focus).toMatchObject({
      path: firstTextPath,
      offset: 2,
    });
    expect(shadowSelection.focusNode).toBe(firstText);
    expect(shadowSelection.focusOffset).toBe(2);
  });

  it("snaps flushed native caret offsets to grapheme boundaries", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A😀B" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    first.textContent = "A😀B";
    const session = createContentEditableViewEngine();

    setDOMSelection(first, 2);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "insertText", data: "x" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });

    const result = session.flush(root, note);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected flush result.");
    }
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 3,
    });
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
    const session = createContentEditableViewEngine();

    setDOMSelection(first, 0);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: firstTextPath, offset: 0 }),
        { inputType: "insertText", data: "A" },
      ),
    ).toEqual({ kind: "deferToContentEditable" });

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
    ).toEqual({ kind: "deferToContentEditable" });

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

  it("keeps the final composition commit when no composed DOM text was observed", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createContentEditableViewEngine();
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 5,
    });

    setDOMSelection(first, 5);
    session.beginComposition(root, note, selection);
    first.textContent = "Alpha한";
    setDOMSelection(first, 6);
    session.endComposition();
    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "insertText",
        data: "한",
      }),
    ).toEqual({ kind: "commitComposition" });

    const result = session.flush(root, note);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toEqual([
      { op: "replace", path: firstTextPath, value: "Alpha한" },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 6,
    });
  });

  it("removes a duplicated final composition commit after observed composed DOM text", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createContentEditableViewEngine();
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 5,
    });

    setDOMSelection(first, 5);
    session.beginComposition(root, note, selection);
    first.textContent = "Alpha한";
    setDOMSelection(first, 6);
    session.trackInput(root, note);
    session.endComposition();
    first.textContent = "Alpha한한";
    setDOMSelection(first, 7);
    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "insertText",
        data: "한",
      }),
    ).toEqual({ kind: "commitComposition" });

    const result = session.flush(root, note);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toEqual([
      { op: "replace", path: firstTextPath, value: "Alpha한" },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 6,
    });
  });

  it("replaces the composed preedit range with a differing final commit", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha " }],
      },
    ]);
    const { root, first } = setupTextRoot();
    first.textContent = "Alpha ";
    const session = createContentEditableViewEngine();
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 6,
    });

    setDOMSelection(first, 6);
    session.beginComposition(root, note, selection);
    first.textContent = "Alpha nihon";
    setDOMSelection(first, 11);
    session.trackInput(root, note);
    session.endComposition();
    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "insertFromComposition",
        data: "日本",
      }),
    ).toEqual({ kind: "commitComposition" });

    const result = session.flush(root, note);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toEqual([
      { op: "replace", path: firstTextPath, value: "Alpha 日本" },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 8,
    });
  });

  it("replaces repeated-text preedit at the composition start offset", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "aaaa" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    first.textContent = "aaaa";
    const session = createContentEditableViewEngine();
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 2,
    });

    setDOMSelection(first, 2);
    session.beginComposition(root, note, selection);
    first.textContent = "aaaaa";
    setDOMSelection(first, 3);
    session.trackInput(root, note);
    session.endComposition();
    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "insertText",
        data: "b",
      }),
    ).toEqual({ kind: "commitComposition" });

    const result = session.flush(root, note);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toEqual([
      { op: "replace", path: firstTextPath, value: "aabaa" },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 3,
    });
  });

  it("ignores browser history input while composition owns the native edit", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
    ]);
    const { root, first } = setupTextRoot();
    const session = createContentEditableViewEngine();
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 5,
    });

    setDOMSelection(first, 5);
    session.beginComposition(root, note, selection);

    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "historyUndo",
      }),
    ).toEqual({ kind: "ignore" });
    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "historyRedo",
      }),
    ).toEqual({ kind: "ignore" });
  });

  it("does not release a stale composition end after another composition starts", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Plain " }],
      },
    ]);
    const { root, first } = setupTextRoot();
    first.textContent = "Plain ";
    const session = createContentEditableViewEngine();
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 5,
    });

    setDOMSelection(first, 5);
    session.beginComposition(root, note, selection);
    first.textContent = "Plain안 ";
    setDOMSelection(first, 6);
    session.trackInput(root, note);
    session.endComposition();

    session.beginComposition(root, note, selection);
    first.textContent = "Plain안ㄴ ";
    setDOMSelection(first, 7);
    session.trackInput(root, note);

    expect(session.clearCompositionCommit()).toBe(false);
  });

  it("retargets composition when the browser moves the native caret to another text leaf", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "" }],
      },
    ]);
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="text-block" data-path="/root/children/0">',
      `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
      "</p>",
      '<p class="text-block" data-path="/root/children/1">',
      `<span class="text-run" data-path="${secondTextPath}"></span>`,
      "</p>",
    ].join("");
    document.body.append(root);
    const first = textRun(root, firstTextPath);
    const session = createContentEditableViewEngine();

    setContentEditableSelection(root, note, {
      path: secondTextPath,
      offset: 0,
    });
    session.beginComposition(
      root,
      note,
      selectionFromCursorPoint({ path: secondTextPath, offset: 0 }),
    );

    setDOMSelection(first, 5);
    expect(
      session.planBeforeInput(
        root,
        note,
        selectionFromCursorPoint({ path: secondTextPath, offset: 0 }),
        {
          inputType: "insertCompositionText",
          data: "ㅎ",
          isComposing: true,
        },
      ),
    ).toEqual({ kind: "deferToContentEditable" });

    first.textContent = "Alphaㅎ";
    setDOMSelection(first, 6);

    expect(session.trackInput(root, note)).toEqual({
      path: firstTextPath,
      offset: 6,
    });

    const result = session.flush(root, note);
    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toMatchObject([
      { op: "replace", path: firstTextPath, value: "Alphaㅎ" },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 6,
    });
  });

  it("commits retargeted composition against the retargeted text leaf", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "" }],
      },
    ]);
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="text-block" data-path="/root/children/0">',
      `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
      "</p>",
      '<p class="text-block" data-path="/root/children/1">',
      `<span class="text-run" data-path="${secondTextPath}"></span>`,
      "</p>",
    ].join("");
    document.body.append(root);
    const first = textRun(root, firstTextPath);
    const session = createContentEditableViewEngine();
    const selection = selectionFromCursorPoint({
      path: secondTextPath,
      offset: 0,
    });

    setContentEditableSelection(root, note, {
      path: secondTextPath,
      offset: 0,
    });
    session.beginComposition(root, note, selection);

    setDOMSelection(first, 5);
    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "insertCompositionText",
        data: "ㅎ",
        isComposing: true,
      }),
    ).toEqual({ kind: "deferToContentEditable" });

    first.textContent = "Alphaㅎ";
    setDOMSelection(first, 6);
    session.trackInput(root, note);
    session.endComposition();
    expect(
      session.planBeforeInput(root, note, selection, {
        inputType: "insertText",
        data: "ㅎ",
      }),
    ).toEqual({ kind: "commitComposition" });

    const result = session.flush(root, note);

    expect(result.ok).toBe(true);
    if (!result.ok || !result.changed) {
      throw new Error("Expected changed flush result.");
    }
    expect(result.patch).toMatchObject([
      { op: "replace", path: firstTextPath, value: "Alphaㅎ" },
    ]);
    expect(result.selectionAfter.focus).toMatchObject({
      path: firstTextPath,
      offset: 6,
    });
  });

  it("maps DOM selection on a mark element to that element child boundary", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha", marks: [{ type: "bold" }] }],
      },
    ]);
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="text-block" data-path="/root/children/0">',
      `<span class="text-run" data-path="${firstTextPath}"><strong>Alpha</strong></span>`,
      "</p>",
    ].join("");
    document.body.append(root);
    const strong = root.querySelector("strong");
    if (!(strong instanceof HTMLElement)) {
      throw new Error("Fixture failed to render mark element.");
    }

    const range = document.createRange();
    range.setStart(strong, 0);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);

    expect(readContentEditableSelection(root, note)?.focus).toMatchObject({
      path: firstTextPath,
      offset: 0,
    });
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

  it("scrolls the focused selection point into view", () => {
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
    const { root, second } = setupTextRoot();
    const scrollIntoView = vi.fn();
    Object.defineProperty(second, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    scrollContentEditableSelectionIntoView(
      root,
      note,
      selectionFromCursorPoint({ path: secondTextPath, offset: 2 }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
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

    setContentEditableSelection(root, note, { path: firstTextPath, offset: 0 });

    const selection = document.getSelection();
    expect(selection?.focusNode).toBeInstanceOf(Text);
    expect(selection?.focusNode?.parentElement).toBe(
      textRun(root, firstTextPath),
    );
    expect(selection?.focusOffset).toBe(0);
  });
});
