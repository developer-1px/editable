import { tryParsePointer } from "@interactive-os/json-document";
import {
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";

export type TextAddress = {
  blockIndex: number;
  inlineIndex?: number;
  path: string;
  text: string;
};

export type AtomAddress = {
  blockIndex: number;
  inlineIndex?: number;
  path: string;
};

export function textAddressFromPath(
  document: NoteDocument,
  path: string,
): TextAddress | null {
  const segments = tryParsePointer(path);
  const blockIndex = blockIndexFromParsedPointer(segments);
  if (segments === null || blockIndex === null) {
    return null;
  }

  const block = document.root.children[blockIndex];
  if (block === undefined) {
    return null;
  }

  if (isCodeBlock(block) && segments.length === 4 && segments[3] === "text") {
    return { blockIndex, path, text: block.text };
  }

  if (
    !isInlineTextBlock(block) ||
    segments.length !== 6 ||
    segments[3] !== "children" ||
    segments[5] !== "text"
  ) {
    return null;
  }

  const inlineIndex = arrayIndexFromSegment(segments[4]);
  if (inlineIndex === null) {
    return null;
  }

  const child = block.children[inlineIndex];
  if (child?.type !== "text") {
    if (inlineIndex === 0 && block.children.length === 0) {
      return { blockIndex, inlineIndex, path, text: "" };
    }

    return null;
  }

  return { blockIndex, inlineIndex, path, text: child.text };
}

export function atomAddressFromPath(
  document: NoteDocument,
  path: string,
): AtomAddress | null {
  const segments = tryParsePointer(path);
  const blockIndex = blockIndexFromParsedPointer(segments);
  if (segments === null || blockIndex === null) {
    return null;
  }

  const block = document.root.children[blockIndex];
  if (block === undefined) {
    return null;
  }

  if (isFigureBlock(block) && path === `/root/children/${blockIndex}`) {
    return { blockIndex, path };
  }

  if (
    !isInlineTextBlock(block) ||
    segments.length !== 5 ||
    segments[3] !== "children"
  ) {
    return null;
  }

  const inlineIndex = arrayIndexFromSegment(segments[4]);
  if (inlineIndex === null) {
    return null;
  }

  const child = block.children[inlineIndex];
  if (child?.type !== "mention") {
    return null;
  }

  return { blockIndex, inlineIndex, path };
}

export function blockIndexFromCursorPath(path: string): number | null {
  return blockIndexFromParsedPointer(tryParsePointer(path));
}

function blockIndexFromParsedPointer(segments: string[] | null): number | null {
  if (
    segments === null ||
    segments[0] !== "root" ||
    segments[1] !== "children"
  ) {
    return null;
  }

  return arrayIndexFromSegment(segments[2]);
}

function arrayIndexFromSegment(segment: string | undefined): number | null {
  if (segment === undefined || !/^(0|[1-9]\d*)$/.test(segment)) {
    return null;
  }

  return Number(segment);
}
