import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import type { CursorGeometry } from "./cursorGeometry";
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
  it("draws a text caret from rectForPoint", () => {
    const html = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometryFor({
          "/root/children/0/children/0/text:2": rect(32, 10, 1, 20),
        })}
        selection={selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
        })}
      />,
    );

    expect(html).toContain('data-overlay="caret"');
    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain("left:32px");
    expect(html).toContain("top:10px");
  });

  it("keeps zero-width text carets visible", () => {
    const html = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometryFor({
          "/root/children/0/children/0/text:0": rect(32, 10, 0, 20),
        })}
        selection={selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: 0,
        })}
      />,
    );

    expect(html).toContain('data-overlay="caret"');
    expect(html).toContain("width:2px");
  });

  it("draws mention before and after caret edges", () => {
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

    expect(before).toContain('data-edge="before"');
    expect(before).toContain("left:70px");
    expect(before).not.toContain('data-overlay="selected-atom"');
    expect(after).toContain('data-edge="after"');
    expect(after).toContain("left:110px");
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

  it("draws figure before and after caret edges", () => {
    const geometry = geometryFor({
      "/root/children/1:before": rect(10, 50, 1, 120),
      "/root/children/1:after": rect(210, 50, 1, 120),
    });

    const before = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometry}
        selection={selectionFromCursorPoint({
          path: "/root/children/1",
          edge: "before",
        })}
      />,
    );
    const after = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometry}
        selection={selectionFromCursorPoint({
          path: "/root/children/1",
          edge: "after",
        })}
      />,
    );

    expect(before).toContain('data-edge="before"');
    expect(before).toContain("left:10px");
    expect(before).toContain("height:120px");
    expect(before).not.toContain('data-overlay="selected-atom"');
    expect(after).toContain('data-edge="after"');
    expect(after).toContain("left:210px");
    expect(after).toContain("height:120px");
    expect(after).not.toContain('data-overlay="selected-atom"');
  });

  it("draws paragraph before and after caret edges without atom selection", () => {
    const geometry = geometryFor({
      "/root/children/0:before": rect(10, 10, 1, 20),
      "/root/children/0:after": rect(60, 10, 1, 20),
    });

    const before = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometry}
        selection={selectionFromCursorPoint({
          path: "/root/children/0",
          edge: "before",
        })}
      />,
    );
    const after = renderToStaticMarkup(
      <SelectionOverlay
        geometry={geometry}
        selection={selectionFromCursorPoint({
          path: "/root/children/0",
          edge: "after",
        })}
      />,
    );

    expect(before).toContain('data-edge="before"');
    expect(before).toContain("left:10px");
    expect(before).not.toContain('data-overlay="selected-atom"');
    expect(after).toContain('data-edge="after"');
    expect(after).toContain("left:60px");
    expect(after).not.toContain('data-overlay="selected-atom"');
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
