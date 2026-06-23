// @vitest-environment jsdom

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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

describe("BlockEditor composition bridge", () => {
  it("deletes cross-block ranges before starting native composition", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    const afterFigureText = editor.querySelector(
      '[data-path="/root/children/2/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text) || !(afterFigureText instanceof Text)) {
      throw new Error("Fixture failed to render cross-block text.");
    }

    setDOMRangeSelection(firstText, 5, afterFigureText, 5);
    fireEvent(document, new Event("selectionchange"));

    fireEvent.compositionStart(editor);

    await waitFor(() => {
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
    });
    expect(editor.getAttribute("data-ime-composing")).toBe("true");
    expect(editor.querySelector(".figure-block")).toBeNull();
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("");
  });

  it("does not draw a stale custom cursor while IME composition owns the native caret", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "abc" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });

    await waitFor(() =>
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-path"),
      ).toBe("/root/children/1/children/0/text"),
    );

    fireEvent.compositionStart(editor);

    expect(editor.getAttribute("data-ime-composing")).toBe("true");
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    const previousText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(previousText instanceof Text)) {
      throw new Error("Fixture failed to render previous text.");
    }

    previousText.textContent = "abcㅎ";
    setDOMSelection(previousText, 4);
    fireBeforeInput(editor, {
      inputType: "insertCompositionText",
      data: "ㅎ",
      isComposing: true,
    });
    fireEvent.input(editor);

    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    await act(async () => {
      fireEvent.compositionEnd(editor);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(editor.textContent).toContain("abcㅎ");
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
      ).toBe("4");
    });
  });

  it("commits IME text with active marks through the marked text path", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "b", metaKey: true });

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    fireEvent.compositionStart(editor);
    const composing = fireBeforeInput(editor, {
      inputType: "insertCompositionText",
      data: "한",
      isComposing: true,
    });
    expect(composing.defaultPrevented).toBe(false);

    firstText.textContent = "한Plain ";
    setDOMSelection(firstText, 1);
    fireEvent.input(editor);

    await act(async () => {
      fireEvent.compositionEnd(editor);
      fireBeforeInput(editor, { inputType: "insertText", data: "한" });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(editor.textContent).toContain("한Plain");
    await waitFor(() =>
      expect(
        Array.from(editor.querySelectorAll("strong")).some((element) =>
          element.textContent?.includes("한"),
        ),
      ).toBe(true),
    );
  });

  it("ends composition UI state before toolbar commands", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.compositionStart(editor);

    expect(editor.getAttribute("data-ime-composing")).toBe("true");
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));

    expect(editor.getAttribute("data-ime-composing")).toBe(null);
    expect(editor.textContent).toContain("@Ada");
    expect(document.body.querySelector('[data-overlay="caret"]')).not.toBe(
      null,
    );
  });

  it("ignores history shortcuts while composition is active", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "x" });
    expect(editor.textContent).toContain("xPlain");

    fireEvent.compositionStart(editor);

    const keydown = dispatchKeyboard(editor, "keydown", {
      key: "z",
      metaKey: true,
    });
    expect(keydown.defaultPrevented).toBe(true);
    expect(editor.textContent).toContain("xPlain");

    const beforeInput = fireBeforeInput(editor, { inputType: "historyUndo" });
    expect(beforeInput.defaultPrevented).toBe(true);
    expect(editor.textContent).toContain("xPlain");
  });
});
