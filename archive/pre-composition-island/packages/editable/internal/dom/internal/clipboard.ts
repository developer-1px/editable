import type {
  JSONDocument,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  ATOM_REPLACEMENT,
  RICH_FRAGMENT_MIME,
  RICH_FRAGMENT_SCHEMA,
  type RichInlineAtom,
  type RichTextFragment,
} from "../../model";
import { selectedAtoms } from "./atoms";
import { readString } from "./jsonDocument";
import { selectedRanges } from "./ranges";
import { isRecord } from "./record";
import { isTextPoint } from "./selection";

export function selectedFragment<T>(
  document: JSONDocument<T>,
  selection: SelectionSnap,
  atomsPath: Pointer | null,
  rangesPath: Pointer | null,
): { plainText: string; payload: unknown } | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }
  if (!isTextPoint(range.anchor) || !isTextPoint(range.focus)) {
    return null;
  }
  if (range.anchor.path !== range.focus.path) {
    return null;
  }

  const value = readString(document, range.anchor.path);
  if (!value.ok) {
    return null;
  }
  const start = Math.min(range.anchor.offset, range.focus.offset);
  const end = Math.max(range.anchor.offset, range.focus.offset);
  if (start === end) {
    return null;
  }
  const text = value.value.slice(start, end);
  const atoms = selectedAtoms(document, atomsPath, start, end);
  const ranges = selectedRanges(document, rangesPath, start, end);
  if (Object.keys(atoms).length === 0 && Object.keys(ranges).length === 0) {
    return { plainText: text, payload: text };
  }

  const payload: RichTextFragment = {
    schema: RICH_FRAGMENT_SCHEMA,
    text,
  };
  if (Object.keys(atoms).length > 0) {
    payload.atoms = atoms;
  }
  if (Object.keys(ranges).length > 0) {
    payload.ranges = ranges;
  }
  return {
    plainText: plainTextFromFragment(payload),
    payload,
  };
}

export function readDocumentClipboard<T>(document: JSONDocument<T>): unknown | null {
  const result = document.clipboard.read();
  return result.ok ? result.payload : null;
}

export function isRichTextFragmentPayload(
  value: unknown,
): value is RichTextFragment {
  return (
    isRecord(value) &&
    value.schema === RICH_FRAGMENT_SCHEMA &&
    typeof value.text === "string" &&
    (value.atoms === undefined || isRecord(value.atoms)) &&
    (value.ranges === undefined || isRecord(value.ranges))
  );
}

export function plainTextFromFragment(fragment: RichTextFragment): string {
  let text = "";
  for (let index = 0; index < fragment.text.length; index += 1) {
    if (fragment.text[index] === ATOM_REPLACEMENT) {
      const atom = Object.values(fragment.atoms ?? {}).find(
        (candidate) => candidate.offset === index,
      );
      text += atom === undefined ? ATOM_REPLACEMENT : atomPlainText(atom);
    } else {
      text += fragment.text[index];
    }
  }
  return text;
}

export function writeBrowserClipboard(
  event: ClipboardEvent | undefined,
  plainText: string,
  payload: unknown,
) {
  event?.clipboardData?.setData("text/plain", plainText);
  event?.clipboardData?.setData(
    RICH_FRAGMENT_MIME,
    JSON.stringify(payload),
  );
}

export function readBrowserJSONPayload(
  event: ClipboardEvent | undefined,
): unknown | null {
  const raw = event?.clipboardData?.getData(RICH_FRAGMENT_MIME) ?? "";
  if (raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function atomPlainText(atom: RichInlineAtom): string {
  if (typeof atom.label === "string") {
    return atom.label;
  }
  if (typeof atom.text === "string") {
    return atom.text;
  }
  if (typeof atom.name === "string") {
    return atom.name;
  }
  return ATOM_REPLACEMENT;
}
