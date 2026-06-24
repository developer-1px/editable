import { selectionFromCursorPoint } from "../cursorCommands";
import { normalizeInlineChildren } from "../normalizer";
import {
  createParagraphBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../noteDocument";
import { textPath } from "./textCommandAddressing";
import type { TextCommandResult } from "./textCommandResult";
import {
  selectionAfterBlockRemoval,
  selectionAfterInlinePrefix,
} from "./textCommandSelection";
import type { SelectedAtom } from "./textCommandSelectionTargets";

export function deleteInlineAtom(
  document: NoteDocument,
  blockIndex: number,
  childIndex: number,
): TextCommandResult {
  const block = document.root.children[blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Inline atom must belong to a paragraph." };
  }

  if (block.children.length === 1) {
    const path = textPath(blockIndex, 0);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${blockIndex}/children`,
          value: [{ type: "text", text: "" }],
        },
      ],
      selectionAfter: selectionFromCursorPoint({ path, offset: 0 }),
    };
  }

  const prefix = block.children.slice(0, childIndex);
  const children = normalizeInlineChildren([
    ...prefix,
    ...block.children.slice(childIndex + 1),
  ]);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}/children`,
        value: children,
      },
    ],
    selectionAfter: selectionAfterInlinePrefix(blockIndex, children, prefix),
  };
}

export function deleteFigureBlock(
  document: NoteDocument,
  blockIndex: number,
): TextCommandResult {
  if (document.root.children.length === 1) {
    const block = createParagraphBlock("");

    return {
      ok: true,
      patch: [{ op: "replace", path: "/root/children/0", value: block }],
      selectionAfter: selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    };
  }

  return {
    ok: true,
    patch: [{ op: "remove", path: `/root/children/${blockIndex}` }],
    selectionAfter: selectionAfterBlockRemoval(document, blockIndex),
  };
}

export function deleteSelectedAtom(
  document: NoteDocument,
  atom: SelectedAtom,
): TextCommandResult {
  return atom.kind === "inline"
    ? deleteInlineAtom(document, atom.blockIndex, atom.childIndex)
    : deleteFigureBlock(document, atom.blockIndex);
}
