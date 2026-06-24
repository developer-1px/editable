// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import { initialNoteDocument } from "../../model/initialNoteDocument";
import { selectionForRender } from "../../model/richSelection";
import { BlockEditor } from "./BlockEditor";
import {
  fireBeforeInput,
  hasHiddenSelectionClass,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor selection state projection", () => {
  it("hides the custom cursor while a range selection is visible", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));
    expect(document.body.querySelector('[data-overlay="caret"]')).not.toBe(
      null,
    );

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });

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
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-offset"),
    ).toBe("2");
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);
  });

  it("preserves canonical range selection when focus is lost", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });

    const view = editor.querySelector(".document-view");
    expect(view?.getAttribute("data-selection-anchor-path")).toBe(
      "/root/children/0/children/0/text",
    );
    expect(view?.getAttribute("data-selection-anchor-offset")).toBe("1");
    expect(view?.getAttribute("data-selection-focus-path")).toBe(
      "/root/children/0/children/0/text",
    );
    expect(view?.getAttribute("data-selection-focus-offset")).toBe("2");

    fireEvent.blur(editor);

    expect(editor.hasAttribute("data-focused")).toBe(false);
    expect(view?.getAttribute("data-selection-anchor-path")).toBe(
      "/root/children/0/children/0/text",
    );
    expect(view?.getAttribute("data-selection-anchor-offset")).toBe("1");
    expect(view?.getAttribute("data-selection-focus-path")).toBe(
      "/root/children/0/children/0/text",
    );
    expect(view?.getAttribute("data-selection-focus-offset")).toBe("2");
    expect(document.body.querySelector(".selection-overlay")).toBe(null);
  });

  it("hides custom overlays while a native DOM range selection is visible", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));
    expect(document.body.querySelector('[data-overlay="caret"]')).not.toBe(
      null,
    );

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent(document, new Event("selectionchange"));

    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);
    expect(document.body.querySelector(".selection-overlay")).toBe(null);
  });

  it("does not create hidden selection classes across native range and focus transitions", async () => {
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

    expect(hasHiddenSelectionClass(editor)).toBe(false);

    fireEvent.blur(editor);

    expect(hasHiddenSelectionClass(editor)).toBe(false);
    expect(document.body.querySelector(".selection-overlay")).toBe(null);
  });

  it("replaces a native DOM range selection when text is typed", async () => {
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
    const event = fireBeforeInput(editor, {
      inputType: "insertText",
      data: "x",
    });

    expect(event.defaultPrevented).toBe(true);
    expect(editor.textContent).toContain("x bold");
    expect(editor.textContent).not.toContain("Plain bold");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");
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
      selectionForRender(initialNoteDocument, selection)?.selectedPointers,
    ).toEqual(["/root/children/0/children/9", "/root/children/1"]);
  });
});
