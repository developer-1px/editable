import type {
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { InternalEditableRangeRecord } from "../contract";
import { isRecord } from "./record";
import { isTextPoint } from "./selection";

export function selectedRanges<T>(
  document: JSONDocument<T>,
  rangesPath: Pointer | null,
  start: number,
  end: number,
): Record<string, InternalEditableRangeRecord> {
  const ranges = readRangeRecords(document, rangesPath);
  const selected: Record<string, InternalEditableRangeRecord> = {};
  for (const [id, range] of Object.entries(ranges)) {
    const clippedStart = Math.max(range.start, start);
    const clippedEnd = Math.min(range.end, end);
    if (clippedStart < clippedEnd) {
      selected[id] = {
        ...range,
        start: clippedStart - start,
        end: clippedEnd - start,
      };
    }
  }
  return selected;
}

export function rangeReplacementPatches<T>({
  document,
  insertedRanges,
  insertedTextLength,
  rangesPath,
  selection,
}: {
  document: JSONDocument<T>;
  insertedRanges: Record<string, InternalEditableRangeRecord> | null;
  insertedTextLength: number;
  rangesPath: Pointer | null;
  selection: SelectionSnap | null;
}): JSONPatchOperation[] {
  if (rangesPath === null || selection === null) {
    return [];
  }
  const replacement = textRangeFromSelection(selection);
  if (replacement === null) {
    return [];
  }
  return rangeReplacementPatchesForRange({
    document,
    insertedRanges,
    insertedTextLength,
    rangesPath,
    replacement,
  });
}

export function rangeSyncPatchesFromTextChange<T>({
  document,
  nextText,
  previousText,
  rangesPath,
}: {
  document: JSONDocument<T>;
  nextText: string;
  previousText: string;
  rangesPath: Pointer | null;
}): JSONPatchOperation[] {
  if (rangesPath === null || previousText === nextText) {
    return [];
  }
  const replacement = changedTextRange(previousText, nextText);
  return rangeReplacementPatchesForRange({
    document,
    insertedRanges: null,
    insertedTextLength: replacement.insertedTextLength,
    rangesPath,
    replacement,
  });
}

function rangeReplacementPatchesForRange<T>({
  document,
  insertedRanges,
  insertedTextLength,
  rangesPath,
  replacement,
}: {
  document: JSONDocument<T>;
  insertedRanges: Record<string, InternalEditableRangeRecord> | null;
  insertedTextLength: number;
  rangesPath: Pointer;
  replacement: TextReplacementRange;
}): JSONPatchOperation[] {
  const ranges = readRangeRecords(document, rangesPath);
  const patch: JSONPatchOperation[] = [];
  const delta = insertedTextLength - (replacement.end - replacement.start);
  for (const [id, range] of Object.entries(ranges)) {
    const nextStart = mapRangeStart(range.start, replacement, delta);
    const nextEnd = mapRangeEnd(range.end, replacement, insertedTextLength, delta);
    const path = `${rangesPath}/${escapePointerSegment(id)}`;
    if (nextEnd <= nextStart) {
      patch.push({ op: "remove", path });
      continue;
    }
    if (nextStart !== range.start) {
      patch.push({ op: "replace", path: `${path}/start`, value: nextStart });
    }
    if (nextEnd !== range.end) {
      patch.push({ op: "replace", path: `${path}/end`, value: nextEnd });
    }
  }

  for (const [id, range] of Object.entries(insertedRanges ?? {})) {
    const nextId = uniqueRangeId(id, ranges, patch, rangesPath);
    patch.push({
      op: "add",
      path: `${rangesPath}/${escapePointerSegment(nextId)}`,
      value: {
        ...range,
        start: replacement.start + range.start,
        end: replacement.start + range.end,
      },
    });
  }
  return patch;
}

type TextReplacementRange = {
  start: number;
  end: number;
};

function textRangeFromSelection(
  selection: SelectionSnap,
): TextReplacementRange | null {
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

function changedTextRange(
  before: string,
  after: string,
): TextReplacementRange & { insertedTextLength: number } {
  const prefix = commonPrefixLength(before, after);
  const suffix = commonSuffixLength(before, after, prefix);
  return {
    start: prefix,
    end: before.length - suffix,
    insertedTextLength: after.length - prefix - suffix,
  };
}

function mapRangeStart(
  offset: number,
  replacement: TextReplacementRange,
  delta: number,
): number {
  if (offset <= replacement.start) {
    return offset;
  }
  if (offset >= replacement.end) {
    return offset + delta;
  }
  return replacement.start;
}

function mapRangeEnd(
  offset: number,
  replacement: TextReplacementRange,
  insertedTextLength: number,
  delta: number,
): number {
  if (offset <= replacement.start) {
    return offset;
  }
  if (offset >= replacement.end) {
    return offset + delta;
  }
  return replacement.start + insertedTextLength;
}

function readRangeRecords<T>(
  document: JSONDocument<T>,
  rangesPath: Pointer | null,
): Record<string, InternalEditableRangeRecord> {
  if (rangesPath === null) {
    return {};
  }
  const result = document.at(rangesPath);
  if (!result.ok || !isRecord(result.value)) {
    return {};
  }
  const ranges: Record<string, InternalEditableRangeRecord> = {};
  for (const [id, value] of Object.entries(result.value)) {
    if (
      isRecord(value) &&
      typeof value.start === "number" &&
      typeof value.end === "number"
    ) {
      ranges[id] = value as InternalEditableRangeRecord;
    }
  }
  return ranges;
}

function uniqueRangeId(
  id: string,
  ranges: Record<string, InternalEditableRangeRecord>,
  patch: ReadonlyArray<JSONPatchOperation>,
  rangesPath: Pointer,
): string {
  const reserved = new Set(Object.keys(ranges));
  for (const operation of patch) {
    if (operation.op === "add" && operation.path.startsWith(`${rangesPath}/`)) {
      reserved.add(operation.path.slice(rangesPath.length + 1));
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
