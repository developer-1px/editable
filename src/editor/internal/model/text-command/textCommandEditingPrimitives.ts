import type { EdgeCursorPoint, TextCursorPoint } from "../cursor";
import { selectionFromCursorPoint } from "../cursorCommands";
import { normalizeInlineChildren } from "../normalizer";
import {
  type InlineNode,
  isInlineTextBlock,
  type NoteDocument,
} from "../noteDocument";
import { type TextLocation, textInline } from "./textCommandAddressing";
import type { TextCommandResult } from "./textCommandResult";
import { selectionAfterInlinePrefix } from "./textCommandSelection";

export function replaceTextRange(
  location: TextLocation,
  startOffset: number,
  endOffset: number,
  replacement: string,
): TextCommandResult {
  const nextText = [
    location.text.slice(0, startOffset),
    replacement,
    location.text.slice(endOffset),
  ].join("");
  const offset = startOffset + replacement.length;

  return {
    ok: true,
    patch: [{ op: "replace", path: location.path, value: nextText }],
    selectionAfter: selectionFromCursorPoint({
      path: location.path,
      offset,
    }),
  };
}

export function replaceInlineTextRangeWithMarks(
  document: NoteDocument,
  location: Extract<TextLocation, { kind: "inline" }>,
  startOffset: number,
  endOffset: number,
  replacement: string,
  replacementMarks: Extract<InlineNode, { type: "text" }>["marks"],
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected inline text block." };
  }

  const beforeText = location.text.slice(0, startOffset);
  const afterText = location.text.slice(endOffset);
  const rawChildren = [
    ...block.children.slice(0, location.childIndex),
    ...(beforeText.length === 0
      ? []
      : [textInline(beforeText, location.marks)]),
    ...(replacement.length === 0
      ? []
      : [textInline(replacement, replacementMarks)]),
    ...(afterText.length === 0 ? [] : [textInline(afterText, location.marks)]),
    ...block.children.slice(location.childIndex + 1),
  ];
  const children = normalizeInlineChildren(rawChildren);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${location.blockIndex}/children`,
        value: children,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(location.blockIndex, children, [
      ...block.children.slice(0, location.childIndex),
      ...(beforeText.length === 0
        ? []
        : [textInline(beforeText, location.marks)]),
      ...(replacement.length === 0
        ? []
        : [textInline(replacement, replacementMarks)]),
    ]),
  };
}

export function noOp(
  point: TextCursorPoint | EdgeCursorPoint,
): TextCommandResult {
  return {
    ok: true,
    patch: [],
    selectionAfter: selectionFromCursorPoint(point),
  };
}
