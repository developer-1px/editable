import { normalizeBlocks, normalizeInlineChildren } from "../normalizer";
import {
  createParagraphBlock,
  type InlineNode,
  type NoteDocument,
} from "../noteDocument";
import type { TextCommandResult } from "./textCommandResult";
import {
  selectionAfterInlinePrefix,
  selectionAtChildrenStart,
  selectionAtReplacementBlockBoundary,
} from "./textCommandSelection";
import {
  type BlockSplitPosition,
  isAtParagraphStart,
  type NonCodeSplitPosition,
  type ParagraphSplitPosition,
} from "./textCommandSplitPosition";

export function replaceNonCodeDocumentRange(
  document: NoteDocument,
  start: NonCodeSplitPosition,
  end: NonCodeSplitPosition,
  replacementChild: InlineNode | null,
): TextCommandResult | null {
  if (start.kind === "paragraph" && end.kind === "paragraph") {
    if (start.blockIndex === end.blockIndex) {
      return replaceSameParagraphRange(start, end, replacementChild);
    }

    return replaceParagraphToParagraphRange(
      document,
      start,
      end,
      replacementChild,
    );
  }

  if (start.kind === "paragraph" && end.kind === "block") {
    return replaceParagraphToBlockRange(document, start, end, replacementChild);
  }

  if (start.kind === "block" && end.kind === "block") {
    return replaceBlockToBlockRange(document, start, end, replacementChild);
  }

  if (start.kind === "block" && end.kind === "paragraph") {
    return replaceBlockToParagraphRange(document, start, end, replacementChild);
  }

  return null;
}

function replaceSameParagraphRange(
  start: ParagraphSplitPosition,
  end: ParagraphSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const rawChildren = [
    ...start.beforeChildren,
    ...(replacement === null ? [] : [replacement]),
    ...end.afterChildren,
  ];
  const children = normalizeInlineChildren(rawChildren);
  const block = { ...start.block, children };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${start.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      start.blockIndex,
      children,
      replacement === null
        ? start.beforeChildren
        : [...start.beforeChildren, replacement],
    ),
  };
}

function replaceParagraphToParagraphRange(
  document: NoteDocument,
  start: ParagraphSplitPosition,
  end: ParagraphSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementPrefix =
    replacement === null
      ? start.beforeChildren
      : [...start.beforeChildren, replacement];

  if (isAtParagraphStart(end)) {
    const startBlock = {
      ...start.block,
      children: normalizeInlineChildren(replacementPrefix),
    };
    const blocks = normalizeBlocks([
      ...document.root.children.slice(0, start.blockIndex),
      startBlock,
      ...document.root.children.slice(end.blockIndex),
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

  const rawChildren = [...replacementPrefix, ...end.afterChildren];
  const mergedBlock = {
    ...start.block,
    children: normalizeInlineChildren(rawChildren),
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    mergedBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter: selectionAfterInlinePrefix(
      start.blockIndex,
      mergedBlock.children,
      replacementPrefix,
    ),
  };
}

function replaceParagraphToBlockRange(
  document: NoteDocument,
  start: ParagraphSplitPosition,
  end: BlockSplitPosition,
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
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.blockIndex),
    startBlock,
    ...document.root.children.slice(end.insertIndex),
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

function replaceBlockToBlockRange(
  document: NoteDocument,
  start: BlockSplitPosition,
  end: BlockSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const replacementChildren =
    replacement === null ? [] : normalizeInlineChildren([replacement]);
  const replacementBlock =
    replacement === null
      ? []
      : [{ ...createParagraphBlock(""), children: replacementChildren }];
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.insertIndex),
    ...replacementBlock,
    ...document.root.children.slice(end.insertIndex),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionAtReplacementBlockBoundary(blocks, start.insertIndex)
        : selectionAfterInlinePrefix(start.insertIndex, replacementChildren, [
            replacement,
          ]),
  };
}

function replaceBlockToParagraphRange(
  document: NoteDocument,
  start: BlockSplitPosition,
  end: ParagraphSplitPosition,
  replacement: InlineNode | null,
): TextCommandResult {
  const rawChildren = [
    ...(replacement === null ? [] : [replacement]),
    ...end.afterChildren,
  ];
  const endBlock = {
    ...end.block,
    children: normalizeInlineChildren(rawChildren),
  };
  const blocks = normalizeBlocks([
    ...document.root.children.slice(0, start.insertIndex),
    endBlock,
    ...document.root.children.slice(end.blockIndex + 1),
  ]);

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      replacement === null
        ? selectionAtChildrenStart(start.insertIndex, endBlock.children)
        : selectionAfterInlinePrefix(start.insertIndex, endBlock.children, [
            replacement,
          ]),
  };
}
