// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { initialNoteDocument } from "../../model/initialNoteDocument";
import { BlockEditor } from "./BlockEditor";
import { installBlockEditorTestCleanup } from "./blockEditorTestUtils";

installBlockEditorTestCleanup();

describe("BlockEditor title and toolbar history", () => {
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
});
