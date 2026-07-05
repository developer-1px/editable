import type { Pointer } from "@interactive-os/json-document";
import {
  richBlockIndexFromTextPath,
  type RichDocument,
  type RichVisualLineSeed,
} from "../../kernel";
import type {
  InternalProjectionProvider,
  InternalVisualCaret,
  InternalVisualLayout,
  InternalVisualLine,
  InternalVisualLineKind,
  InternalVisualLineSeed,
  InternalVisualLayoutOptions,
  VisualLayout,
  VisualLayoutOptions,
} from "../contract";
import {
  JSON_ATOM_ATTRIBUTE,
  JSON_ATOM_REPLACEMENT,
  JSON_TEXT_ATTRIBUTE,
} from "../contract";
import {
  editableTextContent,
  textDOMPositionForOffset,
} from "./domText";
import type { TextOffsetMapper } from "./selection";

export function measureVisualLayout({
  atomAttribute,
  lineSeeds = null,
  mapper,
  root,
  textAttribute,
}: {
  atomAttribute: string;
  lineSeeds?: ReadonlyArray<InternalVisualLineSeed> | null;
  mapper: TextOffsetMapper | null;
  root: HTMLElement;
  textAttribute: string;
}): InternalVisualLayout | null {
  const lines: InternalVisualLine[] = [];
  const seedsByPath = lineSeedsByTextPath(lineSeeds);
  for (const element of textSurfaceElements(root, textAttribute)) {
    const path = element.getAttribute(textAttribute);
    if (path === null) {
      continue;
    }

    const editableText = editableTextContent(element, atomAttribute);
    const seeds =
      seedsByPath.get(path) ??
      hardLineSeedsFromEditableText(path, editableText, mapper);
    for (const seed of seeds) {
      const measured = measureSeedLine({
        atomAttribute,
        editableText,
        element,
        mapper,
        previousLines: lines,
        seed,
      });
      lines.push(...measured);
    }
  }

  const sorted = lines.sort(compareVisualLines);
  return sorted.length === 0 ? null : { lines: sorted };
}

export function measureInternalVisualLayout<T>({
  atomAttribute = JSON_ATOM_ATTRIBUTE,
  lineSeeds = null,
  projection = null,
  root,
  textAttribute = JSON_TEXT_ATTRIBUTE,
}: InternalVisualLayoutOptions<T>): InternalVisualLayout | null {
  return measureVisualLayout({
    atomAttribute,
    lineSeeds,
    mapper: offsetMapperFromProjection(projection),
    root,
    textAttribute,
  });
}

export function measureEditableVisualLayout({
  lineSeeds = null,
  projection = null,
  root,
}: VisualLayoutOptions): VisualLayout | null {
  return measureInternalVisualLayout<RichDocument>({
    atomAttribute: JSON_ATOM_ATTRIBUTE,
    lineSeeds,
    projection,
    root,
    textAttribute: JSON_TEXT_ATTRIBUTE,
  });
}

export function richVisualLineSeedsFromMeasuredLayout(
  document: RichDocument,
  layout: InternalVisualLayout,
): RichVisualLineSeed[] {
  const seeds: RichVisualLineSeed[] = [];
  const lineIndexByBlock = new Map<string, number>();
  for (const line of layout.lines) {
    const blockIndex = richBlockIndexFromTextPath(line.path);
    const block = blockIndex === null ? undefined : document.blocks[blockIndex];
    if (blockIndex === null || block === undefined) {
      continue;
    }
    const lineIndex = lineIndexByBlock.get(block.id) ?? 0;
    lineIndexByBlock.set(block.id, lineIndex + 1);
    seeds.push({
      id: line.id,
      blockId: block.id,
      blockIndex,
      path: line.path,
      startOffset: line.startOffset,
      endOffset: line.endOffset,
      kind: line.kind,
      lineIndex,
      caretMetrics: line.carets.map((caret) => ({
        offset: caret.offset,
        x: caret.x,
      })),
    });
  }
  return seeds;
}

function offsetMapperFromProjection<T>(
  projection: InternalProjectionProvider<T> | null,
): TextOffsetMapper | null {
  return projection === null
    ? null
    : {
        editableOffsetToDocumentOffset(path, offset) {
          return projection(path)?.editableOffsetToDocumentOffset(offset) ?? offset;
        },
        documentOffsetToEditableOffset(path, offset) {
          return projection(path)?.documentOffsetToEditableOffset(offset) ?? offset;
        },
      };
}

