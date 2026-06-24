import type {
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { JsonContentEditableAtomRecord } from "../contract";
import { atomOffsetsInElement } from "./domText";
import { isRecord } from "./record";
import { isTextPoint } from "./selection";

export function selectedAtoms<T>(
  document: JSONDocument<T>,
  atomsPath: Pointer | null,
  start: number,
  end: number,
): Record<string, JsonContentEditableAtomRecord> {
  const atoms = readAtomRecords(document, atomsPath);
  const selected: Record<string, JsonContentEditableAtomRecord> = {};
  for (const [id, atom] of Object.entries(atoms)) {
    if (atom.offset >= start && atom.offset < end) {
      selected[id] = { ...atom, offset: atom.offset - start };
    }
  }
  return selected;
}

export function atomReplacementPatches<T>({
  atomsPath,
  document,
  insertedAtoms,
  insertedTextLength,
  selection,
}: {
  atomsPath: Pointer | null;
  document: JSONDocument<T>;
  insertedAtoms: Record<string, JsonContentEditableAtomRecord> | null;
  insertedTextLength: number;
  selection: SelectionSnap | null;
}): JSONPatchOperation[] {
  if (atomsPath === null || selection === null) {
    return [];
  }
  const range = textRangeFromSelection(selection);
  if (range === null) {
    return [];
  }

  const atoms = readAtomRecords(document, atomsPath);
  const patch: JSONPatchOperation[] = [];
  const delta = insertedTextLength - (range.end - range.start);
  for (const [id, atom] of Object.entries(atoms)) {
    if (atom.offset >= range.start && atom.offset < range.end) {
      patch.push({
        op: "remove",
        path: `${atomsPath}/${escapePointerSegment(id)}`,
      });
      continue;
    }
    if (atom.offset >= range.end && delta !== 0) {
      patch.push({
        op: "replace",
        path: `${atomsPath}/${escapePointerSegment(id)}/offset`,
        value: atom.offset + delta,
      });
    }
  }

  for (const [id, atom] of Object.entries(insertedAtoms ?? {})) {
    const nextId = uniqueAtomId(id, atoms, patch, atomsPath);
    patch.push({
      op: "add",
      path: `${atomsPath}/${escapePointerSegment(nextId)}`,
      value: {
        ...atom,
        offset: range.start + atom.offset,
      },
    });
  }
  return patch;
}

export function atomSyncPatchesFromDOM<T>(
  document: JSONDocument<T>,
  atomsPath: Pointer | null,
  element: Element,
  atomAttribute: string,
): JSONPatchOperation[] {
  if (atomsPath === null) {
    return [];
  }
  const atoms = readAtomRecords(document, atomsPath);
  const offsets = atomOffsetsInElement(element, atomAttribute);
  const patch: JSONPatchOperation[] = [];
  for (const [id, atom] of Object.entries(atoms)) {
    const offset = offsets.get(id);
    if (offset === undefined) {
      patch.push({
        op: "remove",
        path: `${atomsPath}/${escapePointerSegment(id)}`,
      });
      continue;
    }
    if (offset !== atom.offset) {
      patch.push({
        op: "replace",
        path: `${atomsPath}/${escapePointerSegment(id)}/offset`,
        value: offset,
      });
    }
  }
  return patch;
}

function textRangeFromSelection(
  selection: SelectionSnap,
): { start: number; end: number } | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (
    range === undefined ||
    !isTextPoint(range.anchor) ||
    !isTextPoint(range.focus) ||
    range.anchor.path !== range.focus.path
  ) {
    return null;
  }
  return {
    start: Math.min(range.anchor.offset, range.focus.offset),
    end: Math.max(range.anchor.offset, range.focus.offset),
  };
}

function readAtomRecords<T>(
  document: JSONDocument<T>,
  atomsPath: Pointer | null,
): Record<string, JsonContentEditableAtomRecord> {
  if (atomsPath === null) {
    return {};
  }
  const result = document.at(atomsPath);
  if (!result.ok || !isRecord(result.value)) {
    return {};
  }
  const atoms: Record<string, JsonContentEditableAtomRecord> = {};
  for (const [id, value] of Object.entries(result.value)) {
    if (isRecord(value) && typeof value.offset === "number") {
      atoms[id] = value as JsonContentEditableAtomRecord;
    }
  }
  return atoms;
}

function uniqueAtomId(
  id: string,
  atoms: Record<string, JsonContentEditableAtomRecord>,
  patch: ReadonlyArray<JSONPatchOperation>,
  atomsPath: Pointer,
): string {
  const reserved = new Set(Object.keys(atoms));
  for (const operation of patch) {
    if (operation.op === "add" && operation.path.startsWith(`${atomsPath}/`)) {
      reserved.add(operation.path.slice(atomsPath.length + 1));
    }
  }
  if (!reserved.has(id)) {
    return id;
  }
  let index = 2;
  while (reserved.has(`${id}-${index}`)) {
    index += 1;
  }
  return `${id}-${index}`;
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
