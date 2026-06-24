// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
  setDOMSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor native text buffer clipboard flush", () => {
  it("pastes after active native text edits at the flushed caret", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xPlain ";
    setDOMSelection(textNode, 1);
    fireEvent.input(editor);

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "y");
    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.textContent).toContain("xyPlain");
    expect(editor.textContent).not.toContain("yxPlain");
  });

  it("pastes over a selected active native text edit instead of the flushed caret", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xPlain ";
    setDOMRangeSelection(textNode, 0, textNode, 1);
    fireEvent.input(editor);

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "y");
    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.textContent).toContain("yPlain");
    expect(editor.textContent).not.toContain("xyPlain");
  });

  it("pastes over a DOM range inside newly appended native text", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "Plain xy";
    setDOMRangeSelection(firstText, 7, firstText, 8);
    fireEvent.input(editor);

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "Z");
    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.textContent).toContain("Plain xZ");
    expect(editor.textContent).not.toContain("Plain Z");
    expect(editor.textContent).not.toContain("Plain xyZ");
  });

  it("copies a DOM range inside newly appended native text after flushing it", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "Plain xy";
    setDOMRangeSelection(firstText, 7, firstText, 8);
    fireEvent.input(editor);

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("y");
    expect(editor.textContent).toContain("Plain xy");
  });

  it("cuts a DOM range inside newly appended native text after flushing it", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "Plain xy";
    setDOMRangeSelection(firstText, 7, firstText, 8);
    fireEvent.input(editor);

    const clipboard = createClipboardData();
    fireEvent.cut(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("y");
    expect(editor.textContent).toContain("Plain x");
    expect(editor.textContent).not.toContain("Plain xy");
  });
});
