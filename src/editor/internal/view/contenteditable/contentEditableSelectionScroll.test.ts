// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import { scrollContentEditableSelectionIntoView } from "./contentEditableViewEngine";
import {
  documentWithBlocks,
  installContentEditableViewTestCleanup,
  installVisualViewport,
  installWindowScrollBy,
  rect,
  secondTextPath,
  setupTextRoot,
} from "./contentEditableViewEngineTestUtils";

installContentEditableViewTestCleanup();

describe("contenteditable selection scroll reveal", () => {
  it("scrolls the focused selection point into view", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Beta" }],
      },
    ]);
    const { root, second } = setupTextRoot();
    const scrollIntoView = vi.fn();
    Object.defineProperty(second, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    scrollContentEditableSelectionIntoView(
      root,
      note,
      selectionFromCursorPoint({ path: secondTextPath, offset: 2 }),
    );

    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
  });

  it("adjusts page scroll when visualViewport occludes the focused selection", () => {
    const restoreViewport = installVisualViewport({
      height: 500,
      offsetTop: 0,
      width: 360,
    });
    const scrollBy = vi.fn();
    const restoreScrollBy = installWindowScrollBy(scrollBy);
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Beta" }],
      },
    ]);
    const { root, second } = setupTextRoot();

    try {
      Object.defineProperty(second, "getBoundingClientRect", {
        configurable: true,
        value: () => rect(10, 480, 100, 40),
      });

      scrollContentEditableSelectionIntoView(
        root,
        note,
        selectionFromCursorPoint({ path: secondTextPath, offset: 2 }),
      );
    } finally {
      restoreScrollBy();
      restoreViewport();
    }

    expect(scrollBy).toHaveBeenCalledWith({ top: 20 });
  });

  it("keeps the desktop reveal path when visualViewport is unavailable", () => {
    const restoreViewport = installVisualViewport(undefined);
    const scrollBy = vi.fn();
    const restoreScrollBy = installWindowScrollBy(scrollBy);
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Beta" }],
      },
    ]);
    const { root, second } = setupTextRoot();

    try {
      Object.defineProperty(second, "getBoundingClientRect", {
        configurable: true,
        value: () => rect(10, 480, 100, 40),
      });

      scrollContentEditableSelectionIntoView(
        root,
        note,
        selectionFromCursorPoint({ path: secondTextPath, offset: 2 }),
      );
    } finally {
      restoreScrollBy();
      restoreViewport();
    }

    expect(scrollBy).not.toHaveBeenCalled();
  });
});
