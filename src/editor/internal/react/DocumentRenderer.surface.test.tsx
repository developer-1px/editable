// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import { DocumentRenderer } from "./DocumentRenderer";
import {
  documentWithBlocks,
  renderDocument,
} from "./documentRendererTestUtils";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DocumentRenderer surface", () => {
  it("renders the root inspection surface for the current selection", () => {
    const selection = {
      ...selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
      selectedPointers: ["/root/children/0/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: {
            path: "/root/children/0/children/1",
            edge: "after" as const,
          },
        },
      ],
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/1", edge: "after" as const },
    };
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Hi " },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
      ]),
      selection,
    );

    expect(html).toContain('class="document-view"');
    expect(html).toContain('aria-label="Document"');
    expect(html).toContain('role="document"');
    expect(html).toContain(
      'data-selection-anchor-path="/root/children/0/children/0/text"',
    );
    expect(html).toContain('data-selection-anchor-offset="1"');
    expect(html).toContain(
      'data-selection-focus-path="/root/children/0/children/1"',
    );
    expect(html).toContain('data-selection-focus-edge="after"');
    expect(html).toContain('data-selection-range-count="1"');
    expect(html).toContain(
      'data-selection-selected-pointers="/root/children/0/children/1"',
    );
  });

  it("does not emit duplicate-key warnings for duplicate block ids", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return;
    });
    const note = documentWithBlocks([
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "First" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Second" }],
      },
    ]);

    render(<DocumentRenderer note={note} />);

    expect(
      consoleError.mock.calls.some((call) =>
        call.some(
          (value) =>
            typeof value === "string" &&
            value.includes("Encountered two children with the same key"),
        ),
      ),
    ).toBe(false);
  });

  it("renders text runs with stable data paths", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Hello" }],
        },
      ]),
    );

    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain(">Hello</span>");
  });

  it("reflects the current headless selection for inspection", () => {
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Hello " },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
      ]),
      selection,
    );

    expect(html).toContain('data-selection-path="/root/children/0/children/1"');
    expect(html).toContain('data-selection-edge="after"');
    expect(html).toContain('data-cursor="focus"');
    expect(html).toContain('data-cursor-edge="after"');
  });
});
