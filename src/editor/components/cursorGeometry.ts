import {
  materializeRichInlineLineRange,
  prepareRichInline,
  type RichInlineItem,
  walkRichInlineLineRanges,
} from "@chenglou/pretext/rich-inline";
import type { CursorPoint } from "../model/cursor";

export type CursorGeometry = {
  rectForPoint(point: CursorPoint): DOMRect | null;
  rectsForRange(anchor: CursorPoint, focus: CursorPoint): DOMRect[];
  pointFromCoordinates(x: number, y: number): CursorPoint | null;
  pointForHorizontalMovement?(
    origin: CursorPoint,
    direction: "backward" | "forward",
  ): CursorPoint | null;
  pointForVerticalMovement?(
    origin: CursorPoint,
    x: number,
    direction: "up" | "down",
    distance: "line" | "page",
  ): CursorPoint | null;
  lineStartPoint?(point: CursorPoint): CursorPoint | null;
  lineEndPoint?(point: CursorPoint): CursorPoint | null;
  pageStep(): number;
};

type LayoutFragment =
  | {
      kind: "text";
      path: string;
      rect: DOMRect;
      startOffset: number;
      endOffset: number;
      caretXs: number[];
      orderStart: number;
      orderEnd: number;
    }
  | {
      kind: "atom";
      path: string;
      rect: DOMRect;
      orderStart: number;
      orderEnd: number;
    };

type TextLayoutFragment = Extract<LayoutFragment, { kind: "text" }>;

type TextCaretFragment = {
  fragment: TextLayoutFragment;
  offset: number;
};

type LayoutLine = {
  blockPath: string;
  rect: DOMRect;
  start: CursorPoint;
  end: CursorPoint;
  fragments: LayoutFragment[];
};

type GeometryMap = {
  lines: LayoutLine[];
  figures: Map<string, DOMRect>;
};

type LayoutRow =
  | {
      kind: "line";
      line: LayoutLine;
      rect: DOMRect;
    }
  | {
      kind: "figure";
      path: string;
      rect: DOMRect;
    };

type InlineLayoutItem = {
  kind: "text" | "atom";
  path: string;
  text: string;
  font: string;
  element: Element;
  consumedOffset: number;
  extraWidth: number;
};

export function createDOMCursorGeometry(root: ParentNode): CursorGeometry {
  let cachedMap: GeometryMap | null = null;
  const geometryMap = () => {
    cachedMap ??= buildGeometryMap(root);
    return cachedMap;
  };

  return {
    rectForPoint(point) {
      return rectForPoint(geometryMap(), point);
    },
    rectsForRange(anchor, focus) {
      return rectsForRange(geometryMap(), anchor, focus);
    },
    pointFromCoordinates(x, y) {
      return pointFromCoordinates(geometryMap(), x, y);
    },
    pointForHorizontalMovement(origin, direction) {
      return pointForHorizontalMovement(geometryMap(), origin, direction);
    },
    pointForVerticalMovement(origin, x, direction, distance) {
      return pointForVerticalMovement(
        geometryMap(),
        origin,
        x,
        direction,
        distance,
      );
    },
    lineStartPoint(point) {
      return lineForPoint(geometryMap(), point)?.start ?? null;
    },
    lineEndPoint(point) {
      return lineForPoint(geometryMap(), point)?.end ?? null;
    },
    pageStep() {
      return pageStepForRoot(root);
    },
  };
}

function buildGeometryMap(root: ParentNode): GeometryMap {
  const lines: LayoutLine[] = [];
  const figures = new Map<string, DOMRect>();
  let order = 0;

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
      figures.set(path, rect);
      order += 1;
      continue;
    }

    if (!isTextBlockElement(block)) {
      continue;
    }

    const result = layoutTextBlock(block, order);
    lines.push(...result.lines);
    order = result.nextOrder;
  }

  return { lines, figures };
}

