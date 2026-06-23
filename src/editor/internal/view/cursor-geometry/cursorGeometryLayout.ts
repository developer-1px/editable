import {
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineItem,
  walkRichInlineLineRanges,
} from "@chenglou/pretext/rich-inline";
import {
  type CursorPoint,
  createCursorIndexResolver,
} from "../../model/cursor";
import type { NoteDocument } from "../../model/noteDocument";
import {
  canUsePretextMeasurement,
  isBlockAtom,
  isTextBlockElement,
  isTopLevelCursorBlock,
  lineHeightForElement,
  textLayoutRectForBlock,
} from "./cursorGeometryDom";
import {
  consumeWhitespaceGap,
  layoutFragmentFromPretextFragment,
  lineFromFragments,
  textFragmentForRange,
} from "./cursorGeometryFragments";
import { layoutTextBlockWithHardBreaks } from "./cursorGeometryHardBreakLayout";
import {
  collectInlineItems,
  estimatedInlineItemWidth,
  estimatedInlineWidth,
  hasHardLineBreak,
  isEmptyTextOnlyBlock,
} from "./cursorGeometryInlineItems";
import { cloneRect, makeRect } from "./cursorGeometryRects";
import type {
  FigureLayoutAtom,
  GeometryMap,
  InlineLayoutItem,
  LayoutFragment,
  LayoutLine,
} from "./cursorGeometryTypes";

type CursorOrderResolver = (point: CursorPoint) => number;

export function buildGeometryMap(
  root: ParentNode,
  document: NoteDocument,
): GeometryMap {
  const lines: LayoutLine[] = [];
  const figures = new Map<string, FigureLayoutAtom>();
  const orderForPoint: CursorOrderResolver =
    createCursorIndexResolver(document);

  for (const block of Array.from(root.querySelectorAll("[data-path]"))) {
    if (!isTopLevelCursorBlock(block)) {
      continue;
    }

    const path = block.getAttribute("data-path");
    if (path === null) {
      continue;
    }

    if (isBlockAtom(block)) {
      const rect = cloneRect(block.getBoundingClientRect());
      figures.set(path, {
        rect,
        orderStart: orderForPoint({ path, edge: "before" }),
        orderEnd: orderForPoint({ path, edge: "after" }),
      });
      continue;
    }

    if (!isTextBlockElement(block)) {
      continue;
    }

    lines.push(...layoutTextBlock(block, orderForPoint));
  }

  return { lines, figures };
}

function layoutTextBlock(
  block: Element,
  orderForPoint: CursorOrderResolver,
): LayoutLine[] {
  const blockPath = block.getAttribute("data-path");
  if (blockPath === null) {
    return [];
  }

  const blockRect = cloneRect(block.getBoundingClientRect());
  const inlineItems = collectInlineItems(block);
  if (inlineItems.length === 0) {
    return [];
  }

  const estimatedWidth = estimatedInlineWidth(inlineItems);
  const layoutRect = textLayoutRectForBlock(block, blockRect, estimatedWidth);
  const lineHeight = lineHeightForElement(block, layoutRect);
  const width = Math.max(
    1,
    layoutRect.width > 0 ? layoutRect.width : estimatedWidth,
  );

  if (hasHardLineBreak(inlineItems)) {
    return layoutTextBlockWithHardBreaks(
      blockPath,
      inlineItems,
      layoutRect,
      width,
      lineHeight,
      orderForPoint,
    );
  }

  if (isEmptyTextOnlyBlock(inlineItems)) {
    return layoutTextBlockWithFallback(
      blockPath,
      inlineItems,
      layoutRect,
      width,
      lineHeight,
      orderForPoint,
    );
  }

  try {
    if (!canUsePretextMeasurement()) {
      throw new Error("Pretext measurement is unavailable.");
    }

    return layoutTextBlockWithPretext(
      blockPath,
      inlineItems,
      layoutRect,
      width,
      lineHeight,
      orderForPoint,
    );
  } catch {
    return layoutTextBlockWithFallback(
      blockPath,
      inlineItems,
      layoutRect,
      width,
      lineHeight,
      orderForPoint,
    );
  }
}

