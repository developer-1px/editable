import type { Pointer } from "@interactive-os/json-document";
import {
  ATOM_REPLACEMENT,
  clampOffset,
  createRichDocument,
  richTextPathForBlock,
  type RichBlock,
  type RichDocument,
} from "../model";

export type RichVisualLineKind = "text" | "empty" | "atom-only";

export type RichVisualCaretMetric = {
  offset: number;
  x: number;
};

export type RichVisualLineSeed = {
  id: string;
  blockId: string;
  blockIndex: number;
  path: Pointer;
  startOffset: number;
  endOffset: number;
  kind: RichVisualLineKind;
  lineIndex: number;
  caretMetrics?: ReadonlyArray<RichVisualCaretMetric>;
};

export type RichCursorAffinity = "before" | "after";
export type RichCursorDirection = "backward" | "forward" | "up" | "down";
export type RichCursorMoveUnit =
  | "grapheme"
  | "word"
  | "lineBoundary"
  | "visualLine"
  | "documentBoundary";

export type RichCursorMoveCommand = {
  unit: RichCursorMoveUnit;
  direction: RichCursorDirection;
  extend?: boolean;
};

export type RichCursorVisualAffinityEdge = "start" | "end" | "inside";

export type RichCursorVisualAffinity = {
  lineId: string;
  lineIndex: number;
  lineOrder: number;
  edge: RichCursorVisualAffinityEdge;
  column: number;
};

export type RichCursorPoint = {
  blockId: string;
  path: Pointer;
  offset: number;
  affinity: RichCursorAffinity;
  order: number;
  visualAffinity: RichCursorVisualAffinity | null;
};

export type RichVirtualSelection = {
  anchor: RichCursorPoint;
  focus: RichCursorPoint;
  goalX: number | null;
};

export type RichVirtualSelectionRange = {
  anchor: RichCursorPoint;
  focus: RichCursorPoint;
  start: RichCursorPoint;
  end: RichCursorPoint;
  collapsed: boolean;
  direction: "none" | "forward" | "backward";
};

export type RichCursorWord = {
  blockId: string;
  path: Pointer;
  startOffset: number;
  endOffset: number;
};

export type RichCursorBlockFrame = {
  blockId: string;
  blockIndex: number;
  path: Pointer;
  textLength: number;
  caretOffsets: number[];
  words: RichCursorWord[];
};

export type RichCursorLineFrame = {
  id: string;
  blockId: string;
  blockIndex: number;
  path: Pointer;
  lineIndex: number;
  order: number;
  startOffset: number;
  endOffset: number;
  carets: RichCursorCaret[];
};

export type RichCursorCaret = RichCursorPoint & {
  lineId: string;
  lineIndex: number;
  lineOrder: number;
  column: number;
  x: number;
  y: number;
  atomId: string | null;
  isLineStart: boolean;
  isLineEnd: boolean;
};

export type RichCursorFrame = {
  documentId: string;
  blocks: RichCursorBlockFrame[];
  lines: RichCursorLineFrame[];
  carets: RichCursorCaret[];
};

export type RichCursorFrameOptions = {
  lineSeeds?: ReadonlyArray<RichVisualLineSeed>;
};

export function createRichVisualLineSeeds(
  document: RichDocument,
): RichVisualLineSeed[] {
  const seeds: RichVisualLineSeed[] = [];
  document.blocks.forEach((block, blockIndex) => {
    const path = richTextPathForBlock(blockIndex);
    let lineIndex = 0;
    let startOffset = 0;
    for (let offset = 0; offset < block.text.length; offset += 1) {
      if (block.text[offset] !== "\n") {
        continue;
      }
      seeds.push(
        createRichVisualLineSeed(block, blockIndex, path, lineIndex, startOffset, offset),
      );
      lineIndex += 1;
      startOffset = offset + 1;
    }
    seeds.push(
      createRichVisualLineSeed(
        block,
        blockIndex,
        path,
        lineIndex,
        startOffset,
        block.text.length,
      ),
    );
  });
  return seeds;
}

