// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../../fixtures/unicodeGraphemeCorpus";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import { createContentEditableViewEngine } from "./contentEditableViewEngine";
import {
  documentWithBlocks,
  firstTextNodeInside,
  firstTextPath,
  installContentEditableViewTestCleanup,
  secondTextPath,
  setDOMBoundarySelection,
  setDOMSelection,
  setupTextRoot,
  textRun,
} from "./contentEditableViewEngineTestUtils";

installContentEditableViewTestCleanup();

describe("contenteditable native text flush and DOM repair", () => {
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

  it("snaps flushed native caret offsets across the Unicode grapheme corpus", () => {
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
      const session = createContentEditableViewEngine();

      setDOMSelection(first, unicodeFixtureClusterEnd(fixture) - 1);
      expect(
        session.planBeforeInput(
          root,
          note,
          selectionFromCursorPoint({
            path: firstTextPath,
            offset: unicodeFixtureClusterStart(),
          }),
          { inputType: "insertText", data: "x" },
        ),
        fixture.id,
      ).toEqual({ kind: "deferToContentEditable" });

      const result = session.flush(root, note);

      expect(result.ok, fixture.id).toBe(true);
      if (!result.ok) {
        throw new Error("Expected flush result.");
      }
      expect(result.selectionAfter.focus, fixture.id).toMatchObject({
        path: firstTextPath,
        offset: unicodeFixtureClusterEnd(fixture),
      });
      root.remove();
    }
  });
});
