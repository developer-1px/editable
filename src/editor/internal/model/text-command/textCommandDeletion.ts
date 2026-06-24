import type { SelectionSnap } from "@interactive-os/json-document";
import {
  type EdgeCursorPoint,
  normalizeCursorPoint,
  type TextCursorPoint,
} from "../cursor";
import { cursorPointInputFromSelection } from "../cursorCommands";
import { mergeAdjacentText, normalizeInlineChildren } from "../normalizer";
import {
  isCodeBlock,
  isInlineTextBlock,
  isTextBlock,
  type NoteDocument,
} from "../noteDocument";
import {
  nextTextBoundaryOffset,
  previousTextBoundaryOffset,
  snapTextOffset,
} from "../textBoundaries";
import {
  blockAtomLocationFromPath,
  blockLocationFromPath,
  inlineAtomLocationFromPath,
  type TextLocation,
  textLocationFromPath,
} from "./textCommandAddressing";
import {
  deleteFigureBlock,
  deleteInlineAtom,
  deleteSelectedAtom,
} from "./textCommandAtomDeletion";
import { replaceDocumentRangeWithText } from "./textCommandDocumentRange";
import { noOp, replaceTextRange } from "./textCommandEditingPrimitives";
import type { TextCommandResult } from "./textCommandResult";
import {
  isTextLocationAtBlockEnd,
  isTextLocationAtBlockStart,
  selectionAfterInlinePrefix,
  selectionAtBlockEnd,
} from "./textCommandSelection";
import {
  selectedDocumentRange,
  selectedSingleAtom,
  selectedSingleTextRange,
} from "./textCommandSelectionTargets";

export function deleteBackward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteSelection(document, selection, "backward");
}

export function deleteForward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteSelection(document, selection, "forward");
}

function deleteSelection(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
): TextCommandResult {
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return deleteTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return deleteSelectedAtom(document, selectedAtom);
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithText(document, selectedRange, "");
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    return deleteFromTextPoint(document, point, direction);
  }

  return deleteFromAtomPoint(document, point, direction);
}

function deleteFromTextPoint(
  document: NoteDocument,
  point: TextCursorPoint,
  direction: "backward" | "forward",
): TextCommandResult {
  const location = textLocationFromPath(document, point.path);
  if (location === null) {
    return { ok: false, reason: "Cursor text path does not exist." };
  }

  const currentOffset = snapTextOffset(
    location.text,
    point.offset,
    direction === "backward" ? "forward" : "backward",
  );
  if (direction === "backward" && currentOffset <= 0) {
    return isTextLocationAtBlockStart(document, location)
      ? mergeWithPreviousTextBlock(document, location.blockIndex)
      : noOp(point);
  }
  if (direction === "forward" && currentOffset >= location.text.length) {
    return isTextLocationAtBlockEnd(document, location)
      ? mergeWithNextTextBlock(document, location.blockIndex)
      : noOp(point);
  }

  const startOffset =
    direction === "backward"
      ? previousTextBoundaryOffset(location.text, currentOffset)
      : currentOffset;
  const endOffset =
    direction === "backward"
      ? currentOffset
      : nextTextBoundaryOffset(location.text, currentOffset);
  if (startOffset === endOffset) {
    return noOp(point);
  }

  return deleteTextRange(document, location, startOffset, endOffset);
}

