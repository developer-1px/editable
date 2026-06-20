import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { CSSProperties } from "react";
import type { CursorPoint } from "../model/cursor";
import type { CursorGeometry } from "./cursorGeometry";

type SelectionOverlayProps = {
  geometry: CursorGeometry;
  selection?: SelectionSnap;
};

export function SelectionOverlay({
  geometry,
  selection,
}: SelectionOverlayProps) {
  if (selection === undefined) {
    return null;
  }

  const focusPoint = selectionPointToCursorPoint(selection.focus);
  const focusRect =
    focusPoint === null ? null : geometry.rectForPoint(focusPoint);
  const selectedRanges = selectionRangeRects(geometry, selection);
  const selectedAtoms = selectedAtomRects(geometry, selection);

  return (
    <div aria-hidden={true} className="selection-overlay">
      {selectedRanges.map((rect) => (
        <div
          className="selection-range"
          data-overlay="selected-range"
          key={`range:${rect.left}:${rect.top}:${rect.width}:${rect.height}`}
          style={rectStyle(rect)}
        />
      ))}
      {focusPoint !== null && focusRect !== null ? (
        <div
          className="selection-caret"
          data-edge={"edge" in focusPoint ? focusPoint.edge : undefined}
          data-overlay="caret"
          data-path={focusPoint.path}
          style={caretStyle(focusRect)}
        />
      ) : null}
      {selectedAtoms.map((atom) => (
        <div
          className={`selection-atom selection-atom-${atom.kind}`}
          data-overlay="selected-atom"
          data-path={atom.path}
          key={atom.path}
          style={rectStyle(atom.rect)}
        />
      ))}
    </div>
  );
}

function selectionRangeRects(
  geometry: CursorGeometry,
  selection: SelectionSnap,
) {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return [];
  }

  const anchor = selectionPointToCursorPoint(range.anchor);
  const focus = selectionPointToCursorPoint(range.focus);
  if (anchor === null || focus === null || cursorPointsEqual(anchor, focus)) {
    return [];
  }

  return geometry.rectsForRange(anchor, focus);
}

function selectedAtomRects(geometry: CursorGeometry, selection: SelectionSnap) {
  return selection.selectedPointers.flatMap((path) => {
    const before = geometry.rectForPoint({ path, edge: "before" });
    const after = geometry.rectForPoint({ path, edge: "after" });
    if (before === null || after === null) {
      return [];
    }

    return [
      {
        path,
        kind: atomKind(path),
        rect: unionRect(before, after),
      },
    ];
  });
}

function selectionPointToCursorPoint(
  point: SelectionPoint | null,
): CursorPoint | null {
  if (point === null || typeof point === "string") {
    return null;
  }

  if (point.offset !== undefined) {
    return {
      path: point.path,
      offset: point.offset,
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }

  if (point.edge !== undefined) {
    return {
      path: point.path,
      edge: point.edge,
      ...(point.affinity !== undefined ? { affinity: point.affinity } : {}),
    };
  }

  return null;
}

function atomKind(path: string): "figure" | "mention" {
  return /^\/blocks\/\d+$/.test(path) ? "figure" : "mention";
}

function cursorPointsEqual(left: CursorPoint, right: CursorPoint): boolean {
  if ("offset" in left || "offset" in right) {
    return (
      "offset" in left &&
      "offset" in right &&
      left.path === right.path &&
      left.offset === right.offset
    );
  }

  return left.path === right.path && left.edge === right.edge;
}

function unionRect(left: DOMRect, right: DOMRect): DOMRect {
  const x = Math.min(left.left, right.left);
  const y = Math.min(left.top, right.top);
  const maxX = Math.max(left.right, right.right);
  const maxY = Math.max(left.bottom, right.bottom);

  return makeRect(x, y, maxX - x, maxY - y);
}

function rectStyle(rect: DOMRect): CSSProperties {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
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

function makeRect(
  x: number,
  y: number,
  width: number,
  height: number,
): DOMRect {
  if (typeof DOMRect !== "undefined") {
    return new DOMRect(x, y, width, height);
  }

  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON() {
      return { x, y, width, height };
    },
  } as DOMRect;
}