function createRichVisualLineSeed(
  block: RichBlock,
  blockIndex: number,
  path: Pointer,
  lineIndex: number,
  startOffset: number,
  endOffset: number,
): RichVisualLineSeed {
  return {
    id: `${block.id}:line:${lineIndex}:${startOffset}-${endOffset}`,
    blockId: block.id,
    blockIndex,
    path,
    startOffset,
    endOffset,
    kind: richVisualLineKind(block.text.slice(startOffset, endOffset)),
    lineIndex,
  };
}

function richVisualLineKind(text: string): RichVisualLineKind {
  if (text.length === 0) {
    return "empty";
  }
  return Array.from(text).every((character) => character === ATOM_REPLACEMENT)
    ? "atom-only"
    : "text";
}

export function createRichCursorFrame(
  document: RichDocument,
  options: RichCursorFrameOptions = {},
): RichCursorFrame {
  const blocks: RichCursorBlockFrame[] = [];
  const lines: RichCursorLineFrame[] = [];
  const carets: RichCursorCaret[] = [];
  const lineSeeds = options.lineSeeds ?? createRichVisualLineSeeds(document);
  const lineSeedsByBlock = new Map<string, RichVisualLineSeed[]>();
  for (const seed of lineSeeds) {
    const key = `${seed.blockId}:${seed.path}`;
    const current = lineSeedsByBlock.get(key);
    if (current === undefined) {
      lineSeedsByBlock.set(key, [seed]);
    } else {
      current.push(seed);
    }
  }
  let lineOrder = 0;

  document.blocks.forEach((block, blockIndex) => {
    const path = richTextPathForBlock(blockIndex);
    const caretOffsets = richGraphemeBoundaryOffsets(block.text);
    const words = richWordSegments(block.text).map((word) => ({
      blockId: block.id,
      path,
      startOffset: word.startOffset,
      endOffset: word.endOffset,
    }));
    blocks.push({
      blockId: block.id,
      blockIndex,
      path,
      textLength: block.text.length,
      caretOffsets,
      words,
    });

    const blockLineSeeds =
      lineSeedsByBlock.get(`${block.id}:${path}`) ??
      createRichVisualLineSeeds(createRichDocument({ id: document.id, blocks: [block] }))
        .map((seed) => ({
          ...seed,
          blockIndex,
          path,
        }));
    const sortedLineSeeds = [...blockLineSeeds].sort(
      (left, right) =>
        left.lineIndex - right.lineIndex ||
        left.startOffset - right.startOffset ||
        left.endOffset - right.endOffset,
    );
    sortedLineSeeds.forEach((seed, fallbackLineIndex) => {
      appendRichCursorLine({
        block,
        blockIndex,
        path,
        caretMetrics: seed.caretMetrics,
        lineIndex: seed.lineIndex ?? fallbackLineIndex,
        lineOrder,
        startOffset: Math.max(0, Math.min(seed.startOffset, block.text.length)),
        endOffset: Math.max(0, Math.min(seed.endOffset, block.text.length)),
        caretOffsets,
        carets,
        lines,
      });
      lineOrder += 1;
    });
  });

  return {
    documentId: document.id,
    blocks,
    lines,
    carets,
  };
}

export function richCursorPointAt(
  frame: RichCursorFrame,
  path: Pointer,
  offset: number,
  affinity: RichCursorAffinity = "after",
): RichCursorPoint | null {
  const block = frame.blocks.find((candidate) => candidate.path === path);
  if (block === undefined) {
    return null;
  }
  const caret = closestRichCaretInBlock(frame, block, offset, affinity);
  return caret === null ? null : richCursorPointFromCaret(caret, affinity);
}

export function richCursorSelectionAt(
  frame: RichCursorFrame,
  path: Pointer,
  offset: number,
  affinity: RichCursorAffinity = "after",
): RichVirtualSelection | null {
  const point = richCursorPointAt(frame, path, offset, affinity);
  if (point === null) {
    return null;
  }
  return {
    anchor: point,
    focus: point,
    goalX: null,
  };
}

export function recoverRichVirtualSelection(
  frame: RichCursorFrame,
  selection: RichVirtualSelection,
): RichVirtualSelection {
  return {
    anchor: recoverRichCursorPoint(frame, selection.anchor),
    focus: recoverRichCursorPoint(frame, selection.focus),
    goalX: selection.goalX,
  };
}

