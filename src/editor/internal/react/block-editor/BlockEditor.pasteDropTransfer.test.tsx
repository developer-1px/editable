// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EDITABLE_CLIPBOARD_MIME } from "../../model/clipboard";
import { initialNoteDocument } from "../../model/initialNoteDocument";
import { readContentEditableSelection } from "../../view/contentEditableViewEngine";
import { BlockEditor } from "./BlockEditor";
import {
  createClipboardData,
  fireBeforeInput,
  installBlockEditorTestCleanup,
  setDOMSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor paste and drop transfer bridge", () => {
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
});
