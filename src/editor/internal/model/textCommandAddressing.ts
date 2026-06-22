import { tryParsePointer } from "@interactive-os/json-document";
import {
  type InlineNode,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";

export type TextLocation = {
  blockIndex: number;
  path: string;
  text: string;
  marks?: Extract<InlineNode, { type: "text" }>["marks"];
} & (
  | {
      kind: "inline";
      childIndex: number;
    }
  | {
      kind: "code";
    }
);

export function textLocationFromPath(
  document: NoteDocument,
  path: string,
): TextLocation | null {
  const indexes = textIndexesFromPath(path);
  if (indexes !== null) {
    const block = document.root.children[indexes.blockIndex];
    const child = isInlineTextBlock(block)
      ? block.children[indexes.childIndex]
      : undefined;
    if (child?.type !== "text") {
      return null;
    }

    return {
      blockIndex: indexes.blockIndex,
      kind: "inline",
      childIndex: indexes.childIndex,
      path,
      text: child.text,
      marks: child.marks,
    };
  }

  const codeIndex = codeTextIndexFromPath(path);
  if (codeIndex === null) {
    return null;
  }

  const block = document.root.children[codeIndex.blockIndex];
  return isCodeBlock(block)
    ? {
        blockIndex: codeIndex.blockIndex,
        kind: "code",
        path,
        text: block.text,
      }
    : null;
}

export function inlineAtomLocationFromPath(
  document: NoteDocument,
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const indexes = inlineIndexesFromPath(path);
  if (indexes === null) {
    return null;
  }

  const block = document.root.children[indexes.blockIndex];
  const child = isInlineTextBlock(block)
    ? block.children[indexes.childIndex]
    : undefined;
  return child?.type === "mention" ? indexes : null;
}

export function blockAtomLocationFromPath(
  document: NoteDocument,
  path: string,
): number | null {
  const blockIndex = blockIndexFromPath(path);
  const block =
    blockIndex === null ? undefined : document.root.children[blockIndex];

  return isFigureBlock(block) ? blockIndex : null;
}

export function blockLocationFromPath(
  document: NoteDocument,
  path: string,
): number | null {
  const blockIndex = blockIndexFromPath(path);
  return blockIndex !== null && document.root.children[blockIndex] !== undefined
    ? blockIndex
    : null;
}

export function textPath(blockIndex: number, childIndex: number): string {
  return `/root/children/${blockIndex}/children/${childIndex}/text`;
}

export function codeTextPath(blockIndex: number): string {
  return `/root/children/${blockIndex}/text`;
}

export function inlinePath(blockIndex: number, childIndex: number): string {
  return `/root/children/${blockIndex}/children/${childIndex}`;
}

export function textInline(
  text: string,
  marks?: Extract<InlineNode, { type: "text" }>["marks"],
): InlineNode {
  return marks === undefined || marks.length === 0
    ? { kind: "text", type: "text", text }
    : { kind: "text", type: "text", text, marks };
}

function textIndexesFromPath(
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments.length !== 6 ||
    segments[0] !== "root" ||
    segments[1] !== "children" ||
    segments[3] !== "children" ||
    segments[5] !== "text"
  ) {
    return null;
  }

  const blockIndex = arrayIndexFromSegment(segments[2]);
  const childIndex = arrayIndexFromSegment(segments[4]);

  return blockIndex === null || childIndex === null
    ? null
    : { blockIndex, childIndex };
}

function codeTextIndexFromPath(path: string): { blockIndex: number } | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments.length !== 4 ||
    segments[0] !== "root" ||
    segments[1] !== "children" ||
    segments[3] !== "text"
  ) {
    return null;
  }

  const blockIndex = arrayIndexFromSegment(segments[2]);

  return blockIndex === null ? null : { blockIndex };
}

function inlineIndexesFromPath(
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments.length !== 5 ||
    segments[0] !== "root" ||
    segments[1] !== "children" ||
    segments[3] !== "children"
  ) {
    return null;
  }

  const blockIndex = arrayIndexFromSegment(segments[2]);
  const childIndex = arrayIndexFromSegment(segments[4]);

  return blockIndex === null || childIndex === null
    ? null
    : { blockIndex, childIndex };
}

function blockIndexFromPath(path: string): number | null {
  const segments = tryParsePointer(path);
  if (
    segments === null ||
    segments.length !== 3 ||
    segments[0] !== "root" ||
    segments[1] !== "children"
  ) {
    return null;
  }

  return arrayIndexFromSegment(segments[2]);
}

function arrayIndexFromSegment(segment: string): number | null {
  if (!/^(0|[1-9]\d*)$/.test(segment)) {
    return null;
  }

  return Number(segment);
}
