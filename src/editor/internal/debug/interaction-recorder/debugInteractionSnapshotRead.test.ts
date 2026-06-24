// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../../model/cursorCommands";
import { createNoteDocument } from "../../model/noteDocument";
import { selectionForRender } from "../../model/richSelection";
import { readSnapshot } from "./debugInteractionSnapshot";

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
});
