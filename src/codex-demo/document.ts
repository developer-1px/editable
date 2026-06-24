import {
  createJSONDocument,
  type JSONDocument,
  type JSONPatchOperation,
  type Pointer,
  type SelectionSnap,
} from "@interactive-os/json-document";
import { z } from "zod";
import {
  JSON_ATOM_ATTRIBUTE,
  JSON_ATOM_REPLACEMENT,
  JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
  type JsonContentEditableFragment,
} from "../../codex/core";

const INITIAL_MENTION_ID = "mention-ada";
const INITIAL_TEXT = `Plain text. 한글과 日本語 IME. ${JSON_ATOM_REPLACEMENT}`;

const MentionAtomSchema = z.object({
  type: z.literal("mention"),
  userId: z.string(),
  label: z.string(),
  offset: z.number().int().nonnegative(),
});

const RichTextMarkSchema = z.object({
  type: z.union([z.literal("bold"), z.literal("underline")]),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

const CodexDemoBlockSchema = z.object({
  type: z.union([z.literal("paragraph"), z.literal("heading1")]),
  text: z.string(),
  atoms: z.record(z.string(), MentionAtomSchema),
  marks: z.record(z.string(), RichTextMarkSchema),
});

const CodexDemoDocumentSchema = z.object({
  blocks: z.array(CodexDemoBlockSchema).min(1),
});

export type CodexDemoDocument = z.infer<typeof CodexDemoDocumentSchema>;
type CodexDemoBlock = z.infer<typeof CodexDemoBlockSchema>;
type MentionAtom = z.infer<typeof MentionAtomSchema>;
type RichTextMark = z.infer<typeof RichTextMarkSchema>;
export type RichTextMarkType = RichTextMark["type"];

export function codexDemoTextPath(blockIndex: number): Pointer {
  return `/blocks/${blockIndex}/text`;
}

export function codexDemoAtomsPathForTextPath(
  textPath: Pointer,
): Pointer | null {
  const index = blockIndexFromTextPath(textPath);
  return index === null ? null : `/blocks/${index}/atoms`;
}

export function codexDemoRangesPathForTextPath(
  textPath: Pointer,
): Pointer | null {
  const index = blockIndexFromTextPath(textPath);
  return index === null ? null : `/blocks/${index}/marks`;
}

export function createCodexDemoValue(): CodexDemoDocument {
  return {
    blocks: [
      {
        type: "paragraph",
        text: INITIAL_TEXT,
        atoms: {
          [INITIAL_MENTION_ID]: {
            type: "mention",
            userId: "ada",
            label: "@Ada",
            offset: INITIAL_TEXT.indexOf(JSON_ATOM_REPLACEMENT),
          },
        },
        marks: {},
      },
    ],
  };
}

export function createCodexDemoDocument() {
  return createJSONDocument(CodexDemoDocumentSchema, createCodexDemoValue(), {
    history: 100,
    selection: true,
    trustedInitial: true,
  });
}

export function createMentionFragment(): JsonContentEditableFragment {
  const id = `mention-${Date.now().toString(36)}`;
  return {
    schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
    text: JSON_ATOM_REPLACEMENT,
    atoms: {
      [id]: {
        type: "mention",
        userId: "ada",
        label: "@Ada",
        offset: 0,
      },
    },
  };
}

let markId = 0;

export function toggleCodexDemoBlock(
  document: JSONDocument<CodexDemoDocument>,
  type: CodexDemoBlock["type"],
  selection: SelectionSnap | null,
): void {
  const target = blockRangeFromSelection(selection);
  if (target === null) {
    return;
  }

  if (target.collapsed) {
    const block = document.value.blocks[target.start.block];
    if (block === undefined) {
      return;
    }
    const next = block.type === type ? "paragraph" : type;
    document.commit(
      [
        {
          op: "replace",
          path: `/blocks/${target.start.block}/type`,
          value: next,
        },
      ],
      {
        label: "toggle block",
        origin: "codex-demo",
        selectionAfter: selection ?? undefined,
      },
    );
    return;
  }

  const { blocks, selectionAfter } = splitBlocksForRange(
    document.value.blocks,
    target,
    type,
  );

  document.commit([{ op: "replace", path: "/blocks", value: blocks }], {
    label: "toggle block",
    origin: "codex-demo",
    selectionAfter,
  });
}

export function toggleCodexDemoMark(
  document: JSONDocument<CodexDemoDocument>,
  type: RichTextMarkType,
  selection: SelectionSnap | null,
): void {
  const range = blockRangeFromSelection(selection);
  if (range === null || range.collapsed) {
    return;
  }

  const patch: JSONPatchOperation[] = [];
  let removed = false;
  forEachSelectedBlockRange(
    document.value.blocks,
    range,
    (block, blockIndex, part) => {
      for (const [id, mark] of Object.entries(block.marks)) {
        if (
          mark.type !== type ||
          mark.end <= part.start ||
          mark.start >= part.end
        ) {
          continue;
        }
        removed = true;
        patch.push({
          op: "remove",
          path: `/blocks/${blockIndex}/marks/${escapePointerSegment(id)}`,
        });
        if (mark.start < part.start) {
          patch.push({
            op: "add",
            path: `/blocks/${blockIndex}/marks/${escapePointerSegment(`${id}-left`)}`,
            value: { ...mark, end: part.start },
          });
        }
        if (mark.end > part.end) {
          patch.push({
            op: "add",
            path: `/blocks/${blockIndex}/marks/${escapePointerSegment(`${id}-right`)}`,
            value: { ...mark, start: part.end },
          });
        }
      }
    },
  );

  if (!removed) {
    forEachSelectedBlockRange(
      document.value.blocks,
      range,
      (_block, blockIndex, part) => {
        markId += 1;
        patch.push({
          op: "add",
          path: `/blocks/${blockIndex}/marks/mark-${type}-${markId.toString(36)}`,
          value: {
            type,
            start: part.start,
            end: part.end,
          },
        });
      },
    );
  }

  if (patch.length === 0) {
    return;
  }

  document.commit(patch, {
    label: `toggle ${type}`,
    origin: "codex-demo",
    selectionAfter: selection ?? undefined,
  });
}

export function codexDemoBlockActive(
  document: CodexDemoDocument,
  selection: SelectionSnap | null,
  type: CodexDemoBlock["type"],
): boolean {
  const range = blockRangeFromSelection(selection);
  if (range === null) {
    return false;
  }
  const start = range.start.block;
  const end = range.collapsed ? start : range.end.block;
  for (let index = start; index <= end; index += 1) {
    if (document.blocks[index]?.type === type) {
      return true;
    }
  }
  return false;
}

export function codexDemoMarkActive(
  document: CodexDemoDocument,
  selection: SelectionSnap | null,
  type: RichTextMarkType,
): boolean {
  const range = blockRangeFromSelection(selection);
  if (range === null || range.collapsed) {
    return false;
  }
  let active = false;
  forEachSelectedBlockRange(
    document.blocks,
    range,
    (block, _blockIndex, part) => {
      if (
        Object.values(block.marks).some(
          (mark) =>
            mark.type === type &&
            mark.start < part.end &&
            mark.end > part.start,
        )
      ) {
        active = true;
      }
    },
  );
  return active;
}

export function renderCodexDemoContent(
  root: HTMLElement,
  document: CodexDemoDocument,
): void {
  root.replaceChildren();
  document.blocks.forEach((block, blockIndex) => {
    const element = root.ownerDocument.createElement("div");
    element.className = "codex-block";
    element.dataset.blockType = block.type;
    element.classList.toggle("codex-block-heading", block.type === "heading1");
    element.setAttribute("data-json-text", codexDemoTextPath(blockIndex));
    renderBlockContent(element, block);
    root.append(element);
  });
}

type TextRange = { start: number; end: number };
type BlockPoint = { block: number; offset: number };
type BlockRange = {
  collapsed: boolean;
  start: BlockPoint;
  end: BlockPoint;
};
type ActiveMarks = { bold: boolean; underline: boolean };

function renderBlockContent(root: HTMLElement, block: CodexDemoBlock): void {
  const byOffset = new Map<number, [string, MentionAtom]>();
  for (const entry of Object.entries(block.atoms)) {
    byOffset.set(entry[1].offset, entry);
  }

  let buffer = "";
  let bufferMarks: ActiveMarks = { bold: false, underline: false };
  const flushText = () => {
    if (buffer.length === 0) {
      return;
    }
    appendMarkedText(root, buffer, bufferMarks);
    buffer = "";
  };

  for (let offset = 0; offset < block.text.length; offset += 1) {
    const atomEntry = byOffset.get(offset);
    const activeMarks = marksAt(block.marks, offset);
    if (!sameActiveMarks(activeMarks, bufferMarks)) {
      flushText();
      bufferMarks = activeMarks;
    }
    if (
      block.text[offset] !== JSON_ATOM_REPLACEMENT ||
      atomEntry === undefined
    ) {
      buffer += block.text[offset] ?? "";
      continue;
    }

    flushText();
    const [id, atom] = atomEntry;
    const element = root.ownerDocument.createElement("span");
    element.className = "mention-chip";
    element.contentEditable = "false";
    element.setAttribute(JSON_ATOM_ATTRIBUTE, id);
    element.textContent = atom.label;
    appendMarkedNode(root, element, activeMarks);
  }

  flushText();
  if (root.childNodes.length === 0) {
    root.append(root.ownerDocument.createTextNode(""));
  }
}

function splitBlocksForRange(
  blocks: ReadonlyArray<CodexDemoBlock>,
  range: BlockRange,
  type: CodexDemoBlock["type"],
): { blocks: CodexDemoBlock[]; selectionAfter: SelectionSnap } {
  const next: CodexDemoBlock[] = [];
  let selectionStart: BlockPoint | null = null;
  let selectionEnd: BlockPoint | null = null;

  blocks.forEach((block, blockIndex) => {
    if (blockIndex < range.start.block || blockIndex > range.end.block) {
      next.push(cloneBlock(block));
      return;
    }

    const selectedStart =
      blockIndex === range.start.block ? range.start.offset : 0;
    const selectedEnd =
      blockIndex === range.end.block ? range.end.offset : block.text.length;

    if (selectedStart > 0) {
      next.push(sliceBlock(block, 0, selectedStart, block.type));
    }
    if (selectedEnd > selectedStart) {
      const selectedIndex = next.length;
      const selected = sliceBlock(block, selectedStart, selectedEnd, type);
      next.push(selected);
      selectionStart ??= { block: selectedIndex, offset: 0 };
      selectionEnd = { block: selectedIndex, offset: selected.text.length };
    }
    if (selectedEnd < block.text.length) {
      next.push(sliceBlock(block, selectedEnd, block.text.length, block.type));
    }
  });

  return {
    blocks: next,
    selectionAfter:
      selectionStart === null || selectionEnd === null
        ? selectionFromRange(range.start, range.end)
        : selectionFromRange(selectionStart, selectionEnd),
  };
}

function forEachSelectedBlockRange(
  blocks: ReadonlyArray<CodexDemoBlock>,
  range: BlockRange,
  callback: (
    block: CodexDemoBlock,
    blockIndex: number,
    part: TextRange,
  ) => void,
): void {
  for (
    let blockIndex = range.start.block;
    blockIndex <= range.end.block;
    blockIndex += 1
  ) {
    const block = blocks[blockIndex];
    if (block === undefined) {
      continue;
    }
    const start = blockIndex === range.start.block ? range.start.offset : 0;
    const end =
      blockIndex === range.end.block ? range.end.offset : block.text.length;
    if (start < end) {
      callback(block, blockIndex, { start, end });
    }
  }
}

function sliceBlock(
  block: CodexDemoBlock,
  start: number,
  end: number,
  type: CodexDemoBlock["type"],
): CodexDemoBlock {
  const atoms: Record<string, MentionAtom> = {};
  for (const [id, atom] of Object.entries(block.atoms)) {
    if (start <= atom.offset && atom.offset < end) {
      atoms[id] = { ...atom, offset: atom.offset - start };
    }
  }

  const marks: Record<string, RichTextMark> = {};
  for (const [id, mark] of Object.entries(block.marks)) {
    const markStart = Math.max(mark.start, start);
    const markEnd = Math.min(mark.end, end);
    if (markStart < markEnd) {
      marks[id] = {
        ...mark,
        start: markStart - start,
        end: markEnd - start,
      };
    }
  }

  return {
    type,
    text: block.text.slice(start, end),
    atoms,
    marks,
  };
}

function cloneBlock(block: CodexDemoBlock): CodexDemoBlock {
  return {
    type: block.type,
    text: block.text,
    atoms: Object.fromEntries(
      Object.entries(block.atoms).map(([id, atom]) => [id, { ...atom }]),
    ),
    marks: Object.fromEntries(
      Object.entries(block.marks).map(([id, mark]) => [id, { ...mark }]),
    ),
  };
}

function blockRangeFromSelection(
  selection: SelectionSnap | null,
): BlockRange | null {
  const range =
    selection === null
      ? undefined
      : selection.selectionRanges[selection.primaryIndex];
  if (
    range === undefined ||
    typeof range.anchor === "string" ||
    typeof range.focus === "string" ||
    typeof range.anchor.offset !== "number" ||
    typeof range.focus.offset !== "number"
  ) {
    return null;
  }
  const anchorBlock = blockIndexFromTextPath(range.anchor.path);
  const focusBlock = blockIndexFromTextPath(range.focus.path);
  if (anchorBlock === null || focusBlock === null) {
    return null;
  }
  const anchor = { block: anchorBlock, offset: range.anchor.offset };
  const focus = { block: focusBlock, offset: range.focus.offset };
  const [start, end] = orderBlockPoints(anchor, focus);
  return {
    collapsed: start.block === end.block && start.offset === end.offset,
    start,
    end,
  };
}

function orderBlockPoints(
  left: BlockPoint,
  right: BlockPoint,
): [BlockPoint, BlockPoint] {
  if (
    left.block < right.block ||
    (left.block === right.block && left.offset <= right.offset)
  ) {
    return [left, right];
  }
  return [right, left];
}

function selectionFromRange(
  anchor: BlockPoint,
  focus: BlockPoint,
): SelectionSnap {
  const anchorPoint = {
    path: codexDemoTextPath(anchor.block),
    offset: anchor.offset,
  };
  const focusPoint = {
    path: codexDemoTextPath(focus.block),
    offset: focus.offset,
  };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor: anchorPoint, focus: focusPoint }],
    primaryIndex: 0,
    anchor: anchorPoint,
    focus: focusPoint,
  };
}

function blockIndexFromTextPath(path: Pointer): number | null {
  const match = /^\/blocks\/(\d+)\/text$/.exec(path);
  return match === null ? null : Number(match[1]);
}

function marksAt(
  marks: Record<string, RichTextMark>,
  offset: number,
): ActiveMarks {
  const active: ActiveMarks = { bold: false, underline: false };
  for (const mark of Object.values(marks)) {
    if (mark.start <= offset && offset < mark.end) {
      active[mark.type] = true;
    }
  }
  return active;
}

function sameActiveMarks(left: ActiveMarks, right: ActiveMarks): boolean {
  return left.bold === right.bold && left.underline === right.underline;
}

function appendMarkedText(
  root: HTMLElement,
  text: string,
  marks: ActiveMarks,
): void {
  appendMarkedNode(root, root.ownerDocument.createTextNode(text), marks);
}

function appendMarkedNode(
  root: HTMLElement,
  node: Node,
  marks: ActiveMarks,
): void {
  let next = node;
  if (marks.underline) {
    const element = root.ownerDocument.createElement("u");
    element.append(next);
    next = element;
  }
  if (marks.bold) {
    const element = root.ownerDocument.createElement("strong");
    element.append(next);
    next = element;
  }
  root.append(next);
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
