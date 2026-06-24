// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BlockEditor } from "./BlockEditor";
import {
  installBlockEditorTestCleanup,
  setDOMSelection,
} from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor native text buffer toolbar flush", () => {
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
});
