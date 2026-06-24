// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  dispatchKeyboard,
  fireBeforeInput,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
  setDOMSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor input bridge", () => {
  it("uses beforeinput for printable text and keydown for structural editing", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }
    setDOMSelection(firstText, 0);

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const beforeBlockCount = editor.querySelectorAll(".paragraph-block").length;

    dispatchKeyboard(editor, "keydown", { key: "x" });

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(
      beforeBlockCount,
    );

    dispatchKeyboard(editor, "keydown", { key: "Enter" });

    await waitFor(() =>
      expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(
        beforeBlockCount + 1,
      ),
    );

    dispatchKeyboard(editor, "keydown", { key: "ArrowRight", shiftKey: true });
    fireBeforeInput(editor, { inputType: "insertText", data: "x" });

    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
      expect(
        editor
          .querySelector(".document-view")
          ?.getAttribute("data-selection-offset"),
      ).toBe("1");
    });
  });

  it("inserts printable text with the active mark from keyboard shortcuts", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const toggleBold = dispatchKeyboard(editor, "keydown", {
      key: "b",
      metaKey: true,
    });
    expect(toggleBold.defaultPrevented).toBe(true);
    fireBeforeInput(editor, { inputType: "insertText", data: "x" });

    expect(editor.textContent).toContain("xPlain");
    await waitFor(() =>
      expect(
        Array.from(editor.querySelectorAll("strong")).some((element) =>
          element.textContent?.includes("x"),
        ),
      ).toBe(true),
    );
  });

  it("keeps native format beforeinput as a prevented no-op separate from shortcut mark commands", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    const documentView = editor.querySelector(".document-view");
    if (!(firstText instanceof Text) || documentView === null) {
      throw new Error("Fixture failed to render first text.");
    }
    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent(editor.ownerDocument, new Event("selectionchange"));
    const beforeHtml = documentView.innerHTML;
    const beforeText = documentView.textContent;

    for (const inputType of ["formatBold", "formatItalic", "formatRemove"]) {
      const beforeInput = fireBeforeInput(editor, { inputType });

      expect(beforeInput.defaultPrevented).toBe(true);
      expect(documentView.innerHTML).toBe(beforeHtml);
      expect(documentView.textContent).toBe(beforeText);
    }
  });

  it("prevents native insertLink beforeinput from bypassing the pending href command seam", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    const documentView = editor.querySelector(".document-view");
    if (!(firstText instanceof Text) || documentView === null) {
      throw new Error("Fixture failed to render first text.");
    }
    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent(editor.ownerDocument, new Event("selectionchange"));
    const beforeHtml = documentView.innerHTML;
    const beforeText = documentView.textContent;

    const beforeInput = fireBeforeInput(editor, {
      inputType: "insertLink",
      data: "https://example.com",
    });

    expect(beforeInput.defaultPrevented).toBe(true);
    expect(documentView.innerHTML).toBe(beforeHtml);
    expect(documentView.textContent).toBe(beforeText);
    expect(
      Array.from(editor.querySelectorAll("a")).some((element) =>
        element.textContent?.includes("Plain"),
      ),
    ).toBe(false);

    const linkShortcut = dispatchKeyboard(editor, "keydown", {
      key: "k",
      metaKey: true,
    });

    expect(linkShortcut.defaultPrevented).toBe(true);
    expect(documentView.innerHTML).toBe(beforeHtml);
  });

  it("moves the rendered cursor to the previous paragraph when Backspace removes an empty paragraph", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "abc" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });

    expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(4);
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/1/children/0/text");
    await waitFor(() =>
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-path"),
      ).toBe("/root/children/1/children/0/text"),
    );

    fireBeforeInput(editor, { inputType: "deleteContentBackward" });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("3");
    await waitFor(() => {
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-path"),
      ).toBe("/root/children/0/children/0/text");
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-offset"),
      ).toBe("3");
    });
    expect(document.getSelection()?.focusNode).toBe(
      editor.querySelector('[data-path="/root/children/0/children/0/text"]')
        ?.firstChild,
    );
    expect(document.getSelection()?.focusOffset).toBe(3);
  });
});
