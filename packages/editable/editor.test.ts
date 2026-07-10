// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEditableDocument,
  mountJsonEditable,
  type EditorFault,
  type JsonEditable,
} from "./index";

type EditorFixture = ReturnType<typeof setupEditor>;

const mountedEditors: JsonEditable[] = [];

afterEach(() => {
  for (const editor of mountedEditors.splice(0)) {
    editor.destroy();
  }
  window.document.body.replaceChildren();
  vi.useRealTimers();
});

function setupEditor() {
  const document = createEditableDocument({
    schema: "interactive-os.editable-document@2",
    id: "editor-test",
    blocks: [
      { id: "alpha", type: "paragraph", text: "abcdef" },
      { id: "beta", type: "paragraph", text: "second" },
    ],
  });
  const root = window.document.createElement("div");
  const faults: EditorFault[] = [];
  window.document.body.append(root);
  const editor = mountJsonEditable({
    root,
    document,
    onFault: (fault) => faults.push(fault),
  });
  mountedEditors.push(editor);
  return { document, editor, faults, root };
}

function textSurface(fixture: EditorFixture, blockId: string): HTMLElement {
  const surface = fixture.root.querySelector(
    `[data-editable-block="${blockId}"] [data-editable-text]`,
  );
  if (!(surface instanceof HTMLElement)) {
    throw new Error(`Missing editable surface for ${blockId}.`);
  }
  return surface;
}

function textNode(fixture: EditorFixture, blockId: string): Text {
  const node = textSurface(fixture, blockId).firstChild;
  if (!(node instanceof Text)) {
    throw new Error(`Missing editable Text node for ${blockId}.`);
  }
  return node;
}

