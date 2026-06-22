// @vitest-environment jsdom

import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorToolbar } from "./EditorToolbar";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderToolbar() {
  const callbacks = {
    onInsertFigure: vi.fn(),
    onInsertMention: vi.fn(),
    onRedo: vi.fn(),
    onUndo: vi.fn(),
  };

  render(<EditorToolbar {...callbacks} />);

  return callbacks;
}

describe("EditorToolbar", () => {
  it("renders the fixed accessible toolbar command set", () => {
    renderToolbar();

    const toolbar = screen.getByRole("toolbar", { name: "Editor tools" });
    const buttons = within(toolbar).getAllByRole("button");

    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Undo",
      "Redo",
      "Insert mention",
      "Insert figure",
    ]);
    expect(
      buttons.every((button) =>
        Array.from(button.querySelectorAll("svg")).every(
          (icon) => icon.getAttribute("aria-hidden") === "true",
        ),
      ),
    ).toBe(true);
  });

  it("dispatches toolbar callbacks without stealing focus on mouse down", () => {
    const callbacks = renderToolbar();
    const undo = screen.getByRole("button", { name: "Undo" });

    const mouseDown = createEvent.mouseDown(undo);
    fireEvent(undo, mouseDown);

    expect(mouseDown.defaultPrevented).toBe(true);

    fireEvent.click(undo);
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert mention" }));
    fireEvent.click(screen.getByRole("button", { name: "Insert figure" }));

    expect(callbacks.onUndo).toHaveBeenCalledTimes(1);
    expect(callbacks.onRedo).toHaveBeenCalledTimes(1);
    expect(callbacks.onInsertMention).toHaveBeenCalledTimes(1);
    expect(callbacks.onInsertFigure).toHaveBeenCalledTimes(1);
  });
});
