import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import { MARK_ORDER, markKey } from "./markOrder";
import {
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type Mark,
  type NoteBlock,
  type NoteDocument,
  NoteDocumentSchema,
  type TextNode,
} from "./noteDocument";

type ResolvedPath =
  | { kind: "atom"; path: string }
  | { block: NoteBlock; kind: "block"; path: string }
  | { kind: "text"; path: string; text: string };

export function assertNoteDocumentInvariants(
  document: NoteDocument,
  selection?: SelectionSnap,
) {
  const parsed = NoteDocumentSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(
      `Invalid note document: ${parsed.error.issues
        .map((issue) => issue.path.join("."))
        .filter((path) => path.length > 0)
        .join(", ")}`,
    );
  }

  assertUniqueBlockIds(parsed.data);
  assertNormalizedTextMarks(parsed.data);
  if (selection !== undefined) {
    assertSelectionInvariants(parsed.data, selection);
  }
}

function assertUniqueBlockIds(document: NoteDocument) {
  const seen = new Set<string>();
  for (const block of document.root.children) {
    if (seen.has(block.id)) {
      throw new Error(`Duplicate block id: ${block.id}`);
    }
    seen.add(block.id);
  }
}

function assertNormalizedTextMarks(document: NoteDocument) {
  document.root.children.forEach((block, blockIndex) => {
    if (isCodeBlock(block)) {
      block.children.forEach((child, childIndex) => {
        assertNormalizedMarks(
          child,
          `/root/children/${blockIndex}/children/${childIndex}/text`,
        );
      });
      return;
    }

    if (!isInlineTextBlock(block)) {
      return;
    }

    block.children.forEach((child, childIndex) => {
      if (child.type !== "text") {
        return;
      }

      assertNormalizedMarks(
        child,
        `/root/children/${blockIndex}/children/${childIndex}/text`,
      );
    });
  });
}

function assertNormalizedMarks(node: TextNode, path: string) {
  const expected = normalizeMarks(node.marks);
  const expectedMarks = expected.length === 0 ? undefined : expected;
  if (JSON.stringify(node.marks) !== JSON.stringify(expectedMarks)) {
    throw new Error(`Unnormalized marks at ${path}.`);
  }
}

function normalizeMarks(marks: Mark[] | undefined): Mark[] {
  if (marks === undefined) {
    return [];
  }

  const byKey = new Map<string, Mark>();
  for (const mark of marks) {
    const normalized = normalizeMark(mark);
    byKey.set(markKey(normalized), normalized);
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const order = MARK_ORDER[left.type] - MARK_ORDER[right.type];
    return order === 0 ? markKey(left).localeCompare(markKey(right)) : order;
  });
}

function normalizeMark(mark: Mark): Mark {
  if (mark.type !== "link") {
    return { type: mark.type };
  }

  return mark.title === undefined
    ? { type: "link", href: mark.href }
    : { type: "link", href: mark.href, title: mark.title };
}

function assertSelectionInvariants(
  document: NoteDocument,
  selection: SelectionSnap,
) {
  if (
    !Number.isInteger(selection.primaryIndex) ||
    selection.primaryIndex < 0 ||
    selection.primaryIndex >= selection.selectionRanges.length
  ) {
    throw new Error(
      `Invalid selection primaryIndex: ${selection.primaryIndex}`,
    );
  }

  selection.selectionRanges.forEach((range, index) => {
    assertSelectionPoint(
      document,
      range.anchor,
      `selectionRanges.${index}.anchor`,
    );
    assertSelectionPoint(
      document,
      range.focus,
      `selectionRanges.${index}.focus`,
    );
  });

  if (selection.anchor !== null) {
    assertSelectionPoint(document, selection.anchor, "anchor");
  }
  if (selection.focus !== null) {
    assertSelectionPoint(document, selection.focus, "focus");
  }

  for (const path of selection.selectedPointers) {
    const resolved = resolveDocumentPath(document, path);
    if (resolved === null) {
      throw new Error(`Invalid selection selectedPointers path: ${path}`);
    }
    if (resolved.kind !== "atom") {
      throw new Error(`Invalid selection selectedPointers atom path: ${path}`);
    }
  }

  const primaryRange = selection.selectionRanges[selection.primaryIndex];
  if (
    primaryRange !== undefined &&
    selectionPointsEqual(primaryRange.anchor, primaryRange.focus) &&
    selection.selectedPointers.length > 0
  ) {
    throw new Error("Invalid selection: collapsed selectedPointers.");
  }
}