function lineSeedsByTextPath(
  lineSeeds: ReadonlyArray<InternalVisualLineSeed> | null,
): Map<Pointer, InternalVisualLineSeed[]> {
  const grouped = new Map<Pointer, InternalVisualLineSeed[]>();
  for (const seed of lineSeeds ?? []) {
    const seeds = grouped.get(seed.path) ?? [];
    seeds.push(seed);
    grouped.set(seed.path, seeds);
  }
  for (const seeds of grouped.values()) {
    seeds.sort((left, right) => {
      if ((left.lineIndex ?? 0) !== (right.lineIndex ?? 0)) {
        return (left.lineIndex ?? 0) - (right.lineIndex ?? 0);
      }
      return left.startOffset - right.startOffset;
    });
  }
  return grouped;
}

function textSurfaceElements(
  root: HTMLElement,
  textAttribute: string,
): HTMLElement[] {
  const elements: HTMLElement[] = [];
  if (root.hasAttribute(textAttribute)) {
    elements.push(root);
  }
  for (const element of Array.from(root.querySelectorAll(`[${textAttribute}]`))) {
    if (element instanceof HTMLElement) {
      elements.push(element);
    }
  }
  return elements;
}

function hardLineSeedsFromEditableText(
  path: Pointer,
  editableText: string,
  mapper: TextOffsetMapper | null,
): InternalVisualLineSeed[] {
  const seeds: InternalVisualLineSeed[] = [];
  let lineIndex = 0;
  let start = 0;
  for (let index = 0; index < editableText.length; index += 1) {
    if (editableText[index] !== "\n") {
      continue;
    }
    seeds.push(createFallbackSeed(path, lineIndex, start, index, editableText, mapper));
    lineIndex += 1;
    start = index + 1;
  }
  seeds.push(
    createFallbackSeed(path, lineIndex, start, editableText.length, editableText, mapper),
  );
  return seeds;
}

function createFallbackSeed(
  path: Pointer,
  lineIndex: number,
  editableStart: number,
  editableEnd: number,
  editableText: string,
  mapper: TextOffsetMapper | null,
): InternalVisualLineSeed {
  const startOffset =
    mapper?.editableOffsetToDocumentOffset(path, editableStart) ?? editableStart;
  const endOffset =
    mapper?.editableOffsetToDocumentOffset(path, editableEnd) ?? editableEnd;
  return {
    id: `${path}:line:${lineIndex}:${startOffset}-${endOffset}`,
    path,
    startOffset,
    endOffset,
    kind: visualLineKind(editableText.slice(editableStart, editableEnd)),
    lineIndex,
  };
}

function visualLineKind(text: string): InternalVisualLineKind {
  if (text.length === 0) {
    return "empty";
  }
  return Array.from(text).every((character) => character === JSON_ATOM_REPLACEMENT)
    ? "atom-only"
    : "text";
}

function measureSeedLine({
  atomAttribute,
  editableText,
  element,
  mapper,
  previousLines,
  seed,
}: {
  atomAttribute: string;
  editableText: string;
  element: HTMLElement;
  mapper: TextOffsetMapper | null;
  previousLines: ReadonlyArray<InternalVisualLine>;
  seed: InternalVisualLineSeed;
}): InternalVisualLine[] {
  const startEditable = clampOffset(
    mapper?.documentOffsetToEditableOffset(seed.path, seed.startOffset) ??
      seed.startOffset,
    editableText.length,
  );
  const endEditable = clampOffset(
    mapper?.documentOffsetToEditableOffset(seed.path, seed.endOffset) ??
      seed.endOffset,
    editableText.length,
  );
  const start = Math.min(startEditable, endEditable);
  const end = Math.max(startEditable, endEditable);
  const carets: InternalVisualCaret[] = [];
  for (let editableOffset = start; editableOffset <= end; editableOffset += 1) {
    const caret = measureCaret({
      atomAttribute,
      editableText,
      editableOffset,
      element,
      mapper,
      path: seed.path,
    });
    if (caret !== null) {
      carets.push(caret);
    }
  }

  const grouped = groupCaretsIntoLines(seed, carets);
  if (grouped.length > 0) {
    return grouped;
  }

  return [
    synthesizeLineFromSeed({
      editableOffset: start,
      element,
      previousLines,
      seed,
    }),
  ];
}

