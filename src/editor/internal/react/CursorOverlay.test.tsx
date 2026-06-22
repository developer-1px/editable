import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CursorGeometry } from "../view/cursorGeometry";
import { CursorOverlay } from "./CursorOverlay";

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

function geometryFor(rects: Record<string, DOMRect>): CursorGeometry {
  return {
    rectForPoint(point) {
      const suffix = "offset" in point ? `:${point.offset}` : `:${point.edge}`;
      return rects[`${point.path}${suffix}`] ?? null;
    },
    rectsForRange: () => [],
    pointFromCoordinates: () => null,
    pageStep: () => 600,
  };
}

describe("CursorOverlay", () => {
  it("draws a text caret from rectForPoint", () => {
    const html = renderToStaticMarkup(
      <CursorOverlay
        geometry={geometryFor({
          "/root/children/0/children/0/text:2": rect(32, 10, 1, 20),
        })}
        ownerDocument={null}
        point={{
          path: "/root/children/0/children/0/text",
          offset: 2,
        }}
      />,
    );

    expect(html).toContain('data-overlay="caret"');
    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain('data-offset="2"');
    expect(html).toContain("left:32px");
    expect(html).toContain("top:10px");
  });

  it("keeps zero-width text carets visible", () => {
    const html = renderToStaticMarkup(
      <CursorOverlay
        geometry={geometryFor({
          "/root/children/0/children/0/text:0": rect(32, 10, 0, 20),
        })}
        ownerDocument={null}
        point={{
          path: "/root/children/0/children/0/text",
          offset: 0,
        }}
      />,
    );

    expect(html).toContain('data-overlay="caret"');
    expect(html).toContain("width:2px");
  });

  it("draws atom edge carets", () => {
    const html = renderToStaticMarkup(
      <CursorOverlay
        geometry={geometryFor({
          "/root/children/0/children/1:after": rect(110, 10, 1, 20),
        })}
        ownerDocument={null}
        point={{
          path: "/root/children/0/children/1",
          edge: "after",
        }}
      />,
    );

    expect(html).toContain('data-edge="after"');
    expect(html).toContain("left:110px");
  });
});
