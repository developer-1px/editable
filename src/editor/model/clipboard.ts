import type { SelectionSnap } from "@interactive-os/json-document";
import { tryParsePointer } from "@interactive-os/json-document";
import { type CursorPoint, cursorPointAt, resolveCursorIndex } from "./cursor";
import {
  type InlineNode,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";
import {
  cursorPointInputFromSelectionPoint,
  selectionIsCollapsed,
} from "./richSelection";

export function plainTextFromSelection(
  document: NoteDocument,
  selection: SelectionSnap,
): string {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined || selectionIsCollapsed(selection)) {
    return "";
  }

  const anchor = cursorPointInputFromSelectionPoint(range.anchor);
  const focus = cursorPointInputFromSelectionPoint(range.focus);
  const anchorIndex = resolveCursorIndex(document, anchor);
  const focusIndex = resolveCursorIndex(document, focus);
  const start = Math.min(anchorIndex, focusIndex);
  const end = Math.max(anchorIndex, focusIndex);
  const parts: string[] = [];

  for (let index = start; index < end; index += 1) {
    parts.push(
      plainTextForCursorUnit(
        document,
        cursorPointAt(document, index),
        cursorPointAt(document, index + 1),
      ),
    );
  }

  return parts.join("");
}

function plainTextForCursorUnit(
  document: NoteDocument,
  from: CursorPoint,
  to: CursorPoint,
): string {
  return (
    textCharacterBetween(document, from, to) ??
    atomTextBetween(document, from, to) ??
    blockSeparatorBetween(document, from, to) ??
    ""
  );
}

function textCharacterBetween(
  document: NoteDocument,
  from: CursorPoint,
  to: CursorPoint,
): string | null {
  if (!hasTextOffset(from) || !hasTextOffset(to)) {
    return null;
  }

  if (from.path === to.path) {
    return to.offset === from.offset + 1
      ? (readTextAtPath(document, from.path)?.[from.offset] ?? "")
      : null;
  }

  return collapsedInlineStartCharacterBetween(document, from, to);
}

function atomTextBetween(
  document: NoteDocument,
  from: CursorPoint,
  to: CursorPoint,
): string | null {
  if (
    !("edge" in from) ||
    !("edge" in to) ||
    from.path !== to.path ||
    from.edge !== "before" ||
    to.edge !== "after"
  ) {
    return null;
  }

  const atom = readAtomAtPath(document, from.path);
  if (atom === null) {
    return null;
  }
  if (atom.type === "figure") {
    return atom.alt ?? "";
  }

  return `@${atom.label}`;
}

function blockSeparatorBetween(
  document: NoteDocument,
  from: CursorPoint,
  to: CursorPoint,
): string | null {
  if (
    !("edge" in from) ||
    !("edge" in to) ||
    from.edge !== "after" ||
    to.edge !== "before"
  ) {
    return null;
  }

  const fromBlockIndex = parseBlockPath(from.path);
  const toBlockIndex = parseBlockPath(to.path);
  if (
    fromBlockIndex === null ||
    toBlockIndex === null ||
    toBlockIndex !== fromBlockIndex + 1 ||
    document.root.children[fromBlockIndex] === undefined ||
    document.root.children[toBlockIndex] === undefined
  ) {
    return null;
  }

  return "\n";
}

function readTextAtPath(document: NoteDocument, path: string): string | null {
  const codeBlockIndex = parseCodeTextPath(path);
  if (codeBlockIndex !== null) {
    const block = document.root.children[codeBlockIndex];
    return isCodeBlock(block) ? block.text : null;
  }

  const inlineTextPath = parseInlineTextPath(path);
  if (inlineTextPath === null) {
    return null;
  }

  const block = document.root.children[inlineTextPath.blockIndex];
  if (!isInlineTextBlock(block)) {
    return null;
  }

  const child = block.children[inlineTextPath.inlineIndex];
  return child?.type === "text" ? child.text : null;
}

function readAtomAtPath(
  document: NoteDocument,
  path: string,
):
  | Extract<InlineNode, { type: "mention" }>
  | { type: "figure"; alt?: string }
  | null {
  const blockIndex = parseBlockPath(path);
  if (blockIndex !== null) {
    const block = document.root.children[blockIndex];
    return isFigureBlock(block)
      ? {
          type: "figure",
          ...(block.alt === undefined ? {} : { alt: block.alt }),
        }
      : null;
  }

  const inlinePath = parseInlineNodePath(path);
  if (inlinePath === null) {
    return null;
  }

  const block = document.root.children[inlinePath.blockIndex];
  if (!isInlineTextBlock(block)) {
    return null;
  }

  const child = block.children[inlinePath.inlineIndex];
  return child?.type === "mention" ? child : null;
}

function collapsedInlineStartCharacterBetween(
  document: NoteDocument,
  from: CursorPoint & { offset: number },
  to: CursorPoint & { offset: number },
): string | null {
  if (to.offset !== 1) {
    return null;
  }

  const fromPath = parseInlineTextPath(from.path);
  const toPath = parseInlineTextPath(to.path);
  if (
    fromPath === null ||
    toPath === null ||
    fromPath.blockIndex !== toPath.blockIndex ||
    toPath.inlineIndex !== fromPath.inlineIndex + 1
  ) {
    return null;
  }

  const fromText = readTextAtPath(document, from.path);
  const toText = readTextAtPath(document, to.path);
  if (fromText === null || toText === null || from.offset !== fromText.length) {
    return null;
  }

  return toText[0] ?? "";
}

function parseCodeTextPath(path: string): number | null {
  const segments = tryParsePointer(path);
  if (
    segments?.length !== 4 ||
    segments[0] !== "root" ||
    segments[1] !== "children" ||
    segments[3] !== "text"
  ) {
    return null;
  }

  return arrayIndexFromSegment(segments[2]);
}

function parseInlineTextPath(
  path: string,
): { blockIndex: number; inlineIndex: number } | null {
  const inlinePath = parseInlineNodePath(path);
  if (inlinePath === null) {
    return null;
  }

  const segments = tryParsePointer(path);
  return segments?.length === 6 && segments[5] === "text" ? inlinePath : null;
}

function parseInlineNodePath(
  path: string,
): { blockIndex: number; inlineIndex: number } | null {
  const segments = tryParsePointer(path);
  if (segments?.length !== 5 && segments?.length !== 6) {
    return null;
  }
  if (
    segments[0] !== "root" ||
    segments[1] !== "children" ||
    segments[3] !== "children"
  ) {
    return null;
  }

  const blockIndex = arrayIndexFromSegment(segments[2]);
  const inlineIndex = arrayIndexFromSegment(segments[4]);
  return blockIndex === null || inlineIndex === null
    ? null
    : { blockIndex, inlineIndex };
}

function parseBlockPath(path: string): number | null {
  const segments = tryParsePointer(path);
  if (
    segments?.length !== 3 ||
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

function hasTextOffset(
  point: CursorPoint,
): point is CursorPoint & { offset: number } {
  return point.offset !== undefined;
}
