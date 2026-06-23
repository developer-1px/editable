import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import type { NoteDocument } from "../../model/noteDocument";
import { snapTextOffset } from "../../model/textBoundaries";
import { normalizeCompositionCommitText } from "./compositionCommitText";
import {
  findElementByDataPath,
  readDocumentText,
  textPointFromDOMSelection,
} from "./contentEditableSelection";
import { restoreTextElement } from "./contentEditableTextDom";

export type ContentEditableFlushResult =
  | {
      ok: false;
    }
  | {
      ok: true;
      changed: false;
      selectionAfter: SelectionSnap;
    }
  | {
      ok: true;
      changed: true;
      patch: JSONPatchOperation[];
      path: string;
      previousText: string;
      nextText: string;
      selectionAfter: SelectionSnap;
    };

export type ContentEditableFlushCompositionState = {
  compositionStartText: string | null;
  compositionStartOffset: number | null;
  lastCompositionText: string | null;
  finalCompositionCommitText: string | null;
};

export function flushContentEditableTextChange(
  root: HTMLElement | null,
  document: NoteDocument,
  path: string | null,
  composition: ContentEditableFlushCompositionState,
): ContentEditableFlushResult {
  if (path === null || root === null) {
    return { ok: false };
  }

  const textElement = findElementByDataPath(root, path);
  if (textElement === null) {
    return { ok: false };
  }

  const rawNextText = textElement.textContent ?? "";
  const currentText = readDocumentText(document, path);
  const domPoint = textPointFromDOMSelection(root);
  const rawOffset =
    domPoint?.path === path ? domPoint.offset : rawNextText.length;
  const normalized = normalizeCompositionCommitText(
    rawNextText,
    rawOffset,
    composition.compositionStartText,
    composition.compositionStartOffset,
    composition.lastCompositionText,
    composition.finalCompositionCommitText,
  );
  const nextText = normalized.text;
  const offset = normalized.offset;
  if (nextText !== rawNextText) {
    textElement.textContent = nextText;
  }
  const selectionOffset = snapTextOffset(nextText, offset);
  const selectionAfter = selectionFromCursorPoint({
    path,
    offset: selectionOffset,
  });

  if (currentText === nextText) {
    restoreTextElement(root, path, nextText);
    return { ok: true, changed: false, selectionAfter };
  }

  return {
    ok: true,
    changed: true,
    patch: [{ op: "replace", path, value: nextText }],
    path,
    previousText: currentText,
    nextText,
    selectionAfter,
  };
}
