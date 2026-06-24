import { normalizeBlocks } from "../normalizer";
import type { NoteBlock } from "../noteDocument";
import { ensureUniqueBlockIds } from "./textCommandBlockIds";
import type { TextCommandResult } from "./textCommandResult";
import {
  selectionAtInsertedBlockEnd,
  selectionAtReplacementBlockBoundary,
} from "./textCommandSelection";

export function spliceBlockFragment(
  beforeBlocks: NoteBlock[],
  fragment: NoteBlock[],
  afterBlocks: NoteBlock[],
): TextCommandResult {
  const insertIndex = beforeBlocks.length;
  const blocks = ensureUniqueBlockIds(
    normalizeBlocks([...beforeBlocks, ...fragment, ...afterBlocks]),
  );
  const lastInsertedIndex = Math.min(
    insertIndex + Math.max(fragment.length, 1) - 1,
    blocks.length - 1,
  );
  const insertedBlock = blocks[lastInsertedIndex];

  return {
    ok: true,
    patch: [{ op: "replace", path: "/root/children", value: blocks }],
    selectionAfter:
      insertedBlock === undefined
        ? selectionAtReplacementBlockBoundary(blocks, insertIndex)
        : selectionAtInsertedBlockEnd(lastInsertedIndex, insertedBlock),
  };
}
