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

describe("BlockEditor cut transfer bridge", () => {
  it("cuts native DOM range selections through the command layer", async () => {
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
    fireEvent.cut(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("Plain");
    expect(editor.textContent).toContain(" bold");
    expect(editor.textContent).not.toContain("Plain bold");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("0");
  });

  it("flushes active native edits before cutting the current DOM range", async () => {
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
    fireEvent.cut(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("x");
    expect(clipboard.getData("text/plain")).not.toBe("P");
    expect(editor.textContent).toContain("Plain bold");
    expect(editor.textContent).not.toContain("xPlain bold");
  });
});
