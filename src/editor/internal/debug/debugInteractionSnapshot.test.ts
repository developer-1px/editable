// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../model/cursorCommands";
import { createNoteDocument } from "../model/noteDocument";
import { selectionForRender } from "../model/richSelection";
import { serializeInputEvent } from "./debugInteractionEvents";
import { buildReport, formatDebugReport } from "./debugInteractionReport";
import { readSnapshot } from "./debugInteractionSnapshot";
import {
  formatTimeline,
  summarizeTimelineEntry,
} from "./debugInteractionTimeline";

describe("readSnapshot", () => {
  it("summarizes open selection ranges instead of only the focus point", () => {
    const note = createNoteDocument(
      [
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "A" },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
        {
          id: "figure-1",
          type: "figure",
          src: "/image.png",
        },
      ],
      {
        id: "note-test",
        title: "Debug",
        tags: [],
      },
    );
    const selection = selectionForRender(
      note,
      selectionFromCursorRange(
        note,
        { path: "/root/children/0/children/0/text", offset: 1 },
        { path: "/root/children/1", edge: "after" },
      ),
    );

    const snapshot = readSnapshot({
      note,
      rootElement: null,
      selection,
    });

    expect(snapshot.summary.selection).toBe(
      "/root/children/0/children/0/text@1 -> /root/children/1:after selected=/root/children/0/children/1,/root/children/1",
    );
  });

  it("reports duplicate block ids without rejecting the document", () => {
    const note = createNoteDocument(
      [
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "First" }],
        },
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Second" }],
        },
      ],
      {
        id: "note-test",
        title: "Debug",
        tags: [],
      },
    );

    const snapshot = readSnapshot({
      note,
      rootElement: null,
      selection: undefined,
    });

    expect(snapshot.summary.document.blockIds).toEqual(["block-1", "block-1"]);
    expect(snapshot.summary.document.duplicateBlockIds).toEqual(["block-1"]);
  });

  it("adds minimal viewport and selection rect evidence to raw snapshots", () => {
    const visualViewportDescriptor = Object.getOwnPropertyDescriptor(
      window,
      "visualViewport",
    );
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: {
        height: 480,
        offsetLeft: 0,
        offsetTop: 120,
        scale: 1,
        width: 360,
      },
    });
    const note = createNoteDocument(
      [
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "First" }],
        },
      ],
      {
        id: "note-test",
        title: "Debug",
        tags: [],
      },
    );
    const root = document.createElement("div");
    root.innerHTML =
      '<p data-path="/root/children/0"><span data-path="/root/children/0/children/0/text">First</span></p>';
    const textRun = root.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    );
    if (!(textRun instanceof HTMLElement)) {
      throw new Error("Fixture failed to render text run.");
    }
    Object.defineProperty(textRun, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 620,
        height: 20,
        left: 10,
        right: 90,
        top: 600,
        width: 80,
      }),
    });

    let snapshot: ReturnType<typeof readSnapshot>;
    try {
      snapshot = readSnapshot({
        note,
        rootElement: root,
        selection: selectionForRender(
          note,
          selectionFromCursorPoint({
            path: "/root/children/0/children/0/text",
            offset: 1,
          }),
        ),
      });
    } finally {
      if (visualViewportDescriptor === undefined) {
        Reflect.deleteProperty(window, "visualViewport");
      } else {
        Object.defineProperty(
          window,
          "visualViewport",
          visualViewportDescriptor,
        );
      }
    }

    expect(snapshot.summary.viewport).toMatchObject({
      layout: {
        height: window.innerHeight,
        width: window.innerWidth,
      },
      selectionRect: {
        bottom: 620,
        path: "/root/children/0/children/0/text",
        top: 600,
      },
      visual: {
        height: 480,
        offsetTop: 120,
        width: 360,
      },
    });
  });

  it("raises duplicate block ids as debug report diagnostics", () => {
    const note = createNoteDocument(
      [
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "First" }],
        },
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Second" }],
        },
      ],
      {
        id: "note-test",
        title: "Debug",
        tags: [],
      },
    );
    const snapshot = readSnapshot({
      note,
      rootElement: null,
      selection: undefined,
    });
    const report = buildReport(
      {
        entries: [
          {
            kind: "state",
            reason: "recording-stopped",
            sequence: 0,
            at: "2026-06-22T00:00:00.000Z",
            elapsedMs: 0,
            json: "{}",
            dom: null,
            summary: snapshot.summary,
            activeElement: null,
          },
        ],
        lastStateKey: null,
        sequence: 1,
        startedAt: "2026-06-22T00:00:00.000Z",
        startedAtMs: 0,
      },
      0,
    );

    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining(
          "Duplicate block id detected: block-1",
        ),
      }),
    ]);
    expect(formatDebugReport(report)).toContain("duplicates: block-1");
  });

  it("raises document render surface issues as debug report diagnostics", () => {
    const note = createNoteDocument(
      [
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Alpha" }],
        },
      ],
      {
        id: "note-test",
        title: "Debug",
        tags: [],
      },
    );
    const rootElement = document.createElement("div");
    rootElement.innerHTML = [
      '<div class="document-view" role="document">',
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span data-path="/root/children/0/children/0/text">Alpha</span>',
      "</p>",
      "</div>",
    ].join("");

    const snapshot = readSnapshot({
      note,
      rootElement,
      selection: undefined,
    });
    const report = buildReport(
      {
        entries: [
          {
            kind: "state",
            reason: "recording-stopped",
            sequence: 0,
            at: "2026-06-22T00:00:00.000Z",
            elapsedMs: 0,
            json: "{}",
            dom: snapshot.dom,
            summary: snapshot.summary,
            activeElement: null,
          },
        ],
        lastStateKey: null,
        sequence: 1,
        startedAt: "2026-06-22T00:00:00.000Z",
        startedAtMs: 0,
      },
      0,
    );

    expect(snapshot.summary.document.surfaceIssues).toEqual([
      "invalid-content: /root/children/0/children/0/text",
    ]);
    expect(report.diagnostics).toEqual([
      expect.objectContaining({
        level: "error",
        message: expect.stringContaining(
          "Document render surface integrity issue: invalid-content: /root/children/0/children/0/text",
        ),
      }),
    ]);
  });

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
