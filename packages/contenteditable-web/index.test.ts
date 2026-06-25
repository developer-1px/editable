// @vitest-environment jsdom

import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as PublicCore from "./index";
import {
  createJsonContentEditable,
  JSON_ATOM_ATTRIBUTE,
  JSON_ATOM_REPLACEMENT,
  JSON_CONTENT_EDITABLE_MIME,
  JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
  JSON_TEXT_ATTRIBUTE,
  type JsonContentEditableVisualLayout,
} from "./index";

const TestDocumentSchema = z.object({
  text: z.string(),
});

const MarkerDocumentSchema = z.object({
  text: z.string(),
  atoms: z.record(
    z.string(),
    z.object({
      type: z.literal("taskMarker"),
      label: z.string(),
      offset: z.number().int().nonnegative(),
    }),
  ),
});

const AtomDocumentSchema = z.object({
  text: z.string(),
  atoms: z.record(
    z.string(),
    z.object({
      type: z.literal("mention"),
      userId: z.string(),
      label: z.string(),
      offset: z.number().int().nonnegative(),
    }),
  ),
});

const RangeDocumentSchema = z.object({
  text: z.string(),
  marks: z.record(
    z.string(),
    z.object({
      type: z.union([z.literal("bold"), z.literal("underline")]),
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    }),
  ),
});

type TestAtomRecord = z.infer<typeof AtomDocumentSchema>["atoms"];
type TestRangeRecord = z.infer<typeof RangeDocumentSchema>["marks"];

function setup(initial = "Plain") {
  const document = createJSONDocument(
    TestDocumentSchema,
    { text: initial },
    { history: 20, selection: true, trustedInitial: true },
  );
  const root = window.document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = `<span ${JSON_TEXT_ATTRIBUTE}="/text">${initial}</span>`;
  window.document.body.append(root);
  const textElement = root.querySelector(`[${JSON_TEXT_ATTRIBUTE}]`);
  if (!(textElement instanceof HTMLElement) || textElement.firstChild === null) {
    throw new Error("Fixture failed to create editable text.");
  }

  const core = createJsonContentEditable({ root, document });
  return { core, document, root, textElement, textNode: textElement.firstChild };
}

function setupMarkerDocument(initial = "Task text") {
  const text = `${JSON_ATOM_REPLACEMENT}${initial}`;
  const document = createJSONDocument(
    MarkerDocumentSchema,
    {
      text,
      atoms: {
        "task-marker": {
          type: "taskMarker",
          label: "- [ ] ",
          offset: 0,
        },
      },
    },
    { history: 20, selection: true, trustedInitial: true },
  );
  const root = window.document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = `<div><span ${JSON_TEXT_ATTRIBUTE}="/text"><span ${JSON_ATOM_ATTRIBUTE}="task-marker" contenteditable="false">- [ ] </span>${initial}</span></div>`;
  window.document.body.append(root);
  const block = root.firstElementChild;
  const marker = root.querySelector(`[${JSON_ATOM_ATTRIBUTE}="task-marker"]`);
  const textElement = root.querySelector(`[${JSON_TEXT_ATTRIBUTE}]`);
  const textNode = marker?.nextSibling ?? null;
  if (
    !(block instanceof HTMLElement) ||
    !(marker instanceof HTMLElement) ||
    !(textElement instanceof HTMLElement) ||
    textNode === null
  ) {
    throw new Error("Fixture failed to create marker text.");
  }

  const core = createJsonContentEditable({ root, document, atomsPath: "/atoms" });
  return {
    block,
    core,
    document,
    marker,
    root,
    textElement,
    textNode,
  };
}

