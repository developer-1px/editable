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
} from "./index";

const TestDocumentSchema = z.object({
  text: z.string(),
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

describe("contenteditable-web json-document bridge", () => {
  it("locks the runtime public API surface", () => {
    expect(Object.keys(PublicCore).sort()).toEqual([
      "JSON_ATOM_ATTRIBUTE",
      "JSON_ATOM_REPLACEMENT",
      "JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA",
      "JSON_CONTENT_EDITABLE_MIME",
      "JSON_TEXT_ATTRIBUTE",
      "createJsonContentEditable",
      "isJsonContentEditableFragment",
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

  it("commits native DOM text changes through json-document history", () => {
    const { core, document, textNode } = setup("Plain");

    textNode.textContent = "가Plain";
    setDOMRange(textNode, 1, textNode, 1);
    const result = core.handle(
      new InputEvent("input", { bubbles: true, inputType: "insertText" }),
    );

    expect(result.ok).toBe(true);
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

  it("does not own command-arrow movement during native IME composition", () => {
    const { core, document, textNode } = setup("Plain");

    setDOMRange(textNode, 1, textNode, 1);
    core.handle(new CompositionEvent("compositionstart", { bubbles: true }));
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
      metaKey: true,
    });
    const result = core.handle(event);

    expect(event.defaultPrevented).toBe(false);
    expect(result.ok).toBe(true);
    if (!result.ok || !("kind" in result)) {
      throw new Error("Expected a contenteditable update.");
    }
    expect(result.kind).toBe("no-change");
    expect(document.selection?.focus ?? null).toBe(null);
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
