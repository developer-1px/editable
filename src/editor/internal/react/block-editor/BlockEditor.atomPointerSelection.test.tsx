// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  fireBeforeInput,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor atom pointer selection", () => {
  it("selects atom nodes on pointer down and copies their fallback data", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const mention = editor.querySelector(".mention-chip");
    if (!(mention instanceof HTMLElement)) {
      throw new Error("Fixture failed to render mention.");
    }

    fireEvent.pointerDown(mention);

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("/root/children/0/children/9");
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("@Ada");
    expect(clipboard.getData("text/markdown")).toBe("@[Ada](mention:user-ada)");
  });

  it("does not let a stale native text range override atom selection", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    const mention = editor.querySelector(".mention-chip");
    if (!(firstText instanceof Text) || !(mention instanceof HTMLElement)) {
      throw new Error("Fixture failed to render selectable content.");
    }

    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent.pointerDown(mention);

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("@Ada");
    expect(clipboard.getData("text/plain")).not.toBe("Plain");
  });

  it("replaces explicit atom selection when text is typed", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const mention = editor.querySelector(".mention-chip");
    if (!(mention instanceof HTMLElement)) {
      throw new Error("Fixture failed to render mention.");
    }

    fireEvent.pointerDown(mention);
    fireBeforeInput(editor, { inputType: "insertText", data: "Ada Lovelace" });

    expect(editor.textContent).toContain("Ada Lovelace");
    expect(editor.querySelector(".mention-chip")).toBe(null);
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/8/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("13");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("");
  });

  it("extends selection to atom nodes with shift pointer down", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    const mention = editor.querySelector(".mention-chip");
    if (!(mention instanceof HTMLElement)) {
      throw new Error("Fixture failed to render mention.");
    }

    fireEvent.pointerDown(mention, { shiftKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-offset"),
    ).toBe("1");
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

  it("triple pointer down selects the current block", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const mention = editor.querySelector(".mention-chip");
    if (!(mention instanceof HTMLElement)) {
      throw new Error("Fixture failed to render mention.");
    }

    fireEvent.pointerDown(mention, { detail: 3 });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-path"),
    ).toBe("/root/children/0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-edge"),
    ).toBe("before");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-path"),
    ).toBe("/root/children/0");
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
});