function measureCaret({
  atomAttribute,
  editableText,
  editableOffset,
  element,
  mapper,
  path,
}: {
  atomAttribute: string;
  editableText: string;
  editableOffset: number;
  element: HTMLElement;
  mapper: TextOffsetMapper | null;
  path: Pointer;
}): InternalVisualCaret | null {
  const position = textDOMPositionForOffset(
    element,
    editableOffset,
    atomAttribute,
  );
  const range = element.ownerDocument.createRange();
  range.setStart(position.node, position.offset);
  range.collapse(true);
  let measured = measureLineAfterBreak({
    atomAttribute,
    editableOffset,
    editableText,
    element,
  });
  measured ??= measureCollapsedRange(range);
  range.detach();
  measured ??= measureProbeRange({
    atomAttribute,
    element,
    endOffset: editableOffset + 1,
    side: "left",
    startOffset: editableOffset,
  });
  measured ??= measureProbeRange({
    atomAttribute,
    element,
    endOffset: editableOffset,
    side: "right",
    startOffset: editableOffset - 1,
  });
  if (measured === null) {
    return null;
  }

  return {
    path,
    offset:
      mapper?.editableOffsetToDocumentOffset(path, editableOffset) ??
      editableOffset,
    x: measured.x,
    top: measured.top,
    bottom: measured.bottom,
  };
}

function measureLineAfterBreak({
  atomAttribute,
  editableOffset,
  editableText,
  element,
}: {
  atomAttribute: string;
  editableOffset: number;
  editableText: string;
  element: HTMLElement;
}): { x: number; top: number; bottom: number } | null {
  if (editableOffset <= 0 || editableText[editableOffset - 1] !== "\n") {
    return null;
  }

  const previousBreak = measureProbeRange({
    atomAttribute,
    element,
    endOffset: editableOffset,
    side: "left",
    startOffset: editableOffset - 1,
  });
  if (previousBreak === null) {
    return null;
  }

  const linePitch = measuredLinePitch(element, previousBreak);
  const height = previousBreak.bottom - previousBreak.top;
  const top = previousBreak.top + linePitch;
  return {
    x: lineStartX(element),
    top,
    bottom: top + height,
  };
}

function measureCollapsedRange(
  range: Range,
): { x: number; top: number; bottom: number } | null {
  const rect = firstUsableRect(range);
  return rect === null ? null : { x: rect.left, top: rect.top, bottom: rect.bottom };
}

function measureProbeRange({
  atomAttribute,
  element,
  endOffset,
  side,
  startOffset,
}: {
  atomAttribute: string;
  element: HTMLElement;
  endOffset: number;
  side: "left" | "right";
  startOffset: number;
}): { x: number; top: number; bottom: number } | null {
  if (startOffset < 0 || endOffset < startOffset) {
    return null;
  }
  const start = textDOMPositionForOffset(element, startOffset, atomAttribute);
  const end = textDOMPositionForOffset(element, endOffset, atomAttribute);
  const range = element.ownerDocument.createRange();
  try {
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
  } catch {
    range.detach();
    return null;
  }
  const rect = firstUsableRect(range);
  range.detach();
  if (rect === null) {
    return null;
  }
  return {
    x: side === "left" ? rect.left : rect.right,
    top: rect.top,
    bottom: rect.bottom,
  };
}

function firstUsableRect(range: Range): DOMRect | null {
  const rects = Array.from(range.getClientRects());
  const rect = rects.find((candidate) => usableRect(candidate));
  if (rect !== undefined) {
    return rect;
  }
  const bounding = range.getBoundingClientRect();
  return usableRect(bounding) ? bounding : null;
}

function usableRect(rect: DOMRect): boolean {
  return (
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.bottom) &&
    rect.bottom > rect.top
  );
}

function synthesizeLineFromSeed({
  editableOffset,
  element,
  previousLines,
  seed,
}: {
  editableOffset: number;
  element: HTMLElement;
  previousLines: ReadonlyArray<InternalVisualLine>;
  seed: InternalVisualLineSeed;
}): InternalVisualLine {
  const previous = [...previousLines]
    .filter((line) => line.path === seed.path)
    .sort(compareVisualLines)
    .at(-1);
  const rect = element.getBoundingClientRect();
  const height =
    previous === undefined
      ? measuredElementLineHeight(element)
      : previous.bottom - previous.top;
  const pitch =
    previous === undefined ? measuredElementLineHeight(element) : measuredLinePitch(element, previous);
  const top =
    previous === undefined
      ? rect.top + (seed.lineIndex ?? 0) * pitch
      : previous.top + pitch;
  const bottom = top + height;
  const caret = {
    path: seed.path,
    offset: seed.startOffset,
    x: lineStartX(element),
    top,
    bottom,
  };
  return lineFromCarets(seed, [caret], 0, {
    id: seed.id,
    sourceId: seed.id,
    editableOffset,
  });
}

