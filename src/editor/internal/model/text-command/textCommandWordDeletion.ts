import type { SelectionSnap } from "@interactive-os/json-document";
import { normalizeCursorPoint } from "../cursor";
import {
  cursorPointInputFromSelection,
  moveWordLeft,
  moveWordRight,
} from "../cursorCommands";
import type { NoteDocument } from "../noteDocument";
import { deleteForward } from "./textCommandDeletion";
import { noOp } from "./textCommandEditingPrimitives";
import type { TextCommandResult } from "./textCommandResult";
import { selectedDocumentRange } from "./textCommandSelectionTargets";

export function deleteWordBackward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteWordSelection(document, selection, "backward");
}

export function deleteWordForward(
  document: NoteDocument,
  selection: SelectionSnap,
): TextCommandResult {
  return deleteWordSelection(document, selection, "forward");
}

function deleteWordSelection(
  document: NoteDocument,
  selection: SelectionSnap,
  direction: "backward" | "forward",
): TextCommandResult {
  if (selectedDocumentRange(document, selection) !== null) {
    return deleteForward(document, selection);
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );
  const wordSelection =
    direction === "backward"
      ? moveWordLeft(document, selection, { extend: true }).selectionAfter
      : moveWordRight(document, selection, { extend: true }).selectionAfter;

  if (selectedDocumentRange(document, wordSelection) === null) {
    return noOp(point);
  }

  return deleteForward(document, wordSelection);
}