function layoutTextBlock(
  block: Element,
  initialOrder: number,
): { lines: LayoutLine[]; nextOrder: number } {
  const blockPath = block.getAttribute("data-path");
  if (blockPath === null) {
    return { lines: [], nextOrder: initialOrder };
  }

  const blockRect = cloneRect(block.getBoundingClientRect());
  const inlineItems = collectInlineItems(block);
  if (inlineItems.length === 0) {
    return { lines: [], nextOrder: initialOrder };
  }

  const estimatedWidth = estimatedInlineWidth(inlineItems);
  const layoutRect = textLayoutRectForBlock(block, blockRect, estimatedWidth);
  const lineHeight = lineHeightForElement(block, layoutRect);
  const width = Math.max(
    1,
    layoutRect.width > 0 ? layoutRect.width : estimatedWidth,
  );

  if (isEmptyTextOnlyBlock(inlineItems)) {
    return layoutTextBlockWithFallback(
      blockPath,
      inlineItems,
      layoutRect,
      width,
      lineHeight,
      initialOrder,
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
      initialOrder,
    );
  } catch {
    return layoutTextBlockWithFallback(
      blockPath,
      inlineItems,
      layoutRect,
      width,
      lineHeight,
      initialOrder,
    );
  }
}

function layoutTextBlockWithPretext(
  blockPath: string,
  inlineItems: InlineLayoutItem[],
  blockRect: DOMRect,
  width: number,
  lineHeight: number,
  initialOrder: number,
): { lines: LayoutLine[]; nextOrder: number } {
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
  let nextOrder = initialOrder;
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
          const fragmentOrderStart = nextOrder;
          nextOrder += gap.endOffset - gap.startOffset;
          fragments.push({
            kind: "text",
            path: gap.path,
            rect,
            startOffset: gap.startOffset,
            endOffset: gap.endOffset,
            caretXs: [0, rect.width],
            orderStart: fragmentOrderStart,
            orderEnd: nextOrder,
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
        nextOrder,
      );
      if (nextFragment !== null) {
        nextOrder = nextFragment.orderEnd;
        fragments.push(nextFragment);
      }
      x += fragment.occupiedWidth;
    }

    const line = lineFromFragments(blockPath, fragments);
    if (line !== null) {
      lines.push(line);
    }
    lineIndex += 1;
  });

  return { lines, nextOrder };
}