export function richVirtualSelectionRange(
  frame: RichCursorFrame,
  selection: RichVirtualSelection,
): RichVirtualSelectionRange {
  const recovered = recoverRichVirtualSelection(frame, selection);
  const direction =
    recovered.anchor.order === recovered.focus.order
      ? "none"
      : recovered.anchor.order < recovered.focus.order
        ? "forward"
        : "backward";
  const [start, end] =
    recovered.anchor.order <= recovered.focus.order
      ? [recovered.anchor, recovered.focus]
      : [recovered.focus, recovered.anchor];
  return {
    anchor: recovered.anchor,
    focus: recovered.focus,
    start,
    end,
    collapsed: start.order === end.order,
    direction,
  };
}

export function moveRichVirtualSelection(
  frame: RichCursorFrame,
  selection: RichVirtualSelection,
  command: RichCursorMoveCommand,
): RichVirtualSelection {
  if (frame.carets.length === 0) {
    return selection;
  }

  const recovered = recoverRichVirtualSelection(frame, selection);
  const range = richVirtualSelectionRange(frame, recovered);
  const focus = richCaretForPoint(frame, recovered.focus);
  if (focus === null) {
    return recovered;
  }

  const extend = command.extend === true;
  const collapseTarget =
    !extend && !range.collapsed && collapsesRangeBeforeMove(command)
      ? command.direction === "backward"
        ? richCaretForPoint(frame, range.start)
        : richCaretForPoint(frame, range.end)
      : null;
  const target =
    collapseTarget ??
    richCursorMoveTarget(frame, focus, recovered.goalX, command);
  if (target === null) {
    return recovered;
  }

  const nextFocus = richCursorPointFromCaret(target);
  return {
    anchor: extend ? recovered.anchor : nextFocus,
    focus: nextFocus,
    goalX:
      command.unit === "visualLine"
        ? recovered.goalX ?? focus.x
        : null,
  };
}


type SegmenterGranularity = "grapheme" | "word";
type SegmenterSegment = {
  segment: string;
  index: number;
  isWordLike?: boolean;
};
type SegmenterLike = {
  segment(input: string): Iterable<SegmenterSegment>;
};
type IntlWithSegmenter = typeof Intl & {
  Segmenter?: new (
    locale?: string | string[],
    options?: { granularity: SegmenterGranularity },
  ) => SegmenterLike;
};

function appendRichCursorLine({
  block,
  blockIndex,
  caretMetrics,
  path,
  lineIndex,
  lineOrder,
  startOffset,
  endOffset,
  caretOffsets,
  carets,
  lines,
}: {
  block: RichBlock;
  blockIndex: number;
  caretMetrics?: ReadonlyArray<RichVisualCaretMetric>;
  path: Pointer;
  lineIndex: number;
  lineOrder: number;
  startOffset: number;
  endOffset: number;
  caretOffsets: number[];
  carets: RichCursorCaret[];
  lines: RichCursorLineFrame[];
}): void {
  const lineCarets: RichCursorCaret[] = [];
  const lineId = `${block.id}:cursor-line:${lineIndex}:${startOffset}-${endOffset}`;
  const offsets = caretOffsets.filter(
    (offset) => startOffset <= offset && offset <= endOffset,
  );
  const measuredXByOffset = richMeasuredCaretXByOffset(caretMetrics);
  offsets.forEach((offset, column) => {
    const isLineStart = offset === startOffset;
    const isLineEnd = offset === endOffset;
    const x = measuredXByOffset.get(offset) ?? column;
    const caret: RichCursorCaret = {
      blockId: block.id,
      path,
      offset,
      affinity: "after",
      order: carets.length,
      visualAffinity: {
        lineId,
        lineIndex,
        lineOrder,
        edge: richCursorVisualAffinityEdge(isLineStart, isLineEnd),
        column,
      },
      lineId,
      lineIndex,
      lineOrder,
      column,
      x,
      y: lineOrder,
      atomId: atomAtCaretOffset(block, offset),
      isLineStart,
      isLineEnd,
    };
    carets.push(caret);
    lineCarets.push(caret);
  });
  lines.push({
    id: lineId,
    blockId: block.id,
    blockIndex,
    path,
    lineIndex,
    order: lineOrder,
    startOffset,
    endOffset,
    carets: lineCarets,
  });
}

