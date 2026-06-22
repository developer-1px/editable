export function rectForAtomEdge(
  rect: DOMRect,
  edge: "before" | "after",
): DOMRect {
  return caretRectAt(
    edge === "before" ? rect.left : rect.right,
    rect.top,
    rect.height,
  );
}

export function caretRectAt(
  left: number,
  top: number,
  height: number,
): DOMRect {
  return makeRect(left, top, 1, height);
}

export function unionRects(rects: DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return makeRect(left, top, right - left, bottom - top);
}

export function distanceToRect(x: number, y: number, rect: DOMRect): number {
  const dx =
    x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy =
    y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;

  return Math.hypot(dx, dy);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

export function cloneRect(rect: DOMRect | DOMRectReadOnly): DOMRect {
  return makeRect(rect.left, rect.top, rect.width, rect.height);
}

export function makeRect(
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
