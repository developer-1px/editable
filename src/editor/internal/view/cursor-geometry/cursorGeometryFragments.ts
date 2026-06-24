import type { CursorPoint } from "../../model/cursor";
import {
  textBoundaryOffsets,
  textBoundaryOffsetsInRange,
} from "../../model/textBoundaries";
import { measureTextWidth } from "./cursorGeometryDom";
import type {
  InlineLayoutItem,
  LayoutFragment,
  LayoutLine,
} from "./cursorGeometryTypes";

type CursorOrderResolver = (point: CursorPoint) => number;

export function textFragmentForRange(
  path: string,
  sourceText: string,
  startOffset: number,
  endOffset: number,
  rect: DOMRect,
  font: string,
  targetWidth: number,
  orderForPoint: CursorOrderResolver,
  options: { isLineBreak?: boolean } = {},
): LayoutFragment {
  const fragment: LayoutFragment = {
    kind: "text",
    path,
    rect,
    startOffset,
    endOffset,
    offsets: textBoundaryOffsetsInRange(sourceText, startOffset, endOffset),
    caretXs: caretXsForText(
      sourceText.slice(startOffset, endOffset),
      font,
      targetWidth,
    ),
    orderStart: orderForPoint({ path, offset: startOffset }),
    orderEnd: orderForPoint({ path, offset: endOffset }),
  };
  if (options.isLineBreak === true) {
    fragment.isLineBreak = true;
  }

  return fragment;
}

export function layoutFragmentFromPretextFragment(
  source: InlineLayoutItem,
  fragmentText: string,
  rect: DOMRect,
  orderForPoint: CursorOrderResolver,
): LayoutFragment | null {
  if (source.kind === "atom") {
    return {
      kind: "atom",
      path: source.path,
      rect,
      orderStart: orderForPoint({ path: source.path, edge: "before" }),
      orderEnd: orderForPoint({ path: source.path, edge: "after" }),
    };
  }

  const range = consumeText(source, fragmentText);
  if (range === null) {
    return null;
  }

  return {
    kind: "text",
    path: source.path,
    rect,
    startOffset: range.startOffset,
    endOffset: range.endOffset,
    offsets: textBoundaryOffsetsInRange(
      source.text,
      range.startOffset,
      range.endOffset,
    ),
    caretXs: caretXsForText(
      source.text.slice(range.startOffset, range.endOffset),
      source.font,
      rect.width,
    ),
    orderStart: orderForPoint({ path: source.path, offset: range.startOffset }),
    orderEnd: orderForPoint({ path: source.path, offset: range.endOffset }),
  };
}

export function consumeWhitespaceGap(
  inlineItems: InlineLayoutItem[],
  beforeSourceIndex: number,
): { path: string; startOffset: number; endOffset: number } | null {
  for (let index = beforeSourceIndex; index >= 0; index -= 1) {
    const item = inlineItems[index];
    if (item === undefined || item.kind !== "text") {
      continue;
    }

    const startOffset = item.consumedOffset;
    let endOffset = startOffset;
    while (
      endOffset < item.text.length &&
      /\s/.test(item.text[endOffset] ?? "")
    ) {
      endOffset += 1;
    }

    if (endOffset > startOffset) {
      item.consumedOffset = endOffset;
      return { path: item.path, startOffset, endOffset };
    }
  }

  return null;
}

export function lineFromFragments(
  blockPath: string,
  fragments: LayoutFragment[],
  rect: DOMRect,
): LayoutLine | null {
  const first = fragments[0];
  const last = fragments.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }

  return {
    blockPath,
    rect,
    start: pointForFragmentEdge(first, "before"),
    end: pointForLineEnd(last),
    fragments,
  };
}

export function pointForFragmentEdge(
  fragment: LayoutFragment,
  edge: "before" | "after",
): CursorPoint {
  if (fragment.kind === "atom") {
    return {
      path: fragment.path,
      edge,
      affinity: edge === "before" ? "forward" : "backward",
    };
  }

  return {
    path: fragment.path,
    offset: edge === "before" ? fragment.startOffset : fragment.endOffset,
    affinity: edge === "before" ? "forward" : "backward",
  };
}

function consumeText(
  source: InlineLayoutItem,
  fragmentText: string,
): { startOffset: number; endOffset: number } | null {
  if (fragmentText.length === 0) {
    return null;
  }

  const next = source.text.indexOf(fragmentText, source.consumedOffset);
  const startOffset = next >= 0 ? next : source.consumedOffset;
  const endOffset = Math.min(
    source.text.length,
    startOffset + fragmentText.length,
  );
  source.consumedOffset = endOffset;

  return { startOffset, endOffset };
}

function pointForLineEnd(fragment: LayoutFragment): CursorPoint {
  return isLineBreakFragment(fragment)
    ? pointForFragmentEdge(fragment, "before")
    : pointForFragmentEdge(fragment, "after");
}

function isLineBreakFragment(fragment: LayoutFragment): boolean {
  return fragment.kind === "text" && fragment.isLineBreak === true;
}

function caretXsForText(
  text: string,
  font: string,
  targetWidth: number,
): number[] {
  if (text.length === 0) {
    return [0];
  }

  const offsets = textBoundaryOffsets(text);
  const measured = [0];
  for (const offset of offsets.slice(1)) {
    const prefix = text.slice(0, offset);
    measured.push(measureTextWidth(prefix, font));
  }

  const measuredWidth = measured.at(-1) ?? 0;
  if (measuredWidth <= 0) {
    return measured.map(
      (_, index) => (targetWidth * index) / Math.max(1, measured.length - 1),
    );
  }

  const scale = targetWidth / measuredWidth;

  return measured.map((value) => value * scale);
}
