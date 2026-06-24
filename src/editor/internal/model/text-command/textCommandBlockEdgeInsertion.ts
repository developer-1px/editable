import { selectionFromCursorPoint } from "../cursorCommands";
import { normalizeInlineChildren } from "../normalizer";
import {
  createParagraphBlock,
  isCodeBlock,
  isInlineTextBlock,
  isTextBlock,
  type NoteDocument,
  textInline,
} from "../noteDocument";
import { codeTextPath, textPath } from "./textCommandAddressing";
import {
  replaceInlineTextRangeWithMarks,
  replaceTextRange,
} from "./textCommandEditingPrimitives";
import {
  addInlineText,
  type InlineTextMarks,
} from "./textCommandInlineTextInsertion";
import type { TextCommandResult } from "./textCommandResult";

export function insertTextAtTextBlockEdge(
  document: NoteDocument,
  blockIndex: number,
  edge: "before" | "after",
  text: string,
  activeMarks: InlineTextMarks = [],
): TextCommandResult {
  return edge === "before"
    ? insertTextAtParagraphStart(document, blockIndex, text, activeMarks)
    : insertTextAtParagraphEnd(document, blockIndex, text, activeMarks);
}

export function insertTextAtBlockAtomEdge(
  document: NoteDocument,
  blockIndex: number,
  edge: "before" | "after",
  text: string,
  activeMarks: InlineTextMarks = [],
): TextCommandResult {
  if (edge === "before") {
    const previousBlockIndex = blockIndex - 1;
    const previous = document.root.children[previousBlockIndex];
    if (isTextBlock(previous)) {
      return insertTextAtParagraphEnd(
        document,
        previousBlockIndex,
        text,
        activeMarks,
      );
    }

    return addParagraph(blockIndex, text, activeMarks);
  }

  const nextBlockIndex = blockIndex + 1;
  const next = document.root.children[nextBlockIndex];
  if (isTextBlock(next)) {
    return insertTextAtParagraphStart(
      document,
      nextBlockIndex,
      text,
      activeMarks,
    );
  }

  return addParagraph(nextBlockIndex, text, activeMarks);
}

function insertTextAtParagraphEnd(
  document: NoteDocument,
  blockIndex: number,
  text: string,
  activeMarks: InlineTextMarks = [],
): TextCommandResult {
  const block = document.root.children[blockIndex];
  if (isCodeBlock(block)) {
    return replaceTextRange(
      {
        blockIndex,
        kind: "code",
        path: codeTextPath(blockIndex),
        text: block.text,
      },
      block.text.length,
      block.text.length,
      text,
    );
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const childIndex = block.children.length - 1;
  const child = block.children[childIndex];
  if (child?.type === "text") {
    const path = textPath(blockIndex, childIndex);
    if (activeMarks.length > 0) {
      return replaceInlineTextRangeWithMarks(
        document,
        {
          blockIndex,
          kind: "inline",
          childIndex,
          path,
          text: child.text,
          marks: child.marks,
        },
        child.text.length,
        child.text.length,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(
      { blockIndex, kind: "inline", childIndex, path, text: child.text },
      child.text.length,
      child.text.length,
      text,
    );
  }

  return addInlineText(blockIndex, block.children.length, text, activeMarks);
}

function insertTextAtParagraphStart(
  document: NoteDocument,
  blockIndex: number,
  text: string,
  activeMarks: InlineTextMarks = [],
): TextCommandResult {
  const block = document.root.children[blockIndex];
  if (isCodeBlock(block)) {
    return replaceTextRange(
      {
        blockIndex,
        kind: "code",
        path: codeTextPath(blockIndex),
        text: block.text,
      },
      0,
      0,
      text,
    );
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const child = block.children[0];
  if (child?.type === "text") {
    const path = textPath(blockIndex, 0);
    if (activeMarks.length > 0) {
      return replaceInlineTextRangeWithMarks(
        document,
        {
          blockIndex,
          kind: "inline",
          childIndex: 0,
          path,
          text: child.text,
          marks: child.marks,
        },
        0,
        0,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(
      { blockIndex, kind: "inline", childIndex: 0, path, text: child.text },
      0,
      0,
      text,
    );
  }

  return addInlineText(blockIndex, 0, text, activeMarks);
}

function addParagraph(
  blockIndex: number,
  text: string,
  marks?: InlineTextMarks,
): TextCommandResult {
  const block = {
    ...createParagraphBlock(""),
    children: normalizeInlineChildren([textInline(text, marks)]),
  };

  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${blockIndex}`, value: block }],
    selectionAfter: selectionFromCursorPoint({
      path: textPath(blockIndex, 0),
      offset: text.length,
    }),
  };
}
