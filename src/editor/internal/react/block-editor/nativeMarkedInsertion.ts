import type { SelectionSnap } from "@interactive-os/json-document";
import { selectionHasActiveTextMarks } from "../../model/markCommands";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionIsCollapsed } from "../../model/richSelection";
import { insertText, type TextCommandResult } from "../../model/textCommands";
import { selectionSnapshotPoint } from "../../view/blockEditorSelection";

export function textCommandFromMarkedNativeInsertion(
  document: NoteDocument,
  selection: SelectionSnap,
  path: string,
  previousText: string,
  nextText: string,
): TextCommandResult | null {
  if (
    !selectionIsCollapsed(selection) ||
    !selectionHasActiveTextMarks(selection)
  ) {
    return null;
  }

  const point = selectionSnapshotPoint(selection);
  if (point === null || !("offset" in point) || point.path !== path) {
    return null;
  }

  const insertion = pureInsertionBetween(previousText, nextText);
  if (insertion === null || insertion.text.length === 0) {
    return null;
  }
  if (point.offset !== insertion.offset) {
    return null;
  }

  return insertText(document, selection, insertion.text);
}

function pureInsertionBetween(
  previousText: string,
  nextText: string,
): { offset: number; text: string } | null {
  const prefixLength = commonPrefixLength(previousText, nextText);
  const suffixLength = commonSuffixLength(previousText, nextText, prefixLength);
  if (previousText.length !== prefixLength + suffixLength) {
    return null;
  }

  return {
    offset: prefixLength,
    text: nextText.slice(prefixLength, nextText.length - suffixLength),
  };
}

function commonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function commonSuffixLength(
  left: string,
  right: string,
  prefixLength: number,
): number {
  let length = 0;
  const maxLength = Math.min(left.length, right.length) - prefixLength;
  while (
    length < maxLength &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }

  return length;
}
