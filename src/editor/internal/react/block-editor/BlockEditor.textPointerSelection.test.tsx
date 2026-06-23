// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  installBlockEditorTestCleanup,
  installEditorGeometry,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor text pointer selection", () => {
  it("places the caret at a text point on single pointer down", async () => {
    const restoreGeometry = installEditorGeometry();
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");

    fireEvent.pointerDown(editor, {
      button: 0,
      clientX: 1,
      clientY: 8,
      pointerId: 1,
    });

    restoreGeometry();

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
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("");
  });

  it("ignores non-primary pointer buttons", async () => {
    const restoreGeometry = installEditorGeometry();
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");

    fireEvent.pointerDown(editor, {
      button: 1,
      clientX: 0,
      clientY: 8,
      pointerId: 1,
    });

    restoreGeometry();

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");
  });

  it("double pointer down selects the nearest word", async () => {
    const restoreGeometry = installEditorGeometry();
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.pointerDown(editor, {
      button: 0,
      clientX: 1,
      clientY: 8,
      detail: 2,
      pointerId: 1,
    });

    restoreGeometry();

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
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-offset"),
    ).toBe("5");

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("Plain");
  });
});
