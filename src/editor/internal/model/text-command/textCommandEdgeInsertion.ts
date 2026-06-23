import type { EdgeCursorPoint } from "../cursor";
import {
  isInlineTextBlock,
  isTextBlock,
  type NoteDocument,
} from "../noteDocument";
import {
  blockLocationFromPath,
  inlineAtomLocationFromPath,
  textPath,
} from "./textCommandAddressing";
import {
  insertTextAtBlockAtomEdge,
  insertTextAtTextBlockEdge,
} from "./textCommandBlockEdgeInsertion";
import {
  replaceInlineTextRangeWithMarks,
  replaceTextRange,
} from "./textCommandEditingPrimitives";
import {
  addInlineText,
  type InlineTextMarks,
} from "./textCommandInlineTextInsertion";
import type { TextCommandResult } from "./textCommandResult";

export function insertTextAtAtomEdge(
  document: NoteDocument,
  point: EdgeCursorPoint,
  text: string,
  activeMarks: InlineTextMarks = [],
): TextCommandResult {
  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    return insertTextAtInlineAtomEdge(
      document,
      inline,
      point.edge,
      text,
      activeMarks,
    );
  }

  const block = blockLocationFromPath(document, point.path);
  if (block !== null) {
    const blockNode = document.root.children[block];
    if (isTextBlock(blockNode)) {
      return insertTextAtTextBlockEdge(
        document,
        block,
        point.edge,
        text,
        activeMarks,
      );
    }

    return insertTextAtBlockAtomEdge(
      document,
      block,
      point.edge,
      text,
      activeMarks,
    );
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function insertTextAtInlineAtomEdge(
  document: NoteDocument,
  location: { blockIndex: number; childIndex: number },
  edge: "before" | "after",
  text: string,
  activeMarks: InlineTextMarks = [],
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Inline atom must belong to a paragraph." };
  }

  if (edge === "before") {
    const previousChildIndex = location.childIndex - 1;
    const previous = block.children[previousChildIndex];
    if (previous?.type === "text") {
      const path = textPath(location.blockIndex, previousChildIndex);
      if (activeMarks.length > 0) {
        return replaceInlineTextRangeWithMarks(
          document,
          {
            blockIndex: location.blockIndex,
            kind: "inline",
            childIndex: previousChildIndex,
            path,
            text: previous.text,
            marks: previous.marks,
          },
          previous.text.length,
          previous.text.length,
          text,
          activeMarks,
        );
      }

      return replaceTextRange(
        {
          blockIndex: location.blockIndex,
          kind: "inline",
          childIndex: previousChildIndex,
          path,
          text: previous.text,
        },
        previous.text.length,
        previous.text.length,
        text,
      );
    }

    return addInlineText(
      location.blockIndex,
      location.childIndex,
      text,
      activeMarks,
    );
  }

  const nextChildIndex = location.childIndex + 1;
  const next = block.children[nextChildIndex];
  if (next?.type === "text") {
    const path = textPath(location.blockIndex, nextChildIndex);
    if (activeMarks.length > 0) {
      return replaceInlineTextRangeWithMarks(
        document,
        {
          blockIndex: location.blockIndex,
          kind: "inline",
          childIndex: nextChildIndex,
          path,
          text: next.text,
          marks: next.marks,
        },
        0,
        0,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(
      {
        blockIndex: location.blockIndex,
        kind: "inline",
        childIndex: nextChildIndex,
        path,
        text: next.text,
      },
      0,
      0,
      text,
    );
  }

  return addInlineText(location.blockIndex, nextChildIndex, text, activeMarks);
}
