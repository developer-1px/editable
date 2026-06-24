// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { serializeInputEvent } from "./debugInteractionEvents";
import {
  formatTimeline,
  summarizeTimelineEntry,
} from "./debugInteractionTimeline";

describe("debug interaction timelines", () => {
  it("keeps newline clipboard text escaped in formatted timelines", () => {
    expect(
      formatTimeline([
        {
          kind: "input",
          sequence: 0,
          elapsedMs: 0,
          event: {
            type: "paste",
            key: undefined,
            code: undefined,
            keyCode: undefined,
            inputType: undefined,
            data: undefined,
            isComposing: undefined,
            clipboardText: "A\nB",
            clipboardTypes: ["text/plain"],
            pointerType: undefined,
            button: undefined,
            client: undefined,
            modifiers: [],
            target: { nodeName: "DIV", tagName: "DIV" },
            defaultPrevented: false,
          },
        },
      ]),
    ).toEqual(['  #0 +0ms input: paste "A\\nB" types=text/plain target=DIV']);
  });

  it("keeps clipboard MIME types when clipboard text is unavailable", () => {
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      configurable: true,
      value: {
        getData: () => "",
        types: ["text/html", "text/uri-list"],
      },
    });

    const serialized = serializeInputEvent(paste);
    const entry = {
      kind: "input",
      sequence: 0,
      at: "2026-06-21T00:00:00.000Z",
      elapsedMs: 0,
      event: serialized,
    } as const;
    const timelineEntry = summarizeTimelineEntry(entry);

    expect(serialized.clipboardText).toBeUndefined();
    expect(serialized.clipboardTypes).toEqual(["text/html", "text/uri-list"]);
    expect(formatTimeline([timelineEntry])).toContain(
      "  #0 +0ms input: paste types=text/html,text/uri-list target=unknown",
    );
    expect(timelineEntry.kind).toBe("input");
    if (timelineEntry.kind !== "input") {
      throw new Error("expected input timeline entry");
    }
    expect(timelineEntry.event.clipboardTypes).toEqual([
      "text/html",
      "text/uri-list",
    ]);
  });

  it("keeps IME diagnostic fields in serialized events and timelines", () => {
    const keydown = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    Object.defineProperty(keydown, "keyCode", {
      configurable: true,
      value: 229,
    });
    Object.defineProperty(keydown, "isComposing", {
      configurable: true,
      value: false,
    });
    const compositionEnd = new Event("compositionend", {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(compositionEnd, "data", {
      configurable: true,
      value: "안",
    });
    const beforeInput = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: false,
      data: "안",
      inputType: "insertCompositionText",
      isComposing: true,
    });

    const keydownEvent = serializeInputEvent(keydown);
    const compositionEndEvent = serializeInputEvent(compositionEnd);
    const beforeInputEvent = serializeInputEvent(beforeInput);

    expect(keydownEvent).toMatchObject({
      isComposing: false,
      key: "Enter",
      keyCode: 229,
    });
    expect(compositionEndEvent).toMatchObject({
      data: "안",
      type: "compositionend",
    });
    expect(beforeInputEvent).toMatchObject({
      data: "안",
      inputType: "insertCompositionText",
      isComposing: true,
    });
    expect(
      formatTimeline([
        summarizeTimelineEntry({
          kind: "input",
          sequence: 0,
          at: "2026-06-22T00:00:00.000Z",
          elapsedMs: 0,
          event: keydownEvent,
        }),
        summarizeTimelineEntry({
          kind: "input",
          sequence: 1,
          at: "2026-06-22T00:00:00.001Z",
          elapsedMs: 1,
          event: compositionEndEvent,
        }),
        summarizeTimelineEntry({
          kind: "input",
          sequence: 2,
          at: "2026-06-22T00:00:00.002Z",
          elapsedMs: 2,
          event: beforeInputEvent,
        }),
      ]),
    ).toEqual([
      "  #0 +0ms input: keydown Enter keyCode=229 target=unknown",
      '  #1 +1ms input: compositionend data="안" target=unknown',
      '  #2 +2ms input: beforeinput insertCompositionText data="안" composing target=unknown',
    ]);
  });
});
