import type {
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  ATOM_REPLACEMENT,
  blockPath,
  clampOffset,
  createRichBlock,
  richBlockIndexFromTextPath,
  richBlockRangeFromSelection,
  richTextPathForBlock,
  richTextSurfaceForBlock,
  uniqueId,
  type RichBlock,
  type RichBlockInput,
  type RichBlockRange,
  type RichBlockStyle,
  type RichDocument,
  type RichHeadingLevel,
  type RichInlineAtom,
  type RichInlineRange,
  type RichInlineRangeType,
} from "../model";

export const EDITABLE_DOCUMENT_ATTRIBUTE = "data-editable-document";
export const EDITABLE_BLOCK_ATTRIBUTE = "data-editable-block";
export const EDITABLE_BLOCK_TYPE_ATTRIBUTE = "data-editable-block-type";
export const EDITABLE_HEADING_LEVEL_ATTRIBUTE = "data-editable-heading-level";
export const EDITABLE_ATOM_TYPE_ATTRIBUTE = "data-editable-atom-type";
export const EDITABLE_MARK_ATTRIBUTE = "data-editable-mark";
export const EDITABLE_TEXT_ATTRIBUTE = "data-editable-text";
export const EDITABLE_ATOM_ATTRIBUTE = "data-editable-atom";

export type RichProjectionPolicy = {
  revealBlockSyntax?: "selected" | "always" | "never";
  revealInlineSyntax?: "selected" | "always" | "never";
  freezeDuringComposition?: boolean;
  composing?: boolean;
};

export type RichProjection = {
  documentId: string;
  blocks: RichProjectionBlock[];
};

export type RichProjectionBlock = {
  blockId: string;
  blockIndex: number;
  textPath: Pointer;
  text: string;
  spans: RichProjectionSpan[];
};

export type RichProjectionSpan =
  | {
      kind: "content";
      projectionStart: number;
      projectionEnd: number;
      textPath: Pointer;
      modelStart: number;
      modelEnd: number;
    }
  | {
      kind: "atom";
      projectionStart: number;
      projectionEnd: number;
      textPath: Pointer;
      atomId: string;
      modelOffset: number;
    }
  | {
      kind: "syntax";
      projectionStart: number;
      projectionEnd: number;
      marker: string;
      modelOffset: number;
      role: "blockPrefix" | "rangeOpen" | "rangeClose";
      target:
        | { kind: "block"; blockId: string }
        | { kind: "range"; blockId: string; rangeId: string };
      affinity: "before" | "after";
    };


export type RichProjectionTextChange =
  | {
      ok: true;
      kind: "no-change" | "text";
      patch: ReadonlyArray<JSONPatchOperation>;
      selectionAfter: SelectionSnap | null;
    }
  | {
      ok: false;
      code: "block_not_found" | "invalid_projection";
      reason: string;
    };

export function createRichProjection(
  document: RichDocument,
  selection: SelectionSnap | null,
  policy: RichProjectionPolicy = {},
): RichProjection {
  const resolved = resolveProjectionPolicy(policy);
  const range = richBlockRangeFromSelection(selection);
  return {
    documentId: document.id,
    blocks: document.blocks.map((block, blockIndex) =>
      createRichProjectionBlock(
        block,
        blockIndex,
        blockRevealState(blockIndex, range, resolved.revealBlockSyntax),
        inlineRevealState(blockIndex, range, resolved.revealInlineSyntax),
      ),
    ),
  };
}

export function richProjectionBlockForTextPath(
  projection: RichProjection,
  textPath: Pointer,
): RichProjectionBlock | null {
  return (
    projection.blocks.find((block) => block.textPath === textPath) ?? null
  );
}

export function richProjectionOffsetToModelOffset(
  block: RichProjectionBlock,
  projectionOffset: number,
): number {
  const offset = clampOffset(projectionOffset, block.text.length);
  for (const span of block.spans) {
    if (offset < span.projectionStart || offset > span.projectionEnd) {
      continue;
    }
    if (span.kind === "content") {
      return span.modelStart + clampOffset(offset - span.projectionStart, span.modelEnd - span.modelStart);
    }
    if (span.kind === "atom") {
      return span.modelOffset + (offset > span.projectionStart ? 1 : 0);
    }
    return span.modelOffset;
  }

  const before = [...block.spans]
    .reverse()
    .find((span) => span.projectionEnd <= offset);
  if (before?.kind === "content") {
    return before.modelEnd;
  }
  if (before?.kind === "atom") {
    return before.modelOffset + 1;
  }
  if (before?.kind === "syntax") {
    return before.modelOffset;
  }
  return 0;
}

