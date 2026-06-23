// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  dispatchPointerEvent,
  installBlockEditorTestCleanup,
  installEditorGeometry,
  setDOMRangeSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor drag pointer selection", () => {
  it("creates canonical range selection while pointer dragging", async () => {
    const restoreGeometry = installEditorGeometry();
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.pointerDown(editor, {
      button: 0,
      clientX: 0,
      clientY: 8,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(editor, {
      clientX: 1000,
      clientY: 8,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(editor, { pointerId: 1, pointerType: "mouse" });

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

  it("leaves touch pointer movement to the browser owner", async () => {
    const restoreGeometry = installEditorGeometry();
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperty(editor, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    Object.defineProperty(editor, "releasePointerCapture", {
      configurable: true,
      value: releasePointerCapture,
    });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");

    const pointerDown = dispatchPointerEvent(editor, "pointerdown", {
      button: 0,
      clientX: 0,
      clientY: 8,
      pointerId: 11,
      pointerType: "touch",
    });
    const pointerMove = dispatchPointerEvent(editor, "pointermove", {
      button: 0,
      clientX: 1000,
      clientY: 8,
      pointerId: 11,
      pointerType: "touch",
    });
    dispatchPointerEvent(editor, "pointerup", {
      button: 0,
      clientX: 1000,
      clientY: 8,
      pointerId: 11,
      pointerType: "touch",
    });

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(pointerMove.defaultPrevented).toBe(false);
    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(releasePointerCapture).not.toHaveBeenCalled();
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
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-edge"),
    ).toBe(null);
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("");

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent(document, new Event("selectionchange"));

    restoreGeometry();

    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);
    expect(document.body.querySelector(".selection-overlay")).toBe(null);
  });

  it("captures and releases primary pointer drags", async () => {
    const restoreGeometry = installEditorGeometry();
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperty(editor, "setPointerCapture", {
      configurable: true,
      value: setPointerCapture,
    });
    Object.defineProperty(editor, "releasePointerCapture", {
      configurable: true,
      value: releasePointerCapture,
    });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.pointerDown(editor, {
      button: 0,
      clientX: 0,
      clientY: 8,
      pointerId: 7,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(editor, { pointerId: 7, pointerType: "mouse" });

    restoreGeometry();

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
  });

  it("stops drag selection updates after pointer cancel", async () => {
    const restoreGeometry = installEditorGeometry();
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.pointerDown(editor, {
      button: 0,
      clientX: 0,
      clientY: 8,
      pointerId: 3,
    });
    fireEvent.pointerCancel(editor, { pointerId: 3 });
    fireEvent.pointerMove(editor, {
      clientX: 1000,
      clientY: 8,
      pointerId: 3,
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
        ?.getAttribute("data-selection-focus-edge"),
    ).toBe(null);
  });
});