function assertSelectionPoint(
  document: NoteDocument,
  point: SelectionPoint,
  label: string,
) {
  if (typeof point === "string") {
    if (resolveDocumentPath(document, point) === null) {
      throw new Error(`Invalid selection ${label} path: ${point}`);
    }
    return;
  }

  const resolved = resolveDocumentPath(document, point.path);
  if (resolved === null) {
    throw new Error(`Invalid selection ${label} path: ${point.path}`);
  }

  const offset = point.offset;
  const hasOffset = offset !== undefined;
  const hasEdge = point.edge !== undefined;
  if (hasOffset === hasEdge) {
    throw new Error(`Invalid selection ${label}: expected offset or edge.`);
  }

  if (hasOffset) {
    if (resolved.kind !== "text") {
      throw new Error(`Invalid selection ${label} offset path: ${point.path}`);
    }
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      offset > resolved.text.length
    ) {
      throw new Error(`Invalid selection ${label} offset: ${offset}`);
    }
    return;
  }

  if (point.edge !== "before" && point.edge !== "after") {
    throw new Error(`Invalid selection ${label} edge: ${point.edge}`);
  }
  if (resolved.kind === "text") {
    throw new Error(`Invalid selection ${label} edge path: ${point.path}`);
  }
}

function resolveDocumentPath(
  document: NoteDocument,
  path: string,
): ResolvedPath | null {
  const blockMatch = /^\/root\/children\/(\d+)$/.exec(path);
  if (blockMatch !== null) {
    const block = document.root.children[numberFromMatch(blockMatch)];
    if (block === undefined) {
      return null;
    }

    return isFigureBlock(block)
      ? { kind: "atom", path }
      : { block, kind: "block", path };
  }

  const codeTextMatch = /^\/root\/children\/(\d+)\/text$/.exec(path);
  if (codeTextMatch !== null) {
    const block = document.root.children[numberFromMatch(codeTextMatch)];
    return block !== undefined && isCodeBlock(block)
      ? { kind: "text", path, text: block.text }
      : null;
  }

  const inlineTextMatch =
    /^\/root\/children\/(\d+)\/children\/(\d+)\/text$/.exec(path);
  if (inlineTextMatch !== null) {
    const block =
      document.root.children[Number.parseInt(inlineTextMatch[1] ?? "", 10)];
    const childIndex = Number.parseInt(inlineTextMatch[2] ?? "", 10);
    if (!isInlineTextBlock(block)) {
      return null;
    }

    const child = block.children[childIndex];
    return child?.type === "text"
      ? { kind: "text", path, text: child.text }
      : null;
  }

  const inlineAtomMatch = /^\/root\/children\/(\d+)\/children\/(\d+)$/.exec(
    path,
  );
  if (inlineAtomMatch !== null) {
    const block =
      document.root.children[Number.parseInt(inlineAtomMatch[1] ?? "", 10)];
    const childIndex = Number.parseInt(inlineAtomMatch[2] ?? "", 10);
    if (!isInlineTextBlock(block)) {
      return null;
    }

    return block.children[childIndex]?.type === "mention"
      ? { kind: "atom", path }
      : null;
  }

  return null;
}

function numberFromMatch(match: RegExpExecArray): number {
  return Number.parseInt(match[1] ?? "", 10);
}

function selectionPointsEqual(left: SelectionPoint, right: SelectionPoint) {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }

  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}