function deleteFromAtomPoint(
  document: NoteDocument,
  point: EdgeCursorPoint,
  direction: "backward" | "forward",
): TextCommandResult {
  const edgeBlockIndex = blockLocationFromPath(document, point.path);
  const block =
    edgeBlockIndex === null
      ? undefined
      : document.root.children[edgeBlockIndex];
  if (edgeBlockIndex !== null && isTextBlock(block)) {
    if (direction === "backward" && point.edge === "before") {
      return mergeWithPreviousTextBlock(document, edgeBlockIndex);
    }
    if (direction === "forward" && point.edge === "after") {
      return mergeWithNextTextBlock(document, edgeBlockIndex);
    }

    return noOp(point);
  }

  const shouldDelete =
    (direction === "backward" && point.edge === "after") ||
    (direction === "forward" && point.edge === "before");
  if (!shouldDelete) {
    const inline = inlineAtomLocationFromPath(document, point.path);
    if (inline !== null) {
      if (
        direction === "backward" &&
        point.edge === "before" &&
        inline.childIndex === 0
      ) {
        return mergeWithPreviousTextBlock(document, inline.blockIndex);
      }
      const block = document.root.children[inline.blockIndex];
      if (
        direction === "forward" &&
        point.edge === "after" &&
        isInlineTextBlock(block) &&
        inline.childIndex === block.children.length - 1
      ) {
        return mergeWithNextTextBlock(document, inline.blockIndex);
      }
    }

    return noOp(point);
  }

  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    return deleteInlineAtom(document, inline.blockIndex, inline.childIndex);
  }

  const blockIndex = blockAtomLocationFromPath(document, point.path);
  if (blockIndex !== null) {
    return deleteFigureBlock(document, blockIndex);
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function deleteTextRange(
  document: NoteDocument,
  location: TextLocation,
  startOffset: number,
  endOffset: number,
): TextCommandResult {
  const nextText = [
    location.text.slice(0, startOffset),
    location.text.slice(endOffset),
  ].join("");
  const block = document.root.children[location.blockIndex];

  if (
    nextText.length > 0 ||
    location.kind === "code" ||
    !isInlineTextBlock(block) ||
    block.children.length === 1
  ) {
    return replaceTextRange(location, startOffset, endOffset, "");
  }

  const prefix = block.children.slice(0, location.childIndex);
  const children = normalizeInlineChildren([
    ...prefix,
    ...block.children.slice(location.childIndex + 1),
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${location.blockIndex}/children`,
        value: children,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      location.blockIndex,
      children,
      prefix,
    ),
  };
}

function mergeWithPreviousTextBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  if (blockIndex <= 0) {
    return noOp({ path: `/root/children/${blockIndex}`, edge: "before" });
  }

  const previous = document.root.children[blockIndex - 1];
  const current = document.root.children[blockIndex];
  if (isCodeBlock(previous) && isCodeBlock(current)) {
    const selectionAfter = selectionAtBlockEnd(document, blockIndex - 1);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${blockIndex - 1}/text`,
          value: previous.text + current.text,
        },
        { op: "remove", path: `/root/children/${blockIndex}` },
      ],
      selectionAfter,
    };
  }

  if (!isInlineTextBlock(previous) || !isInlineTextBlock(current)) {
    return noOp({ path: `/root/children/${blockIndex}`, edge: "before" });
  }

  const selectionAfter = selectionAtBlockEnd(document, blockIndex - 1);
  const mergedChildren = mergeAdjacentText([
    ...previous.children,
    ...current.children,
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex - 1}/children`,
        value: mergedChildren,
      },
      { op: "remove", path: `/root/children/${blockIndex}` },
    ],
    selectionAfter,
  };
}

function mergeWithNextTextBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  const current = document.root.children[blockIndex];
  const next = document.root.children[blockIndex + 1];
  if (isCodeBlock(current) && isCodeBlock(next)) {
    const selectionAfter = selectionAtBlockEnd(document, blockIndex);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${blockIndex}/text`,
          value: current.text + next.text,
        },
        { op: "remove", path: `/root/children/${blockIndex + 1}` },
      ],
      selectionAfter,
    };
  }

  if (!isInlineTextBlock(current) || !isInlineTextBlock(next)) {
    return noOp({ path: `/root/children/${blockIndex}`, edge: "after" });
  }

  const selectionAfter = selectionAtBlockEnd(document, blockIndex);
  const mergedChildren = mergeAdjacentText([
    ...current.children,
    ...next.children,
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}/children`,
        value: mergedChildren,
      },
      { op: "remove", path: `/root/children/${blockIndex + 1}` },
    ],
    selectionAfter,
  };
}