export function richModelOffsetToProjectionOffset(
  block: RichProjectionBlock,
  modelOffset: number,
): number {
  const content = block.spans.find(
    (span) =>
      span.kind === "content" &&
      span.modelStart <= modelOffset &&
      modelOffset <= span.modelEnd,
  );
  if (content?.kind === "content") {
    return (
      content.projectionStart +
      clampOffset(modelOffset - content.modelStart, content.modelEnd - content.modelStart)
    );
  }

  const atom = block.spans.find(
    (span) => span.kind === "atom" && span.modelOffset === modelOffset,
  );
  if (atom?.kind === "atom") {
    return atom.projectionStart;
  }

  const before = [...block.spans]
    .reverse()
    .find((span) => {
      if (span.kind === "content") {
        return span.modelEnd <= modelOffset;
      }
      if (span.kind === "atom") {
        return span.modelOffset + 1 <= modelOffset;
      }
      return span.modelOffset <= modelOffset;
    });
  return before?.projectionEnd ?? 0;
}

export function richProjectionTextToModelText(
  block: RichProjectionBlock,
  editableText: string,
): string {
  return parseProjectionBlockText(block, editableText).text;
}


export function applyRichProjectionTextChange(
  document: RichDocument,
  projection: RichProjection,
  textPath: Pointer,
  editableText: string,
  selectionAfter: SelectionSnap | null = null,
): RichProjectionTextChange {
  const blockProjection = richProjectionBlockForTextPath(projection, textPath);
  const blockIndex = richBlockIndexFromTextPath(textPath);
  const block = blockIndex === null ? undefined : document.blocks[blockIndex];
  if (blockProjection === null || blockIndex === null || block === undefined) {
    return {
      ok: false,
      code: "block_not_found",
      reason: `No projection block found for ${textPath}.`,
    };
  }

  const parsed = parseProjectionBlockText(blockProjection, editableText);
  const nextBlock = blockFromParsedProjection(block, parsed);
  if (sameJSONValue(block, nextBlock)) {
    return {
      ok: true,
      kind: "no-change",
      patch: [],
      selectionAfter,
    };
  }
  return {
    ok: true,
    kind: "text",
    patch: [{ op: "replace", path: blockPath(blockIndex), value: nextBlock }],
    selectionAfter,
  };
}

export function canonicalEditableDocumentAttributes(
  document: Pick<RichDocument, "id">,
): Record<string, string> {
  return {
    [EDITABLE_DOCUMENT_ATTRIBUTE]: document.id,
  };
}

export function canonicalEditableBlockAttributes(
  block: RichBlock,
  blockIndex: number,
): Record<string, string> {
  const surface = richTextSurfaceForBlock(blockIndex);
  return {
    [EDITABLE_BLOCK_ATTRIBUTE]: block.id,
    [EDITABLE_BLOCK_TYPE_ATTRIBUTE]: block.type,
    [EDITABLE_TEXT_ATTRIBUTE]: surface.textPath,
    ...(block.type === "heading"
      ? { [EDITABLE_HEADING_LEVEL_ATTRIBUTE]: block.level.toString() }
      : {}),
  };
}

export function canonicalEditableAtomAttributes(
  id: string,
  atom: RichInlineAtom,
): Record<string, string> {
  return {
    [EDITABLE_ATOM_ATTRIBUTE]: id,
    [EDITABLE_ATOM_TYPE_ATTRIBUTE]: atom.type,
    contenteditable: "false",
  };
}

export function canonicalEditableMarkAttributes(
  range: RichInlineRange,
): Record<string, string> {
  return {
    [EDITABLE_MARK_ATTRIBUTE]: range.type,
  };
}


type ResolvedProjectionPolicy = Required<RichProjectionPolicy>;
type ParsedProjectionBlock = {
  style: RichBlockStyle;
  text: string;
  ranges: Record<string, RichInlineRange>;
};

function resolveProjectionPolicy(
  policy: RichProjectionPolicy,
): ResolvedProjectionPolicy {
  const composing = policy.composing ?? false;
  const freeze = policy.freezeDuringComposition ?? true;
  return {
    revealBlockSyntax:
      composing && freeze ? "never" : (policy.revealBlockSyntax ?? "selected"),
    revealInlineSyntax:
      composing && freeze ? "never" : (policy.revealInlineSyntax ?? "selected"),
    freezeDuringComposition: freeze,
    composing,
  };
}

function blockRevealState(
  blockIndex: number,
  range: RichBlockRange | null,
  mode: ResolvedProjectionPolicy["revealBlockSyntax"],
): boolean {
  if (mode === "always") {
    return true;
  }
  if (mode === "never" || range === null) {
    return false;
  }
  return range.start.block <= blockIndex && blockIndex <= range.end.block;
}

