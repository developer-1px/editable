import type { SelectionSnap } from "@interactive-os/json-document";
import type { ContentEditableTextPoint } from "./contentEditableSelection";

export function isContentEditableTextMutationInputType(
  inputType: string,
): boolean {
  return (
    inputType === "insertText" ||
    inputType === "insertReplacementText" ||
    inputType === "insertCompositionText" ||
    inputType === "insertFromComposition" ||
    inputType === "deleteContentBackward" ||
    inputType === "deleteContentForward"
  );
}

export function isContentEditableTextInsertionInputType(
  inputType: string,
): boolean {
  return inputType === "insertText" || inputType === "insertReplacementText";
}

export function isCompositionCommitInput(inputType: string): boolean {
  return inputType === "insertText" || inputType === "insertFromComposition";
}

export function canUseContentEditableCompositionPoint(
  inputType: string,
  point: ContentEditableTextPoint | null,
  selection: SelectionSnap,
  domSelectionCollapsed: boolean,
): boolean {
  if (inputType !== "insertCompositionText" || point === null) {
    return false;
  }
  if (domSelectionCollapsed) {
    return true;
  }

  const rangePath = selectedSingleTextRangePath(selection);
  return rangePath !== null && rangePath === point.path;
}

function selectedSingleTextRangePath(selection: SelectionSnap): string | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  const anchor = offsetSelectionPoint(range.anchor);
  const focus = offsetSelectionPoint(range.focus);
  if (
    anchor === null ||
    focus === null ||
    anchor.path !== focus.path ||
    anchor.offset === focus.offset
  ) {
    return null;
  }

  return anchor.path;
}

function offsetSelectionPoint(
  point: SelectionSnap["focus"],
): ContentEditableTextPoint | null {
  if (
    typeof point !== "object" ||
    point === null ||
    point.offset === undefined
  ) {
    return null;
  }

  return { path: point.path, offset: point.offset };
}
