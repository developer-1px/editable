// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor copy transfer bridge", () => {
  it("copies native DOM range selections through editor clipboard serialization", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    setDOMRangeSelection(firstText, 0, firstText, 5);
    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("Plain");
    expect(clipboard.getData("text/markdown")).toBe("Plain");
    expect(
      JSON.parse(clipboard.getData("application/x-editable-selection+json"))
        .plainText,
    ).toBe("Plain");
    expect(editor.textContent).toContain("Plain bold");
  });

  it("keeps an observed native range selected after copy", async () => {
    render(<BlockEditor />);
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

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("Plain");
    expect(document.getSelection()?.isCollapsed).toBe(false);
    expect(document.getSelection()?.toString()).toBe("Plain");
  });

  it("flushes active native edits before copying the current DOM range", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "xPlain ";
    setDOMRangeSelection(firstText, 0, firstText, 1);
    fireEvent.input(editor);

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("x");
    expect(clipboard.getData("text/plain")).not.toBe("P");
  });
});
