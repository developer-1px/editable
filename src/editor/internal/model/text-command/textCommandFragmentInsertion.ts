import type { SelectionSnap } from "@interactive-os/json-document";
import { normalizeCursorPoint } from "../cursor";
import { cursorPointInputFromSelection } from "../cursorCommands";
import { normalizeBlocks, normalizeInlineChildren } from "../normalizer";
import {
  createDocumentRoot,
  createParagraphBlock,
  type InlineNode,
  type InlineNodeInput,
  type NoteBlock,
  type NoteBlockInput,
  type NoteDocument,
} from "../noteDocument";
import { spliceBlockFragment } from "./spliceBlockFragment";
import { withFreshBlockIds } from "./textCommandBlockIds";
import {
  replaceDocumentRangeWithBlockFragment,
  replaceDocumentRangeWithInlineNode,
  replaceDocumentRangeWithText,
} from "./textCommandDocumentRange";
import { insertText } from "./textCommandInsertion";
import { blockPlainText, inlineNodesPlainText } from "./textCommandPlainText";
import type { TextCommandResult } from "./textCommandResult";
import { selectionAfterInlinePrefix } from "./textCommandSelection";
import { selectedDocumentRange } from "./textCommandSelectionTargets";
import {
  type BlockSplitPosition,
  blocksAfterBlockFragmentPosition,
  blocksBeforeBlockFragmentPosition,
  nonCodeSplitPositionFromCursorPoint,
  type ParagraphSplitPosition,
  type SplitPosition,
  splitPositionFromCursorPoint,
} from "./textCommandSplitPosition";

export function insertInlineFragment(
  document: NoteDocument,
  selection: SelectionSnap,
  fragment: InlineNodeInput[],
): TextCommandResult {
  const children = normalizeInlineChildren(fragment);
  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    if (children.length === 1) {
      const result = replaceDocumentRangeWithInlineNode(
        document,
        selectedRange,
        children[0] as InlineNode,
      );
      if (result !== null) {
        return result;
      }
    }

    const result = replaceDocumentRangeWithText(
      document,
      selectedRange,
      inlineNodesPlainText(children),
    );
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const position = nonCodeSplitPositionFromCursorPoint(document, point);
  if (position === null) {
    return insertText(document, selection, inlineNodesPlainText(children));
  }

  if (position.kind === "paragraph") {
    return insertInlineFragmentAtParagraphPosition(position, children);
  }

  return insertInlineFragmentAtBlockPosition(position, children);
}

export function insertBlockFragment(
  document: NoteDocument,
  selection: SelectionSnap,
  fragment: NoteBlockInput[],
): TextCommandResult {
  const blocks = withFreshBlockIds(
    normalizeBlocks(createDocumentRoot(fragment).children),
  );
  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithBlockFragment(
      document,
      selectedRange,
      blocks,
    );
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const position = splitPositionFromCursorPoint(document, point);
  if (position === null) {
    return insertText(
      document,
      selection,
      blocks.map((block) => blockPlainText(block)).join("\n"),
    );
  }

  return insertBlockFragmentAtSplitPosition(document, position, blocks);
}

function insertBlockFragmentAtSplitPosition(
  document: NoteDocument,
  position: SplitPosition,
  fragment: NoteBlock[],
): TextCommandResult {
  return spliceBlockFragment(
    blocksBeforeBlockFragmentPosition(document, position),
    fragment,
    blocksAfterBlockFragmentPosition(document, position),
  );
}

function insertInlineFragmentAtParagraphPosition(
  position: ParagraphSplitPosition,
  fragment: InlineNode[],
): TextCommandResult {
  const prefix = [...position.beforeChildren, ...fragment];
  const block = {
    ...position.block,
    children: normalizeInlineChildren([...prefix, ...position.afterChildren]),
  };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${position.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      position.blockIndex,
      block.children,
      prefix,
    ),
  };
}

function insertInlineFragmentAtBlockPosition(
  position: BlockSplitPosition,
  fragment: InlineNode[],
): TextCommandResult {
  const block = {
    ...createParagraphBlock(""),
    children: normalizeInlineChildren(fragment),
  };

  return {
    ok: true,
    patch: [
      {
        op: "add",
        path: `/root/children/${position.insertIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(
      position.insertIndex,
      block.children,
      fragment,
    ),
  };
}