function layoutTextBlockWithPretext(
  blockPath: string,
  inlineItems: InlineLayoutItem[],
  blockRect: DOMRect,
  width: number,
  lineHeight: number,
  orderForPoint: CursorOrderResolver,
): LayoutLine[] {
  const richItems: RichInlineItem[] = inlineItems.map((item) =>
    item.kind === "atom"
      ? {
          text: item.text,
          font: item.font,
          break: "never",
          extraWidth: item.extraWidth,
        }
      : {
          text: item.text,
          font: item.font,
        },
  );
  const prepared = prepareRichInline(richItems);
  const lines: LayoutLine[] = [];
  let lineIndex = 0;

  walkRichInlineLineRanges(prepared, width, (range) => {
    const materialized = materializeRichInlineLineRange(prepared, range);
    const fragments: LayoutFragment[] = [];
    let x = blockRect.left;

    for (const fragment of materialized.fragments) {
      const source = inlineItems[fragment.itemIndex];
      if (source === undefined) {
        continue;
      }

      if (fragment.gapBefore > 0) {
        const gap = consumeWhitespaceGap(inlineItems, fragment.itemIndex);
        if (gap !== null) {
          const rect = makeRect(
            x,
            blockRect.top + lineIndex * lineHeight,
            fragment.gapBefore,
            lineHeight,
          );
          fragments.push({
            kind: "text",
            path: gap.path,
            rect,
            startOffset: gap.startOffset,
            endOffset: gap.endOffset,
            offsets: [gap.startOffset, gap.endOffset],
            caretXs: [0, rect.width],
            orderStart: orderForPoint({
              path: gap.path,
              offset: gap.startOffset,
            }),
            orderEnd: orderForPoint({ path: gap.path, offset: gap.endOffset }),
          });
        }
        x += fragment.gapBefore;
      }

      const rect = makeRect(
        x,
        blockRect.top + lineIndex * lineHeight,
        fragment.occupiedWidth,
        lineHeight,
      );
      const nextFragment = layoutFragmentFromPretextFragment(
        source,
        fragment.text,
        rect,
        orderForPoint,
      );
      if (nextFragment !== null) {
        fragments.push(nextFragment);
      }
      x += fragment.occupiedWidth;
    }

    const line = lineFromFragments(
      blockPath,
      fragments,
      makeRect(
        blockRect.left,
        blockRect.top + lineIndex * lineHeight,
        width,
        lineHeight,
      ),
    );
    if (line !== null) {
      lines.push(line);
    }
    lineIndex += 1;
  });

  return lines;
}

function layoutTextBlockWithFallback(
  blockPath: string,
  inlineItems: InlineLayoutItem[],
  blockRect: DOMRect,
  width: number,
  lineHeight: number,
  orderForPoint: CursorOrderResolver,
): LayoutLine[] {
  const lines: LayoutLine[] = [];
  let lineFragments: LayoutFragment[] = [];
  let x = blockRect.left;
  let lineIndex = 0;

  const flushLine = () => {
    const line = lineFromFragments(
      blockPath,
      lineFragments,
      makeRect(
        blockRect.left,
        blockRect.top + lineIndex * lineHeight,
        width,
        lineHeight,
      ),
    );
    if (line !== null) {
      lines.push(line);
    }
    lineFragments = [];
    x = blockRect.left;
    lineIndex += 1;
  };

  for (const item of inlineItems) {
    const itemWidth = estimatedInlineItemWidth(item);
    if (lineFragments.length > 0 && x + itemWidth > blockRect.left + width) {
      flushLine();
    }

    const rect = makeRect(
      x,
      blockRect.top + lineIndex * lineHeight,
      itemWidth,
      lineHeight,
    );
    const fragment =
      item.kind === "atom"
        ? ({
            kind: "atom",
            path: item.path,
            rect,
            orderStart: orderForPoint({ path: item.path, edge: "before" }),
            orderEnd: orderForPoint({ path: item.path, edge: "after" }),
          } satisfies LayoutFragment)
        : textFragmentForRange(
            item.path,
            item.text,
            0,
            item.text.length,
            rect,
            item.font,
            itemWidth,
            orderForPoint,
          );
    lineFragments.push(fragment);
    x += itemWidth;
  }

  flushLine();

  return lines;
}
