// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { selectionFromCursorRange } from "../model/cursorCommands";
import { createNoteDocument } from "../model/noteDocument";
import { selectionForRender } from "../model/richSelection";
import { buildReport, formatDebugReport } from "./debugInteractionReport";
import { readSnapshot } from "./debugInteractionSnapshot";
import { formatTimeline } from "./debugInteractionTimeline";

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
            inputType: undefined,
            data: undefined,
            clipboardText: "A\nB",
            pointerType: undefined,
            button: undefined,
            client: undefined,
            modifiers: [],
            target: { nodeName: "DIV", tagName: "DIV" },
            defaultPrevented: false,
          },
        },
      ]),
    ).toEqual(['  #0 +0ms input: paste "A\\nB" target=DIV']);
  });
});
