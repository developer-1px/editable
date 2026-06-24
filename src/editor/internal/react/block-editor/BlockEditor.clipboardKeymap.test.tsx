// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  dispatchKeyboard,
  installBlockEditorTestCleanup,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor clipboard keymap bridge", () => {
  it("leaves no-data clipboard shortcuts to native browser events", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    for (const key of ["c", "x", "v"]) {
      const keydown = dispatchKeyboard(editor, "keydown", {
        key,
        metaKey: true,
      });

      expect(keydown.defaultPrevented).toBe(false);
    }
    expect(editor.textContent).toContain("Plain bold");
    expect(document.body.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(editor);
  });

  it("handles editor-owned range copy and cut when the native DOM selection is collapsed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const selectKeydown = dispatchKeyboard(editor, "keydown", {
      key: "ArrowRight",
      metaKey: true,
      shiftKey: true,
    });
    expect(selectKeydown.defaultPrevented).toBe(true);

    const copyKeydown = dispatchKeyboard(editor, "keydown", {
      key: "c",
      metaKey: true,
    });
    expect(copyKeydown.defaultPrevented).toBe(true);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0]?.[0]).toContain("@Ada");

    const cutKeydown = dispatchKeyboard(editor, "keydown", {
      key: "x",
      metaKey: true,
    });
    expect(cutKeydown.defaultPrevented).toBe(true);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(editor.querySelectorAll(".mention-chip")).toHaveLength(0),
    );

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", writeText.mock.calls[1]?.[0] ?? "");
    fireEvent.paste(editor, { clipboardData: clipboard });

    await waitFor(() =>
      expect(editor.querySelectorAll(".mention-chip")).toHaveLength(1),
    );
  });

  it("does not cut editor-owned ranges when keymap clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    dispatchKeyboard(editor, "keydown", {
      key: "ArrowRight",
      metaKey: true,
      shiftKey: true,
    });
    const cutKeydown = dispatchKeyboard(editor, "keydown", {
      key: "x",
      metaKey: true,
    });

    expect(cutKeydown.defaultPrevented).toBe(true);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(editor.querySelectorAll(".mention-chip")).toHaveLength(1);
    expect(document.body.querySelector("textarea")).toBeNull();
  });
});
