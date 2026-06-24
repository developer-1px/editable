// @vitest-environment jsdom

import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockEditor } from "./BlockEditor";
import { installBlockEditorTestCleanup } from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor lifecycle and owner document wiring", () => {
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
});
