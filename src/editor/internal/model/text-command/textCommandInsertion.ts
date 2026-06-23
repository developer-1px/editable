import type { SelectionSnap } from "@interactive-os/json-document";
import { normalizeCursorPoint } from "../cursor";
import {
  cursorPointInputFromSelection,
  selectionFromCursorPoint,
} from "../cursorCommands";
import { activeMarksFromSelection } from "../markCommands";
import { normalizeInlineChildren } from "../normalizer";
import {
  createParagraphBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../noteDocument";
import {
  textInline,
  textLocationFromPath,
  textPath,
} from "./textCommandAddressing";
import { deleteSelectedAtom } from "./textCommandAtomDeletion";
import { replaceDocumentRangeWithText } from "./textCommandDocumentRange";
import { insertTextAtAtomEdge } from "./textCommandEdgeInsertion";
import {
  replaceInlineTextRangeWithMarks,
  replaceTextRange,
} from "./textCommandEditingPrimitives";
import type { TextCommandResult } from "./textCommandResult";
import { selectionAfterInlinePrefix } from "./textCommandSelection";
import {
  type SelectedAtom,
  selectedDocumentRange,
  selectedSingleAtom,
  selectedSingleTextRange,
} from "./textCommandSelectionTargets";

export function insertText(
  document: NoteDocument,
  selection: SelectionSnap,
  text: string,
): TextCommandResult {
  const activeMarks = activeMarksFromSelection(selection);
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return replaceTextRange(
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      text,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithText(document, selectedAtom, text);
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithText(document, selectedRange, text);
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    const location = textLocationFromPath(document, point.path);
    if (location === null) {
      return { ok: false, reason: "Cursor text path does not exist." };
    }

    if (
      text.length > 0 &&
      activeMarks.length > 0 &&
      location.kind === "inline"
    ) {
      return replaceInlineTextRangeWithMarks(
        document,
        location,
        point.offset,
        point.offset,
        text,
        activeMarks,
      );
    }

    return replaceTextRange(location, point.offset, point.offset, text);
  }

  return insertTextAtAtomEdge(document, point, text, activeMarks);
}

function replaceSelectedAtomWithText(
  document: NoteDocument,
  atom: SelectedAtom,
  text: string,
): TextCommandResult {
  if (text.length === 0) {
    return deleteSelectedAtom(document, atom);
  }

  if (atom.kind === "inline") {
    const block = document.root.children[atom.blockIndex];
    if (!isInlineTextBlock(block)) {
      return { ok: false, reason: "Inline atom must belong to a paragraph." };
    }
    const replacement = textInline(text);
    const prefix = [...block.children.slice(0, atom.childIndex), replacement];
    const children = normalizeInlineChildren([
      ...prefix,
      ...block.children.slice(atom.childIndex + 1),
    ]);

    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${atom.blockIndex}/children`,
          value: children,
        },
      ],
      selectionAfter: selectionAfterInlinePrefix(
        atom.blockIndex,
        children,
        prefix,
      ),
    };
  }

  const block = createParagraphBlock(text);

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${atom.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: textPath(atom.blockIndex, 0),
      offset: text.length,
    }),
  };
}
