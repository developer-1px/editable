import type { JSONPatchOperation } from "@interactive-os/json-document";
import {
  applyTextChange,
  diffText,
  diffTextNearRange,
  editableTextPath,
  findEditableBlockIndex,
  type EditableDocumentValue,
  type TextChange,
  type TextRange,
} from "../core";
import {
  EDITABLE_BLOCK_ATTRIBUTE,
  EDITABLE_PLACEHOLDER_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  editableBlockFromNode,
  editableSurfaceFromNode,
  textFromSurface,
} from "./editableDOM";
import { findBlockElement } from "./documentProjection";

export type NativeTextMutationInspectionOptions = {
  root: HTMLElement;
  value: EditableDocumentValue;
  records: ReadonlyArray<MutationRecord>;
  nativeEvidence: boolean;
  phase: "idle" | "native-input" | "composing" | "settling";
  nativeEvidenceUntil: number;
  now: number;
  lastBeforeInputBlockId: string | null;
  composition: {
    blockId: string;
    range: TextRange;
  } | null;
};

export type NativeTextMutationInspection = {
  patch: ReadonlyArray<JSONPatchOperation>;
  textChanges: ReadonlyMap<string, TextChange>;
  dirtyBlockIds: ReadonlySet<string>;
  rejectedBlockIds: ReadonlySet<string>;
  rejected: boolean;
};

export function inspectNativeTextMutations({
  root,
  value,
  records,
  nativeEvidence,
  phase,
  nativeEvidenceUntil,
  now,
  lastBeforeInputBlockId,
  composition,
}: NativeTextMutationInspectionOptions): NativeTextMutationInspection {
  const dirtyBlockIds = new Set<string>();
  const rejectedBlockIds = new Set<string>();
  const nativeEmptyCandidateIds = new Set<string>();
  let rejected = false;

  for (const record of records) {
    const block = editableBlockFromNode(root, record.target);
    const surface = editableSurfaceFromNode(root, record.target);
    const blockId = block?.getAttribute(EDITABLE_BLOCK_ATTRIBUTE);
    if (blockId === null || blockId === undefined) {
      rejected = true;
      continue;
    }
    dirtyBlockIds.add(blockId);
    if (surface === null) {
      if (
        record.type === "childList" &&
        record.target === block &&
        isNativeEmptyBlock(block)
      ) {
        nativeEmptyCandidateIds.add(blockId);
      } else {
        rejectedBlockIds.add(blockId);
        rejected = true;
      }
      continue;
    }
    if (!isAdmittedTextMutation(record, surface)) {
      rejectedBlockIds.add(blockId);
      rejected = true;
    }
  }

  const hasNativeEvidence =
    nativeEvidence || phase !== "idle" || now <= nativeEvidenceUntil;
  const expectedBlockId =
    composition?.blockId ??
    lastBeforeInputBlockId ??
    (nativeEvidence && dirtyBlockIds.size === 1
      ? dirtyBlockIds.values().next().value
      : undefined);
  if (dirtyBlockIds.size === 0 && expectedBlockId !== undefined) {
    dirtyBlockIds.add(expectedBlockId);
  }

  const patch: JSONPatchOperation[] = [];
  const textChanges = new Map<string, TextChange>();
  for (const blockId of dirtyBlockIds) {
    if (
      rejectedBlockIds.has(blockId) ||
      !hasNativeEvidence ||
      expectedBlockId === undefined ||
      blockId !== expectedBlockId
    ) {
      rejected = rejected || records.length > 0;
      continue;
    }

    const index = findEditableBlockIndex(value, blockId);
    const block = value.blocks[index];
    const element = findBlockElement(root, blockId);
    const surface = element?.querySelector<HTMLElement>(
      `[${EDITABLE_TEXT_ATTRIBUTE}]`,
    );
    const nativeEmpty =
      element !== null &&
      element !== undefined &&
      nativeEmptyCandidateIds.has(blockId) &&
      isNativeEmptyBlock(element);
    if (
      block === undefined ||
      ((surface === null || surface === undefined) && !nativeEmpty)
    ) {
      rejected = true;
      continue;
    }

    const text = nativeEmpty ? "" : textFromSurface(surface as HTMLElement);
    if (text === block.text) {
      continue;
    }
    const change =
      composition?.blockId === blockId
        ? diffTextNearRange(block.text, text, composition.range)
        : diffText(block.text, text);
    if (change === null || applyTextChange(block.text, change) !== text) {
      rejected = true;
      continue;
    }
    textChanges.set(blockId, change);
    patch.push({ op: "replace", path: editableTextPath(index), value: text });
  }

  return {
    patch,
    textChanges,
    dirtyBlockIds,
    rejectedBlockIds,
    rejected,
  };
}

function isAdmittedTextMutation(
  record: MutationRecord,
  surface: HTMLElement,
): boolean {
  if (record.type === "characterData") {
    return record.target.nodeType === 3 && surface.contains(record.target);
  }
  if (record.type !== "childList" || record.target !== surface) {
    return false;
  }
  return [...record.addedNodes, ...record.removedNodes].every(
    (node) =>
      node.nodeType === 3 ||
      (node.nodeType === 1 &&
        (node as HTMLElement).tagName === "BR" &&
        (node as HTMLElement).hasAttribute(EDITABLE_PLACEHOLDER_ATTRIBUTE)),
  );
}

function isNativeEmptyBlock(element: HTMLElement): boolean {
  return Array.from(element.childNodes).every(
    (node) =>
      (node.nodeType === 3 && (node.textContent ?? "") === "") ||
      (node.nodeType === 1 && (node as HTMLElement).tagName === "BR"),
  );
}
