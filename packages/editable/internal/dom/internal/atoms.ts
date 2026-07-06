import type {
  JSONDocument,
  JSONPatchOperation,
  Pointer,
} from "@interactive-os/json-document";
import type { RichInlineAtom } from "../../model";
import { atomOffsetsInElement } from "./domText";
import { isRecord } from "./record";

export function selectedAtoms<T>(
  document: JSONDocument<T>,
  atomsPath: Pointer | null,
  start: number,
  end: number,
): Record<string, RichInlineAtom> {
  const atoms = readAtomRecords(document, atomsPath);
  const selected: Record<string, RichInlineAtom> = {};
  for (const [id, atom] of Object.entries(atoms)) {
    if (atom.offset >= start && atom.offset < end) {
      selected[id] = { ...atom, offset: atom.offset - start };
    }
  }
  return selected;
}

export function atomSyncPatchesFromDOM<T>(
  document: JSONDocument<T>,
  atomsPath: Pointer | null,
  element: Element,
  atomAttribute: string,
  offsetMapper: ((offset: number) => number) | null = null,
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
    const documentOffset = offsetMapper?.(offset) ?? offset;
    if (documentOffset !== atom.offset) {
      patch.push({
        op: "replace",
        path: `${atomsPath}/${escapePointerSegment(id)}/offset`,
        value: documentOffset,
      });
    }
  }
  return patch;
}

function readAtomRecords<T>(
  document: JSONDocument<T>,
  atomsPath: Pointer | null,
): Record<string, RichInlineAtom> {
  if (atomsPath === null) {
    return {};
  }
  const result = document.at(atomsPath);
  if (!result.ok || !isRecord(result.value)) {
    return {};
  }
  const atoms: Record<string, RichInlineAtom> = {};
  for (const [id, value] of Object.entries(result.value)) {
    if (isRecord(value) && typeof value.offset === "number") {
      atoms[id] = value as RichInlineAtom;
    }
  }
  return atoms;
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}