function inlineRevealState(
  blockIndex: number,
  range: RichBlockRange | null,
  mode: ResolvedProjectionPolicy["revealInlineSyntax"],
): {
  mode: ResolvedProjectionPolicy["revealInlineSyntax"];
  range: RichBlockRange | null;
} {
  return {
    mode,
    range:
      mode === "selected" &&
      range !== null &&
      range.start.block <= blockIndex &&
      blockIndex <= range.end.block
        ? range
        : null,
  };
}

function createRichProjectionBlock(
  block: RichBlock,
  blockIndex: number,
  revealBlock: boolean,
  inlineReveal: {
    mode: ResolvedProjectionPolicy["revealInlineSyntax"];
    range: RichBlockRange | null;
  },
): RichProjectionBlock {
  const textPath = richTextPathForBlock(blockIndex);
  const spans: RichProjectionSpan[] = [];
  let text = "";

  const appendSyntax = (
    marker: string,
    role: Extract<RichProjectionSpan, { kind: "syntax" }>["role"],
    modelOffset: number,
    target: Extract<RichProjectionSpan, { kind: "syntax" }>["target"],
    affinity: Extract<RichProjectionSpan, { kind: "syntax" }>["affinity"],
  ) => {
    if (marker.length === 0) {
      return;
    }
    const start = text.length;
    text += marker;
    spans.push({
      kind: "syntax",
      projectionStart: start,
      projectionEnd: text.length,
      marker,
      modelOffset,
      role,
      target,
      affinity,
    });
  };

  const blockMarker = revealBlock ? blockSyntaxMarker(block) : null;
  if (blockMarker !== null) {
    appendSyntax(
      blockMarker,
      "blockPrefix",
      0,
      { kind: "block", blockId: block.id },
      "before",
    );
  }

  const markers = inlineMarkersForBlock(block, inlineReveal);
  const atomsByOffset = new Map(
    Object.entries(block.atoms).map(
      ([id, atom]) => [atom.offset, [id, atom] as const],
    ),
  );
  const appendContent = (start: number, end: number) => {
    let offset = start;
    while (offset < end) {
      const atom = atomsByOffset.get(offset);
      if (
        atom !== undefined &&
        block.text[offset] === ATOM_REPLACEMENT
      ) {
        const projectionStart = text.length;
        text += ATOM_REPLACEMENT;
        spans.push({
          kind: "atom",
          projectionStart,
          projectionEnd: text.length,
          textPath,
          atomId: atom[0],
          modelOffset: offset,
        });
        offset += 1;
        continue;
      }

      const chunkStart = offset;
      while (
        offset < end &&
        !(
          atomsByOffset.has(offset) &&
          block.text[offset] === ATOM_REPLACEMENT
        )
      ) {
        offset += 1;
      }
      const projectionStart = text.length;
      text += block.text.slice(chunkStart, offset);
      spans.push({
        kind: "content",
        projectionStart,
        projectionEnd: text.length,
        textPath,
        modelStart: chunkStart,
        modelEnd: offset,
      });
    }
  };

  let offset = 0;
  for (const marker of markers) {
    appendContent(offset, marker.offset);
    appendSyntax(
      marker.marker,
      marker.role,
      marker.offset,
      { kind: "range", blockId: block.id, rangeId: marker.rangeId },
      marker.role === "rangeOpen" ? "before" : "after",
    );
    offset = marker.offset;
  }
  appendContent(offset, block.text.length);

  return {
    blockId: block.id,
    blockIndex,
    textPath,
    text,
    spans,
  };
}

function blockSyntaxMarker(block: RichBlock): string | null {
  if (block.type === "heading") {
    return `${"#".repeat(block.level)} `;
  }
  if (block.type === "quote") {
    return "> ";
  }
  return null;
}

function inlineMarkersForBlock(
  block: RichBlock,
  reveal: {
    mode: ResolvedProjectionPolicy["revealInlineSyntax"];
    range: RichBlockRange | null;
  },
): Array<{
  marker: string;
  offset: number;
  rangeId: string;
  role: "rangeOpen" | "rangeClose";
}> {
  if (reveal.mode === "never") {
    return [];
  }
  const markers: Array<{
    marker: string;
    offset: number;
    rangeId: string;
    role: "rangeOpen" | "rangeClose";
  }> = [];
  for (const [rangeId, range] of Object.entries(block.ranges)) {
    const marker = inlineSyntaxMarker(range.type);
    if (marker === null) {
      continue;
    }
    if (
      reveal.mode === "selected" &&
      !rangeIntersectsSelection(range, reveal.range)
    ) {
      continue;
    }
    markers.push({ marker, offset: range.start, rangeId, role: "rangeOpen" });
    markers.push({ marker, offset: range.end, rangeId, role: "rangeClose" });
  }
  return markers.sort((left, right) => {
    if (left.offset !== right.offset) {
      return left.offset - right.offset;
    }
    if (left.role !== right.role) {
      return left.role === "rangeClose" ? -1 : 1;
    }
    return right.marker.length - left.marker.length;
  });
}

