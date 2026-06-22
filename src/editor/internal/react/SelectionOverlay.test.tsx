// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import type { CursorGeometry } from "../view/cursorGeometry";
import { SelectionOverlay } from "./SelectionOverlay";

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return { left, top, width, height };
    },
  } as DOMRect;
}

function geometryFor(
  rects: Record<string, DOMRect | DOMRect[]>,
): CursorGeometry {
  return {
    rectForPoint(point) {
      const suffix = "offset" in point ? `:${point.offset}` : `:${point.edge}`;
      const value = rects[`${point.path}${suffix}`];

      return Array.isArray(value) ? null : (value ?? null);
    },
    rectsForRange(anchor, focus) {
      const anchorSuffix =
        "offset" in anchor ? `:${anchor.offset}` : `:${anchor.edge}`;
      const focusSuffix =
        "offset" in focus ? `:${focus.offset}` : `:${focus.edge}`;
      const value =
        rects[`${anchor.path}${anchorSuffix}->${focus.path}${focusSuffix}`];

      return Array.isArray(value) ? value : [];
    },
    pointFromCoordinates: () => null,
    pageStep: () => 600,
  };
}

describe("SelectionOverlay", () => {
  it("does not draw collapsed caret edges", () => {
    const geometry = geometryFor({
      "/root/children/0/children/1:before": rect(70, 10, 1, 20),
      "/root/children/0/children/1:after": rect(110, 10, 1, 20),
    });

    const before = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometry}
        selection={selectionFromCursorPoint({
          path: "/root/children/0/children/1",
          edge: "before",
        })}
      />,
    );
    const after = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometry}
        selection={selectionFromCursorPoint({
          path: "/root/children/0/children/1",
          edge: "after",
        })}
      />,
    );

    expect(before).not.toContain('data-overlay="caret"');
    expect(before).not.toContain('data-overlay="selected-atom"');
    expect(after).not.toContain('data-overlay="caret"');
    expect(after).not.toContain('data-overlay="selected-atom"');
  });

  it("draws text range highlights from headless selection ranges", () => {
    const html = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometryFor({
          "/root/children/0/children/0/text:1": rect(20, 10, 1, 20),
          "/root/children/0/children/0/text:3": rect(44, 10, 1, 20),
          "/root/children/0/children/0/text:1->/root/children/0/children/0/text:3":
            [rect(20, 10, 24, 20)],
        })}
        selection={{
          ...selectionFromCursorPoint({
            path: "/root/children/0/children/0/text",
            offset: 3,
          }),
          selectionRanges: [
            {
              anchor: { path: "/root/children/0/children/0/text", offset: 1 },
              focus: { path: "/root/children/0/children/0/text", offset: 3 },
            },
          ],
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: { path: "/root/children/0/children/0/text", offset: 3 },
        }}
      />,
    );

    expect(html).toContain('data-overlay="selected-range"');
    expect(html).toContain("left:20px");
    expect(html).toContain("width:24px");
  });

  it("keeps range overlay keys stable when two rects share geometry", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    let unmount: (() => void) | undefined;

    try {
      const view = render(
        <SelectionOverlay
          geometry={geometryFor({
            "/root/children/0/children/0/text:1": rect(20, 10, 1, 20),
            "/root/children/0/children/0/text:3": rect(44, 10, 1, 20),
            "/root/children/0/children/0/text:1->/root/children/0/children/0/text:3":
              [rect(20, 10, 24, 20), rect(20, 10, 24, 20)],
          })}
          selection={{
            ...selectionFromCursorPoint({
              path: "/root/children/0/children/0/text",
              offset: 3,
            }),
            selectionRanges: [
              {
                anchor: {
                  path: "/root/children/0/children/0/text",
                  offset: 1,
                },
                focus: {
                  path: "/root/children/0/children/0/text",
                  offset: 3,
                },
              },
            ],
            anchor: { path: "/root/children/0/children/0/text", offset: 1 },
            focus: { path: "/root/children/0/children/0/text", offset: 3 },
          }}
        />,
      );
      unmount = view.unmount;

      expect(
        view.baseElement.querySelectorAll('[data-overlay="selected-range"]'),
      ).toHaveLength(2);
      expect(
        consoleError.mock.calls.some((call) =>
          call.some(
            (value) =>
              typeof value === "string" &&
              value.includes("same key") &&
              value.includes("range:"),
          ),
        ),
      ).toBe(false);
    } finally {
      unmount?.();
      consoleError.mockRestore();
    }
  });

  it("draws distinct selected states for mention and figure atoms", () => {
    const selection = {
      ...selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
      selectedPointers: ["/root/children/0/children/1", "/root/children/1"],
    };
    const html = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometryFor({
          "/root/children/0/children/1:before": rect(70, 10, 1, 20),
          "/root/children/0/children/1:after": rect(110, 10, 1, 20),
          "/root/children/1:before": rect(10, 50, 1, 120),
          "/root/children/1:after": rect(210, 50, 1, 120),
        })}
        selection={selection}
      />,
    );

    expect(html).toContain("selection-atom selection-atom-mention");
    expect(html).toContain("selection-atom selection-atom-figure");
    expect(html).toContain('aria-hidden="true"');
  });
});
