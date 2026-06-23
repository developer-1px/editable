// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../../fixtures/unicodeGraphemeCorpus";
import {
  readContentEditableSelection,
  setContentEditableSelection,
} from "./contentEditableViewEngine";
import {
  documentWithBlocks,
  firstTextPath,
  installContentEditableViewTestCleanup,
  installShadowSelection,
  setDOMBoundarySelection,
  setDOMRangeSelection,
  setDOMSelection,
  setupInlineAtomTextRoot,
  setupShadowTextRoot,
  setupTextRoot,
  textRun,
} from "./contentEditableViewEngineTestUtils";

installContentEditableViewTestCleanup();

describe("contenteditable DOM selection mapping", () => {
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

  it("snaps collapsed DOM selection across the Unicode grapheme corpus", () => {
    for (const fixture of unicodeGraphemeCorpus) {
      const text = unicodeFixtureText(fixture);
      const note = documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text }],
        },
      ]);
      const { root, first } = setupTextRoot();
      first.textContent = text;

      setDOMSelection(first, unicodeFixtureClusterEnd(fixture) - 1);

      expect(
        readContentEditableSelection(root, note)?.focus,
        fixture.id,
      ).toMatchObject({
        path: firstTextPath,
        offset: unicodeFixtureClusterEnd(fixture),
      });
      root.remove();
    }
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
