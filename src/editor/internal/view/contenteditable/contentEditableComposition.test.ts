// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import {
  createContentEditableViewEngine,
  setContentEditableSelection,
} from "./contentEditableViewEngine";
import {
  documentWithBlocks,
  firstTextPath,
  installContentEditableViewTestCleanup,
  secondTextPath,
  setDOMSelection,
  setupTextRoot,
  textRun,
} from "./contentEditableViewEngineTestUtils";

installContentEditableViewTestCleanup();

describe("contenteditable composition lifecycle", () => {
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
});