function richMeasuredCaretXByOffset(
  caretMetrics: ReadonlyArray<RichVisualCaretMetric> | undefined,
): Map<number, number> {
  const measuredXByOffset = new Map<number, number>();
  if (caretMetrics === undefined) {
    return measuredXByOffset;
  }
  for (const metric of caretMetrics) {
    if (Number.isFinite(metric.offset) && Number.isFinite(metric.x)) {
      measuredXByOffset.set(metric.offset, metric.x);
    }
  }
  return measuredXByOffset;
}

function richGraphemeBoundaryOffsets(text: string): number[] {
  const offsets = new Set([0, text.length]);
  const segments = segmentRichText(text, "grapheme");
  for (const segment of segments) {
    offsets.add(segment.index);
    offsets.add(segment.index + segment.segment.length);
  }
  return sortedOffsets(offsets);
}

function richWordSegments(
  text: string,
): Array<{ startOffset: number; endOffset: number }> {
  const segments = segmentRichText(text, "word");
  return Array.from(segments)
    .filter((segment) => segment.isWordLike === true)
    .map((segment) => ({
      startOffset: segment.index,
      endOffset: segment.index + segment.segment.length,
    }));
}

function segmentRichText(
  text: string,
  granularity: SegmenterGranularity,
): Iterable<SegmenterSegment> {
  const Segmenter = (Intl as IntlWithSegmenter).Segmenter;
  if (Segmenter === undefined) {
    throw new Error("Intl.Segmenter is required for rich cursor navigation.");
  }
  return new Segmenter(undefined, { granularity }).segment(text);
}

function sortedOffsets(offsets: Set<number>): number[] {
  return Array.from(offsets).sort((left, right) => left - right);
}

function atomAtCaretOffset(block: RichBlock, offset: number): string | null {
  for (const [id, atom] of Object.entries(block.atoms)) {
    if (offset === atom.offset || offset === atom.offset + 1) {
      return id;
    }
  }
  return null;
}

function richCursorPointFromCaret(
  caret: RichCursorCaret,
  affinity: RichCursorAffinity = caret.affinity,
): RichCursorPoint {
  return {
    blockId: caret.blockId,
    path: caret.path,
    offset: caret.offset,
    affinity,
    order: caret.order,
    visualAffinity: richCursorVisualAffinityFromCaret(caret),
  };
}

function richCursorVisualAffinityFromCaret(
  caret: Pick<
    RichCursorCaret,
    "column" | "isLineEnd" | "isLineStart" | "lineId" | "lineIndex" | "lineOrder"
  >,
): RichCursorVisualAffinity {
  return {
    lineId: caret.lineId,
    lineIndex: caret.lineIndex,
    lineOrder: caret.lineOrder,
    edge: richCursorVisualAffinityEdge(caret.isLineStart, caret.isLineEnd),
    column: caret.column,
  };
}

function richCursorVisualAffinityEdge(
  isLineStart: boolean,
  isLineEnd: boolean,
): RichCursorVisualAffinityEdge {
  if (isLineStart && !isLineEnd) {
    return "start";
  }
  if (isLineEnd && !isLineStart) {
    return "end";
  }
  return "inside";
}

function recoverRichCursorPoint(
  frame: RichCursorFrame,
  point: RichCursorPoint,
): RichCursorPoint {
  const block =
    frame.blocks.find((candidate) => candidate.blockId === point.blockId) ??
    frame.blocks.find((candidate) => candidate.path === point.path);
  if (block !== undefined) {
    const caret = closestRichCaretInBlock(
      frame,
      block,
      point.offset,
      point.affinity,
      point.visualAffinity ?? null,
    );
    if (caret !== null) {
      return richCursorPointFromCaret(caret, point.affinity);
    }
  }

  const nearest = closestRichCaretByOrder(frame, point.order);
  return nearest === null ? point : richCursorPointFromCaret(nearest, point.affinity);
}

