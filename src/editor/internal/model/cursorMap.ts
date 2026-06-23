import type { CursorPoint } from "./cursor";
import {
  type InlineNode,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";
import { textBoundaryOffsets } from "./textBoundaries";

export type CursorMap = {
  positions: CursorPoint[];
  text: Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >;
  edges: Map<string, { before: number; after: number }>;
  atoms: Map<string, { before: number; after: number }>;
};

export type CaretMap = CursorMap;

export function createCursorMap(document: NoteDocument): CursorMap {
  const positions: CursorPoint[] = [];
  const text = new Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >();
  const edges = new Map<string, { before: number; after: number }>();
  const atoms = new Map<string, { before: number; after: number }>();

  for (const [blockIndex, block] of document.root.children.entries()) {
    const blockPath = `/root/children/${blockIndex}`;

    if (isFigureBlock(block)) {
      atoms.set(blockPath, appendEdgePositions(positions, edges, blockPath));
      continue;
    }

    const before = positions.length;
    positions.push({ path: blockPath, edge: "before" });

    if (isCodeBlock(block)) {
      appendPlainTextPositions(
        positions,
        text,
        `${blockPath}/text`,
        block.text,
      );
    } else if (isInlineTextBlock(block)) {
      let previousInlineWasText = false;
      for (const [inlineIndex, child] of block.children.entries()) {
        const childPath = `${blockPath}/children/${inlineIndex}`;

        if (child.type === "mention") {
          atoms.set(
            childPath,
            appendEdgePositions(positions, edges, childPath),
          );
          previousInlineWasText = false;
          continue;
        }

        appendInlineTextPositions(positions, text, childPath, child, {
          collapseStart: previousInlineWasText,
        });
        previousInlineWasText = true;
      }

      if (block.children.length === 0) {
        appendPlainTextPositions(
          positions,
          text,
          `${blockPath}/children/0/text`,
          "",
        );
      }
    }

    const after = positions.length;
    positions.push({ path: blockPath, edge: "after" });
    edges.set(blockPath, { before, after });
  }

  return { positions, text, edges, atoms };
}

export function createCaretMap(document: NoteDocument): CaretMap {
  const positions: CursorPoint[] = [];
  const text = new Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >();
  const edges = new Map<string, { before: number; after: number }>();
  const atoms = new Map<string, { before: number; after: number }>();

  for (const [blockIndex, block] of document.root.children.entries()) {
    const blockPath = `/root/children/${blockIndex}`;

    if (isFigureBlock(block)) {
      atoms.set(blockPath, appendEdgePositions(positions, edges, blockPath));
      continue;
    }

    const blockStart = positions.length;
    if (isCodeBlock(block)) {
      appendPlainTextPositions(
        positions,
        text,
        `${blockPath}/text`,
        block.text,
      );
      continue;
    }

    if (isInlineTextBlock(block)) {
      let previousInlineWasText = false;
      for (const [inlineIndex, child] of block.children.entries()) {
        const childPath = `${blockPath}/children/${inlineIndex}`;

        if (child.type === "mention") {
          atoms.set(
            childPath,
            appendEdgePositions(positions, edges, childPath),
          );
          previousInlineWasText = false;
          continue;
        }

        appendInlineTextPositions(positions, text, childPath, child, {
          collapseStart: previousInlineWasText,
        });
        previousInlineWasText = true;
      }

      if (positions.length === blockStart) {
        appendPlainTextPositions(
          positions,
          text,
          `${blockPath}/children/0/text`,
          "",
        );
      }
    }
  }

  return { positions, text, edges, atoms };
}

function appendInlineTextPositions(
  positions: CursorPoint[],
  text: Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >,
  childPath: string,
  child: Extract<InlineNode, { type: "text" }>,
  options: { collapseStart?: boolean } = {},
) {
  appendPlainTextPositions(positions, text, `${childPath}/text`, child.text, {
    collapseStart: options.collapseStart,
  });
}

function appendPlainTextPositions(
  positions: CursorPoint[],
  text: Map<
    string,
    { start: number; length: number; offsets: number[]; value: string }
  >,
  path: string,
  value: string,
  options: { collapseStart?: boolean } = {},
) {
  const collapseStart = options.collapseStart === true && positions.length > 0;
  const start = collapseStart ? positions.length - 1 : positions.length;
  const offsets = textBoundaryOffsets(value);

  text.set(path, { start, length: value.length, offsets, value });

  for (const offset of collapseStart ? offsets.slice(1) : offsets) {
    positions.push({ path, offset });
  }
}

function appendEdgePositions(
  positions: CursorPoint[],
  edges: Map<string, { before: number; after: number }>,
  path: string,
): { before: number; after: number } {
  const before = positions.length;
  positions.push({ path, edge: "before" });
  const after = positions.length;
  positions.push({ path, edge: "after" });
  const range = { before, after };
  edges.set(path, range);

  return range;
}
