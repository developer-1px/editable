// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initialNoteDocument } from "../../model/initialNoteDocument";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  dispatchKeyboard,
  fireBeforeInput,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
  setDOMSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor read-only input boundary", () => {
  it("keeps read-only editing cursor-only across keyboard, DOM, paste, and cut input", async () => {
    render(<BlockEditor readOnly />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    const typing = dispatchKeyboard(editor, "keydown", { key: "x" });
    expect(typing.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    const beforeInput = fireBeforeInput(editor, {
      inputType: "insertText",
      data: "x",
    });
    expect(beforeInput.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    firstText.textContent = "xPlain ";
    setDOMSelection(firstText, 1);
    fireEvent.input(editor);

    expect(editor.textContent).not.toContain("xPlain");
    expect(editor.textContent).toContain("Plain bold");

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "pasted ");
    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    const restoredFirstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(restoredFirstText instanceof Text)) {
      throw new Error("Fixture failed to render restored first text.");
    }

    setDOMRangeSelection(restoredFirstText, 0, restoredFirstText, 5);
    const cutClipboard = createClipboardData();
    fireEvent.cut(editor, { clipboardData: cutClipboard });

    expect(cutClipboard.getData("text/plain")).toBe("Plain");
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("5");
  });

  it("ignores dropped transfer text in read-only mode", async () => {
    render(<BlockEditor readOnly />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const dataTransfer = createClipboardData();
    dataTransfer.setData("text/plain", "dropped ");
    dataTransfer.setData("text/markdown", "@[Ada](mention:user-ada)");

    fireEvent.drop(editor, { dataTransfer });

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.querySelectorAll(".mention-chip")).toHaveLength(1);
  });

  it("keeps read-only history shortcuts non-mutating", async () => {
    const { rerender } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "x" });
    await waitFor(() => expect(editor.textContent).toContain("xPlain"));

    rerender(<BlockEditor readOnly />);

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const keydownUndo = dispatchKeyboard(editor, "keydown", {
      key: "z",
      metaKey: true,
    });
    const keydownRedo = dispatchKeyboard(editor, "keydown", {
      key: "y",
      metaKey: true,
    });
    const beforeInputUndo = fireBeforeInput(editor, {
      inputType: "historyUndo",
    });
    const beforeInputRedo = fireBeforeInput(editor, {
      inputType: "historyRedo",
    });

    expect(keydownUndo.defaultPrevented).toBe(true);
    expect(keydownRedo.defaultPrevented).toBe(true);
    expect(beforeInputUndo.defaultPrevented).toBe(true);
    expect(beforeInputRedo.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.textContent).toContain("xPlain");
  });

  it("resets read-only composition input without mutating the document", async () => {
    render(<BlockEditor readOnly />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "ㅎPlain ";
    setDOMSelection(firstText, 1);
    fireEvent.compositionStart(editor);

    expect(editor.getAttribute("data-ime-composing")).toBe(null);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    const restoredFirstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(restoredFirstText instanceof Text)) {
      throw new Error("Fixture failed to restore first text.");
    }

    const composing = fireBeforeInput(editor, {
      inputType: "insertCompositionText",
      data: "한",
      isComposing: true,
    });

    expect(composing.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    restoredFirstText.textContent = "한Plain ";
    setDOMSelection(restoredFirstText, 1);
    fireEvent.compositionEnd(editor);

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.textContent).toContain("Plain bold");
    expect(editor.textContent).not.toContain("한Plain");
  });

  it("recovers active native edits immediately when switching to read-only", async () => {
    const { rerender } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "xPlain ";
    setDOMSelection(firstText, 1);
    fireEvent.input(editor);

    expect(editor.textContent).toContain("xPlain");

    rerender(<BlockEditor readOnly />);

    expect(editor.textContent).not.toContain("xPlain");
    expect(editor.textContent).toContain("Plain bold");
  });

  it("preserves a selected native range when switching to read-only", async () => {
    const { rerender } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent(document, new Event("selectionchange"));

    rerender(<BlockEditor readOnly />);

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("Plain");
  });

  it("keeps read-only title and toolbar commands non-mutating", () => {
    const { rerender } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));

    const textAfterEditableInsert =
      editor.querySelector(".document-view")?.textContent;
    const figuresAfterEditableInsert = screen.getAllByRole("img", {
      name: "Figure",
    }).length;

    rerender(<BlockEditor readOnly />);

    const title = screen.getByRole("textbox", {
      name: "Title",
    }) as HTMLInputElement;
    const readOnlyEditor = screen.getByRole("textbox", {
      name: "Document body",
    });

    expect(title.readOnly).toBe(true);
    expect(readOnlyEditor.getAttribute("aria-readonly")).toBe("true");

    fireEvent.change(title, { target: { value: "Changed title" } });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert figure" }));

    expect(title.value).toBe(initialNoteDocument.title);
    expect(readOnlyEditor.querySelector(".document-view")?.textContent).toBe(
      textAfterEditableInsert,
    );
    expect(screen.getAllByRole("img", { name: "Figure" })).toHaveLength(
      figuresAfterEditableInsert,
    );
  });
});
