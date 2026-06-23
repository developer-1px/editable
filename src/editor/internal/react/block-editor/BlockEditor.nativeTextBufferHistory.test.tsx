// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  fireBeforeInput,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
  setDOMSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor native text buffer history", () => {
  it("records blur-flushed native text edits as one undo unit", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xyPlain ";
    setDOMSelection(textNode, 2);
    fireEvent.input(editor);
    fireEvent.blur(editor);

    expect(editor.textContent).toContain("xyPlain");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(editor.textContent).not.toContain("xyPlain");
      expect(editor.textContent).toContain("Plain");
    });

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));

    await waitFor(() => {
      expect(editor.textContent).toContain("xyPlain");
    });
  });

  it("keeps separate blur-flushed native text edit sessions as separate undo units", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    const firstTextNode = () => {
      const textRun = editor.querySelector(".text-run");
      const textNode = textRun?.firstChild;
      if (textRun === null || textNode === undefined || textNode === null) {
        throw new Error("Fixture failed to render.");
      }

      return textNode;
    };

    const first = firstTextNode();
    first.textContent = "xPlain ";
    setDOMSelection(first, 1);
    fireEvent.input(editor);
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
    });

    fireEvent.focus(editor);
    const second = firstTextNode();
    second.textContent = "xyPlain ";
    setDOMSelection(second, 2);
    fireEvent.input(editor);
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(editor.textContent).toContain("xyPlain");
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
      expect(editor.textContent).not.toContain("xyPlain");
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(editor.textContent).toContain("Plain");
      expect(editor.textContent).not.toContain("xPlain");
    });
  });

  it("flushes active native text edits before keyboard undo and redo", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xyPlain ";
    setDOMSelection(textNode, 2);
    fireEvent.input(editor);

    expect(editor.textContent).toContain("xyPlain");

    fireEvent.keyDown(editor, { key: "z", metaKey: true });

    await waitFor(() => {
      expect(editor.textContent).not.toContain("xyPlain");
      expect(editor.textContent).toContain("Plain");
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-offset"),
      ).toBe("0");
    });

    fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true });

    await waitFor(() => {
      expect(editor.textContent).toContain("xyPlain");
    });
  });

  it("flushes active native text edits before beforeinput history undo and redo", async () => {
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

    const undo = fireBeforeInput(editor, { inputType: "historyUndo" });

    expect(undo.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(editor.textContent).not.toContain("xPlain");
      expect(editor.textContent).toContain("Plain");
    });

    const redo = fireBeforeInput(editor, { inputType: "historyRedo" });

    expect(redo.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
    });
  });

  it("restores the native caret after history undo from an observed range", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "x" });
    expect(editor.textContent).toContain("xPlain");

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    setDOMRangeSelection(firstText, 0, firstText, 1);
    fireEvent(editor.ownerDocument, new Event("selectionchange"));

    const undo = fireBeforeInput(editor, { inputType: "historyUndo" });

    expect(undo.defaultPrevented).toBe(true);
    await waitFor(() => expect(editor.textContent).not.toContain("xPlain"));
    expect(document.getSelection()?.isCollapsed).toBe(true);
    expect(document.getSelection()?.focusNode).toBe(firstText);
    expect(document.getSelection()?.focusOffset).toBe(0);
    expect(document.body.querySelector('[data-overlay="caret"]')).not.toBe(
      null,
    );
  });
});
