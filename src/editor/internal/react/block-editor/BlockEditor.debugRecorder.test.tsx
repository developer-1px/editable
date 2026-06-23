// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EDITABLE_CLIPBOARD_MIME } from "../../model/clipboard";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  installBlockEditorTestCleanup,
  setDOMRangeSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor debug recorder", () => {
  it("records input, JSON, and DOM between Cmd+Shift+Backslash toggles", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {
      return;
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    expect(screen.queryByRole("status", { name: "Debug recorder" })).toBeNull();

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });
    const inspector = screen.getByRole("status", { name: "Debug recorder" });
    expect(inspector.textContent).toContain("REC");

    fireEvent.paste(editor, {
      clipboardData: {
        getData: () => "recorded ",
      },
    });
    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(inspector.textContent).toContain("DONE");

    const report = writeText.mock.calls[0]?.[0];
    expect(typeof report).toBe("string");
    expect(consoleLog).toHaveBeenCalledWith(report);

    expect(report).toContain("EDITABLE DEBUG TRACE");
    expect(report).toContain("schema: editable-debug-trace@3");
    expect(report).toContain("DIAGNOSTICS\n  none");
    expect(report).toContain('paste "recorded "');
    expect(report).toContain("recorded Plain");
    expect(report).toContain("full JSON/DOM omitted from clipboard");
    expect(report).not.toContain("rawEntries");
    expect(report).not.toContain('<main class="app-shell">');
  });

  it("records the clipboard payload that paste and copy actually use", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(console, "log").mockImplementation(() => {
      return;
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });

    const pasteClipboard = createClipboardData();
    pasteClipboard.setData("text/plain", "plain ");
    pasteClipboard.setData(
      EDITABLE_CLIPBOARD_MIME,
      JSON.stringify({
        schema: "editable-clipboard@1",
        plainText: "structured ",
      }),
    );
    fireEvent.paste(editor, { clipboardData: pasteClipboard });

    const firstText = editor.querySelector(".text-run")?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render selectable text.");
    }
    setDOMRangeSelection(firstText, 11, firstText, 16);
    fireEvent.copy(editor, { clipboardData: createClipboardData() });

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const report = writeText.mock.calls[0]?.[0];
    expect(typeof report).toBe("string");
    expect(report).toContain('paste "structured "');
    expect(report).not.toContain('paste "plain "');
    expect(report).toContain('copy "Plain"');
  });

  it("records warn and error console diagnostics while debugging", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {
      return;
    });
    vi.spyOn(console, "warn").mockImplementation(() => {
      return;
    });
    vi.spyOn(console, "error").mockImplementation(() => {
      return;
    });

    render(<BlockEditor />);

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });
    console.warn("debug warning", { reason: "recorder-test" });
    console.error(new Error("debug failure"));
    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const report = consoleLog.mock.calls[0]?.[0];
    expect(typeof report).toBe("string");
    expect(report).toContain("console=2");
    expect(report).toContain("debug warning");
    expect(report).toContain("recorder-test");
    expect(report).toContain("debug failure");
  });

  it("reports debug copy failure while keeping the raw report in memory", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false),
    });
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {
      return;
    });
    vi.spyOn(console, "log").mockImplementation(() => {
      return;
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });
    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });

    const inspector = screen.getByRole("status", { name: "Debug recorder" });
    await waitFor(() => expect(inspector.textContent).toContain("FAIL"));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(document.body.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(editor);
    expect(consoleWarn).toHaveBeenCalledWith(
      "Debug recording could not be copied to the clipboard.",
    );
    expect(
      (
        window as Window & {
          __editableDebugRecordings?: unknown[];
        }
      ).__editableDebugRecordings?.at(-1),
    ).toBeDefined();
  });

  it("keeps only the five most recent raw debug reports", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(console, "log").mockImplementation(() => {
      return;
    });
    delete (
      window as Window & {
        __editableDebugRecordings?: unknown[];
      }
    ).__editableDebugRecordings;

    render(<BlockEditor />);

    for (let index = 0; index < 6; index += 1) {
      fireEvent.keyDown(window, {
        code: "Backslash",
        key: "|",
        metaKey: true,
        shiftKey: true,
      });
      fireEvent.keyDown(window, {
        code: "Backslash",
        key: "|",
        metaKey: true,
        shiftKey: true,
      });
    }

    expect(writeText).toHaveBeenCalledTimes(6);
    expect(
      (
        window as Window & {
          __editableDebugRecordings?: unknown[];
        }
      ).__editableDebugRecordings,
    ).toHaveLength(5);
  });

  it("does not record debug inspector DOM changes as editor state", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    vi.spyOn(console, "log").mockImplementation(() => {
      return;
    });

    render(<BlockEditor />);
    expect(screen.queryByRole("status", { name: "Debug recorder" })).toBeNull();

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });
    const inspector = screen.getByRole("status", { name: "Debug recorder" });
    await waitFor(() => expect(inspector.textContent).toContain("REC"));

    fireEvent.keyDown(window, {
      code: "Backslash",
      key: "|",
      metaKey: true,
      shiftKey: true,
    });

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const raw = (
      window as Window & {
        __editableDebugRecordings?: Array<{
          rawEntries: Array<{ kind: string; reason?: string }>;
        }>;
      }
    ).__editableDebugRecordings?.at(-1);

    expect(
      raw?.rawEntries.map((entry) => entry.reason).filter(Boolean),
    ).toEqual(["recording-started", "recording-stopped"]);
  });
});