function setDOMCaret(node: Text, offset: number): void {
  const selection = window.getSelection();
  if (selection === null) {
    throw new Error("The test DOM does not expose a Selection.");
  }
  const range = window.document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function modelFocusOffset(fixture: EditorFixture): number | undefined {
  const focus = fixture.document.selection?.primaryRange?.focus;
  return typeof focus === "string" ? undefined : focus?.offset;
}

function inputEvent(
  type: "beforeinput" | "input",
  inputType: string,
  options: { data?: string | null; isComposing?: boolean } = {},
): InputEvent {
  return new InputEvent(type, {
    bubbles: true,
    cancelable: type === "beforeinput",
    data: options.data,
    inputType,
    isComposing: options.isComposing ?? false,
  });
}

function startComposition(
  fixture: EditorFixture,
  offset = 2,
  preedit = "한",
): Text {
  const node = textNode(fixture, "alpha");
  setDOMCaret(node, offset);
  fixture.root.dispatchEvent(
    new CompositionEvent("compositionstart", { bubbles: true }),
  );
  fixture.root.dispatchEvent(
    inputEvent("beforeinput", "insertCompositionText", {
      data: preedit,
      isComposing: true,
    }),
  );
  node.insertData(offset, preedit);
  setDOMCaret(node, offset + preedit.length);
  fixture.root.dispatchEvent(
    inputEvent("input", "insertCompositionText", {
      data: preedit,
      isComposing: true,
    }),
  );
  return node;
}

async function nextDOMTurn(): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

describe("JSON editable coordinator", () => {
  it("commits a native DOM text mutation into the JSON document", () => {
    const fixture = setupEditor();
    const node = textNode(fixture, "alpha");
    setDOMCaret(node, 2);

    const accepted = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertText", { data: "한" }),
    );

    expect(accepted).toBe(false);
    expect(fixture.document.value.blocks[0]?.text).toBe("ab한cdef");
    expect(fixture.editor.getSnapshot().phase).toBe("idle");
    expect(fixture.faults).toEqual([]);
  });

  it("keeps the composition node while another block change is queued", () => {
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);

    const result = fixture.editor.dispatch({
      type: "replaceText",
      blockId: "beta",
      from: 0,
      to: 0,
      text: "remote ",
      origin: "remote",
    });

    expect(result).toMatchObject({ ok: true, change: "queued" });
    expect(textNode(fixture, "alpha")).toBe(composingNode);
    expect(fixture.document.value.blocks[0]?.text).toBe("ab한cdef");
    expect(fixture.document.value.blocks[1]?.text).toBe("second");
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "composing",
      composition: { blockId: "alpha", from: 2, to: 3 },
    });
    expect(fixture.faults).toEqual([]);
  });

  it("rejects a disjoint same-block change while preserving the composition island", () => {
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);

    const result = fixture.editor.dispatch({
      type: "replaceText",
      blockId: "alpha",
      from: 0,
      to: 0,
      text: "!",
      origin: "remote",
    });

    expect(result).toMatchObject({ ok: false, code: "composition_conflict" });
    expect(textNode(fixture, "alpha")).toBe(composingNode);
    expect(composingNode.data).toBe("ab한cdef");
    expect(fixture.document.value.blocks[0]?.text).toBe("ab한cdef");
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "composing",
      composition: { blockId: "alpha", from: 2, to: 3 },
    });
    expect(fixture.faults).toEqual([
      expect.objectContaining({ code: "composition_conflict" }),
    ]);
  });

  it("rejects an overlapping external change without pretending to cancel the OS IME", () => {
    const fixture = setupEditor();
    startComposition(fixture);

    const result = fixture.editor.dispatch({
      type: "replaceText",
      blockId: "alpha",
      from: 2,
      to: 3,
      text: "X",
      origin: "remote",
    });

    expect(result).toMatchObject({ ok: false, code: "composition_conflict" });
    expect(fixture.document.value.blocks[0]?.text).toBe("ab한cdef");
    expect(textNode(fixture, "alpha").data).toBe("ab한cdef");
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "composing",
      composition: { blockId: "alpha", from: 2, to: 3 },
    });
    expect(fixture.faults).toEqual([
      expect.objectContaining({
        code: "composition_conflict",
        recoverable: true,
      }),
    ]);
  });

  it("rejects local commands during composition so its undo unit cannot split", () => {
    const fixture = setupEditor();
    startComposition(fixture);

    const result = fixture.editor.dispatch({
      type: "replaceText",
      blockId: "beta",
      from: 0,
      to: 0,
      text: "local ",
    });

    expect(result).toMatchObject({ ok: false, code: "composition_conflict" });
    expect(fixture.document.value.blocks[1]?.text).toBe("second");
    expect(fixture.editor.getSnapshot().phase).toBe("composing");
  });

  it("settles only after the final composition DOM mutation is committed", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "漢",
      }),
    );
    expect(fixture.editor.getSnapshot().phase).toBe("settling");

    composingNode.replaceData(2, 1, "漢");
    setDOMCaret(composingNode, 3);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertFromComposition", {
        data: "漢",
        isComposing: false,
      }),
    );

    expect(fixture.document.value.blocks[0]?.text).toBe("ab漢cdef");
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "settling",
      composition: { blockId: "alpha", from: 2, to: 3 },
    });

    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "idle",
      composition: null,
    });
    expect(textNode(fixture, "alpha")).toBe(composingNode);
    expect(composingNode.data).toBe("ab漢cdef");
    expect(fixture.faults).toEqual([]);
  });

  it("preserves a paragraph intent during composition as a separate undo step", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);

    const accepted = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", {
        isComposing: true,
      }),
    );

    expect(accepted).toBe(false);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(textNode(fixture, "alpha")).toBe(composingNode);
    expect(fixture.editor.getSnapshot().phase).toBe("settling");
    expect(fixture.document.history.undoDepth).toBe(1);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(
      fixture.document.value.blocks.map(({ type, text }) => ({ type, text })),
    ).toEqual([
      { type: "paragraph", text: "ab한" },
      { type: "paragraph", text: "cdef" },
      { type: "paragraph", text: "second" },
    ]);
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "idle",
      composition: null,
    });
    expect(fixture.document.history.undoDepth).toBe(2);

    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "abcdef",
      "second",
    ]);
    expect(fixture.faults).toEqual([]);
  });

  it("applies a queued remote update to its original block before paragraph replay", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);

    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "beta",
        from: 0,
        to: 0,
        text: "remote ",
        origin: "remote",
      }),
    ).toMatchObject({ ok: true, change: "queued" });
    fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", {
        isComposing: true,
      }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "remote second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(3);

    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "remote second",
    ]);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "abcdef",
      "second",
    ]);
    expect(fixture.faults).toEqual([]);
  });

  it("keeps normalized composition selection stable across remote and paragraph undo", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "beta",
        from: 0,
        to: 0,
        text: "remote ",
        origin: "remote",
      }),
    ).toMatchObject({ ok: true, change: "queued" });
    composingNode.insertData(3, "\n");
    setDOMCaret(composingNode, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "\n",
        isComposing: true,
      }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "\n" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(modelFocusOffset(fixture)).toBe(0);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(modelFocusOffset(fixture)).toBe(3);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(modelFocusOffset(fixture)).toBe(3);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(modelFocusOffset(fixture)).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("splits at the final composition caret rather than the captured paragraph caret", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);

    fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", {
        isComposing: true,
      }),
    );
    composingNode.insertData(3, "국");
    setDOMCaret(composingNode, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한국",
        isComposing: true,
      }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한국",
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한국",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("recognizes a newline-bearing composition result as paragraph evidence", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("normalizes a composition newline in the DOM into a paragraph split", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    composingNode.insertData(3, "\n");
    setDOMCaret(composingNode, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한\n",
        isComposing: true,
      }),
    );

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.value.blocks.some((block) => block.text.includes("\n"))).toBe(
      false,
    );
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("locates a composition newline when compositionend reports only the newline delta", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    composingNode.insertData(3, "\n");
    setDOMCaret(composingNode, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "\n",
        isComposing: true,
      }),
    );

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "\n",
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.value.blocks.some((block) => block.text.includes("\n"))).toBe(
      false,
    );
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("recalculates a trailing newline after a late final composition input", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture, 2, "ㅎ");

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );
    composingNode.replaceData(2, 1, "한\n");
    setDOMCaret(composingNode, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertFromComposition", {
        data: "한\n",
        isComposing: false,
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.value.blocks.some((block) => block.text.includes("\n"))).toBe(
      false,
    );
    expect(fixture.faults).toEqual([]);
  });

  it("does not strip a newline that existed after the composition range", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "alpha",
        from: 2,
        to: 2,
        text: "\n",
      }).ok,
    ).toBe(true);
    startComposition(fixture, 2);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "\ncdef",
      "second",
    ]);
    expect(fixture.faults).toEqual([]);
  });

  it("does not treat a candidate-confirming Enter key as paragraph evidence", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);
    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      key: "Enter",
      isComposing: false,
    });
    Object.defineProperty(enter, "keyCode", { value: 229 });

    fixture.root.dispatchEvent(enter);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(1);
    expect(fixture.faults).toEqual([]);
  });

  it("deduplicates paragraph evidence from one composition turn", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);

    fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", {
        isComposing: true,
      }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );
    fixture.root.dispatchEvent(
      inputEvent("input", "insertParagraph", {
        isComposing: false,
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("deduplicates compositionend newline followed by paragraph input", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );
    fixture.root.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("preserves two distinct paragraph beforeinput intents in one composition turn", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);

    const first = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", { isComposing: true }),
    );
    const second = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(first).toBe(false);
    expect(second).toBe(false);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(3);
    expect(fixture.faults).toEqual([]);
  });

  it("does not pair a prevented paragraph with a later input-only Enter", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }

    expect(
      fixture.root.dispatchEvent(
        inputEvent("beforeinput", "insertParagraph", { isComposing: true }),
      ),
    ).toBe(false);
    const right = composingNode.splitText(3);
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(right);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    nativeBlock.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(3);
    expect(fixture.faults).toEqual([]);
  });

  it("preserves insertParagraph that arrives after compositionend during settling", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );

    const accepted = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", {
        isComposing: false,
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(accepted).toBe(false);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("replays one evidenced noncancelable native paragraph split", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }

    const accepted = fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    const right = composingNode.splitText(3);
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(right);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(accepted).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(nativeBlock.isConnected).toBe(false);
    expect(fixture.root.querySelectorAll("[data-editable-block]")).toHaveLength(
      3,
    );
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("accepts the final IME text change inside a noncancelable native split", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = textNode(fixture, "alpha");
    setDOMCaret(composingNode, 2);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    composingNode.insertData(2, "ㅎ");
    setDOMCaret(composingNode, 3);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "ㅎ",
        isComposing: true,
      }),
    );
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }

    fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    composingNode.replaceData(2, 1, "한");
    const right = composingNode.splitText(3);
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(right);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("normalizes a trailing IME newline inside a noncancelable native split", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }

    fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    composingNode.insertData(3, "\n");
    const right = composingNode.splitText(4);
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(right);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    nativeBlock.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.value.blocks.some((block) => block.text.includes("\n"))).toBe(
      false,
    );
    expect(fixture.faults).toEqual([]);
  });

  it("rejects and restores a native split that replaced the pinned Text node", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    const surface = textSurface(fixture, "alpha");
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }
    fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    const foreignText = window.document.createTextNode("ab한");
    surface.replaceChildren(foreignText);
    const nativeBlock = window.document.createElement("div");
    const right = window.document.createTextNode("cdef");
    nativeBlock.append(right);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    nativeBlock.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(textNode(fixture, "alpha")).toBe(composingNode);
    expect(foreignText.isConnected).toBe(false);
    expect(fixture.faults).toEqual([
      expect.objectContaining({ code: "input_state_lost" }),
      expect.objectContaining({ code: "foreign_dom_mutation" }),
    ]);
  });

  it("accepts an empty native right paragraph represented by a bare br", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture, 6);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }
    fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(window.document.createElement("br"));
    alpha.after(nativeBlock);
    nativeBlock.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "abcdef한",
      "",
      "second",
    ]);
    expect(fixture.faults).toEqual([]);
  });

  it("accepts native Enter when an empty composition source keeps its owned placeholder", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "alpha",
        from: 0,
        to: 6,
        text: "",
      }),
    ).toMatchObject({ ok: true, change: "document" });

    const sourceSurface = textSurface(fixture, "alpha");
    const composingNode = textNode(fixture, "alpha");
    const ownedPlaceholder = sourceSurface.querySelector(
      "[data-editable-placeholder]",
    );
    expect(ownedPlaceholder).not.toBeNull();
    setDOMCaret(composingNode, 0);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    composingNode.insertData(0, "한");
    setDOMCaret(composingNode, 1);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한",
        isComposing: true,
      }),
    );
    expect(Array.from(sourceSurface.childNodes)).toEqual(
      expect.arrayContaining([composingNode, ownedPlaceholder]),
    );

    fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    const sourceBlock = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (sourceBlock === null) {
      throw new Error("Missing alpha block.");
    }
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(window.document.createElement("br"));
    sourceBlock.after(nativeBlock);
    nativeBlock.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "한",
      "",
      "second",
    ]);
    expect(fixture.faults).toEqual([]);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "한",
      "second",
    ]);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "",
      "second",
    ]);
  });

  it("rejects an evidenced native split with foreign nested markup", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }

    fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    const right = composingNode.splitText(3);
    const nativeBlock = window.document.createElement("div");
    const foreign = window.document.createElement("aside");
    foreign.append(right);
    nativeBlock.append(foreign);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(nativeBlock.isConnected).toBe(false);
    expect(fixture.document.history.undoDepth).toBe(1);
    expect(fixture.faults).toEqual([
      expect.objectContaining({ code: "input_state_lost" }),
      expect.objectContaining({ code: "foreign_dom_mutation" }),
    ]);
  });

  it("uses paragraph input as fallback evidence when beforeinput is absent", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }

    const right = composingNode.splitText(3);
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(right);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(nativeBlock.isConnected).toBe(false);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("rejects an input-only split that replaced the pinned block identity", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const originalBlock = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (originalBlock === null) {
      throw new Error("Missing alpha block.");
    }
    const forged = window.document.createElement("p");
    forged.className = "contenteditable-block contenteditable-block-paragraph";
    forged.setAttribute("data-editable-block", "alpha");
    forged.setAttribute("data-block-type", "paragraph");
    forged.setAttribute("data-block-index", "0");
    const forgedSurface = window.document.createElement("span");
    forgedSurface.setAttribute("data-editable-text", "/blocks/0/text");
    forgedSurface.append("ab한");
    forged.append(forgedSurface);
    const nativeBlock = window.document.createElement("div");
    const right = window.document.createTextNode("cdef");
    nativeBlock.append(right);
    originalBlock.replaceWith(forged, nativeBlock);
    setDOMCaret(right, 0);

    nativeBlock.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(forged.isConnected).toBe(false);
    expect(textNode(fixture, "alpha")).toBe(composingNode);
    expect(fixture.faults).toEqual([
      expect.objectContaining({ code: "input_state_lost" }),
      expect.objectContaining({ code: "foreign_dom_mutation" }),
    ]);
  });

  it("does not partially adopt a native split without paragraph evidence", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }

    const right = composingNode.splitText(3);
    const nativeBlock = window.document.createElement("div");
    nativeBlock.append(right);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한",
        isComposing: false,
      }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(nativeBlock.isConnected).toBe(false);
    expect(fixture.document.history.undoDepth).toBe(1);
    expect(fixture.faults).toEqual([
      expect.objectContaining({ code: "input_state_lost" }),
      expect.objectContaining({ code: "foreign_dom_mutation" }),
    ]);
  });

  it("drains a prevented paragraph intent before destroy", () => {
    const fixture = setupEditor();
    startComposition(fixture);
    const accepted = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertParagraph", {
        isComposing: true,
      }),
    );

    fixture.editor.destroy();

    expect(accepted).toBe(false);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(2);
    expect(fixture.faults).toEqual([]);
  });

  it("normalizes a composition newline before destroy drains paragraph intent", () => {
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    composingNode.insertData(3, "\n");
    setDOMCaret(composingNode, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한\n",
        isComposing: true,
      }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: "한\n",
      }),
    );

    fixture.editor.destroy();

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한",
      "cdef",
      "second",
    ]);
    expect(fixture.document.value.blocks.some((block) => block.text.includes("\n"))).toBe(
      false,
    );
    expect(fixture.faults).toEqual([]);
  });

  it("rejects an invalid native split when destroy forces an early settle", () => {
    const fixture = setupEditor();
    const composingNode = startComposition(fixture);
    const alpha = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (alpha === null) {
      throw new Error("Missing alpha block.");
    }
    fixture.root.dispatchEvent(
      new InputEvent("beforeinput", {
        bubbles: true,
        cancelable: false,
        inputType: "insertParagraph",
        isComposing: true,
      }),
    );
    const right = composingNode.splitText(2);
    const nativeBlock = window.document.createElement("div");
    const foreign = window.document.createElement("aside");
    foreign.append(right);
    nativeBlock.append(foreign);
    alpha.after(nativeBlock);
    setDOMCaret(right, 0);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertParagraph", { isComposing: false }),
    );

    fixture.editor.destroy();

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(1);
    expect(fixture.faults).toEqual([
      expect.objectContaining({ code: "input_state_lost" }),
      expect.objectContaining({ code: "foreign_dom_mutation" }),
    ]);
  });

  it("does not collect renderer-owned mutations as native input", async () => {
    const fixture = setupEditor();
    const documentChanges: string[] = [];
    const stop = fixture.document.subscribe((_patch, metadata) => {
      documentChanges.push(metadata?.origin ?? "unknown");
    });

    const result = fixture.editor.dispatch({
      type: "setBlockType",
      blockId: "alpha",
      blockType: "heading",
    });
    await nextDOMTurn();
    stop();

    expect(result.ok).toBe(true);
    expect(fixture.document.value.blocks[0]?.type).toBe("heading");
    expect(
      fixture.root.querySelector('[data-editable-block="alpha"]')?.tagName,
    ).toBe("H1");
    expect(documentChanges).toEqual(["app"]);
    expect(fixture.faults).toEqual([]);
  });

  it("reports and removes a foreign structural DOM mutation", async () => {
    const fixture = setupEditor();
    const foreign = window.document.createElement("aside");
    foreign.textContent = "unowned DOM";

    fixture.root.append(foreign);
    await nextDOMTurn();

    expect(fixture.faults).toEqual([
      expect.objectContaining({
        code: "foreign_dom_mutation",
        recoverable: true,
      }),
    ]);
    expect(fixture.root.contains(foreign)).toBe(false);
    expect(fixture.root.querySelectorAll("[data-editable-block]")).toHaveLength(
      2,
    );
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "abcdef",
      "second",
    ]);
  });

  it("rejects a foreign element appended directly to an owned block", async () => {
    const fixture = setupEditor();
    const block = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (block === null) {
      throw new Error("Missing alpha block.");
    }
    const foreign = window.document.createElement("aside");
    foreign.textContent = "unowned block child";

    block.append(foreign);
    await nextDOMTurn();

    expect(block.contains(foreign)).toBe(false);
    expect(fixture.faults).toEqual([
      expect.objectContaining({
        code: "foreign_dom_mutation",
        recoverable: true,
      }),
    ]);
    expect(fixture.document.value.blocks[0]?.text).toBe("abcdef");
  });

  it("rejects a foreign attribute mutation on an owned block", async () => {
    const fixture = setupEditor();
    const block = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    if (block === null) {
      throw new Error("Missing alpha block.");
    }

    block.setAttribute("data-foreign", "true");
    await nextDOMTurn();

    expect(block.hasAttribute("data-foreign")).toBe(false);
    expect(fixture.faults).toEqual([
      expect.objectContaining({
        code: "foreign_dom_mutation",
        recoverable: true,
      }),
    ]);
  });

  it("rejects an unevidenced Text.data mutation and restores canonical DOM", async () => {
    const fixture = setupEditor();
    const node = textNode(fixture, "alpha");
    await nextDOMTurn();

    node.data = "foreign text";
    await nextDOMTurn();

    expect(fixture.document.value.blocks[0]?.text).toBe("abcdef");
    expect(textNode(fixture, "alpha")).toBe(node);
    expect(node.data).toBe("abcdef");
    expect(fixture.faults).toEqual([
      expect.objectContaining({
        code: "foreign_dom_mutation",
        recoverable: true,
      }),
    ]);
  });

  it("cancels composition when the pinned Text node is replaced", async () => {
    const fixture = setupEditor();
    const snapshots: ReturnType<JsonEditable["getSnapshot"]>[] = [];
    fixture.editor.subscribe((snapshot) => snapshots.push(snapshot));
    const composingNode = startComposition(fixture);
    const surface = textSurface(fixture, "alpha");
    const replacement = window.document.createTextNode(composingNode.data);

    surface.replaceChild(replacement, composingNode);
    await nextDOMTurn();

    expect(composingNode.isConnected).toBe(false);
    expect(textNode(fixture, "alpha")).toBe(replacement);
    expect(fixture.document.value.blocks[0]?.text).toBe("ab한cdef");
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "idle",
      composition: null,
    });
    expect(snapshots.at(-1)).toMatchObject({
      phase: "idle",
      composition: null,
    });
    expect(fixture.faults).toEqual([
      expect.objectContaining({
        code: "input_state_lost",
        recoverable: true,
      }),
    ]);
  });

  it("queues a disjoint remote patch until the composition undo entry is complete", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const node = startComposition(fixture);
    const remote = fixture.editor.dispatch({
      type: "replaceText",
      blockId: "beta",
      from: 0,
      to: 0,
      text: "remote ",
      origin: "remote",
    });

    expect(remote).toMatchObject({ ok: true, change: "queued" });
    expect(fixture.editor.getSnapshot().queuedChanges).toBe(1);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "second",
    ]);

    node.insertData(3, "국");
    setDOMCaret(node, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한국",
        isComposing: true,
      }),
    );
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한국cdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(1);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한국" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한국cdef",
      "remote second",
    ]);
    expect(fixture.editor.getSnapshot().queuedChanges).toBe(0);
    expect(fixture.document.history.undoDepth).toBe(2);

    const undoRemote = fixture.editor.dispatch({ type: "undo" });
    expect(undoRemote.ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한국cdef",
      "second",
    ]);

    const undoComposition = fixture.editor.dispatch({ type: "undo" });
    expect(undoComposition.ok).toBe(true);
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "abcdef",
      "second",
    ]);
    expect(fixture.document.history.undoDepth).toBe(0);
    expect(fixture.faults).toEqual([]);
  });

  it("merges consecutive native updates from one composition into one undo step", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const node = startComposition(fixture);

    node.insertData(3, "국");
    setDOMCaret(node, 4);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한국",
        isComposing: true,
      }),
    );

    expect(fixture.document.value.blocks[0]?.text).toBe("ab한국cdef");
    expect(fixture.editor.getSnapshot().composition).toMatchObject({
      from: 2,
      to: 4,
    });
    expect(fixture.document.history.undoDepth).toBe(1);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한국" }),
    );
    await vi.advanceTimersByTimeAsync(31);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.document.value.blocks[0]?.text).toBe("abcdef");
  });

  it("anchors an ambiguous repeated-text composition diff at the native caret", () => {
    const fixture = setupEditor();
    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "alpha",
        from: 0,
        to: 6,
        text: "aaa",
      }).ok,
    ).toBe(true);

    startComposition(fixture, 1, "a");

    expect(fixture.document.value.blocks[0]?.text).toBe("aaaa");
    expect(fixture.editor.getSnapshot().composition).toMatchObject({
      from: 1,
      to: 2,
    });
  });

  it("does not let an earlier settle timer terminate a newly started composition", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    startComposition(fixture);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    expect(fixture.editor.getSnapshot().phase).toBe("settling");

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    expect(fixture.editor.getSnapshot().phase).toBe("composing");

    await vi.advanceTimersByTimeAsync(45);
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "composing",
      composition: { blockId: "alpha" },
    });
  });

  it("maps a root-boundary select-all replacement into the document", () => {
    const fixture = setupEditor();
    const selection = window.getSelection();
    if (selection === null || typeof selection.setBaseAndExtent !== "function") {
      throw new Error("Expected Selection.setBaseAndExtent support.");
    }
    fixture.root.focus();
    selection.setBaseAndExtent(
      fixture.root,
      0,
      fixture.root,
      fixture.root.childNodes.length,
    );

    const accepted = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertText", { data: "X" }),
    );

    expect(accepted).toBe(false);
    expect(fixture.document.value.blocks).toEqual([
      { id: "alpha", type: "paragraph", text: "X" },
    ]);
  });

  it("maps a block-end element boundary to that block rather than the next one", () => {
    const fixture = setupEditor();
    const block = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    const selection = window.getSelection();
    if (
      block === null ||
      selection === null ||
      typeof selection.setBaseAndExtent !== "function"
    ) {
      throw new Error("Expected an editable block and Selection support.");
    }
    selection.setBaseAndExtent(block, 1, block, 1);

    fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertText", { data: "X" }),
    );

    expect(fixture.document.value.blocks.map((entry) => entry.text)).toEqual([
      "abcdefX",
      "second",
    ]);
  });

  it("prefers beforeinput target ranges over a stale DOM selection", () => {
    const fixture = setupEditor();
    const alpha = textNode(fixture, "alpha");
    const beta = textNode(fixture, "beta");
    setDOMCaret(beta, 0);
    const event = inputEvent("beforeinput", "insertText", { data: "X" });
    Object.defineProperty(event, "getTargetRanges", {
      value: () => [
        {
          startContainer: alpha,
          startOffset: 1,
          endContainer: alpha,
          endOffset: 3,
        },
      ],
    });

    fixture.root.dispatchEvent(event);

    expect(fixture.document.value.blocks.map((entry) => entry.text)).toEqual([
      "aXdef",
      "second",
    ]);
  });

  it("retargets a composition pin when beforeinput provides the authoritative range", () => {
    const fixture = setupEditor();
    const alpha = textNode(fixture, "alpha");
    const beta = textNode(fixture, "beta");
    setDOMCaret(beta, 0);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    expect(fixture.editor.getSnapshot().composition?.blockId).toBe("beta");

    const beforeInput = inputEvent("beforeinput", "insertCompositionText", {
      data: "X",
      isComposing: true,
    });
    Object.defineProperty(beforeInput, "getTargetRanges", {
      value: () => [
        {
          startContainer: alpha,
          startOffset: 1,
          endContainer: alpha,
          endOffset: 1,
        },
      ],
    });
    fixture.root.dispatchEvent(beforeInput);
    expect(fixture.document.selection?.primaryRange).toEqual({
      anchor: { path: "/blocks/0/text", offset: 1 },
      focus: { path: "/blocks/0/text", offset: 1 },
    });
    expect(fixture.editor.getSnapshot().composition).toMatchObject({
      blockId: "alpha",
      from: 1,
      to: 1,
    });
    expect(textNode(fixture, "alpha")).toBe(alpha);
    alpha.insertData(1, "X");
    setDOMCaret(alpha, 2);
    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "X",
        isComposing: true,
      }),
    );

    expect(fixture.document.value.blocks.map((entry) => entry.text)).toEqual([
      "aXbcdef",
      "second",
    ]);
    expect(fixture.editor.getSnapshot().composition).toMatchObject({
      blockId: "alpha",
      from: 1,
      to: 2,
    });
  });

  it("deletes a complete block selection through the model and keeps its surface", () => {
    const fixture = setupEditor();
    const node = textNode(fixture, "alpha");
    const selection = window.getSelection();
    if (selection === null || typeof selection.setBaseAndExtent !== "function") {
      throw new Error("Expected Selection.setBaseAndExtent support.");
    }
    selection.setBaseAndExtent(node, 0, node, node.data.length);

    const accepted = fixture.root.dispatchEvent(
      inputEvent("beforeinput", "deleteContentBackward"),
    );

    expect(accepted).toBe(false);
    expect(fixture.document.value.blocks[0]?.text).toBe("");
    expect(textSurface(fixture, "alpha").firstChild?.nodeType).toBe(3);
    expect(textSurface(fixture, "alpha").textContent).toBe("");
    expect(fixture.faults).toEqual([]);
  });

  it("starts composition from an empty block element boundary", () => {
    const fixture = setupEditor();
    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "alpha",
        from: 0,
        to: 6,
        text: "",
      }).ok,
    ).toBe(true);
    const block = fixture.root.querySelector<HTMLElement>(
      '[data-editable-block="alpha"]',
    );
    const selection = window.getSelection();
    if (
      block === null ||
      selection === null ||
      typeof selection.setBaseAndExtent !== "function"
    ) {
      throw new Error("Expected an empty editable block and Selection support.");
    }
    selection.setBaseAndExtent(block, 0, block, 0);

    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );

    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "composing",
      composition: { blockId: "alpha", from: 0, to: 0 },
    });
    expect(fixture.faults).toEqual([]);
  });
});
