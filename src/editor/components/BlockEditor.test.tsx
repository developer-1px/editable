// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import { initialNoteDocument } from "../model/noteDocument";
import { BlockEditor, selectionForView } from "./BlockEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockEditor", () => {
  it("does not claim native selection before the editor is focused", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const selection = document.getSelection();

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("before");
    expect(selection?.focusNode).not.toBe(
      editor.querySelector(".text-run")?.firstChild,
    );
    expect(document.body.querySelector('[data-overlay="selected-atom"]')).toBe(
      null,
    );
  });

  it("places native selection in text when focused model cursor is at paragraph edge", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textNode = editor.querySelector(".text-run")?.firstChild;
    const selection = document.getSelection();

    editor.focus();
    fireEvent.focus(editor);

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("before");
    expect(selection?.focusNode).toBe(textNode);
    expect(selection?.focusOffset).toBe(0);
  });

  it("commits body paste through the headless adapter", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.paste(editor, {
      clipboardData: {
        getData: () => "x",
      },
    });

    expect(editor.textContent).toContain("xPlain");
  });

  it("records input, JSON, and DOM between Cmd+Shift+Backslash toggles", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {
      return;
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const inspector = screen.getByRole("status", { name: "Debug recorder" });

    expect(inspector.textContent).toContain("IDLE");

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });
    expect(inspector.textContent).toContain("REC");

    fireEvent.paste(editor, {
      clipboardData: {
        getData: () => "recorded ",
      },
    });
    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(inspector.textContent).toContain("DONE");

    const report = writeText.mock.calls[0]?.[0];
    expect(typeof report).toBe("string");
    expect(consoleLog).toHaveBeenCalledWith(report);

    expect(report).toContain("EDITABLE DEBUG TRACE");
    expect(report).toContain("schema: editable-debug-trace@3");
    expect(report).toContain("DIAGNOSTICS\n  none");
    expect(report).toContain('paste "recorded "');
    expect(report).toContain("recorded Plain");
    expect(report).toContain("full JSON/DOM omitted from clipboard");
    expect(report).not.toContain("rawEntries");
    expect(report).not.toContain('<main class="app-shell">');
  });

  it("commits printable keydown through headless input when selection is open", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(editor, { key: "x" });

    expect(editor.textContent).toContain("xPlain");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");
  });

  it("does not commit IME starter keydown before composition input", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });
    fireEvent.keyDown(editor, { key: "ㅇ" });

    expect(editor.textContent).toContain("Plain");
    expect(editor.textContent).not.toContain("ㅇPlain");
  });

  it("commits paste through headless input when selection is open", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });
    fireEvent.paste(editor, {
      clipboardData: {
        getData: () => "paste",
      },
    });

    expect(editor.textContent).toContain("pastePlain");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("5");
  });

  it("keeps Enter working on consecutive empty paragraphs", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "Enter" });
    fireEvent.keyDown(editor, { key: "Enter" });

    expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(4);
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/1/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("0");
  });

  it("does not create duplicate React block keys when inserting a paragraph", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return;
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(
      consoleError.mock.calls.some((call) =>
        call.some(
          (value) =>
            typeof value === "string" &&
            value.includes("Encountered two children with the same key"),
        ),
      ),
    ).toBe(false);
  });

  it("moves Home and End through the headless adapter", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "End" });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("after");

    fireEvent.keyDown(editor, { key: "Home", shiftKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9 /root/children/1");

    fireEvent.keyDown(editor, { key: "Home" });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("before");

    fireEvent.keyDown(editor, { key: "End", shiftKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9 /root/children/1");

    fireEvent.keyDown(editor, { key: "ArrowLeft", ctrlKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/6/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("0");

    fireEvent.keyDown(editor, {
      key: "ArrowRight",
      shiftKey: true,
      ctrlKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/6/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-offset"),
    ).toBe("0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/6/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-offset"),
    ).toBe("16");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("");
  });

  it("maps Cmd/Ctrl+ArrowLeft and ArrowRight through the headless adapter", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight", metaKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/9");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("after");

    fireEvent.keyDown(editor, {
      key: "ArrowLeft",
      shiftKey: true,
      metaKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0/children/9");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-edge"),
    ).toBe("after");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-offset"),
    ).toBe("0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9");

    fireEvent.keyDown(editor, { key: "ArrowLeft", metaKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("0");

    fireEvent.keyDown(editor, {
      key: "ArrowRight",
      shiftKey: true,
      metaKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-offset"),
    ).toBe("0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0/children/9");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-edge"),
    ).toBe("after");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9");
  });

  it("maps Alt/Option+ArrowLeft and ArrowRight through word navigation", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight", altKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("5");

    fireEvent.keyDown(editor, {
      key: "ArrowRight",
      shiftKey: true,
      altKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-offset"),
    ).toBe("5");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0/children/1/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-offset"),
    ).toBe("4");

    fireEvent.keyDown(editor, { key: "ArrowLeft", altKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("6");
  });

  it("maps Alt/Option+ArrowUp and ArrowDown through block boundary navigation", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowDown", altKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("after");

    fireEvent.keyDown(editor, { key: "ArrowDown", altKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/1");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("after");

    fireEvent.keyDown(editor, {
      key: "ArrowUp",
      shiftKey: true,
      altKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/1");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/1");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/1");
  });

  it("maps Alt/Option+Backspace and Delete through word deletion", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "Delete", altKey: true });

    expect(editor.querySelector(".document-view")?.textContent).not.toContain(
      "Plain",
    );
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("0");

    fireEvent.keyDown(editor, { key: "ArrowRight", altKey: true });
    fireEvent.keyDown(editor, { key: "Backspace", altKey: true });

    expect(editor.querySelector(".document-view")?.textContent).not.toContain(
      "bold",
    );
  });

  it("maps Cmd/Ctrl+ArrowUp and ArrowDown through the headless adapter", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowDown", metaKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("after");

    fireEvent.keyDown(editor, {
      key: "ArrowUp",
      shiftKey: true,
      metaKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9 /root/children/1");

    fireEvent.keyDown(editor, { key: "ArrowUp", ctrlKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("before");

    fireEvent.keyDown(editor, {
      key: "ArrowDown",
      shiftKey: true,
      ctrlKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9 /root/children/1");
  });

  it("maps PageUp and PageDown through the headless adapter", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "PageDown", ctrlKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("after");

    fireEvent.keyDown(editor, {
      key: "PageUp",
      shiftKey: true,
      ctrlKey: true,
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9 /root/children/1");
  });

  it("maps Ctrl+A to headless select-all before replacement input", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "a", ctrlKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/6");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9 /root/children/1");

    fireEvent.keyDown(editor, { key: "x" });

    expect(editor.querySelector(".document-view")?.textContent).toBe("x");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");
  });

  it("maps Tab and Shift+Tab to headless list depth changes", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "a", ctrlKey: true });
    fireEvent.keyDown(editor, { key: "Tab" });

    expect(
      editor.querySelector(".list-item-block")?.getAttribute("data-list-depth"),
    ).toBe("1");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9 /root/children/1");

    fireEvent.keyDown(editor, { key: "Tab", shiftKey: true });

    expect(
      editor.querySelector(".list-item-block")?.getAttribute("data-list-depth"),
    ).toBe("0");
  });

  it("maps Ctrl+B over a selected text range to marked render output", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });
    }
    fireEvent.keyDown(editor, { key: "b", ctrlKey: true });

    expect(editor.querySelector(".document-view")?.innerHTML).toContain(
      '<strong class="rich-strong">Plain</strong>',
    );
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0/children/0/text");
  });

  it("maps Ctrl+E over a selected text range to inline code render output", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });
    }
    fireEvent.keyDown(editor, { key: "e", ctrlKey: true });

    expect(editor.querySelector(".document-view")?.innerHTML).toContain(
      '<code class="rich-code">Plain</code>',
    );
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0/children/0/text");
  });

  it("maps Ctrl+K over a selected text range to link render output", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    for (let index = 0; index < 5; index += 1) {
      fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });
    }
    fireEvent.keyDown(editor, { key: "k", ctrlKey: true });

    expect(editor.querySelector(".document-view")?.innerHTML).toContain(
      '<a class="rich-link" href="https://example.com">Plain</a>',
    );
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0/children/0/text");
  });

  it("keeps Escape, F-keys, and unsupported command shortcuts non-mutating in the demo", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight" });

    const beforePath = editor
      .querySelector(".document-view")
      ?.getAttribute("data-selection-path");
    const beforeOffset = editor
      .querySelector(".document-view")
      ?.getAttribute("data-selection-offset");
    const beforeText = editor.querySelector(".document-view")?.textContent;

    fireEvent.keyDown(editor, { key: "Escape" });
    fireEvent.keyDown(editor, { key: "F1" });
    fireEvent.keyDown(editor, { key: "F12" });
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true });
    fireEvent.keyDown(editor, { key: "p", metaKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe(beforePath);
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe(beforeOffset);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
  });

  it("defers native contenteditable text sync until editing is released", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xPlain ";
    setDOMSelection(textNode, 1);

    fireEvent.input(editor);

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("before");

    fireEvent.blur(editor);

    expect(editor.textContent).toContain("xPlain");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");
  });

  it("does not run headless key commands while composition is active", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.keyDown(editor, { key: "ArrowRight", isComposing: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("before");
  });

  it("flushes native composition text after composition ends", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "한Plain ";
    setDOMSelection(textNode, 1);

    fireEvent.input(editor);

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-edge"),
    ).toBe("before");

    await act(async () => {
      fireEvent.compositionEnd(editor);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(editor.textContent).toContain("한Plain");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");
  });

  it("commits mention and figure insertion from toolbar controls", () => {
    render(<BlockEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert figure" }));

    expect(
      screen.getByRole("textbox", { name: "Document body" }).textContent,
    ).toContain("@Ada");
    expect(screen.getAllByRole("img", { name: "Figure" })).toHaveLength(2);
  });

  it("maps render selected pointers from the headless range only", () => {
    const anchor = { path: "/root/children/0/children/0/text", offset: 3 };
    const focus = { path: "/root/children/2", edge: "before" as const };
    const selection = {
      ...selectionFromCursorPoint(focus),
      selectedPointers: ["/root/children/2"],
      selectionRanges: [{ anchor, focus }],
      anchor,
      focus,
    };

    expect(
      selectionForView(initialNoteDocument, selection)?.selectedPointers,
    ).toEqual(["/root/children/0/children/9", "/root/children/1"]);
  });
});

function setDOMSelection(node: ChildNode, offset: number) {
  const range = document.createRange();
  const selection = document.getSelection();
  if (selection === null) {
    throw new Error("Selection is unavailable.");
  }

  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
