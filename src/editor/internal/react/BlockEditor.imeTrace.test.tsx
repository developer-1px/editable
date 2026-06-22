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

  it("does not flush a stale composition end after the next Hangul composition starts", async () => {
    render(<BlockEditor />);
    const editor = screen.getByRole("textbox", { name: "Document body" });

    await replayEditorTrace(editor, {
      name: "korean-hangul-adjacent-composition",
      schema: "editable-trace-replay@1",
      steps: [
        {
          kind: "selection",
          path: "/root/children/0/children/0/text",
          offset: 5,
        },
        { kind: "event", event: { type: "keydown", key: "ㅇ" } },
        { kind: "event", event: { type: "compositionstart" } },
        { kind: "event", event: { type: "compositionupdate", data: "ㅇ" } },
        {
          kind: "event",
          event: {
            type: "beforeinput",
            inputType: "insertCompositionText",
            data: "ㅇ",
            isComposing: true,
          },
        },
        {
          kind: "text",
          path: "/root/children/0/children/0/text",
          text: "Plainㅇ ",
          offset: 5,
        },
        {
          kind: "event",
          event: {
            type: "input",
            inputType: "insertCompositionText",
            data: "ㅇ",
            isComposing: true,
          },
        },
        { kind: "event", event: { type: "compositionupdate", data: "아" } },
        {
          kind: "event",
          event: {
            type: "beforeinput",
            inputType: "insertCompositionText",
            data: "아",
            isComposing: true,
          },
        },
        {
          kind: "text",
          path: "/root/children/0/children/0/text",
          text: "Plain아 ",
          offset: 5,
        },
        {
          kind: "event",
          event: {
            type: "input",
            inputType: "insertCompositionText",
            data: "아",
            isComposing: true,
          },
        },
        { kind: "event", event: { type: "compositionupdate", data: "안" } },
        {
          kind: "event",
          event: {
            type: "beforeinput",
            inputType: "insertCompositionText",
            data: "안",
            isComposing: true,
          },
        },
        {
          kind: "text",
          path: "/root/children/0/children/0/text",
          text: "Plain안 ",
          offset: 6,
        },
        {
          kind: "event",
          event: {
            type: "input",
            inputType: "insertCompositionText",
            data: "안",
            isComposing: true,
          },
        },
        { kind: "event", event: { type: "compositionend", data: "안" } },
        { kind: "event", event: { type: "compositionstart" } },
        { kind: "event", event: { type: "compositionupdate", data: "ㄴ" } },
        {
          kind: "event",
          event: {
            type: "beforeinput",
            inputType: "insertCompositionText",
            data: "ㄴ",
            isComposing: true,
          },
        },
        {
          kind: "text",
          path: "/root/children/0/children/0/text",
          text: "Plain안ㄴ ",
          offset: 7,
        },
        {
          kind: "event",
          event: {
            type: "input",
            inputType: "insertCompositionText",
            data: "ㄴ",
            isComposing: true,
          },
        },
        { kind: "timers" },
      ],
    });

    expect(
      editor
        .querySelector(".document-view")
        ?.getAttribute("data-selection-offset"),
    ).not.toBe("7");

    await replayEditorTrace(editor, {
      name: "korean-hangul-adjacent-composition-finish",
      schema: "editable-trace-replay@1",
      steps: [
        { kind: "event", event: { type: "compositionupdate", data: "녀" } },
        {
          kind: "event",
          event: {
            type: "beforeinput",
            inputType: "insertCompositionText",
            data: "녀",
            isComposing: true,
          },
        },
        {
          kind: "text",
          path: "/root/children/0/children/0/text",
          text: "Plain안녀 ",
          offset: 7,
        },
        {
          kind: "event",
          event: {
            type: "input",
            inputType: "insertCompositionText",
            data: "녀",
            isComposing: true,
          },
        },
        { kind: "event", event: { type: "compositionupdate", data: "녕" } },
        {
          kind: "event",
          event: {
            type: "beforeinput",
            inputType: "insertCompositionText",
            data: "녕",
            isComposing: true,
          },
        },
        {
          kind: "text",
          path: "/root/children/0/children/0/text",
          text: "Plain안녕 ",
          offset: 7,
        },
        {
          kind: "event",
          event: {
            type: "input",
            inputType: "insertCompositionText",
            data: "녕",
            isComposing: true,
          },
        },
        { kind: "event", event: { type: "compositionend", data: "녕" } },
        { kind: "timers" },
      ],
    });

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