function inlineSyntaxMarker(type: string): string | null {
  if (type === "bold") {
    return "**";
  }
  if (type === "underline") {
    return "__";
  }
  if (type === "italic") {
    return "_";
  }
  if (type === "code") {
    return "`";
  }
  return null;
}

function rangeIntersectsSelection(
  range: RichInlineRange,
  selection: RichBlockRange | null,
): boolean {
  if (selection === null) {
    return false;
  }
  const start = selection.start.offset;
  const end = selection.collapsed ? start : selection.end.offset;
  return selection.collapsed
    ? range.start <= start && start <= range.end
    : range.start < end && range.end > start;
}

function parseProjectionBlockText(
  block: RichProjectionBlock,
  editableText: string,
): ParsedProjectionBlock {
  const originalStyle = blockStyleForProjection(block);
  const heading = /^(#{1,6})\s/.exec(editableText);
  const body =
    heading === null ? editableText : editableText.slice(heading[0].length);
  const inline = parseInlineProjectionSyntax(body);
  return {
    style:
      heading === null
        ? originalStyle.type === "heading"
          ? { type: "paragraph" }
          : originalStyle
        : { type: "heading", level: heading[1].length as RichHeadingLevel },
    text: inline.text,
    ranges: inline.ranges,
  };
}

function blockStyleForProjection(block: RichProjectionBlock): RichBlockStyle {
  const prefix = block.spans.find(
    (span) => span.kind === "syntax" && span.role === "blockPrefix",
  );
  if (prefix?.kind === "syntax" && /^#{1,6}\s$/.test(prefix.marker)) {
    return {
      type: "heading",
      level: (prefix.marker.trim().length || 1) as RichHeadingLevel,
    };
  }
  if (prefix?.kind === "syntax" && prefix.marker === "> ") {
    return { type: "quote" };
  }
  return { type: "paragraph" };
}

function parseInlineProjectionSyntax(text: string): {
  text: string;
  ranges: Record<string, RichInlineRange>;
} {
  let output = "";
  const ranges: Record<string, RichInlineRange> = {};
  const active = new Map<string, number>();
  let index = 0;
  while (index < text.length) {
    const marker = inlineMarkerAt(text, index);
    if (marker !== null) {
      const start = active.get(marker.type);
      if (start === undefined) {
        active.set(marker.type, output.length);
      } else {
        active.delete(marker.type);
        if (start < output.length) {
          ranges[uniqueId(`range-${marker.type}`, ranges)] = {
            type: marker.type,
            start,
            end: output.length,
          };
        }
      }
      index += marker.marker.length;
      continue;
    }
    output += text[index] ?? "";
    index += 1;
  }
  return { text: output, ranges };
}

function inlineMarkerAt(
  text: string,
  index: number,
): { type: RichInlineRangeType; marker: string } | null {
  if (text.startsWith("**", index)) {
    return { type: "bold", marker: "**" };
  }
  if (text.startsWith("__", index)) {
    return { type: "underline", marker: "__" };
  }
  if (text[index] === "`") {
    return { type: "code", marker: "`" };
  }
  if (text[index] === "_") {
    return { type: "italic", marker: "_" };
  }
  return null;
}

function blockFromParsedProjection(
  original: RichBlock,
  parsed: ParsedProjectionBlock,
): RichBlock {
  return {
    ...createRichBlock({
      ...(parsed.style as RichBlockInput),
      id: original.id,
      text: parsed.text,
    }),
    atoms: remapAtomsToText(original.atoms, parsed.text),
    ranges: {
      ...preserveUnsupportedRanges(original, parsed.text),
      ...parsed.ranges,
    },
    ...(original.metadata === undefined ? {} : { metadata: original.metadata }),
  } satisfies RichBlock;
}

function remapAtomsToText(
  atoms: Record<string, RichInlineAtom>,
  text: string,
): Record<string, RichInlineAtom> {
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === ATOM_REPLACEMENT) {
      offsets.push(index);
    }
  }
  const next: Record<string, RichInlineAtom> = {};
  Object.entries(atoms)
    .sort((left, right) => left[1].offset - right[1].offset)
    .forEach(([id, atom], index) => {
      const offset = offsets[index];
      if (offset !== undefined) {
        next[id] = { ...atom, offset };
      }
    });
  return next;
}

function preserveUnsupportedRanges(
  block: RichBlock,
  nextText: string,
): Record<string, RichInlineRange> {
  if (block.text !== nextText) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(block.ranges).filter(
      ([, range]) => inlineSyntaxMarker(range.type) === null,
    ),
  );
}

function sameJSONValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
