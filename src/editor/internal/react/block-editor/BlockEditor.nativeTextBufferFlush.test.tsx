// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  fireBeforeInput,
  installBlockEditorTestCleanup,
  setDOMSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor native text buffer flush", () => {
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
});