function setupAtomDocument(
  initial = `A${JSON_ATOM_REPLACEMENT}B`,
  atoms: TestAtomRecord = {
    ada: {
      type: "mention" as const,
      userId: "ada",
      label: "@Ada",
      offset: 1,
    },
  },
) {
  const document = createJSONDocument(
    AtomDocumentSchema,
    { text: initial, atoms },
    { history: 20, selection: true, trustedInitial: true },
  );
  const root = window.document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = `<span ${JSON_TEXT_ATTRIBUTE}="/text">A<span ${JSON_ATOM_ATTRIBUTE}="ada" contenteditable="false">@Ada</span>B</span>`;
  window.document.body.append(root);
  const textElement = root.querySelector(`[${JSON_TEXT_ATTRIBUTE}]`);
  if (!(textElement instanceof HTMLElement)) {
    throw new Error("Fixture failed to create atom text.");
  }

  const core = createJsonContentEditable({
    root,
    document,
    atomsPath: "/atoms",
  });
  return { core, document, root, textElement };
}

function setupTrailingAtomDocument() {
  const document = createJSONDocument(
    AtomDocumentSchema,
    {
      text: `A${JSON_ATOM_REPLACEMENT}`,
      atoms: {
        ada: {
          type: "mention",
          userId: "ada",
          label: "@Ada",
          offset: 1,
        },
      },
    },
    { history: 20, selection: true, trustedInitial: true },
  );
  const root = window.document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = `<span ${JSON_TEXT_ATTRIBUTE}="/text">A<span ${JSON_ATOM_ATTRIBUTE}="ada" contenteditable="false">@Ada</span></span>`;
  window.document.body.append(root);
  const textElement = root.querySelector(`[${JSON_TEXT_ATTRIBUTE}]`);
  if (!(textElement instanceof HTMLElement)) {
    throw new Error("Fixture failed to create trailing atom text.");
  }

  const core = createJsonContentEditable({
    root,
    document,
    atomsPath: "/atoms",
  });
  return { core, document, root, textElement };
}

function setupRangeDocument(
  initial = "Hello world",
  marks: TestRangeRecord = {
    bold: {
      type: "bold" as const,
      start: 0,
      end: 5,
    },
  },
) {
  const document = createJSONDocument(
    RangeDocumentSchema,
    { text: initial, marks },
    { history: 20, selection: true, trustedInitial: true },
  );
  const root = window.document.createElement("div");
  root.contentEditable = "true";
  root.innerHTML = `<span ${JSON_TEXT_ATTRIBUTE}="/text">${initial}</span>`;
  window.document.body.append(root);
  const textElement = root.querySelector(`[${JSON_TEXT_ATTRIBUTE}]`);
  if (!(textElement instanceof HTMLElement) || textElement.firstChild === null) {
    throw new Error("Fixture failed to create range text.");
  }

  const core = createJsonContentEditable({
    root,
    document,
    rangesPath: "/marks",
  });
  return { core, document, root, textElement, textNode: textElement.firstChild };
}

function visualLine({
  bottom,
  endOffset,
  index,
  startOffset,
  top,
  xs,
}: {
  bottom: number;
  endOffset: number;
  index: number;
  startOffset: number;
  top: number;
  xs: number[];
}) {
  const id = `/text:line:${index}:${startOffset}-${endOffset}`;
  return {
    id,
    sourceId: id,
    path: "/text",
    startOffset,
    endOffset,
    kind: "text" as const,
    lineIndex: index,
    top,
    bottom,
    box: {
      x: xs[0] ?? 0,
      y: top,
      width: (xs.at(-1) ?? 0) - (xs[0] ?? 0),
      height: bottom - top,
    },
    carets: xs.map((x, offsetIndex) => ({
      path: "/text",
      offset: startOffset + offsetIndex,
      x,
      top,
      bottom,
    })),
  };
}

