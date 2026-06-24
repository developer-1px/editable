import type { CSSProperties } from "react";
import type { CursorPoint } from "../model/cursor";
import type { CursorGeometry } from "../view/cursorGeometry";
import { FixedViewportOverlay } from "./FixedViewportOverlay";

type CursorOverlayProps = {
  geometry: CursorGeometry;
  ownerDocument: Document | null;
  point: CursorPoint | null;
};

export function CursorOverlay({
  geometry,
  ownerDocument,
  point,
}: CursorOverlayProps) {
  if (point === null) {
    return null;
  }

  const rect = geometry.rectForPoint(point);
  if (rect === null) {
    return null;
  }

  return (
    <FixedViewportOverlay
      className="cursor-overlay"
      ownerDocument={ownerDocument}
    >
      <div
        className="selection-caret"
        data-edge={"edge" in point ? point.edge : undefined}
        data-offset={"offset" in point ? point.offset : undefined}
        data-overlay="caret"
        data-path={point.path}
        style={caretStyle(rect)}
      />
    </FixedViewportOverlay>
  );
}

function caretStyle(rect: DOMRect): CSSProperties {
  const horizontal = rect.width > rect.height;

  return {
    height: horizontal ? Math.max(rect.height, 2) : rect.height,
    left: rect.left,
    top: rect.top,
    width: horizontal ? rect.width : Math.max(rect.width, 2),
  };
}