function groupCaretsIntoLines(
  seed: InternalVisualLineSeed,
  carets: InternalVisualCaret[],
): InternalVisualLine[] {
  const sorted = [...carets].sort((left, right) => {
    const lineOrder = lineCenter(left) - lineCenter(right);
    return lineOrder === 0 ? left.x - right.x : lineOrder;
  });
  const grouped: InternalVisualCaret[][] = [];

  for (const caret of sorted) {
    const existing = grouped.find((line) => sameLine(lineBounds(line), caret));
    if (existing === undefined) {
      grouped.push([caret]);
      continue;
    }
    existing.push(caret);
  }

  return grouped
    .map((lineCarets, index) =>
      lineFromCarets(seed, lineCarets, index, {
        id: index === 0 ? seed.id : `${seed.id}:wrap:${index}`,
        sourceId: seed.id,
      }),
    )
    .sort(compareVisualLines);
}

function lineFromCarets(
  seed: InternalVisualLineSeed,
  carets: InternalVisualCaret[],
  wrapIndex: number,
  identity: {
    id: string;
    sourceId: string;
    editableOffset?: number;
  },
): InternalVisualLine {
  const sorted = [...carets].sort((left, right) => {
    if (left.x !== right.x) {
      return left.x - right.x;
    }
    if (left.path !== right.path) {
      return left.path < right.path ? -1 : 1;
    }
    return left.offset - right.offset;
  });
  const bounds = lineBounds(sorted);
  const offsets = sorted.map((caret) => caret.offset);
  const minX = Math.min(...sorted.map((caret) => caret.x));
  const maxX = Math.max(...sorted.map((caret) => caret.x));
  return {
    ...seed,
    id: identity.id,
    sourceId: identity.sourceId,
    lineIndex:
      seed.lineIndex === undefined
        ? wrapIndex
        : seed.lineIndex + wrapIndex,
    startOffset: Math.min(...offsets),
    endOffset: Math.max(...offsets),
    top: bounds.top,
    bottom: bounds.bottom,
    box: {
      x: Number.isFinite(minX) ? minX : 0,
      y: bounds.top,
      width: Number.isFinite(maxX - minX) ? maxX - minX : 0,
      height: bounds.bottom - bounds.top,
    },
    carets: sorted,
  };
}

function lineBounds(
  carets: ReadonlyArray<InternalVisualCaret>,
): { top: number; bottom: number } {
  return {
    top: Math.min(...carets.map((caret) => caret.top)),
    bottom: Math.max(...carets.map((caret) => caret.bottom)),
  };
}

function sameLine(
  line: Pick<InternalVisualLine, "top" | "bottom">,
  caret: InternalVisualCaret,
): boolean {
  const center = lineCenter(caret);
  return line.top - 2 <= center && center <= line.bottom + 2;
}

function measuredLinePitch(
  element: HTMLElement,
  measured: { top: number; bottom: number },
): number {
  const lineHeight = measuredElementLineHeight(element);
  return lineHeight > 0 ? lineHeight : measured.bottom - measured.top;
}

function measuredElementLineHeight(element: HTMLElement): number {
  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
  if (Number.isFinite(lineHeight) && lineHeight > 0) {
    return lineHeight;
  }
  const rect = element.getBoundingClientRect();
  return rect.height > 0 ? rect.height : 16;
}

function lineStartX(element: HTMLElement): number {
  const rects = Array.from(element.getClientRects()).filter(usableRect);
  const left = Math.min(...rects.map((rect) => rect.left));
  if (Number.isFinite(left)) {
    return left;
  }
  return element.getBoundingClientRect().left;
}

function compareVisualLines(
  left: InternalVisualLine,
  right: InternalVisualLine,
): number {
  const visualOrder = lineCenter(left) - lineCenter(right);
  if (visualOrder !== 0) {
    return visualOrder;
  }
  if (left.path !== right.path) {
    return left.path < right.path ? -1 : 1;
  }
  return left.startOffset - right.startOffset;
}

function lineCenter(value: { top: number; bottom: number }): number {
  return (value.top + value.bottom) / 2;
}

function clampOffset(offset: number, length: number): number {
  return Math.max(0, Math.min(offset, length));
}
