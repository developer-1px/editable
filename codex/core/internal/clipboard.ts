import type {
  JSONDocument,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  JSON_ATOM_REPLACEMENT,
  JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
  JSON_CONTENT_EDITABLE_MIME,
  type JsonContentEditableAtomRecord,
  type JsonContentEditableFragment,
} from "../contract";
import { selectedAtoms } from "./atoms";
import { readString } from "./jsonDocument";
import { isRecord } from "./record";
import { isTextPoint } from "./selection";

export function selectedFragment<T>(
  document: JSONDocument<T>,
  selection: SelectionSnap,
  atomsPath: Pointer | null,
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
  if (Object.keys(atoms).length === 0) {
    return { plainText: text, payload: text };
  }

  const payload: JsonContentEditableFragment = {
    schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
    text,
    atoms,
  };
  return {
    plainText: plainTextFromFragment(payload),
    payload,
  };
}

export function readDocumentClipboard<T>(document: JSONDocument<T>): unknown | null {
  const result = document.clipboard.read();
  return result.ok ? result.payload : null;
}

export function isJsonContentEditableFragment(
  value: unknown,
): value is JsonContentEditableFragment {
  return (
    isRecord(value) &&
    value.schema === JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA &&
    typeof value.text === "string" &&
    (value.atoms === undefined || isRecord(value.atoms))
  );
}

export function plainTextFromFragment(fragment: JsonContentEditableFragment): string {
  let text = "";
  for (let index = 0; index < fragment.text.length; index += 1) {
    if (fragment.text[index] === JSON_ATOM_REPLACEMENT) {
      const atom = Object.values(fragment.atoms ?? {}).find(
        (candidate) => candidate.offset === index,
      );
      text += atom === undefined ? JSON_ATOM_REPLACEMENT : atomPlainText(atom);
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
    JSON_CONTENT_EDITABLE_MIME,
    JSON.stringify(payload),
  );
}

export function readBrowserJSONPayload(
  event: ClipboardEvent | undefined,
): unknown | null {
  const raw = event?.clipboardData?.getData(JSON_CONTENT_EDITABLE_MIME) ?? "";
  if (raw.length === 0) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function atomPlainText(atom: JsonContentEditableAtomRecord): string {
  if (typeof atom.label === "string") {
    return atom.label;
  }
  if (typeof atom.text === "string") {
    return atom.text;
  }
  if (typeof atom.name === "string") {
    return atom.name;
  }
  return JSON_ATOM_REPLACEMENT;
}