function closestRichCaretInBlock(
  frame: RichCursorFrame,
  block: RichCursorBlockFrame,
  offset: number,
  affinity: RichCursorAffinity,
  visualAffinity: RichCursorVisualAffinity | null = null,
): RichCursorCaret | null {
  const clamped = clampOffset(offset, block.textLength);
  const blockCarets = frame.carets.filter(
    (caret) => caret.blockId === block.blockId,
  );
  if (blockCarets.length === 0) {
    return null;
  }

  let bestDistance = Number.POSITIVE_INFINITY;
  let candidates: RichCursorCaret[] = [];
  for (const caret of blockCarets) {
    const distance = Math.abs(caret.offset - clamped);
    if (distance < bestDistance) {
      bestDistance = distance;
      candidates = [caret];
      continue;
    }
    if (distance === bestDistance) {
      candidates.push(caret);
    }
  }
  return preferredRichCaretCandidate(candidates, affinity, visualAffinity);
}

function closestRichCaretByOrder(
  frame: RichCursorFrame,
  order: number,
): RichCursorCaret | null {
  if (frame.carets.length === 0) {
    return null;
  }
  const clamped = clampOffset(order, frame.carets.length - 1);
  return frame.carets[clamped] ?? null;
}

function richCaretForPoint(
  frame: RichCursorFrame,
  point: RichCursorPoint,
): RichCursorCaret | null {
  const exact = preferredRichCaretCandidate(
    frame.carets.filter(
      (caret) =>
        caret.blockId === point.blockId &&
        caret.path === point.path &&
        caret.offset === point.offset,
    ),
    point.affinity,
    point.visualAffinity ?? null,
  );
  if (exact !== null) {
    return exact;
  }
  const block =
    frame.blocks.find((candidate) => candidate.blockId === point.blockId) ??
    frame.blocks.find((candidate) => candidate.path === point.path);
  return block === undefined
    ? closestRichCaretByOrder(frame, point.order)
    : closestRichCaretInBlock(
        frame,
        block,
        point.offset,
        point.affinity,
        point.visualAffinity ?? null,
      );
}

function preferredRichCaretCandidate(
  candidates: RichCursorCaret[],
  affinity: RichCursorAffinity,
  visualAffinity: RichCursorVisualAffinity | null,
): RichCursorCaret | null {
  if (candidates.length === 0) {
    return null;
  }
  if (visualAffinity !== null) {
    const sameLineId = candidates.find(
      (caret) => caret.lineId === visualAffinity.lineId,
    );
    if (sameLineId !== undefined) {
      return sameLineId;
    }

    const sameLineOrderAndEdge = candidates.find(
      (caret) =>
        caret.lineOrder === visualAffinity.lineOrder &&
        richCursorVisualAffinityFromCaret(caret).edge === visualAffinity.edge,
    );
    if (sameLineOrderAndEdge !== undefined) {
      return sameLineOrderAndEdge;
    }

    const sameLineIndexAndEdge = candidates.find(
      (caret) =>
        caret.lineIndex === visualAffinity.lineIndex &&
        richCursorVisualAffinityFromCaret(caret).edge === visualAffinity.edge,
    );
    if (sameLineIndexAndEdge !== undefined) {
      return sameLineIndexAndEdge;
    }

    const sameLineOrder = candidates.find(
      (caret) => caret.lineOrder === visualAffinity.lineOrder,
    );
    if (sameLineOrder !== undefined) {
      return sameLineOrder;
    }

    const sameLineIndex = candidates.find(
      (caret) => caret.lineIndex === visualAffinity.lineIndex,
    );
    if (sameLineIndex !== undefined) {
      return sameLineIndex;
    }

    const sameEdge = candidates.find(
      (caret) =>
        richCursorVisualAffinityFromCaret(caret).edge === visualAffinity.edge,
    );
    if (sameEdge !== undefined) {
      return sameEdge;
    }
  }

  const affinityEdge: RichCursorVisualAffinityEdge =
    affinity === "before" ? "end" : "start";
  const sameAffinityEdge = candidates.find(
    (caret) => richCursorVisualAffinityFromCaret(caret).edge === affinityEdge,
  );
  return sameAffinityEdge ?? candidates[0] ?? null;
}

