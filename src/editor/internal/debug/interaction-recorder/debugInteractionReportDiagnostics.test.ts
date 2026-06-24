// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createNoteDocument } from "../../model/noteDocument";
import { buildReport, formatDebugReport } from "./debugInteractionReport";
import { readSnapshot } from "./debugInteractionSnapshot";

function buildSingleSnapshotReport(snapshot: ReturnType<typeof readSnapshot>) {
  return buildReport(
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
}

describe("debug interaction report diagnostics", () => {
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
    const report = buildSingleSnapshotReport(snapshot);

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
    const report = buildSingleSnapshotReport(snapshot);

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
});
