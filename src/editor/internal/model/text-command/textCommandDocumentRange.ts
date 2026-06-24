import { selectionFromCursorPoint } from "../cursorCommands";
import { normalizeBlocks } from "../normalizer";
import type { InlineNode, NoteBlock, NoteDocument } from "../noteDocument";
import { spliceBlockFragment } from "./spliceBlockFragment";
import { textInline } from "./textCommandAddressing";
import { replaceCodeAwareDocumentRange } from "./textCommandCodeDocumentRange";
import { replaceNonCodeDocumentRange } from "./textCommandNonCodeDocumentRange";
import type { TextCommandResult } from "./textCommandResult";
import type { SelectedDocumentRange } from "./textCommandSelectionTargets";
import {
  blocksAfterBlockFragmentPosition,
  blocksAfterSplitPosition,
  blocksBeforeBlockFragmentPosition,
  blocksBeforeSplitPosition,
  marksForReplacement,
  nonCodeSplitPositionFromCursorPoint,
  splitPositionFromCursorPoint,
} from "./textCommandSplitPosition";

type FigureBlock = Extract<NoteBlock, { type: "figure" }>;

export function replaceDocumentRangeWithText(
  document: NoteDocument,
  range: SelectedDocumentRange,
  replacement: string,
): TextCommandResult | null {
  const start = nonCodeSplitPositionFromCursorPoint(document, range.start);
  const end = nonCodeSplitPositionFromCursorPoint(document, range.end);
  const replacementChild =
    replacement.length === 0
      ? null
      : textInline(replacement, marksForReplacement(document, range.start));
  if (start !== null && end !== null) {
    return replaceNonCodeDocumentRange(document, start, end, replacementChild);
  }

  const codeStart = splitPositionFromCursorPoint(document, range.start);
  const codeEnd = splitPositionFromCursorPoint(document, range.end);
  if (codeStart === null || codeEnd === null) {
    return null;
  }

  return replaceCodeAwareDocumentRange(
    document,
    codeStart,
    codeEnd,
    replacement,
    replacementChild,
  );
}

export function replaceDocumentRangeWithInlineNode(
  document: NoteDocument,
  range: SelectedDocumentRange,
  replacement: InlineNode,
): TextCommandResult | null {
  const start = nonCodeSplitPositionFromCursorPoint(document, range.start);
  const end = nonCodeSplitPositionFromCursorPoint(document, range.end);
  if (start === null || end === null) {
    return null;
  }

  return replaceNonCodeDocumentRange(document, start, end, replacement);
}

export function replaceDocumentRangeWithFigure(
  document: NoteDocument,
  range: SelectedDocumentRange,
  figure: FigureBlock,
): TextCommandResult | null {
  const start = splitPositionFromCursorPoint(document, range.start);
  const end = splitPositionFromCursorPoint(document, range.end);
  if (start === null || end === null) {
    return null;
  }

  const beforeBlocks = blocksBeforeSplitPosition(document, start);
  const afterBlocks = blocksAfterSplitPosition(document, end);
  const figureIndex = beforeBlocks.length;
  const blocks = normalizeBlocks([...beforeBlocks, figure, ...afterBlocks]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionFromCursorPoint({
      path: `/root/children/${figureIndex}`,
      edge: "after",
    }),
  };
}

export function replaceDocumentRangeWithBlockFragment(
  document: NoteDocument,
  range: SelectedDocumentRange,
  fragment: NoteBlock[],
): TextCommandResult | null {
  const start = splitPositionFromCursorPoint(document, range.start);
  const end = splitPositionFromCursorPoint(document, range.end);
  if (start === null || end === null) {
    return null;
  }

  return spliceBlockFragment(
    blocksBeforeBlockFragmentPosition(document, start),
    fragment,
    blocksAfterBlockFragmentPosition(document, end),
  );
}