describe("contenteditable-web json-document bridge", () => {
  it("locks the runtime public API surface", () => {
    expect(Object.keys(PublicCore).sort()).toEqual([
      "JSON_ATOM_ATTRIBUTE",
      "JSON_ATOM_REPLACEMENT",
      "JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA",
      "JSON_CONTENT_EDITABLE_MIME",
      "JSON_TEXT_ATTRIBUTE",
      "createJsonContentEditable",
      "createJsonContentEditableVisualLayoutStore",
      "isJsonContentEditableFragment",
      "measureJsonContentEditableVisualLayout",
    ]);
  });

  it("syncs DOM ranges into json-document selection", () => {
    const { core, document, textNode } = setup("Plain");

    setDOMRange(textNode, 1, textNode, 4);
    const selection = core.syncSelectionFromDOM();

    expect(selection?.selectionRanges[0]).toMatchObject({
      anchor: { path: "/text", offset: 1 },
      focus: { path: "/text", offset: 4 },
    });
    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/text", offset: 1 },
      focus: { path: "/text", offset: 4 },
    });
  });

  it("maps generated marker atoms as selectable model characters", () => {
    const { core, document, textElement } = setupMarkerDocument("Task text");

    setDOMRange(textElement, 0, textElement, textElement.childNodes.length);
    const selection = core.syncSelectionFromDOM();

    expect(selection?.selectionRanges[0]).toMatchObject({
      anchor: { path: "/text", offset: 0 },
      focus: { path: "/text", offset: 10 },
    });
    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/text", offset: 0 },
      focus: { path: "/text", offset: 10 },
    });
  });

  it("restores selections around generated marker atoms", () => {
    const { core, textElement, textNode } = setupMarkerDocument("Task text");

    const restored = core.restoreSelectionToDOM({
      selectedPointers: [],
      selectionRanges: [
        {
          anchor: { path: "/text", offset: 0 },
          focus: { path: "/text", offset: 10 },
        },
      ],
      primaryIndex: 0,
      anchor: { path: "/text", offset: 0 },
      focus: { path: "/text", offset: 10 },
    });

    const selection = window.document.getSelection();
    expect(restored).toBe(true);
    expect(selection?.anchorNode).toBe(textElement);
    expect(selection?.anchorOffset).toBe(0);
    expect(selection?.focusNode).toBe(textNode);
    expect(selection?.focusOffset).toBe(9);
  });

  it("copies generated marker atoms as structured fragments", () => {
    const { core, document, textElement } = setupMarkerDocument("Task text");

    setDOMRange(textElement, 0, textElement, textElement.childNodes.length);
    const clipboard = createClipboardEvent("copy");
    const copied = core.copy(clipboard);
    const payload = JSON.parse(
      clipboard.clipboardData?.getData(JSON_CONTENT_EDITABLE_MIME) ?? "{}",
    );

    expect(copied.ok).toBe(true);
    expect(clipboard.clipboardData?.getData("text/plain")).toBe("- [ ] Task text");
    expect(payload).toMatchObject({
      schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
      text: `${JSON_ATOM_REPLACEMENT}Task text`,
      atoms: {
        "task-marker": {
          type: "taskMarker",
          label: "- [ ] ",
          offset: 0,
        },
      },
    });
    expect(document.clipboard.read()).toMatchObject({
      ok: true,
      payload,
    });
  });

  it("commits native text changes from the text surface without marker text", () => {
    const { core, document, textNode } = setupMarkerDocument("Task text");

    textNode.textContent = "New Task text";
    setDOMRange(textNode, 3, textNode, 3);
    const result = core.handle(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ flow: "native-text", render: false });
    expect(document.value.text).toBe(`${JSON_ATOM_REPLACEMENT}New Task text`);
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 5,
    });
  });

  it("commits native DOM text changes through json-document history", () => {
    const { core, document, textNode } = setup("Plain");

    textNode.textContent = "가Plain";
    setDOMRange(textNode, 1, textNode, 1);
    const result = core.handle(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ flow: "native-text", render: false });
    expect(document.value.text).toBe("가Plain");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 1,
    });

    expect(core.undo().ok).toBe(true);
    expect(document.value.text).toBe("Plain");
    expect(core.redo().ok).toBe(true);
    expect(document.value.text).toBe("가Plain");
  });

  it("preserves a native DOM range while copying flushed text", () => {
    const { core, document, textNode } = setup("Plain");

    textNode.textContent = "Plain xy";
    setDOMRange(textNode, 7, textNode, 8);
    const clipboard = createClipboardEvent("copy");
    const copied = core.copy(clipboard);

    expect(copied.ok).toBe(true);
    expect(document.value.text).toBe("Plain xy");
    expect(clipboard.clipboardData?.getData("text/plain")).toBe("y");
    expect(document.clipboard.read()).toMatchObject({
      ok: true,
      payload: "y",
    });
  });

  it("pastes plain text over the current json-document range", () => {
    const { core, document, textNode } = setup("Plain xy");

    setDOMRange(textNode, 7, textNode, 8);
    core.syncSelectionFromDOM();
    const clipboard = createClipboardEvent("paste");
    clipboard.clipboardData?.setData("text/plain", "Z");

    const result = core.paste(clipboard);

    expect(result.ok).toBe(true);
    expect(document.value.text).toBe("Plain xZ");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 8,
    });
  });

  it("pastes plain text without a browser ClipboardEvent", () => {
    const { core, document, textNode } = setup("Plain xy");

    setDOMRange(textNode, 7, textNode, 8);
    core.syncSelectionFromDOM();

    const result = core.pasteText("Z");

    expect(result.ok).toBe(true);
    expect(document.value.text).toBe("Plain xZ");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 8,
    });
  });

  it("pastes over the previous json range when toolbar focus collapses the DOM caret", () => {
    const { core, document, textNode } = setup("Plain xy");

    setDOMRange(textNode, 0, textNode, 5);
    core.syncSelectionFromDOM();
    setDOMRange(textNode, 8, textNode, 8);

    const result = core.pasteText("Z");

    expect(result.ok).toBe(true);
    expect(document.value.text).toBe("Z xy");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 1,
    });
  });

  it("pastes at the previous json caret when toolbar focus collapses the DOM caret", () => {
    const { core, document, textNode } = setup("Plain xy");

    setDOMRange(textNode, 2, textNode, 2);
    core.syncSelectionFromDOM();
    setDOMRange(textNode, 8, textNode, 8);

    const result = core.pasteText("Z");

    expect(result.ok).toBe(true);
    expect(document.value.text).toBe("PlZain xy");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 3,
    });
  });

  it("treats atom DOM elements as one model character for selection", () => {
    const { core, document, textElement } = setupAtomDocument();

    setDOMRange(textElement, 1, textElement, 2);
    const selection = core.syncSelectionFromDOM();

    expect(selection?.selectionRanges[0]).toMatchObject({
      anchor: { path: "/text", offset: 1 },
      focus: { path: "/text", offset: 2 },
    });
    expect(document.selection?.snapshot().selectionRanges[0]).toMatchObject({
      anchor: { path: "/text", offset: 1 },
      focus: { path: "/text", offset: 2 },
    });
  });

  it("moves the caret after a trailing atom for command line-end", () => {
    const { core, document, textElement } = setupTrailingAtomDocument();

    setDOMRange(textElement, 1, textElement, 1);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      metaKey: true,
    });
    const result = core.handle(event);

    expect(event.defaultPrevented).toBe(true);
    expect(result.ok).toBe(true);
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 2,
    });
    expect(window.document.getSelection()?.focusOffset).toBe(2);
  });

  it("extends the selection through a trailing atom for command-shift line-end", () => {
    const { core, document, textElement } = setupTrailingAtomDocument();
    const textNode = textElement.firstChild;
    if (textNode === null) {
      throw new Error("Missing leading text node.");
    }

    setDOMRange(textNode, 0, textNode, 0);
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      metaKey: true,
      shiftKey: true,
    });
    const result = core.handle(event);

    expect(event.defaultPrevented).toBe(true);
    expect(result.ok).toBe(true);
    expect(document.selection?.selectionRanges[0]).toMatchObject({
      anchor: { path: "/text", offset: 0 },
      focus: { path: "/text", offset: 2 },
    });
    expect(window.document.getSelection()?.toString()).toBe("A@Ada");
  });

  it("moves command arrows to text line boundaries instead of the whole text", () => {
    const { core, document, textNode } = setup("One\nTwo\nThree");

    setDOMRange(textNode, 5, textNode, 5);
    expect(
      core.handle(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowRight",
          metaKey: true,
        }),
      ).ok,
    ).toBe(true);
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 7,
    });

    setDOMRange(textNode, 5, textNode, 5);
    expect(
      core.handle(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "ArrowLeft",
          metaKey: true,
        }),
      ).ok,
    ).toBe(true);
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 4,
    });
  });

  it("moves arrow up and down through a visual layout snapshot", () => {
    const visualLayout: JsonContentEditableVisualLayout = {
      lines: [
        visualLine({
          bottom: 10,
          endOffset: 3,
          index: 0,
          startOffset: 0,
          top: 0,
          xs: [0, 10, 20, 30],
        }),
        visualLine({
          bottom: 20,
          endOffset: 8,
          index: 1,
          startOffset: 5,
          top: 10,
          xs: [0, 9, 18, 27],
        }),
      ],
    };
    const { document, root, textNode } = setup("abcd\nefgh");
    const core = createJsonContentEditable({
      root,
      document,
      visualLayout: () => visualLayout,
    });

    setDOMRange(textNode, 2, textNode, 2);
    const down = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });

    expect(core.handle(down)).toMatchObject({
      flow: "model-command",
      kind: "selection",
      render: true,
    });
    expect(down.defaultPrevented).toBe(true);
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 7,
    });

    const up = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowUp",
    });
    expect(core.handle(up)).toMatchObject({
      flow: "model-command",
      kind: "selection",
      render: true,
    });
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 2,
    });
  });

  it("keeps the original visual x while moving through shorter lines", () => {
    const visualLayout: JsonContentEditableVisualLayout = {
      lines: [
        visualLine({
          bottom: 10,
          endOffset: 2,
          index: 0,
          startOffset: 0,
          top: 0,
          xs: [0, 10, 20],
        }),
        visualLine({
          bottom: 20,
          endOffset: 5,
          index: 1,
          startOffset: 4,
          top: 10,
          xs: [0, 8],
        }),
        visualLine({
          bottom: 30,
          endOffset: 9,
          index: 2,
          startOffset: 7,
          top: 20,
          xs: [0, 10, 20],
        }),
      ],
    };
    const { document, root, textNode } = setup("abc\nde\nfgh");
    const core = createJsonContentEditable({
      root,
      document,
      visualLayout: () => visualLayout,
    });

    setDOMRange(textNode, 2, textNode, 2);
    core.handle(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowDown",
      }),
    );
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 5,
    });

    core.handle(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "ArrowDown",
      }),
    );
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 9,
    });
  });

  it("does not measure the DOM on vertical motion without a stored visual layout", () => {
    const { core, document, textNode } = setup("first\nsecond");

    setDOMRange(textNode, 2, textNode, 2);
    core.syncSelectionFromDOM();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    const result = core.handle(event);

    expect(event.defaultPrevented).toBe(true);
    expect(result).toMatchObject({
      flow: "model-command",
      kind: "no-change",
      render: false,
    });
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 2,
    });
  });

  it("hands off native IME text before vertical model commands", () => {
    const { document, root, textNode } = setup("top\nbottom");
    let visualLayout: JsonContentEditableVisualLayout = {
      lines: [],
    };
    const core = createJsonContentEditable({
      root,
      document,
      visualLayout: () => visualLayout,
    });

    setDOMRange(textNode, 0, textNode, 0);
    core.handle(new CompositionEvent("compositionstart", { bubbles: true }));
    textNode.textContent = `반${textNode.textContent ?? ""}`;
    setDOMRange(textNode, 1, textNode, 1);
    core.handle(
      new InputEvent("input", {
        bubbles: true,
        data: "반",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    const result = core.handle(event);

    expect(event.defaultPrevented).toBe(true);
    expect(result).toMatchObject({
      flow: "native-handoff",
      kind: "text",
      render: true,
      command: {
        direction: "down",
        extend: false,
        type: "moveVertical",
      },
    });
    expect(document.value.text).toBe("반top\nbottom");
    if (!result.ok || !("flow" in result) || result.flow !== "native-handoff") {
      throw new Error("Expected native handoff.");
    }

    visualLayout = {
      lines: [
        visualLine({
          bottom: 10,
          endOffset: 4,
          index: 0,
          startOffset: 0,
          top: 0,
          xs: [0, 10, 20, 30, 40],
        }),
        visualLine({
          bottom: 20,
          endOffset: 10,
          index: 1,
          startOffset: 5,
          top: 10,
          xs: [0, 10, 20, 30, 40, 50],
        }),
      ],
    };
    expect(core.runCommand(result.command)).toMatchObject({
      flow: "model-command",
      kind: "selection",
    });
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 6,
    });

    textNode.textContent = `반${textNode.textContent ?? ""}`;
    const duplicateFinalInput = core.handle(
      new InputEvent("input", {
        bubbles: true,
        data: "반",
        inputType: "insertFromComposition",
      }),
    );
    expect(duplicateFinalInput).toMatchObject({
      flow: "native-text",
      kind: "no-change",
      render: true,
    });
    expect(document.value.text).toBe("반top\nbottom");
  });

  it("hands off native IME text before command-arrow movement", () => {
    const { core, document, textNode } = setup("Plain");

    setDOMRange(textNode, 1, textNode, 1);
    core.handle(new CompositionEvent("compositionstart", { bubbles: true }));
    textNode.textContent = `P반lain`;
    setDOMRange(textNode, 2, textNode, 2);
    core.handle(
      new InputEvent("input", {
        bubbles: true,
        data: "반",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      metaKey: true,
    });
    const result = core.handle(event);

    expect(event.defaultPrevented).toBe(true);
    expect(result).toMatchObject({
      flow: "native-handoff",
      kind: "text",
      render: true,
      command: {
        boundary: "line-end",
        extend: false,
        type: "moveLineBoundary",
      },
    });
    expect(document.value.text).toBe("P반lain");
    if (!result.ok || !("flow" in result) || result.flow !== "native-handoff") {
      throw new Error("Expected native handoff.");
    }

    expect(core.runCommand(result.command)).toMatchObject({
      flow: "model-command",
      kind: "selection",
    });
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: "P반lain".length,
    });
  });

  it("copies selected atoms as a structured fragment with plain text fallback", () => {
    const { core, document, textElement } = setupAtomDocument();

    setDOMRange(textElement, 1, textElement, 2);
    const clipboard = createClipboardEvent("copy");
    const copied = core.copy(clipboard);
    const payload = JSON.parse(
      clipboard.clipboardData?.getData(JSON_CONTENT_EDITABLE_MIME) ?? "{}",
    );

    expect(copied.ok).toBe(true);
    expect(clipboard.clipboardData?.getData("text/plain")).toBe("@Ada");
    expect(payload).toMatchObject({
      schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
      text: JSON_ATOM_REPLACEMENT,
      atoms: {
        ada: {
          label: "@Ada",
          offset: 0,
        },
      },
    });
    expect(document.clipboard.read()).toMatchObject({
      ok: true,
      payload,
    });
  });

  it("pastes atom fragments back into text with live atom metadata", () => {
    const { core, document, textElement } = setupAtomDocument("AB", {});
    textElement.textContent = "AB";

    setDOMRange(textElement.firstChild ?? textElement, 1, textElement.firstChild ?? textElement, 1);
    core.syncSelectionFromDOM();
    const clipboard = createClipboardEvent("paste");
    clipboard.clipboardData?.setData("text/plain", "@Ada");
    clipboard.clipboardData?.setData(
      JSON_CONTENT_EDITABLE_MIME,
      JSON.stringify({
        schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
        text: JSON_ATOM_REPLACEMENT,
        atoms: {
          ada: {
            type: "mention",
            userId: "ada",
            label: "@Ada",
            offset: 0,
          },
        },
      }),
    );

    const pasted = core.paste(clipboard);

    expect(pasted.ok).toBe(true);
    expect(document.value.text).toBe(`A${JSON_ATOM_REPLACEMENT}B`);
    expect(document.value.atoms.ada).toMatchObject({
      label: "@Ada",
      offset: 1,
    });
  });

  it("keeps atom offsets in sync when native input happens before an atom", () => {
    const { core, document, textElement } = setupAtomDocument();
    const firstText = textElement.firstChild;
    if (firstText === null) {
      throw new Error("Missing first text node.");
    }

    firstText.textContent = "XA";
    setDOMRange(firstText, 1, firstText, 1);
    const result = core.handle(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );

    expect(result.ok).toBe(true);
    expect(document.value.text).toBe(`XA${JSON_ATOM_REPLACEMENT}B`);
    expect(document.value.atoms.ada.offset).toBe(2);
  });

  it("copies selected ranges as a structured fragment", () => {
    const { core, document, textNode } = setupRangeDocument();

    setDOMRange(textNode, 0, textNode, 5);
    const clipboard = createClipboardEvent("copy");
    const copied = core.copy(clipboard);
    const payload = JSON.parse(
      clipboard.clipboardData?.getData(JSON_CONTENT_EDITABLE_MIME) ?? "{}",
    );

    expect(copied.ok).toBe(true);
    expect(clipboard.clipboardData?.getData("text/plain")).toBe("Hello");
    expect(payload).toMatchObject({
      schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
      text: "Hello",
      ranges: {
        bold: {
          type: "bold",
          start: 0,
          end: 5,
        },
      },
    });
    expect(document.clipboard.read()).toMatchObject({
      ok: true,
      payload,
    });
  });

  it("pastes range fragments back into text with live range metadata", () => {
    const { core, document, textNode } = setupRangeDocument("AB", {});

    setDOMRange(textNode, 1, textNode, 1);
    core.syncSelectionFromDOM();
    const clipboard = createClipboardEvent("paste");
    clipboard.clipboardData?.setData("text/plain", "Hi");
    clipboard.clipboardData?.setData(
      JSON_CONTENT_EDITABLE_MIME,
      JSON.stringify({
        schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
        text: "Hi",
        ranges: {
          bold: {
            type: "bold",
            start: 0,
            end: 2,
          },
        },
      }),
    );

    const pasted = core.paste(clipboard);

    expect(pasted.ok).toBe(true);
    expect(document.value.text).toBe("AHiB");
    expect(document.value.marks.bold).toMatchObject({
      type: "bold",
      start: 1,
      end: 3,
    });
  });

  it("keeps range offsets in sync when native input happens before a range", () => {
    const { core, document, textNode } = setupRangeDocument("Hello world", {
      bold: {
        type: "bold",
        start: 6,
        end: 11,
      },
    });

    textNode.textContent = "Big Hello world";
    setDOMRange(textNode, 4, textNode, 4);
    const result = core.handle(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );

    expect(result.ok).toBe(true);
    expect(document.value.text).toBe("Big Hello world");
    expect(document.value.marks.bold).toMatchObject({
      start: 10,
      end: 15,
    });
  });

  it("keeps native IME composition buffered until commit", () => {
    const { core, document, textNode } = setup("Plain");

    setDOMRange(textNode, 0, textNode, 0);
    core.handle(new CompositionEvent("compositionstart", { bubbles: true }));

    textNode.textContent = "あPlain";
    setDOMRange(textNode, 1, textNode, 1);
    const composingInput = core.handle(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );

    expect(composingInput.ok).toBe(true);
    expect(document.value.text).toBe("Plain");

    const historyUndo = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "historyUndo",
    });
    core.handle(historyUndo);
    expect(historyUndo.defaultPrevented).toBe(true);
    expect(document.value.text).toBe("Plain");

    const commit = core.handle(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromComposition",
      }),
    );

    expect(commit.ok).toBe(true);
    expect(document.value.text).toBe("あPlain");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 1,
    });
  });

  it("commits IME composition over a native range replacement", () => {
    const { core, document, textNode } = setup("Plain");

    setDOMRange(textNode, 0, textNode, 3);
    core.syncSelectionFromDOM();
    core.handle(new CompositionEvent("compositionstart", { bubbles: true }));

    textNode.textContent = "あin";
    setDOMRange(textNode, 1, textNode, 1);
    core.handle(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );

    const commit = core.handle(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertFromComposition",
      }),
    );

    expect(commit.ok).toBe(true);
    expect(document.value.text).toBe("あin");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 1,
    });
  });

  it("derives the IME commit caret from the text diff when the DOM caret is stale", () => {
    const { core, document, textNode } = setup("Plain");

    textNode.textContent = "가Plain";
    setDOMRange(textNode, 1, textNode, 1);
    expect(
      core.handle(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertFromComposition",
        }),
      ).ok,
    ).toBe(true);

    textNode.textContent = "가가Plain";
    setDOMRange(textNode, 1, textNode, 1);
    expect(
      core.handle(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertFromComposition",
        }),
      ).ok,
    ).toBe(true);

    expect(document.value.text).toBe("가가Plain");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 2,
    });
  });

  it("handles line breaks as a model command before native DOM mutation", () => {
    const { core, document, textNode } = setup("안녕하세요.");

    setDOMRange(textNode, 6, textNode, 6);
    const event = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertParagraph",
    });
    const result = core.handle(event);

    expect(event.defaultPrevented).toBe(true);
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ flow: "model-command", render: true });
    expect(document.value.text).toBe("안녕하세요.\n");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 7,
    });
  });

  it("keeps character input on the native input path", () => {
    const { core, document, textNode } = setup("안녕하세요.");

    textNode.textContent = "안녕하세요.a";
    setDOMRange(textNode, 7, textNode, 7);
    const result = core.handle(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ flow: "native-text", render: false });
    expect(document.value.text).toBe("안녕하세요.a");
    expect(document.selection?.focus).toMatchObject({
      path: "/text",
      offset: 7,
    });
  });

  it("round-trips JSON clipboard payload through json-document clipboard", () => {
    const { core, document, textNode } = setup("Plain");

    setDOMRange(textNode, 0, textNode, 5);
    core.syncSelectionFromDOM();
    const copyEvent = createClipboardEvent("copy");
    expect(core.copy(copyEvent).ok).toBe(true);

    const pasteEvent = createClipboardEvent("paste");
    pasteEvent.clipboardData?.setData(
      JSON_CONTENT_EDITABLE_MIME,
      copyEvent.clipboardData?.getData(JSON_CONTENT_EDITABLE_MIME) ?? "",
    );
    pasteEvent.clipboardData?.setData("text/plain", "Plain");
    setDOMRange(textNode, 5, textNode, 5);
    core.syncSelectionFromDOM();

    const pasted = core.paste(pasteEvent);

    expect(pasted.ok).toBe(true);
    expect(document.value.text).toBe("PlainPlain");
  });
});

function setDOMRange(
  anchorNode: Node,
  anchorOffset: number,
  focusNode: Node,
  focusOffset: number,
) {
  const range = window.document.createRange();
  range.setStart(anchorNode, anchorOffset);
  range.setEnd(focusNode, focusOffset);
  const selection = window.document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function createClipboardEvent(type: string): ClipboardEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    value: createClipboardData(),
  });
  return event;
}

function createClipboardData(): DataTransfer {
  const data = new Map<string, string>();
  return {
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
    clearData: (type?: string) => {
      if (type === undefined) {
        data.clear();
      } else {
        data.delete(type);
      }
    },
  } as DataTransfer;
}
