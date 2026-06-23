import { selectionFromCursorPoint } from "../cursorCommands";
import { normalizeBlocks, normalizeInlineChildren } from "../normalizer";
import {
  createParagraphBlock,
  type InlineNode,
  type NoteDocument,
} from "../noteDocument";
import { codeTextPath } from "./textCommandAddressing";
import { replaceNonCodeDocumentRange } from "./textCommandNonCodeDocumentRange";
import type { TextCommandResult } from "./textCommandResult";
import { selectionAfterInlinePrefix } from "./textCommandSelection";
import type {
  BlockSplitPosition,
  CodeSplitPosition,
  ParagraphSplitPosition,
  SplitPosition,
} from "./textCommandSplitPosition";

export function replaceCodeAwareDocumentRange(
  document: NoteDocument,
  start: SplitPosition,
  end: SplitPosition,
  replacementText: string,
  replacementChild: InlineNode | null,
): TextCommandResult | null {
  if (start.kind !== "codeBlock" && end.kind !== "codeBlock") {
    return replaceNonCodeDocumentRange(document, start, end, replacementChild);
  }

  if (start.kind === "codeBlock" && end.kind === "codeBlock") {
    return replaceCodeToCodeRange(document, start, end, replacementText);
  }

  if (start.kind === "codeBlock" && end.kind === "paragraph") {
    return replaceCodeToParagraphRange(document, start, end, replacementText);
  }

  if (start.kind === "paragraph" && end.kind === "codeBlock") {
    return replaceParagraphToCodeRange(document, start, end, replacementChild);
  }

  if (start.kind === "codeBlock" && end.kind === "block") {
    return replaceCodeToBlockRange(document, start, end, replacementText);
  }

  if (start.kind === "block" && end.kind === "codeBlock") {
    return replaceBlockToCodeRange(document, start, end, replacementChild);
  }

  return null;
}

function replaceCodeToCodeRange(
  document: NoteDocument,
  start: CodeSplitPosition,
  end: CodeSplitPosition,
  replacement: string,
): TextCommandResult {
  const selectionAfter = selectionFromCursorPoint({
    path: codeTextPath(start.blockIndex),
    offset: start.beforeText.length + replacement.length,
  });

  if (start.blockIndex === end.blockIndex) {
    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: codeTextPath(start.blockIndex),
          value: `${start.beforeText}${replacement}${end.afterText}`,
        },
      ],
      selectionAfter,
    };
  }

  const startBlock = {
    ...start.block,
    text: `${start.beforeText}${replacement}`,
  };
  const endBlock = { ...end.block, text: end.afterText };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter,
  };
}

function replaceCodeToParagraphRange(
  document: NoteDocument,
  start: CodeSplitPosition,
  end: ParagraphSplitPosition,
  replacement: string,
): TextCommandResult {
  const startBlock = {
    ...start.block,
    text: `${start.beforeText}${replacement}`,
  };
  const endBlock = {
    ...end.block,
    children: normalizeInlineChildren(end.afterChildren),
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionFromCursorPoint({
      path: codeTextPath(start.blockIndex),
      offset: startBlock.text.length,
    }),
  };
}

function replaceParagraphToCodeRange(
  document: NoteDocument,
  start: ParagraphSplitPosition,
  end: CodeSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementPrefix =
    replacement === null
      ? start.beforeChildren
      : [...start.beforeChildren, replacement];
  const startBlock = {
    ...start.block,
    children: normalizeInlineChildren(replacementPrefix),
  };
  const endBlock = { ...end.block, text: end.afterText };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionAfterInlinePrefix(
      start.blockIndex,
      startBlock.children,
      replacementPrefix,
    ),
  };
}

function replaceCodeToBlockRange(
  document: NoteDocument,
  start: CodeSplitPosition,
  end: BlockSplitPosition,
  replacement: string,
): TextCommandResult {
  const startBlock = {
    ...start.block,
    text: `${start.beforeText}${replacement}`,
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    ...document.root.children.slice(end.insertIndex),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionFromCursorPoint({
      path: codeTextPath(start.blockIndex),
      offset: startBlock.text.length,
    }),
  };
}

function replaceBlockToCodeRange(
  document: NoteDocument,
  start: BlockSplitPosition,
  end: CodeSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementChildren =
    replacement === null ? [] : normalizeInlineChildren([replacement]);
  const replacementBlock =
    replacement === null
      ? []
      : [{ ...createParagraphBlock(""), children: replacementChildren }];
  const endBlock = { ...end.block, text: end.afterText };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.insertIndex),
    ...replacementBlock,
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionFromCursorPoint({
            path: codeTextPath(start.insertIndex),
            offset: 0,
          })
        : selectionAfterInlinePrefix(start.insertIndex, replacementChildren, [
            replacement,
          ]),
  };
}
