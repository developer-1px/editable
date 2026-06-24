// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { koreanHangulActiveMarkTrace } from "../../fixtures/ime/koreanHangulActiveMarkTrace";
import {
  koreanHangulAdjacentStaleFinishTrace,
  koreanHangulAdjacentStaleStartTrace,
} from "../../fixtures/ime/koreanHangulAdjacentStaleTrace";
import { koreanHangulBasicTrace } from "../../fixtures/ime/koreanHangulBasicTrace";
import { koreanHangulCompositionBlurTrace } from "../../fixtures/ime/koreanHangulCompositionBlurTrace";
import { koreanHangulCompositionHistoryTrace } from "../../fixtures/ime/koreanHangulCompositionHistoryTrace";
import { koreanHangulEnterConfirmTrace } from "../../fixtures/ime/koreanHangulEnterConfirmTrace";
import {
  findReplayedEvent,
  replayEditorTrace,
} from "../../testing/editorTraceReplay";
import { assertPreventedEditingEventsCovered } from "../../testing/preventedEventAudit";
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
    expect(() => assertPreventedEditingEventsCovered(events)).not.toThrow();
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

  it("does not flush a stale composition end after the next Hangul composition starts", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await replayEditorTrace(editor, koreanHangulAdjacentStaleStartTrace);

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).not.toBe("7");

    await replayEditorTrace(editor, koreanHangulAdjacentStaleFinishTrace);

    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    );
    expect(firstText?.textContent).toBe("Plain안녕 ");
    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).toBe("7");
  });

  it("commits IME text with active marks through the marked text path", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await replayEditorTrace(editor, koreanHangulActiveMarkTrace);

    expect(
      Array.from(editor.querySelectorAll("strong")).some(
        (element) => element.textContent === "안",
      ),
    ).toBe(true);
  });

  it("keeps history undo explicit no-op while composition is active", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    const events = await replayEditorTrace(
      editor,
      koreanHangulCompositionHistoryTrace,
    );
    const historyUndo = findReplayedEvent(events, "beforeinput", "historyUndo");

    expect(historyUndo?.defaultPrevented).toBe(true);
    expect(() =>
      assertPreventedEditingEventsCovered(events, {
        explicitNoOps: [{ type: "beforeinput", inputType: "historyUndo" }],
      }),
    ).not.toThrow();
    expect(editor.textContent).toContain("Plain");
  });

  it("flushes active composition text on blur", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await replayEditorTrace(editor, koreanHangulCompositionBlurTrace);

    expect(
      editor.querySelector('[data-path="/root/children/0/children/0/text"]')
        ?.textContent,
    ).toBe("Plain안 ");
  });

  it("reports the event index and field when a trace expectation fails", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await expect(
      replayEditorTrace(editor, {
        contractIds: ["SEL-02"],
        name: "bad-expectation",
        schema: "editable-trace-replay@1",
        steps: [
          {
            kind: "event",
            event: { type: "keydown", key: "F1" },
            expect: {
              after: {
                selectionOffset: "999",
              },
            },
          },
        ],
      }),
    ).rejects.toThrow(
      /bad-expectation \[SEL-02\] at #0 keydown F1 after\.selectionOffset/,
    );
  });

  it("commits IME text and splits the paragraph when Enter confirms composition", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    const events = await replayEditorTrace(
      editor,
      koreanHangulEnterConfirmTrace,
    );
    const finalCommit = findReplayedEvent(events, "beforeinput", "insertText");
    const enter = findReplayedEvent(events, "keydown");
    const firstParagraph = editor.querySelector(".paragraph-block");
    const firstText = editor.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    );

    expect(finalCommit?.defaultPrevented).toBe(true);
    expect(enter?.defaultPrevented).toBe(true);
    expect(() =>
      assertPreventedEditingEventsCovered(events, {
        deferredCommands: [{ type: "keydown", key: "Enter", altKey: false }],
      }),
    ).not.toThrow();
    expect(firstText?.textContent).toBe("Plai안");
    expect(firstParagraph?.textContent).toBe("Plai안");
    expect(editor.querySelectorAll(".paragraph-block")).toHaveLength(3);
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
