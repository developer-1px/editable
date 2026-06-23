// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  dispatchKeyboard,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor clipboard keymap bridge", () => {
  it("copies selection from keymap without waiting for native copy events", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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
    const keydown = dispatchKeyboard(editor, "keydown", {
      key: "c",
      metaKey: true,
    });

    expect(keydown.defaultPrevented).toBe(true);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Plain"));
    expect(editor.textContent).toContain("Plain bold");
  });

  it("cuts selection from keymap after clipboard write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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
    const keydown = dispatchKeyboard(editor, "keydown", {
      key: "x",
      metaKey: true,
    });

    expect(keydown.defaultPrevented).toBe(true);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Plain"));
    await waitFor(() => expect(editor.textContent).not.toContain("Plain bold"));
    expect(editor.textContent).toContain(" bold");
  });

  it("does not delete selection from keymap when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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
    dispatchKeyboard(editor, "keydown", {
      key: "x",
      metaKey: true,
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("Plain"));
    expect(editor.textContent).toContain("Plain bold");
    expect(document.body.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(editor);
  });

  it("does not create hidden DOM fallback when keymap copy has no Clipboard API", async () => {
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
    const keydown = dispatchKeyboard(editor, "keydown", {
      key: "c",
      metaKey: true,
    });

    expect(keydown.defaultPrevented).toBe(true);
    expect(editor.textContent).toContain("Plain bold");
    expect(document.body.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(editor);
  });

  it("lets paste keymap shortcuts continue to the paste event", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const keydown = dispatchKeyboard(editor, "keydown", {
      key: "v",
      metaKey: true,
    });

    expect(keydown.defaultPrevented).toBe(false);
    expect(editor.textContent).toContain("Plain bold");
  });

  it("does not run clipboard keymap mutation while composition owns keydown", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
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
    fireEvent.compositionStart(editor);
    const keydown = dispatchKeyboard(editor, "keydown", {
      key: "x",
      metaKey: true,
    });

    expect(keydown.defaultPrevented).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
    expect(editor.textContent).toContain("Plain bold");
  });
});
