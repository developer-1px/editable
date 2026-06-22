import {
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineItem,
  walkRichInlineLineRanges,
} from "@chenglou/pretext/rich-inline";
import { type CursorPoint, createCursorIndexResolver } from "../model/cursor";
import type { NoteDocument } from "../model/noteDocument";
import {
  textBoundaryOffsets,
  textBoundaryOffsetsInRange,
} from "../model/textBoundaries";
import {
  canUsePretextMeasurement,
  fontForElement,
  inlineAtomExtraWidth,
  isBlockAtom,
  isInlineAtom,
  isTextBlockElement,
  isTopLevelCursorBlock,
  lineHeightForElement,
  measureTextWidth,
  primaryTextElement,
  textLayoutRectForBlock,
} from "./cursorGeometryDom";
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

function layoutTextBlockWithHardBreaks(
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

function collectInlineItems(block: Element): InlineLayoutItem[] {
  return Array.from(block.querySelectorAll(":scope > [data-path]")).flatMap(
    (element): InlineLayoutItem[] => {
      const path = element.getAttribute("data-path");
      if (path === null) {
        return [];
      }

      const text = element.textContent ?? "";
      const font = fontForElement(primaryTextElement(element));
      if (isInlineAtom(element)) {
        return [
          {
            kind: "atom",
            path,
            text,
            font,
            element,
            consumedOffset: 0,
            extraWidth: inlineAtomExtraWidth(element),
          },
        ];
      }

      return [
        {
          kind: "text",
          path,
          text,
          font,
          element,
          consumedOffset: 0,
          extraWidth: 0,
        },
      ];
    },
  );
}

function estimatedInlineWidth(inlineItems: InlineLayoutItem[]): number {
  return inlineItems.reduce(
    (total, item) => total + estimatedInlineItemWidth(item),
    0,
  );
}

function estimatedInlineItemWidth(item: InlineLayoutItem): number {
  if (item.kind === "atom") {
    const rectWidth = item.element.getBoundingClientRect().width;
    if (Number.isFinite(rectWidth) && rectWidth > 0) {
      return rectWidth;
    }

    return Math.max(
      1,
      measureTextWidth(item.text, item.font) + item.extraWidth,
    );
  }

  return Math.max(1, measureTextWidth(item.text, item.font));
}

function isEmptyTextOnlyBlock(inlineItems: InlineLayoutItem[]): boolean {
  return inlineItems.every(
    (item) => item.kind === "text" && item.text.length === 0,
  );
}

function hasHardLineBreak(inlineItems: InlineLayoutItem[]): boolean {
  return inlineItems.some(
    (item) => item.kind === "text" && item.text.includes("\n"),
  );
}

function hardLineCountForItems(inlineItems: InlineLayoutItem[]): number {
  return Math.max(
    1,
    inlineItems.reduce(
      (count, item) =>
        item.kind === "text"
          ? count + Array.from(item.text.matchAll(/\n/g)).length
          : count,
      1,
    ),
  );
}

function textFragmentForRange(
  path: string,
  sourceText: string,
  startOffset: number,
  endOffset: number,
  rect: DOMRect,
  font: string,
  targetWidth: number,
  orderForPoint: CursorOrderResolver,
): LayoutFragment {
  return {
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
}

function layoutFragmentFromPretextFragment(
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

function consumeWhitespaceGap(
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

function lineFromFragments(
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
    end: pointForFragmentEdge(last, "after"),
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