function layoutTextBlockWithFallback(
  blockPath: string,
  inlineItems: InlineLayoutItem[],
  blockRect: DOMRect,
  width: number,
  lineHeight: number,
  initialOrder: number,
): { lines: LayoutLine[]; nextOrder: number } {
  const lines: LayoutLine[] = [];
  let lineFragments: LayoutFragment[] = [];
  let x = blockRect.left;
  let lineIndex = 0;
  let nextOrder = initialOrder;

  const flushLine = () => {
    const line = lineFromFragments(blockPath, lineFragments);
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
    const fragmentOrderStart = nextOrder;
    const fragment =
      item.kind === "atom"
        ? ({
            kind: "atom",
            path: item.path,
            rect,
            orderStart: fragmentOrderStart,
            orderEnd: fragmentOrderStart + 1,
          } satisfies LayoutFragment)
        : ({
            kind: "text",
            path: item.path,
            rect,
            startOffset: 0,
            endOffset: item.text.length,
            caretXs: caretXsForText(item.text, item.font, itemWidth),
            orderStart: fragmentOrderStart,
            orderEnd: fragmentOrderStart + item.text.length,
          } satisfies LayoutFragment);
    lineFragments.push(fragment);
    nextOrder = fragment.orderEnd;
    x += itemWidth;
  }

  flushLine();

  return { lines, nextOrder };
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

function textLayoutRectForBlock(
  block: Element,
  blockRect: DOMRect,
  fallbackWidth: number,
): DOMRect {
  const style = ownerWindow(block)?.getComputedStyle(block);
  const paddingLeft = cssPixels(style?.paddingLeft ?? "");
  const paddingRight = cssPixels(style?.paddingRight ?? "");
  const paddingTop = cssPixels(style?.paddingTop ?? "");
  const paddingBottom = cssPixels(style?.paddingBottom ?? "");
  const contentWidth =
    blockRect.width > 0
      ? Math.max(1, blockRect.width - paddingLeft - paddingRight)
      : fallbackWidth;
  const contentHeight =
    blockRect.height > 0
      ? Math.max(1, blockRect.height - paddingTop - paddingBottom)
      : blockRect.height;

  return makeRect(
    blockRect.left + paddingLeft,
    blockRect.top + paddingTop,
    contentWidth,
    contentHeight,
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

function layoutFragmentFromPretextFragment(
  source: InlineLayoutItem,
  fragmentText: string,
  rect: DOMRect,
  orderStart: number,
): LayoutFragment | null {
  if (source.kind === "atom") {
    return {
      kind: "atom",
      path: source.path,
      rect,
      orderStart,
      orderEnd: orderStart + 1,
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
    caretXs: caretXsForText(
      source.text.slice(range.startOffset, range.endOffset),
      source.font,
      rect.width,
    ),
    orderStart,
    orderEnd: orderStart + range.endOffset - range.startOffset,
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
): LayoutLine | null {
  const first = fragments[0];
  const last = fragments.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }

  return {
    blockPath,
    rect: unionRects(fragments.map((fragment) => fragment.rect)),
    start: pointForFragmentEdge(first, "before"),
    end: pointForFragmentEdge(last, "after"),
    fragments,
  };
}

function pointForFragmentEdge(
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

function rectForPoint(map: GeometryMap, point: CursorPoint): DOMRect | null {
  if (point.offset !== undefined) {
    const caret = textCaretFragmentForPoint(map, point);
    if (caret === null) {
      return null;
    }

    return caretRectForTextFragment(caret.fragment, caret.offset);
  }

  const figure = map.figures.get(point.path);
  if (figure !== undefined) {
    return rectForAtomEdge(figure, point.edge);
  }

  const blockLine = blockLineForPointEdge(map, point);
  if (blockLine !== null) {
    return rectForLineEdge(blockLine, point.edge);
  }

  for (const line of map.lines) {
    if (point.path === line.start.path && point.edge === "before") {
      return rectForLineEdge(line, "before");
    }
    if (point.path === line.end.path && point.edge === "after") {
      return rectForLineEdge(line, "after");
    }

    const atom = line.fragments.find(
      (fragment) => fragment.kind === "atom" && fragment.path === point.path,
    );
    if (atom !== undefined) {
      return rectForAtomEdge(atom.rect, point.edge);
    }
  }

  return null;
}

function rectsForRange(
  map: GeometryMap,
  anchor: CursorPoint,
  focus: CursorPoint,
): DOMRect[] {
  const anchorOrder = orderForPoint(map, anchor);
  const focusOrder = orderForPoint(map, focus);
  if (
    anchorOrder === null ||
    focusOrder === null ||
    anchorOrder === focusOrder
  ) {
    return [];
  }

  const start = Math.min(anchorOrder, focusOrder);
  const end = Math.max(anchorOrder, focusOrder);
  const rects: DOMRect[] = [];

  for (const line of map.lines) {
    for (const fragment of line.fragments) {
      if (fragment.kind !== "text") {
        continue;
      }
      const overlapStart = Math.max(start, fragment.orderStart);
      const overlapEnd = Math.min(end, fragment.orderEnd);
      if (overlapStart >= overlapEnd) {
        continue;
      }

      const startOffset =
        fragment.startOffset + overlapStart - fragment.orderStart;
      const endOffset = fragment.startOffset + overlapEnd - fragment.orderStart;
      rects.push(rectForTextFragmentRange(fragment, startOffset, endOffset));
    }
  }

  return rects;
}

function pointFromCoordinates(
  map: GeometryMap,
  x: number,
  y: number,
): CursorPoint | null {
  const figure = nearestFigure(map, x, y);
  const line = nearestLine(map, x, y);
  if (line === null) {
    if (figure !== null) {
      return pointForFigureCoordinate(figure.path, figure.rect, x);
    }
    return null;
  }

  if (
    figure !== null &&
    distanceToRect(x, y, figure.rect) < distanceToRect(x, y, line.rect)
  ) {
    return pointForFigureCoordinate(figure.path, figure.rect, x);
  }

  const first = line.fragments[0];
  const last = line.fragments.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }

  if (x <= first.rect.left) {
    return pointForFragmentEdge(first, "before");
  }
  if (x >= last.rect.right) {
    return pointForFragmentEdge(last, "after");
  }

  const fragment =
    line.fragments.find(
      (candidate) => x >= candidate.rect.left && x <= candidate.rect.right,
    ) ?? nearestFragment(line, x);
  if (fragment === null) {
    return null;
  }

  if (fragment.kind === "atom") {
    return {
      path: fragment.path,
      edge:
        x < fragment.rect.left + fragment.rect.width / 2 ? "before" : "after",
    };
  }

  return {
    path: fragment.path,
    offset: offsetForTextFragmentX(fragment, x),
  };
}

function pointForHorizontalMovement(
  map: GeometryMap,
  origin: CursorPoint,
  direction: "backward" | "forward",
): CursorPoint | null {
  if (origin.offset === undefined) {
    return null;
  }

  const line = lineForPoint(map, origin);
  if (line === null) {
    return null;
  }

  if (direction === "forward" && origin.affinity === "backward") {
    const last = line.fragments.at(-1);
    if (last?.kind === "text" && sameTextPoint(origin, line.end)) {
      const next = nextCollapsedTextFragment(map, last);
      return next === null
        ? null
        : { path: origin.path, offset: origin.offset, affinity: "forward" };
    }
  }

  if (direction === "backward" && origin.affinity === "forward") {
    const first = line.fragments[0];
    if (first?.kind === "text" && sameTextPoint(origin, line.start)) {
      const previous = previousCollapsedTextFragment(map, first);
      return previous === null ? null : pointForFragmentEdge(previous, "after");
    }
  }

  return null;
}

function pointForVerticalMovement(
  map: GeometryMap,
  origin: CursorPoint,
  x: number,
  direction: "up" | "down",
  distance: "line" | "page",
): CursorPoint | null {
  if (distance === "page") {
    const originRect = rectForPoint(map, origin);
    if (originRect === null) {
      return null;
    }

    const pageStep = Math.max(1, originRect.height * 10);
    const y =
      direction === "up"
        ? originRect.top - pageStep
        : originRect.bottom + pageStep;
    return pointFromCoordinates(map, x, y);
  }

  const rows = layoutRows(map);
  const originIndex = rowIndexForPoint(map, rows, origin);
  if (originIndex === null) {
    return null;
  }

  const targetIndex = direction === "up" ? originIndex - 1 : originIndex + 1;
  const targetRow = rows[targetIndex];
  if (targetRow === undefined) {
    return null;
  }

  return pointFromRowCoordinate(targetRow, x);
}

function layoutRows(map: GeometryMap): LayoutRow[] {
  return [
    ...map.lines.map(
      (line): LayoutRow => ({
        kind: "line",
        line,
        rect: line.rect,
      }),
    ),
    ...Array.from(
      map.figures.entries(),
      ([path, rect]): LayoutRow => ({
        kind: "figure",
        path,
        rect,
      }),
    ),
  ].sort((left, right) => {
    const topDifference = left.rect.top - right.rect.top;
    if (Math.abs(topDifference) > 0.5) {
      return topDifference;
    }

    return left.rect.left - right.rect.left;
  });
}

function rowIndexForPoint(
  map: GeometryMap,
  rows: LayoutRow[],
  point: CursorPoint,
): number | null {
  if (point.edge !== undefined && map.figures.has(point.path)) {
    const index = rows.findIndex(
      (row) => row.kind === "figure" && row.path === point.path,
    );
    return index >= 0 ? index : null;
  }

  const line = lineForPoint(map, point);
  if (line === null) {
    return null;
  }

  const index = rows.findIndex(
    (row) => row.kind === "line" && row.line === line,
  );
  return index >= 0 ? index : null;
}

function pointFromRowCoordinate(row: LayoutRow, x: number): CursorPoint | null {
  if (row.kind === "figure") {
    return pointForFigureCoordinate(row.path, row.rect, x);
  }

  return pointFromLineCoordinate(row.line, x);
}

function pointFromLineCoordinate(
  line: LayoutLine,
  x: number,
): CursorPoint | null {
  const first = line.fragments[0];
  const last = line.fragments.at(-1);
  if (first === undefined || last === undefined) {
    return null;
  }

  if (x <= first.rect.left) {
    return pointForFragmentEdge(first, "before");
  }
  if (x >= last.rect.right) {
    return pointForFragmentEdge(last, "after");
  }

  const fragment =
    line.fragments.find(
      (candidate) => x >= candidate.rect.left && x <= candidate.rect.right,
    ) ?? nearestFragment(line, x);
  if (fragment === null) {
    return null;
  }

  if (fragment.kind === "atom") {
    return {
      path: fragment.path,
      edge:
        x < fragment.rect.left + fragment.rect.width / 2 ? "before" : "after",
    };
  }

  return {
    path: fragment.path,
    offset: offsetForTextFragmentX(fragment, x),
  };
}

function lineForPoint(map: GeometryMap, point: CursorPoint): LayoutLine | null {
  if (point.offset !== undefined) {
    const caret = textCaretFragmentForPoint(map, point);
    return caret === null ? null : lineContainingFragment(map, caret.fragment);
  }

  const blockLine = blockLineForPointEdge(map, point);
  if (blockLine !== null) {
    return blockLine;
  }

  for (const line of map.lines) {
    if (
      line.start.path === point.path ||
      line.end.path === point.path ||
      line.fragments.some((fragment) => fragment.path === point.path)
    ) {
      return line;
    }
  }

  return null;
}

function lineContainingFragment(
  map: GeometryMap,
  target: LayoutFragment,
): LayoutLine | null {
  return (
    map.lines.find((line) =>
      line.fragments.some((fragment) => fragment === target),
    ) ?? null
  );
}

function textFragmentForPoint(
  map: GeometryMap,
  point: Extract<CursorPoint, { offset: number }>,
): TextLayoutFragment | null {
  let exactEndMatch: TextLayoutFragment | null = null;
  for (const line of map.lines) {
    for (const fragment of line.fragments) {
      if (fragment.kind !== "text" || fragment.path !== point.path) {
        continue;
      }
      if (
        point.offset >= fragment.startOffset &&
        point.offset < fragment.endOffset
      ) {
        return fragment;
      }
      if (point.offset === fragment.endOffset) {
        exactEndMatch = fragment;
      }
    }
  }

  return exactEndMatch;
}

function textCaretFragmentForPoint(
  map: GeometryMap,
  point: Extract<CursorPoint, { offset: number }>,
): TextCaretFragment | null {
  const fragment = textFragmentForPoint(map, point);
  if (fragment === null) {
    return null;
  }

  if (point.affinity !== "backward" && point.offset === fragment.endOffset) {
    const next = nextCollapsedTextFragment(map, fragment);
    if (next !== null) {
      return { fragment: next, offset: next.startOffset };
    }
  }

  return { fragment, offset: point.offset };
}

function nextCollapsedTextFragment(
  map: GeometryMap,
  current: TextLayoutFragment,
): TextLayoutFragment | null {
  for (const line of map.lines) {
    for (const fragment of line.fragments) {
      if (
        fragment.kind === "text" &&
        fragment !== current &&
        fragment.orderStart === current.orderEnd
      ) {
        return fragment;
      }
    }
  }

  return null;
}

function previousCollapsedTextFragment(
  map: GeometryMap,
  current: TextLayoutFragment,
): TextLayoutFragment | null {
  let previous: TextLayoutFragment | null = null;
  for (const line of map.lines) {
    for (const fragment of line.fragments) {
      if (fragment === current) {
        return previous?.orderEnd === current.orderStart ? previous : null;
      }
      if (fragment.kind === "text") {
        previous = fragment;
      }
    }
  }

  return null;
}

function sameTextPoint(left: CursorPoint, right: CursorPoint): boolean {
  return (
    left.offset !== undefined &&
    right.offset !== undefined &&
    left.path === right.path &&
    left.offset === right.offset
  );
}

function orderForPoint(map: GeometryMap, point: CursorPoint): number | null {
  if (point.offset !== undefined) {
    const fragment = textFragmentForPoint(map, point);
    if (fragment === null) {
      return null;
    }
    return fragment.orderStart + point.offset - fragment.startOffset;
  }

  const blockLine = blockLineForPointEdge(map, point);
  if (blockLine !== null) {
    const fragment = fragmentForLineEdge(blockLine, point.edge);
    if (fragment === null) {
      return null;
    }

    return point.edge === "before" ? fragment.orderStart : fragment.orderEnd;
  }

  for (const line of map.lines) {
    if (line.start.path === point.path && point.edge === "before") {
      return line.fragments[0]?.orderStart ?? null;
    }
    if (line.end.path === point.path && point.edge === "after") {
      return line.fragments.at(-1)?.orderEnd ?? null;
    }
    for (const fragment of line.fragments) {
      if (fragment.kind === "atom" && fragment.path === point.path) {
        return point.edge === "before"
          ? fragment.orderStart
          : fragment.orderEnd;
      }
    }
  }

  const figureIndex = Array.from(map.figures.keys()).indexOf(point.path);
  return figureIndex >= 0 ? Number.MAX_SAFE_INTEGER / 2 + figureIndex : null;
}

function blockLineForPointEdge(
  map: GeometryMap,
  point: Extract<CursorPoint, { edge: "before" | "after" }>,
): LayoutLine | null {
  const blockLines = map.lines.filter((line) => line.blockPath === point.path);
  if (blockLines.length === 0) {
    return null;
  }

  return point.edge === "before"
    ? (blockLines[0] ?? null)
    : (blockLines.at(-1) ?? null);
}

function rectForLineEdge(
  line: LayoutLine,
  edge: "before" | "after",
): DOMRect | null {
  const fragment = fragmentForLineEdge(line, edge);
  return fragment === null ? null : rectForFragmentEdge(fragment, edge);
}

function fragmentForLineEdge(
  line: LayoutLine,
  edge: "before" | "after",
): LayoutFragment | null {
  return (
    (edge === "before" ? line.fragments[0] : line.fragments.at(-1)) ?? null
  );
}

function rectForFragmentEdge(
  fragment: LayoutFragment,
  edge: "before" | "after",
): DOMRect {
  if (fragment.kind === "atom") {
    return rectForAtomEdge(fragment.rect, edge);
  }

  return caretRectForTextFragment(
    fragment,
    edge === "before" ? fragment.startOffset : fragment.endOffset,
  );
}

function caretRectForTextFragment(
  fragment: Extract<LayoutFragment, { kind: "text" }>,
  offset: number,
): DOMRect {
  const index = clamp(
    offset - fragment.startOffset,
    0,
    fragment.caretXs.length - 1,
  );

  return caretRectAt(
    fragment.rect.left + (fragment.caretXs[index] ?? 0),
    fragment.rect.top,
    fragment.rect.height,
  );
}

function rectForTextFragmentRange(
  fragment: Extract<LayoutFragment, { kind: "text" }>,
  startOffset: number,
  endOffset: number,
): DOMRect {
  const startIndex = clamp(
    startOffset - fragment.startOffset,
    0,
    fragment.caretXs.length - 1,
  );
  const endIndex = clamp(
    endOffset - fragment.startOffset,
    0,
    fragment.caretXs.length - 1,
  );
  const left = fragment.rect.left + (fragment.caretXs[startIndex] ?? 0);
  const right =
    fragment.rect.left + (fragment.caretXs[endIndex] ?? fragment.rect.width);

  return makeRect(
    left,
    fragment.rect.top,
    Math.max(1, right - left),
    fragment.rect.height,
  );
}

function offsetForTextFragmentX(
  fragment: Extract<LayoutFragment, { kind: "text" }>,
  x: number,
): number {
  const relativeX = clampNumber(x - fragment.rect.left, 0, fragment.rect.width);
  for (let index = 0; index < fragment.caretXs.length - 1; index += 1) {
    const left = fragment.caretXs[index] ?? 0;
    const right = fragment.caretXs[index + 1] ?? fragment.rect.width;
    if (relativeX < left + (right - left) / 2) {
      return fragment.startOffset + index;
    }
  }

  return fragment.endOffset;
}

function caretXsForText(
  text: string,
  font: string,
  targetWidth: number,
): number[] {
  if (text.length === 0) {
    return [0];
  }

  const graphemes = graphemeSlices(text);
  const measured = [0];
  let prefix = "";
  for (const grapheme of graphemes) {
    prefix += grapheme;
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

function graphemeSlices(text: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });

    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }

  return Array.from(text);
}

function measureTextWidth(text: string, font: string): number {
  const context = measureContext();
  if (context === null) {
    return text.length * 10;
  }

  context.font = font;

  return context.measureText(text).width;
}

function measureContext():
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null {
  if (isJsdomRuntime()) {
    return null;
  }

  const globalObject = globalThis as typeof globalThis & {
    OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvas;
  };
  if (typeof globalObject.OffscreenCanvas === "function") {
    return new globalObject.OffscreenCanvas(1, 1).getContext("2d");
  }

  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");

  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function canUsePretextMeasurement(): boolean {
  if (isJsdomRuntime()) {
    return false;
  }

  const globalObject = globalThis as typeof globalThis & {
    OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvas;
  };

  return (
    typeof globalObject.OffscreenCanvas === "function" ||
    typeof document !== "undefined"
  );
}

function isJsdomRuntime(): boolean {
  return typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
}

function fontForElement(element: Element): string {
  const style = ownerWindow(element)?.getComputedStyle(element);
  if (style === undefined) {
    return "16px sans-serif";
  }

  const font = style.font;
  if (font !== undefined && font !== "") {
    return font;
  }

  const fontSize = style.fontSize || "16px";
  const fontFamily = style.fontFamily || "sans-serif";
  const fontWeight = style.fontWeight || "400";
  const fontStyle = style.fontStyle || "normal";

  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

function primaryTextElement(element: Element): Element {
  const child = Array.from(element.children).find((candidate) =>
    candidate.matches(".rich-strong, .rich-emphasis, .rich-code, .rich-link"),
  );

  return child ?? element;
}

function lineHeightForElement(element: Element, rect: DOMRect): number {
  const style = ownerWindow(element)?.getComputedStyle(element);
  const parsed = Number.parseFloat(style?.lineHeight ?? "");
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  if (Number.isFinite(rect.height) && rect.height > 0) {
    return rect.height;
  }

  const fontSize = Number.parseFloat(style?.fontSize ?? "");
  if (Number.isFinite(fontSize) && fontSize > 0) {
    return fontSize * 1.2;
  }

  return Math.max(1, rect.height);
}

function inlineAtomExtraWidth(element: Element): number {
  const style = ownerWindow(element)?.getComputedStyle(element);
  if (style === undefined) {
    return 0;
  }

  return (
    cssPixels(style.paddingLeft) +
    cssPixels(style.paddingRight) +
    cssPixels(style.borderLeftWidth) +
    cssPixels(style.borderRightWidth)
  );
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function pageStepForRoot(root: ParentNode): number {
  if (root instanceof Element) {
    const clientHeight = root.clientHeight;
    if (Number.isFinite(clientHeight) && clientHeight > 0) {
      return clientHeight;
    }

    const rect = root.getBoundingClientRect();
    if (Number.isFinite(rect.height) && rect.height > 0) {
      return rect.height;
    }
  }

  const ownerDocument =
    root instanceof Document
      ? root
      : root instanceof Node
        ? root.ownerDocument
        : null;
  const viewportHeight = ownerDocument?.defaultView?.innerHeight;

  return viewportHeight !== undefined &&
    Number.isFinite(viewportHeight) &&
    viewportHeight > 0
    ? viewportHeight
    : 1;
}

function nearestLine(
  map: GeometryMap,
  x: number,
  y: number,
): LayoutLine | null {
  return nearestByDistance(map.lines, (line) =>
    distanceToRect(x, y, line.rect),
  );
}

function nearestFigure(
  map: GeometryMap,
  x: number,
  y: number,
): { path: string; rect: DOMRect } | null {
  return nearestByDistance(
    Array.from(map.figures.entries(), ([path, rect]) => ({ path, rect })),
    (figure) => distanceToRect(x, y, figure.rect),
  );
}

function nearestFragment(line: LayoutLine, x: number): LayoutFragment | null {
  return nearestByDistance(line.fragments, (fragment) =>
    x < fragment.rect.left
      ? fragment.rect.left - x
      : x > fragment.rect.right
        ? x - fragment.rect.right
        : 0,
  );
}

function nearestByDistance<T>(
  items: T[],
  distance: (item: T) => number,
): T | null {
  let nearest: { item: T; distance: number } | null = null;
  for (const item of items) {
    const nextDistance = distance(item);
    if (nearest === null || nextDistance < nearest.distance) {
      nearest = { item, distance: nextDistance };
    }
  }

  return nearest?.item ?? null;
}

function pointForFigureCoordinate(
  path: string,
  rect: DOMRect,
  x: number,
): CursorPoint {
  return {
    path,
    edge: x < rect.left + rect.width / 2 ? "before" : "after",
  };
}

function rectForAtomEdge(rect: DOMRect, edge: "before" | "after"): DOMRect {
  return caretRectAt(
    edge === "before" ? rect.left : rect.right,
    rect.top,
    rect.height,
  );
}

function caretRectAt(left: number, top: number, height: number): DOMRect {
  return makeRect(left, top, 1, height);
}

function unionRects(rects: DOMRect[]): DOMRect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return makeRect(left, top, right - left, bottom - top);
}

function isTopLevelCursorBlock(element: Element): boolean {
  return /^\/blocks\/\d+$/.test(element.getAttribute("data-path") ?? "");
}

function isBlockAtom(element: Element): boolean {
  return (
    element.tagName === "FIGURE" || element.classList.contains("figure-block")
  );
}

function isTextBlockElement(element: Element): boolean {
  return (
    element.classList.contains("text-block") ||
    element.classList.contains("paragraph-block") ||
    element.classList.contains("heading-block") ||
    element.classList.contains("quote-block") ||
    element.classList.contains("list-item-block") ||
    element.classList.contains("code-block")
  );
}

function isInlineAtom(element: Element): boolean {
  return element.classList.contains("mention-chip");
}

function ownerWindow(element: Element): Window | null {
  return element.ownerDocument.defaultView;
}

function distanceToRect(x: number, y: number, rect: DOMRect): number {
  const dx =
    x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
  const dy =
    y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;

  return Math.hypot(dx, dy);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function cloneRect(rect: DOMRect | DOMRectReadOnly): DOMRect {
  return makeRect(rect.left, rect.top, rect.width, rect.height);
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
