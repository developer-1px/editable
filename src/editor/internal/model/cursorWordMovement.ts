import type { CursorDirection, CursorPoint, CursorPointInput } from "./cursor";
import { textAddressFromPath } from "./cursorAddressing";
import type { NoteDocument } from "./noteDocument";
import {
  nextTextBoundaryOffset,
  previousTextBoundaryOffset,
} from "./textBoundaries";

type CursorMover = (
  document: NoteDocument,
  point: CursorPointInput,
  direction: CursorDirection,
) => CursorPoint;

type CursorUnitKind = "atom" | "separator" | "word";

export function resolveWordBoundaryCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
  direction: CursorDirection,
  moveCursor: CursorMover,
): CursorPoint | null {
  return direction === "forward"
    ? nextWordBoundaryFromPoint(document, point, moveCursor)
    : previousWordBoundaryFromPoint(document, point, moveCursor);
}

function nextWordBoundaryFromPoint(
  document: NoteDocument,
  point: CursorPoint,
  moveCursor: CursorMover,
): CursorPoint | null {
  let current = point;
  let next = moveCursor(document, current, "forward");

  while (!cursorPointsEqual(current, next)) {
    const unitKind = unitKindBetween(document, current, next);
    if (unitKind !== "separator") {
      break;
    }

    current = next;
    next = moveCursor(document, current, "forward");
  }

  if (cursorPointsEqual(current, next)) {
    return current;
  }

  if (unitKindBetween(document, current, next) === "atom") {
    return next;
  }

  while (!cursorPointsEqual(current, next)) {
    const unitKind = unitKindBetween(document, current, next);
    if (unitKind !== "word") {
      break;
    }

    current = next;
    next = moveCursor(document, current, "forward");
  }

  return current;
}

function previousWordBoundaryFromPoint(
  document: NoteDocument,
  point: CursorPoint,
  moveCursor: CursorMover,
): CursorPoint | null {
  let current = point;
  let previous = moveCursor(document, current, "backward");

  while (!cursorPointsEqual(previous, current)) {
    const unitKind = unitKindBetween(document, previous, current);
    if (unitKind !== "separator") {
      break;
    }

    current = previous;
    previous = moveCursor(document, current, "backward");
  }

  if (cursorPointsEqual(previous, current)) {
    return current;
  }

  if (unitKindBetween(document, previous, current) === "atom") {
    return previous;
  }

  while (!cursorPointsEqual(previous, current)) {
    const unitKind = unitKindBetween(document, previous, current);
    if (unitKind !== "word") {
      break;
    }

    current = previous;
    previous = moveCursor(document, current, "backward");
  }

  return current;
}

function unitKindBetween(
  document: NoteDocument,
  from: CursorPoint,
  to: CursorPoint,
): CursorUnitKind {
  if (from.edge === "before" && to.edge === "after" && from.path === to.path) {
    return "atom";
  }

  if (
    from.offset !== undefined &&
    to.offset !== undefined &&
    from.path === to.path
  ) {
    const text = textAddressFromPath(document, from.path);
    if (
      text !== null &&
      nextTextBoundaryOffset(text.text, from.offset) === to.offset
    ) {
      return wordKindForCharacter(text.text.slice(from.offset, to.offset));
    }
  }

  if (from.offset !== undefined && to.offset !== undefined) {
    const fromText = textAddressFromPath(document, from.path);
    const toText = textAddressFromPath(document, to.path);
    if (
      fromText !== null &&
      toText !== null &&
      fromText.blockIndex === toText.blockIndex &&
      fromText.inlineIndex !== undefined &&
      toText.inlineIndex !== undefined &&
      toText.inlineIndex === fromText.inlineIndex + 1 &&
      from.offset === fromText.text.length &&
      to.offset === nextTextBoundaryOffset(toText.text, 0)
    ) {
      return wordKindForCharacter(toText.text.slice(0, to.offset));
    }

    if (
      fromText !== null &&
      toText !== null &&
      fromText.blockIndex === toText.blockIndex &&
      fromText.inlineIndex !== undefined &&
      toText.inlineIndex !== undefined &&
      toText.inlineIndex === fromText.inlineIndex + 1 &&
      from.offset ===
        previousTextBoundaryOffset(fromText.text, fromText.text.length) &&
      to.offset === 0
    ) {
      return wordKindForCharacter(fromText.text.slice(from.offset));
    }
  }

  return "separator";
}

function wordKindForCharacter(character: string | undefined): CursorUnitKind {
  return isWordCharacter(character) ? "word" : "separator";
}

function cursorPointsEqual(left: CursorPointInput, right: CursorPointInput) {
  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}

function isWordCharacter(character: string | undefined): boolean {
  return character !== undefined && /[\p{L}\p{N}_]/u.test(character);
}
