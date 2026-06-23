import type { CursorPoint } from "../../model/cursor";
import { textBoundaryOffsetsInRange } from "../../model/textBoundaries";
import { measureTextWidth } from "./cursorGeometryDom";
import {
  lineFromFragments,
  textFragmentForRange,
} from "./cursorGeometryFragments";
import {
  estimatedInlineItemWidth,
  hardLineCountForItems,
} from "./cursorGeometryInlineItems";
import { makeRect } from "./cursorGeometryRects";
import type {
  InlineLayoutItem,
  LayoutFragment,
  LayoutLine,
} from "./cursorGeometryTypes";

type CursorOrderResolver = (point: CursorPoint) => number;

export function layoutTextBlockWithHardBreaks(
  blockPath: string,
  inlineItems: InlineLayoutItem[],
  blockRect: DOMRect,
  width: number,
  fallbackLineHeight: number,
  orderForPoint: CursorOrderResolver,
): LayoutLine[] {
  const hardLineCount = hardLineCountForItems(inlineItems);
  const lineHeight =
    hardLineCount > 1 && blockRect.height > 0
      ? Math.max(
          1,
          Math.min(fallbackLineHeight, blockRect.height / hardLineCount),
        )
      : fallbackLineHeight;
  const lines: LayoutLine[] = [];
  let lineFragments: LayoutFragment[] = [];
  let emptyLineFallback: { path: string; offset: number } | null = null;
  let x = blockRect.left;
  let lineIndex = 0;

  const lineTop = () => blockRect.top + lineIndex * lineHeight;
  const flushLine = (fallbackPath?: string, fallbackOffset?: number) => {
    if (
      lineFragments.length === 0 &&
      fallbackPath !== undefined &&
      fallbackOffset !== undefined
    ) {
      lineFragments.push(
        textFragmentForRange(
          fallbackPath,
          "",
          fallbackOffset,
          fallbackOffset,
          makeRect(blockRect.left, lineTop(), 1, lineHeight),
          "",
          1,
          orderForPoint,
        ),
      );
    }

    const line = lineFromFragments(
      blockPath,
      lineFragments,
      makeRect(blockRect.left, lineTop(), width, lineHeight),
    );
    if (line !== null) {
      lines.push(line);
    }
    lineFragments = [];
    x = blockRect.left;
    lineIndex += 1;
  };
  const appendTextRange = (
    item: InlineLayoutItem,
    startOffset: number,
    endOffset: number,
  ) => {
    let rangeStart = startOffset;
    const offsets = textBoundaryOffsetsInRange(
      item.text,
      startOffset,
      endOffset,
    );

    while (rangeStart < endOffset) {
      const remainingWidth = blockRect.left + width - x;
      let rangeEnd = rangeStart;
      let rangeWidth = 0;

      for (const offset of offsets) {
        if (offset <= rangeStart) {
          continue;
        }

        const nextWidth = measureTextWidth(
          item.text.slice(rangeStart, offset),
          item.font,
        );
        if (nextWidth <= remainingWidth || rangeEnd === rangeStart) {
          if (nextWidth > remainingWidth && lineFragments.length > 0) {
            break;
          }
          rangeEnd = offset;
          rangeWidth = nextWidth;
        }
        if (nextWidth > remainingWidth) {
          break;
        }
      }

      if (rangeEnd === rangeStart && lineFragments.length > 0) {
        flushLine();
        continue;
      }

      if (rangeEnd === rangeStart) {
        break;
      }

      const fragmentWidth = Math.max(1, rangeWidth);
      const rect = makeRect(x, lineTop(), fragmentWidth, lineHeight);
      lineFragments.push(
        textFragmentForRange(
          item.path,
          item.text,
          rangeStart,
          rangeEnd,
          rect,
          item.font,
          fragmentWidth,
          orderForPoint,
        ),
      );
      x += fragmentWidth;
      rangeStart = rangeEnd;

      if (rangeStart < endOffset) {
        flushLine();
      }
    }
  };

  for (const item of inlineItems) {
    if (item.kind === "atom") {
      emptyLineFallback = null;
      const itemWidth = estimatedInlineItemWidth(item);
      if (lineFragments.length > 0 && x + itemWidth > blockRect.left + width) {
        flushLine();
      }
      const rect = makeRect(x, lineTop(), itemWidth, lineHeight);
      lineFragments.push({
        kind: "atom",
        path: item.path,
        rect,
        orderStart: orderForPoint({ path: item.path, edge: "before" }),
        orderEnd: orderForPoint({ path: item.path, edge: "after" }),
      });
      x += itemWidth;
      continue;
    }

    let segmentStart = 0;
    while (segmentStart <= item.text.length) {
      const lineBreak = item.text.indexOf("\n", segmentStart);
      const segmentEnd = lineBreak === -1 ? item.text.length : lineBreak;
      if (segmentEnd > segmentStart) {
        emptyLineFallback = null;
        appendTextRange(item, segmentStart, segmentEnd);
      }

      if (lineBreak === -1) {
        break;
      }

      const newlineRect = makeRect(x, lineTop(), 1, lineHeight);
      lineFragments.push(
        textFragmentForRange(
          item.path,
          item.text,
          lineBreak,
          lineBreak + 1,
          newlineRect,
          item.font,
          1,
          orderForPoint,
          { isLineBreak: true },
        ),
      );
      x += 1;
      flushLine(item.path, lineBreak);
      segmentStart = lineBreak + 1;
      emptyLineFallback =
        segmentStart === item.text.length
          ? { path: item.path, offset: segmentStart }
          : null;
    }
  }

  flushLine(emptyLineFallback?.path, emptyLineFallback?.offset);

  return lines;
}