function collapsesRangeBeforeMove(command: RichCursorMoveCommand): boolean {
  return (
    (command.unit === "grapheme" || command.unit === "word") &&
    (command.direction === "backward" || command.direction === "forward")
  );
}

function richCursorMoveTarget(
  frame: RichCursorFrame,
  focus: RichCursorCaret,
  goalX: number | null,
  command: RichCursorMoveCommand,
): RichCursorCaret | null {
  if (command.unit === "grapheme") {
    return moveRichCaretByOrder(frame, focus, command.direction);
  }
  if (command.unit === "word") {
    return moveRichCaretByWord(frame, focus, command.direction);
  }
  if (command.unit === "lineBoundary") {
    return moveRichCaretToLineBoundary(frame, focus, command.direction);
  }
  if (command.unit === "visualLine") {
    return moveRichCaretByVisualLine(frame, focus, goalX, command.direction);
  }
  if (command.unit === "documentBoundary") {
    return moveRichCaretToDocumentBoundary(frame, command.direction);
  }
  return null;
}

function moveRichCaretByOrder(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction === "backward") {
    return frame.carets[Math.max(0, caret.order - 1)] ?? null;
  }
  if (direction === "forward") {
    return frame.carets[Math.min(frame.carets.length - 1, caret.order + 1)] ?? null;
  }
  return caret;
}

function moveRichCaretByWord(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction !== "backward" && direction !== "forward") {
    return caret;
  }
  const blockIndex = frame.blocks.findIndex(
    (block) => block.blockId === caret.blockId,
  );
  if (blockIndex < 0) {
    return caret;
  }

  if (direction === "forward") {
    for (let index = blockIndex; index < frame.blocks.length; index += 1) {
      const block = frame.blocks[index];
      const offset = index === blockIndex ? caret.offset : 0;
      const word = block?.words.find(
        (candidate) => candidate.endOffset > offset,
      );
      if (block !== undefined && word !== undefined) {
        return closestRichCaretInBlock(frame, block, word.endOffset, "after");
      }
    }
    return frame.carets.at(-1) ?? null;
  }

  for (let index = blockIndex; index >= 0; index -= 1) {
    const block = frame.blocks[index];
    if (block === undefined) {
      continue;
    }
    const offset = index === blockIndex ? caret.offset : block.textLength;
    const word = [...block.words]
      .reverse()
      .find((candidate) => candidate.startOffset < offset);
    if (word !== undefined) {
      return closestRichCaretInBlock(frame, block, word.startOffset, "before");
    }
  }
  return frame.carets[0] ?? null;
}

function moveRichCaretToLineBoundary(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  const line = frame.lines.find((candidate) => candidate.id === caret.lineId);
  if (line === undefined || line.carets.length === 0) {
    return caret;
  }
  if (direction === "backward") {
    return line.carets[0] ?? null;
  }
  if (direction === "forward") {
    return line.carets.at(-1) ?? null;
  }
  return caret;
}

function moveRichCaretByVisualLine(
  frame: RichCursorFrame,
  caret: RichCursorCaret,
  goalX: number | null,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction !== "up" && direction !== "down") {
    return caret;
  }
  const targetLine = frame.lines.find(
    (line) => line.order === caret.lineOrder + (direction === "up" ? -1 : 1),
  );
  if (targetLine === undefined || targetLine.carets.length === 0) {
    return caret;
  }
  const x = goalX ?? caret.x;
  return targetLine.carets.reduce((best, candidate) => {
    const bestDistance = Math.abs(best.x - x);
    const candidateDistance = Math.abs(candidate.x - x);
    if (candidateDistance < bestDistance) {
      return candidate;
    }
    if (candidateDistance > bestDistance) {
      return best;
    }
    return candidate.x < best.x ? candidate : best;
  });
}

function moveRichCaretToDocumentBoundary(
  frame: RichCursorFrame,
  direction: RichCursorDirection,
): RichCursorCaret | null {
  if (direction === "backward") {
    return frame.carets[0] ?? null;
  }
  if (direction === "forward") {
    return frame.carets.at(-1) ?? null;
  }
  return null;
}
