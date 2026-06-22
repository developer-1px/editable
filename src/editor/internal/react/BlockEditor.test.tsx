// @vitest-environment jsdom

import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EDITABLE_CLIPBOARD_MIME } from "../model/clipboard";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import { initialNoteDocument } from "../model/noteDocument";
import { selectionForRender } from "../model/richSelection";
import { readContentEditableSelection } from "../view/contentEditableViewEngine";
import { BlockEditor } from "./BlockEditor";

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockEditor", () => {
  it("autofocuses the editor and places native selection at the model cursor", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => {
      const firstText = editor.querySelector(".text-run")?.firstChild;
      const selection = document.getSelection();

      expect(document.activeElement).toBe(editor);
      expect(editor.getAttribute("data-focused")).toBe("true");
      expect(firstText).not.toBe(null);
      expect(selection?.focusNode).toBe(firstText);
      expect(selection?.focusOffset).toBe(0);
      expect(document.body.querySelector('[data-overlay="caret"]')).not.toBe(
        null,
      );
    });

    fireEvent.blur(editor);

    expect(editor.hasAttribute("data-focused")).toBe(false);
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);
  });

  it("keeps editor focus and selection when toolbar buttons receive mouse down", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    const view = editor.querySelector(".document-view");

    expect(view?.getAttribute("data-selection-path")).toBe(
      "/root/children/0/children/0/text",
    );
    expect(view?.getAttribute("data-selection-offset")).toBe("1");

    const undo = screen.getByRole("button", { name: "Undo" });
    const mouseDown = createEvent.mouseDown(undo);
    fireEvent(undo, mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor);
    expect(view?.getAttribute("data-selection-path")).toBe(
      "/root/children/0/children/0/text",
    );
    expect(view?.getAttribute("data-selection-offset")).toBe("1");
  });

  it("uses a single guarded owner-document selectionchange listener", async () => {
    const addEventListener = vi.spyOn(document, "addEventListener");
    const removeEventListener = vi.spyOn(document, "removeEventListener");

    const { unmount } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const addedSelectionListeners = addEventListener.mock.calls.filter(
      ([type]) => type === "selectionchange",
    );
    expect(addedSelectionListeners).toHaveLength(1);

    unmount();

    const removedSelectionListeners = removeEventListener.mock.calls.filter(
      ([type]) => type === "selectionchange",
    );
    expect(removedSelectionListeners).toHaveLength(1);
  });

  it("portals overlays into the editor owner document", async () => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    const iframeDocument = iframe.contentDocument;
    if (iframeDocument === null) {
      throw new Error("iframe document is unavailable.");
    }
    iframeDocument.body.innerHTML = "";
    const container = iframeDocument.createElement("div");
    iframeDocument.body.append(container);

    const view = render(<BlockEditor />, {
      baseElement: iframeDocument.body,
      container,
    });
    const editor = view.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(iframeDocument.activeElement).toBe(editor));
    await waitFor(() =>
      expect(
        iframeDocument.body.querySelector('[data-overlay="caret"]'),
      ).not.toBe(null),
    );
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    view.unmount();
    iframe.remove();
  });

  it("scrolls the canonical selection into view after keyboard movement", async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));
    scrollIntoView.mockClear();

    fireEvent.keyDown(editor, { key: "End" });

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

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

  it("pastes editor-owned mention clipboard data through the text envelope", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    await waitFor(() => expect(document.activeElement).toBe(editor));

    const clipboard = createClipboardData();
    clipboard.setData(
      EDITABLE_CLIPBOARD_MIME,
      JSON.stringify({
        schema: "editable-clipboard@1",
        plainText: "@Ada",
        markdown: "@[Ada](mention:user-ada)",
      }),
    );

    fireEvent.paste(editor, { clipboardData: clipboard });

    await waitFor(() => {
      expect(editor.querySelectorAll(".mention-chip")).toHaveLength(2);
      expect(
        editor.querySelector(".mention-chip")?.getAttribute("data-mention-id"),
      ).toBe("user-ada");
    });
  });

  it("pastes markdown clipboard fallback data as a mention atom", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    await waitFor(() => expect(document.activeElement).toBe(editor));

    const clipboard = createClipboardData();
    clipboard.setData("text/markdown", "@[Ada](mention:user-ada)");

    fireEvent.paste(editor, { clipboardData: clipboard });

    await waitFor(() =>
      expect(editor.querySelectorAll(".mention-chip")).toHaveLength(2),
    );
  });

  it("routes markdown beforeinput paste through the same rich paste path", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    await waitFor(() => expect(document.activeElement).toBe(editor));
    const clipboard = createClipboardData();
    clipboard.setData("text/markdown", "@[Ada](mention:user-ada)");

    fireBeforeInput(editor, {
      inputType: "insertFromPaste",
      dataTransfer: clipboard,
    });

    await waitFor(() =>
      expect(editor.querySelectorAll(".mention-chip")).toHaveLength(2),
    );
    expect(
      editor.querySelector(".mention-chip")?.getAttribute("data-mention-id"),
    ).toBe("user-ada");
  });

  it("pastes editor-owned multi-block clipboard data as blocks", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    await waitFor(() => expect(document.activeElement).toBe(editor));

    const clipboard = createClipboardData();
    clipboard.setData(
      EDITABLE_CLIPBOARD_MIME,
      JSON.stringify({
        schema: "editable-clipboard@1",
        plainText: "Alpha\nBeta",
        markdown: "Alpha\n\nBeta",
      }),
    );

    fireEvent.paste(editor, { clipboardData: clipboard });

    await waitFor(() => {
      const paragraphs = Array.from(
        editor.querySelectorAll(".paragraph-block"),
      ).map((paragraph) => paragraph.textContent);

      expect(paragraphs.slice(0, 2)).toEqual(["Alpha", "Beta"]);
    });
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

  it("uses beforeinput for printable text and keydown for structural editing", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }
    setDOMSelection(firstText, 0);

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const beforeBlockCount = editor.querySelectorAll(".paragraph-block").length;

    dispatchKeyboard(editor, "keydown", { key: "x" });

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(
      beforeBlockCount,
    );

    dispatchKeyboard(editor, "keydown", { key: "Enter" });

    await waitFor(() =>
      expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(
        beforeBlockCount + 1,
      ),
    );

    dispatchKeyboard(editor, "keydown", { key: "ArrowRight", shiftKey: true });
    fireBeforeInput(editor, { inputType: "insertText", data: "x" });

    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
      expect(
        editor
          .querySelector(".document-view")
          ?.getAttribute("data-selection-offset"),
      ).toBe("1");
    });
  });

  it("inserts printable text with the active mark from keyboard shortcuts", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const toggleBold = dispatchKeyboard(editor, "keydown", {
      key: "b",
      metaKey: true,
    });
    expect(toggleBold.defaultPrevented).toBe(true);
    fireBeforeInput(editor, { inputType: "insertText", data: "x" });

    expect(editor.textContent).toContain("xPlain");
    await waitFor(() =>
      expect(
        Array.from(editor.querySelectorAll("strong")).some((element) =>
          element.textContent?.includes("x"),
        ),
      ).toBe(true),
    );
  });

  it("keeps native format beforeinput as a prevented no-op separate from shortcut mark commands", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    const documentView = editor.querySelector(".document-view");
    if (!(firstText instanceof Text) || documentView === null) {
      throw new Error("Fixture failed to render first text.");
    }
    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent(editor.ownerDocument, new Event("selectionchange"));
    const beforeHtml = documentView.innerHTML;
    const beforeText = documentView.textContent;

    for (const inputType of ["formatBold", "formatItalic", "formatRemove"]) {
      const beforeInput = fireBeforeInput(editor, { inputType });

      expect(beforeInput.defaultPrevented).toBe(true);
      expect(documentView.innerHTML).toBe(beforeHtml);
      expect(documentView.textContent).toBe(beforeText);
    }
  });

  it("prevents native insertLink beforeinput from bypassing the pending href command seam", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    const documentView = editor.querySelector(".document-view");
    if (!(firstText instanceof Text) || documentView === null) {
      throw new Error("Fixture failed to render first text.");
    }
    setDOMRangeSelection(firstText, 0, firstText, 5);
    fireEvent(editor.ownerDocument, new Event("selectionchange"));
    const beforeHtml = documentView.innerHTML;
    const beforeText = documentView.textContent;

    const beforeInput = fireBeforeInput(editor, {
      inputType: "insertLink",
      data: "https://example.com",
    });

    expect(beforeInput.defaultPrevented).toBe(true);
    expect(documentView.innerHTML).toBe(beforeHtml);
    expect(documentView.textContent).toBe(beforeText);
    expect(
      Array.from(editor.querySelectorAll("a")).some((element) =>
        element.textContent?.includes("Plain"),
      ),
    ).toBe(false);

    const linkShortcut = dispatchKeyboard(editor, "keydown", {
      key: "k",
      metaKey: true,
    });

    expect(linkShortcut.defaultPrevented).toBe(true);
    expect(documentView.innerHTML).toBe(beforeHtml);
  });

  it("pastes structured clipboard data through the transfer reader", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "plain ");
    clipboard.setData(
      EDITABLE_CLIPBOARD_MIME,
      JSON.stringify({
        schema: "editable-clipboard@1",
        plainText: "structured ",
      }),
    );

    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.textContent).toContain("structured Plain");
    expect(editor.textContent).not.toContain("plain Plain");
  });

  it("pastes at the observed collapsed native caret", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    setDOMSelection(firstText, 5);
    fireEvent(editor.ownerDocument, new Event("selectionchange"));

    expect(document.getSelection()?.focusNode).toBe(firstText);
    expect(document.getSelection()?.focusOffset).toBe(5);
    expect(
      readContentEditableSelection(editor, initialNoteDocument)?.focus,
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 5,
    });

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "x");
    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.textContent).toContain("Plainx bold");
    expect(editor.textContent).not.toContain("xPlain");
  });

  it("pastes over a visible model range when the native DOM caret is collapsed", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "ArrowRight", shiftKey: true });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-anchor-offset"),
    ).toBe("0");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-focus-offset"),
    ).toBe("1");
    expect(document.getSelection()?.isCollapsed).toBe(true);

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "x");
    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.textContent).toContain("xlain bold");
    expect(editor.textContent).not.toContain("Pxlain bold");
  });

  it("drops transfer text through the command layer", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const dataTransfer = createClipboardData();
    dataTransfer.setData("text/plain", "dropped ");

    fireEvent.drop(editor, { dataTransfer });

    expect(editor.textContent).toContain("dropped Plain");
  });

  it("drops markdown transfer text through the rich command path", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const dataTransfer = createClipboardData();
    dataTransfer.setData("text/markdown", "@[Ada](mention:user-ada)");

    fireEvent.drop(editor, { dataTransfer });

    await waitFor(() =>
      expect(editor.querySelectorAll(".mention-chip")).toHaveLength(2),
    );
    expect(
      editor.querySelector(".mention-chip")?.getAttribute("data-mention-id"),
    ).toBe("user-ada");
  });

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

  it("keeps read-only editing cursor-only across keyboard, DOM, paste, and cut input", async () => {
    render(<BlockEditor readOnly />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    const typing = dispatchKeyboard(editor, "keydown", { key: "x" });
    expect(typing.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    const beforeInput = fireBeforeInput(editor, {
      inputType: "insertText",
      data: "x",
    });
    expect(beforeInput.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    firstText.textContent = "xPlain ";
    setDOMSelection(firstText, 1);
    fireEvent.input(editor);

    expect(editor.textContent).not.toContain("xPlain");
    expect(editor.textContent).toContain("Plain bold");

    const clipboard = createClipboardData();
    clipboard.setData("text/plain", "pasted ");
    fireEvent.paste(editor, { clipboardData: clipboard });

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    const restoredFirstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(restoredFirstText instanceof Text)) {
      throw new Error("Fixture failed to render restored first text.");
    }

    setDOMRangeSelection(restoredFirstText, 0, restoredFirstText, 5);
    const cutClipboard = createClipboardData();
    fireEvent.cut(editor, { clipboardData: cutClipboard });

    expect(cutClipboard.getData("text/plain")).toBe("Plain");
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    fireEvent.keyDown(editor, { key: "ArrowRight" });
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("5");
  });

  it("ignores dropped transfer text in read-only mode", async () => {
    render(<BlockEditor readOnly />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const dataTransfer = createClipboardData();
    dataTransfer.setData("text/plain", "dropped ");
    dataTransfer.setData("text/markdown", "@[Ada](mention:user-ada)");

    fireEvent.drop(editor, { dataTransfer });

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.querySelectorAll(".mention-chip")).toHaveLength(1);
  });

  it("keeps read-only history shortcuts non-mutating", async () => {
    const { rerender } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "x" });
    await waitFor(() => expect(editor.textContent).toContain("xPlain"));

    rerender(<BlockEditor readOnly />);

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const keydownUndo = dispatchKeyboard(editor, "keydown", {
      key: "z",
      metaKey: true,
    });
    const keydownRedo = dispatchKeyboard(editor, "keydown", {
      key: "y",
      metaKey: true,
    });
    const beforeInputUndo = fireBeforeInput(editor, {
      inputType: "historyUndo",
    });
    const beforeInputRedo = fireBeforeInput(editor, {
      inputType: "historyRedo",
    });

    expect(keydownUndo.defaultPrevented).toBe(true);
    expect(keydownRedo.defaultPrevented).toBe(true);
    expect(beforeInputUndo.defaultPrevented).toBe(true);
    expect(beforeInputRedo.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.textContent).toContain("xPlain");
  });

  it("resets read-only composition input without mutating the document", async () => {
    render(<BlockEditor readOnly />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const beforeText = editor.querySelector(".document-view")?.textContent;
    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "ㅎPlain ";
    setDOMSelection(firstText, 1);
    fireEvent.compositionStart(editor);

    expect(editor.getAttribute("data-ime-composing")).toBe(null);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    const restoredFirstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(restoredFirstText instanceof Text)) {
      throw new Error("Fixture failed to restore first text.");
    }

    const composing = fireBeforeInput(editor, {
      inputType: "insertCompositionText",
      data: "한",
      isComposing: true,
    });

    expect(composing.defaultPrevented).toBe(true);
    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );

    restoredFirstText.textContent = "한Plain ";
    setDOMSelection(restoredFirstText, 1);
    fireEvent.compositionEnd(editor);

    expect(editor.querySelector(".document-view")?.textContent).toBe(
      beforeText,
    );
    expect(editor.textContent).toContain("Plain bold");
    expect(editor.textContent).not.toContain("한Plain");
  });

  it("deletes cross-block ranges before starting native composition", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    const afterFigureText = editor.querySelector(
      '[data-path="/root/children/2/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text) || !(afterFigureText instanceof Text)) {
      throw new Error("Fixture failed to render cross-block text.");
    }

    setDOMRangeSelection(firstText, 5, afterFigureText, 5);
    fireEvent(document, new Event("selectionchange"));

    fireEvent.compositionStart(editor);

    await waitFor(() => {
      expect(
        editor
          .querySelector(".document-view")
          ?.getAttribute("data-selection-path"),
      ).toBe("/root/children/0/children/0/text");
      expect(
        editor
          .querySelector(".document-view")
          ?.getAttribute("data-selection-offset"),
      ).toBe("5");
    });
    expect(editor.getAttribute("data-ime-composing")).toBe("true");
    expect(editor.querySelector(".figure-block")).toBeNull();
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-selected-pointers"),
    ).toBe("");
  });

  it("recovers active native edits immediately when switching to read-only", async () => {
    const { rerender } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "xPlain ";
    setDOMSelection(firstText, 1);
    fireEvent.input(editor);

    expect(editor.textContent).toContain("xPlain");

    rerender(<BlockEditor readOnly />);

    expect(editor.textContent).not.toContain("xPlain");
    expect(editor.textContent).toContain("Plain bold");
  });

  it("preserves a selected native range when switching to read-only", async () => {
    const { rerender } = render(<BlockEditor />);
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

    rerender(<BlockEditor readOnly />);

    const clipboard = createClipboardData();
    fireEvent.copy(editor, { clipboardData: clipboard });

    expect(clipboard.getData("text/plain")).toBe("Plain");
  });

  it("keeps read-only title and toolbar commands non-mutating", () => {
    const { rerender } = render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));

    const textAfterEditableInsert =
      editor.querySelector(".document-view")?.textContent;
    const figuresAfterEditableInsert = screen.getAllByRole("img", {
      name: "Figure",
    }).length;

    rerender(<BlockEditor readOnly />);

    const title = screen.getByRole("textbox", {
      name: "Title",
    }) as HTMLInputElement;
    const readOnlyEditor = screen.getByRole("textbox", {
      name: "Document body",
    });

    expect(title.readOnly).toBe(true);
    expect(readOnlyEditor.getAttribute("aria-readonly")).toBe("true");

    fireEvent.change(title, { target: { value: "Changed title" } });
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert figure" }));

    expect(title.value).toBe(initialNoteDocument.title);
    expect(readOnlyEditor.querySelector(".document-view")?.textContent).toBe(
      textAfterEditableInsert,
    );
    expect(screen.getAllByRole("img", { name: "Figure" })).toHaveLength(
      figuresAfterEditableInsert,
    );
  });

  it("stores editable title changes in document history", () => {
    render(<BlockEditor />);
    const title = screen.getByRole("textbox", {
      name: "Title",
    }) as HTMLInputElement;

    expect(title.value).toBe(initialNoteDocument.title);

    fireEvent.change(title, { target: { value: "Edited title" } });

    expect(title.value).toBe("Edited title");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    expect(title.value).toBe(initialNoteDocument.title);

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));

    expect(title.value).toBe("Edited title");
  });

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

  it("moves the rendered cursor to the previous paragraph when Backspace removes an empty paragraph", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "abc" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });

    expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(4);
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/1/children/0/text");
    await waitFor(() =>
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-path"),
      ).toBe("/root/children/1/children/0/text"),
    );

    fireBeforeInput(editor, { inputType: "deleteContentBackward" });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("3");
    await waitFor(() => {
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-path"),
      ).toBe("/root/children/0/children/0/text");
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-offset"),
      ).toBe("3");
    });
    expect(document.getSelection()?.focusNode).toBe(
      editor.querySelector('[data-path="/root/children/0/children/0/text"]')
        ?.firstChild,
    );
    expect(document.getSelection()?.focusOffset).toBe(3);
  });

  it("does not draw a stale custom cursor while IME composition owns the native caret", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "abc" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });
    fireBeforeInput(editor, { inputType: "insertParagraph" });

    await waitFor(() =>
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-path"),
      ).toBe("/root/children/1/children/0/text"),
    );

    fireEvent.compositionStart(editor);

    expect(editor.getAttribute("data-ime-composing")).toBe("true");
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    const previousText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(previousText instanceof Text)) {
      throw new Error("Fixture failed to render previous text.");
    }

    previousText.textContent = "abcㅎ";
    setDOMSelection(previousText, 4);
    fireBeforeInput(editor, {
      inputType: "insertCompositionText",
      data: "ㅎ",
      isComposing: true,
    });
    fireEvent.input(editor);

    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    await act(async () => {
      fireEvent.compositionEnd(editor);
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(editor.textContent).toContain("abcㅎ");
    await waitFor(() => {
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-path"),
      ).toBe("/root/children/0/children/0/text");
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-offset"),
      ).toBe("4");
    });
  });

  it("commits IME text with active marks through the marked text path", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.keyDown(editor, { key: "b", metaKey: true });

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    fireEvent.compositionStart(editor);
    const composing = fireBeforeInput(editor, {
      inputType: "insertCompositionText",
      data: "한",
      isComposing: true,
    });
    expect(composing.defaultPrevented).toBe(false);

    firstText.textContent = "한Plain ";
    setDOMSelection(firstText, 1);
    fireEvent.input(editor);

    await act(async () => {
      fireEvent.compositionEnd(editor);
      fireBeforeInput(editor, { inputType: "insertText", data: "한" });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(editor.textContent).toContain("한Plain");
    await waitFor(() =>
      expect(
        Array.from(editor.querySelectorAll("strong")).some((element) =>
          element.textContent?.includes("한"),
        ),
      ).toBe(true),
    );
  });

  it("ends composition UI state before toolbar commands", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireEvent.compositionStart(editor);

    expect(editor.getAttribute("data-ime-composing")).toBe("true");
    expect(document.body.querySelector('[data-overlay="caret"]')).toBe(null);

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));

    expect(editor.getAttribute("data-ime-composing")).toBe(null);
    expect(editor.textContent).toContain("@Ada");
    expect(document.body.querySelector('[data-overlay="caret"]')).not.toBe(
      null,
    );
  });

  it("applies toolbar commands on top of flushed native text edits", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    firstText.textContent = "Plainx ";
    setDOMSelection(firstText, 6);
    fireEvent.input(editor);

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));

    expect(editor.textContent).toContain("Plainx@Ada");
    expect(editor.textContent).not.toContain("Plain@Ada");
  });

  it("applies toolbar insertion after appended native text edits", async () => {
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
    setDOMSelection(firstText, 8);
    fireEvent.input(editor);

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));

    expect(editor.textContent).toContain("Plain xy@Ada");
    expect(editor.textContent).not.toContain("Plain @Ada");
    expect(editor.textContent).not.toContain("Plain@Ada");
  });

  it("defers native contenteditable text sync until editing is released", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xPlain ";
    setDOMSelection(textNode, 1);

    fireEvent.input(editor);

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
      document.body
        .querySelector('[data-overlay="caret"]')
        ?.getAttribute("data-path"),
    ).toBe("/root/children/0/children/0/text");
    expect(
      document.body
        .querySelector('[data-overlay="caret"]')
        ?.getAttribute("data-offset"),
    ).toBe("1");

    fireEvent.blur(editor);

    expect(editor.textContent).toContain("xPlain");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("1");
  });

  it("records blur-flushed native text edits as one undo unit", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xyPlain ";
    setDOMSelection(textNode, 2);
    fireEvent.input(editor);
    fireEvent.blur(editor);

    expect(editor.textContent).toContain("xyPlain");

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(editor.textContent).not.toContain("xyPlain");
      expect(editor.textContent).toContain("Plain");
    });

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));

    await waitFor(() => {
      expect(editor.textContent).toContain("xyPlain");
    });
  });

  it("keeps separate blur-flushed native text edit sessions as separate undo units", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    const firstTextNode = () => {
      const textRun = editor.querySelector(".text-run");
      const textNode = textRun?.firstChild;
      if (textRun === null || textNode === undefined || textNode === null) {
        throw new Error("Fixture failed to render.");
      }

      return textNode;
    };

    const first = firstTextNode();
    first.textContent = "xPlain ";
    setDOMSelection(first, 1);
    fireEvent.input(editor);
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
    });

    fireEvent.focus(editor);
    const second = firstTextNode();
    second.textContent = "xyPlain ";
    setDOMSelection(second, 2);
    fireEvent.input(editor);
    fireEvent.blur(editor);

    await waitFor(() => {
      expect(editor.textContent).toContain("xyPlain");
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
      expect(editor.textContent).not.toContain("xyPlain");
    });

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));

    await waitFor(() => {
      expect(editor.textContent).toContain("Plain");
      expect(editor.textContent).not.toContain("xPlain");
    });
  });

  it("runs headless beforeinput at the flushed native caret", () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xPlain ";
    setDOMSelection(textNode, 1);
    fireEvent.input(editor);

    const event = fireBeforeInput(editor, { inputType: "insertParagraph" });

    expect(event.defaultPrevented).toBe(true);
    const paragraphs = Array.from(editor.querySelectorAll(".paragraph-block"));
    expect(paragraphs[0]?.textContent).toBe("x");
    expect(paragraphs[1]?.textContent).toContain("Plain bold");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-path"),
    ).toBe("/root/children/1/children/0/text");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("0");
  });

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

  it("flushes active native text edits before keyboard undo and redo", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xyPlain ";
    setDOMSelection(textNode, 2);
    fireEvent.input(editor);

    expect(editor.textContent).toContain("xyPlain");

    fireEvent.keyDown(editor, { key: "z", metaKey: true });

    await waitFor(() => {
      expect(editor.textContent).not.toContain("xyPlain");
      expect(editor.textContent).toContain("Plain");
      expect(
        document.body
          .querySelector('[data-overlay="caret"]')
          ?.getAttribute("data-offset"),
      ).toBe("0");
    });

    fireEvent.keyDown(editor, { key: "z", metaKey: true, shiftKey: true });

    await waitFor(() => {
      expect(editor.textContent).toContain("xyPlain");
    });
  });

  it("flushes active native text edits before beforeinput history undo and redo", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });
    const textRun = editor.querySelector(".text-run");
    const textNode = textRun?.firstChild;
    if (textRun === null || textNode === undefined || textNode === null) {
      throw new Error("Fixture failed to render.");
    }

    textNode.textContent = "xPlain ";
    setDOMSelection(textNode, 1);
    fireEvent.input(editor);

    const undo = fireBeforeInput(editor, { inputType: "historyUndo" });

    expect(undo.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(editor.textContent).not.toContain("xPlain");
      expect(editor.textContent).toContain("Plain");
    });

    const redo = fireBeforeInput(editor, { inputType: "historyRedo" });

    expect(redo.defaultPrevented).toBe(true);
    await waitFor(() => {
      expect(editor.textContent).toContain("xPlain");
    });
  });

  it("restores the native caret after history undo from an observed range", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "x" });
    expect(editor.textContent).toContain("xPlain");

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    )?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Fixture failed to render first text.");
    }

    setDOMRangeSelection(firstText, 0, firstText, 1);
    fireEvent(editor.ownerDocument, new Event("selectionchange"));

    const undo = fireBeforeInput(editor, { inputType: "historyUndo" });

    expect(undo.defaultPrevented).toBe(true);
    await waitFor(() => expect(editor.textContent).not.toContain("xPlain"));
    expect(document.getSelection()?.isCollapsed).toBe(true);
    expect(document.getSelection()?.focusNode).toBe(firstText);
    expect(document.getSelection()?.focusOffset).toBe(0);
    expect(document.body.querySelector('[data-overlay="caret"]')).not.toBe(
      null,
    );
  });

  it("ignores history shortcuts while composition is active", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await waitFor(() => expect(document.activeElement).toBe(editor));

    fireBeforeInput(editor, { inputType: "insertText", data: "x" });
    expect(editor.textContent).toContain("xPlain");

    fireEvent.compositionStart(editor);

    const keydown = dispatchKeyboard(editor, "keydown", {
      key: "z",
      metaKey: true,
    });
    expect(keydown.defaultPrevented).toBe(true);
    expect(editor.textContent).toContain("xPlain");

    const beforeInput = fireBeforeInput(editor, { inputType: "historyUndo" });
    expect(beforeInput.defaultPrevented).toBe(true);
    expect(editor.textContent).toContain("xPlain");
  });

  it("commits mention and figure insertion from toolbar controls", () => {
    render(<BlockEditor />);

    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert figure" }));

    expect(
      screen.getByRole("textbox", { name: "Document body" }).textContent,
    ).toContain("@Ada");
    const figures = screen.getAllByRole("img", { name: "Figure" });
    expect(figures).toHaveLength(2);
    expect(figures.map((figure) => figure.getAttribute("src"))).toEqual([
      "/sample-figure.svg",
      "/sample-figure.svg",
    ]);
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

function setDOMSelection(node: ChildNode, offset: number) {
  setDOMRangeSelection(node, offset, node, offset);
}

function setDOMRangeSelection(
  anchorNode: ChildNode,
  anchorOffset: number,
  focusNode: ChildNode,
  focusOffset: number,
) {
  const range = document.createRange();
  const selection = document.getSelection();
  if (selection === null) {
    throw new Error("Selection is unavailable.");
  }

  range.setStart(anchorNode, anchorOffset);
  range.setEnd(focusNode, focusOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

function hasHiddenSelectionClass(root: Element) {
  const hiddenSelectionSelector =
    ".ProseMirror-hideselection, .editable-hideselection, .editable-hidden-selection";
  return (
    root.matches(hiddenSelectionSelector) ||
    root.querySelector(hiddenSelectionSelector) !== null
  );
}

function createClipboardData(): DataTransfer {
  const data = new Map<string, string>();

  return {
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
    clearData: (type?: string) => {
      if (type === undefined) {
        data.clear();
      } else {
        data.delete(type);
      }
    },
  } as DataTransfer;
}

function dispatchKeyboard(
  element: Element,
  type: "keydown" | "keyup",
  init: KeyboardEventInit,
) {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  act(() => {
    element.dispatchEvent(event);
  });

  return event;
}

function dispatchPointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: MouseEventInit & {
    pointerId: number;
    pointerType: string;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperties(event, {
    isPrimary: { configurable: true, value: true },
    pointerId: { configurable: true, value: init.pointerId },
    pointerType: { configurable: true, value: init.pointerType },
  });

  act(() => {
    element.dispatchEvent(event);
  });

  return event;
}

function installEditorGeometry() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (!(this instanceof HTMLElement)) {
      return original.call(this);
    }

    const path = this.getAttribute("data-path");
    if (path === "/root/children/0") {
      return rect(0, 0, 800, 24);
    }
    if (path === "/root/children/1") {
      return rect(0, 32, 180, 80);
    }
    if (path !== null) {
      return rect(0, 0, 120, 24);
    }

    return original.call(this);
  };

  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON() {
      return { x, y, width, height };
    },
  } as DOMRect;
}

function fireBeforeInput(
  element: Element,
  init: {
    inputType: string;
    data?: string | null;
    dataTransfer?: DataTransfer;
    isComposing?: boolean;
  },
) {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: init.data ?? null,
    inputType: init.inputType,
    isComposing: init.isComposing === true,
  });
  if (init.dataTransfer !== undefined) {
    Object.defineProperty(event, "dataTransfer", {
      configurable: true,
      value: init.dataTransfer,
    });
  }

  act(() => {
    element.dispatchEvent(event);
  });

  return event;
}
