// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { koreanHangulBasicTrace } from "../fixtures/ime/koreanHangulBasicTrace";
import { koreanHangulEnterConfirmTrace } from "../fixtures/ime/koreanHangulEnterConfirmTrace";
import {
  findReplayedEvent,
  replayEditorTrace,
} from "../testing/editorTraceReplay";
import { BlockEditor } from "./BlockEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockEditor IME trace replay", () => {
  it("replays Korean composition without committing the starter key twice", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    const events = await replayEditorTrace(editor, koreanHangulBasicTrace);
    const finalCommit = findReplayedEvent(events, "beforeinput", "insertText");
    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    );

    expect(finalCommit?.defaultPrevented).toBe(true);
    expect(firstText?.textContent).toBe("Plai안n ");
    expect(firstText?.textContent).not.toContain("ㅇ");
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

  it("does not treat IME confirmation Enter as a paragraph split", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    const events = await replayEditorTrace(
      editor,
      koreanHangulEnterConfirmTrace,
    );
    const finalCommit = findReplayedEvent(events, "beforeinput", "insertText");
    const firstParagraph = editor.querySelector(".paragraph-block");
    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    );

    expect(finalCommit?.defaultPrevented).toBe(true);
    expect(firstText?.textContent).toBe("Plai안n ");
    expect(firstParagraph?.textContent).toContain("Plai안n bold");
    expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(2);
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
});
