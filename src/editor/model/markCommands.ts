import type {
  JSONPatchOperation,
  SelectionContext,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  normalizeCursorPoint,
  resolveCursorIndex,
} from "./cursor";
import { normalizeInlineChildren } from "./normalizer";
import {
  type InlineNode,
  isInlineTextBlock,
  type Mark,
  type NoteDocument,
} from "./noteDocument";
import {
  cursorPointInputFromSelectionPoint,
  selectionFromCursorPoint,
  selectionFromCursorRange,
  selectionIsCollapsed,
} from "./richSelection";

export type MarkCommandResult =
  | {
      ok: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: false;
      reason: string;
    };

export type ToggleableMarkType = Extract<
  Mark["type"],
  "bold" | "italic" | "code"
>;

type InlinePosition = {
  blockIndex: number;
  unitOffset: number;
};

const ACTIVE_MARKS_KEY = "activeMarks";
const PENDING_LINK_HREF_KEY = "pendingLinkHref";
const DEFAULT_LINK_HREF = "https://example.com";
const MARK_ORDER: Record<Mark["type"], number> = {
  bold: 0,
  italic: 1,
  code: 2,
  link: 3,
};

export function toggleMark(
  document: NoteDocument,
  selection: SelectionSnap,
  markType: ToggleableMarkType,
): MarkCommandResult {
  return toggleInlineMark(document, selection, activeMark(markType), markType);
}

export function toggleLink(
  document: NoteDocument,
  selection: SelectionSnap,
): MarkCommandResult {
  return toggleInlineMark(
    document,
    selection,
    { type: "link", href: pendingLinkHrefFromSelection(selection) },
    "link",
  );
}

function toggleInlineMark(
  document: NoteDocument,
  selection: SelectionSnap,
  mark: Mark,
  markType: Mark["type"],
): MarkCommandResult {
  if (selectionIsCollapsed(selection)) {
    const selectionPoint = selection.focus ?? selection.anchor;
    if (selectionPoint === null) {
      return { ok: false, reason: "Selection has no caret point." };
    }

    const point = normalizeCursorPoint(
      document,
      cursorPointInputFromSelectionPoint(selectionPoint),
    );

    return {
      ok: true,
      patch: [],
      selectionAfter: selectionFromCursorPoint(
        point,
        contextWithActiveMarks(
          selection.context,
          toggleMarkInSet(activeMarksFromSelection(selection), mark, markType),
        ),
      ),
    };
  }

  const range = selectedInlineRange(document, selection);
  if (range === null) {
    return {
      ok: false,
      reason: "Marks can only be toggled inside one inline text block.",
    };
  }

  const block = document.root.children[range.blockIndex];
  if (!isInlineTextBlock(block)) {
    return {
      ok: false,
      reason: "Marks can only be toggled inside inline text blocks.",
    };
  }

  const selectedText = selectedTextChildren(
    block.children,
    range.startUnit,
    range.endUnit,
  );
  if (selectedText.length === 0) {
    return {
      ok: true,
      patch: [],
      selectionAfter: selectionFromCursorRange(
        document,
        pointFromInlineUnitOffset(
          range.blockIndex,
          block.children,
          range.startUnit,
          "forward",
        ),
        pointFromInlineUnitOffset(
          range.blockIndex,
          block.children,
          range.endUnit,
          "backward",
        ),
      ),
    };
  }

  const shouldRemove = selectedText.every((child) =>
    hasMark(child.marks, markType),
  );
  const nextChildren = normalizeInlineChildren(
    toggleMarkInInlineRange(
      block.children,
      range.startUnit,
      range.endUnit,
      mark,
      markType,
      shouldRemove,
    ),
  );
  const nextDocument = {
    ...document,
    root: {
      ...document.root,
      children: document.root.children.map((candidate, index) =>
        index === range.blockIndex
          ? { ...block, children: nextChildren }
          : candidate,
      ),
    },
  };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${range.blockIndex}/children`,
        value: nextChildren,
      },
    ],
    selectionAfter: selectionFromCursorRange(
      nextDocument,
      pointFromInlineUnitOffset(
        range.blockIndex,
        nextChildren,
        range.startUnit,
        "forward",
      ),
      pointFromInlineUnitOffset(
        range.blockIndex,
        nextChildren,
        range.endUnit,
        "backward",
      ),
    ),
  };
}

export function activeMarksFromSelection(selection: SelectionSnap): Mark[] {
  const context = contextRecord(selection.context);
  const activeMarks = context?.[ACTIVE_MARKS_KEY];
  if (!Array.isArray(activeMarks)) {
    return [];
  }

  return normalizeActiveMarks(activeMarks);
}

export function selectionHasActiveTextMarks(selection: SelectionSnap): boolean {
  return activeMarksFromSelection(selection).length > 0;
}

function selectedInlineRange(
  document: NoteDocument,
  selection: SelectionSnap,
): { blockIndex: number; startUnit: number; endUnit: number } | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  const anchor = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.anchor),
  );
  const focus = normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(range.focus),
  );
  const start =
    resolveCursorIndex(document, anchor) <= resolveCursorIndex(document, focus)
      ? anchor
      : focus;
  const end = start === anchor ? focus : anchor;
  const startPosition = inlinePositionFromCursorPoint(document, start);
  const endPosition = inlinePositionFromCursorPoint(document, end);

  if (
    startPosition === null ||
    endPosition === null ||
    startPosition.blockIndex !== endPosition.blockIndex ||
    startPosition.unitOffset === endPosition.unitOffset
  ) {
    return null;
  }

  return {
    blockIndex: startPosition.blockIndex,
    startUnit: Math.min(startPosition.unitOffset, endPosition.unitOffset),
    endUnit: Math.max(startPosition.unitOffset, endPosition.unitOffset),
  };
}

function inlinePositionFromCursorPoint(
  document: NoteDocument,
  point: CursorPoint,
): InlinePosition | null {
  const text = /^\/root\/children\/(\d+)\/children\/(\d+)\/text$/.exec(
    point.path,
  );
  if (text !== null && point.offset !== undefined) {
    const blockIndex = Number(text[1]);
    const childIndex = Number(text[2]);
    const block = document.root.children[blockIndex];
    if (!isInlineTextBlock(block)) {
      return null;
    }

    return {
      blockIndex,
      unitOffset:
        inlineUnitLength(block.children.slice(0, childIndex)) + point.offset,
    };
  }

  const inline = /^\/root\/children\/(\d+)\/children\/(\d+)$/.exec(point.path);
  if (inline !== null && point.edge !== undefined) {
    const blockIndex = Number(inline[1]);
    const childIndex = Number(inline[2]);
    const block = document.root.children[blockIndex];
    if (!isInlineTextBlock(block)) {
      return null;
    }

    return {
      blockIndex,
      unitOffset:
        inlineUnitLength(block.children.slice(0, childIndex)) +
        (point.edge === "after" ? 1 : 0),
    };
  }

  const blockPath = /^\/root\/children\/(\d+)$/.exec(point.path);
  if (blockPath !== null && point.edge !== undefined) {
    const blockIndex = Number(blockPath[1]);
    const block = document.root.children[blockIndex];
    if (!isInlineTextBlock(block)) {
      return null;
    }

    return {
      blockIndex,
      unitOffset: point.edge === "after" ? inlineUnitLength(block.children) : 0,
    };
  }

  return null;
}

function selectedTextChildren(
  children: InlineNode[],
  startUnit: number,
  endUnit: number,
): Array<Extract<InlineNode, { type: "text" }>> {
  const selected: Array<Extract<InlineNode, { type: "text" }>> = [];
  let childStart = 0;

  for (const child of children) {
    const childLength = inlineUnitLength([child]);
    const childEnd = childStart + childLength;
    if (
      child.type === "text" &&
      Math.max(startUnit, childStart) < Math.min(endUnit, childEnd)
    ) {
      selected.push(child);
    }
    childStart = childEnd;
  }

  return selected;
}

function toggleMarkInInlineRange(
  children: InlineNode[],
  startUnit: number,
  endUnit: number,
  mark: Mark,
  markType: Mark["type"],
  shouldRemove: boolean,
): InlineNode[] {
  const nextChildren: InlineNode[] = [];
  let childStart = 0;

  for (const child of children) {
    const childLength = inlineUnitLength([child]);
    const childEnd = childStart + childLength;

    if (
      child.type !== "text" ||
      Math.max(startUnit, childStart) >= Math.min(endUnit, childEnd)
    ) {
      nextChildren.push(child);
      childStart = childEnd;
      continue;
    }

    const overlapStart = Math.max(startUnit, childStart) - childStart;
    const overlapEnd = Math.min(endUnit, childEnd) - childStart;
    const before = child.text.slice(0, overlapStart);
    const selected = child.text.slice(overlapStart, overlapEnd);
    const after = child.text.slice(overlapEnd);

    if (before.length > 0) {
      nextChildren.push(textInline(before, child.marks));
    }
    if (selected.length > 0) {
      nextChildren.push(
        textInline(
          selected,
          shouldRemove
            ? removeMark(child.marks, markType)
            : addMark(child.marks, mark),
        ),
      );
    }
    if (after.length > 0) {
      nextChildren.push(textInline(after, child.marks));
    }

    childStart = childEnd;
  }

  return nextChildren;
}

function pointFromInlineUnitOffset(
  blockIndex: number,
  children: InlineNode[],
  unitOffset: number,
  bias: "forward" | "backward",
): CursorPoint {
  let offset = Math.max(0, unitOffset);

  for (const [childIndex, child] of children.entries()) {
    if (child.type === "text") {
      if (
        offset < child.text.length ||
        (offset === child.text.length && bias === "backward") ||
        (offset === 0 && bias === "forward")
      ) {
        return {
          path: textPath(blockIndex, childIndex),
          offset,
        };
      }

      offset -= child.text.length;
      continue;
    }

    if (offset <= 0) {
      return { path: inlinePath(blockIndex, childIndex), edge: "before" };
    }
    if (offset <= 1) {
      return { path: inlinePath(blockIndex, childIndex), edge: "after" };
    }

    offset -= 1;
  }

  return { path: `/root/children/${blockIndex}`, edge: "after" };
}

function activeMark(markType: ToggleableMarkType): Mark {
  return { type: markType };
}

function toggleMarkInSet(
  marks: Mark[],
  mark: Mark,
  markType: Mark["type"],
): Mark[] {
  return hasMark(marks, markType)
    ? removeMark(marks, markType)
    : addMark(marks, mark);
}

function hasMark(marks: Mark[] | undefined, markType: Mark["type"]): boolean {
  return marks?.some((mark) => mark.type === markType) === true;
}

function addMark(marks: Mark[] | undefined, mark: Mark): Mark[] {
  return normalizeMarks([
    ...(marks ?? []).filter((candidate) => candidate.type !== mark.type),
    mark,
  ]);
}

function removeMark(marks: Mark[] | undefined, markType: Mark["type"]): Mark[] {
  return normalizeMarks((marks ?? []).filter((mark) => mark.type !== markType));
}

function normalizeMarks(marks: Mark[]): Mark[] {
  const byKey = new Map<string, Mark>();
  for (const mark of marks) {
    byKey.set(markKey(mark), mark);
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const order = MARK_ORDER[left.type] - MARK_ORDER[right.type];
    return order === 0 ? markKey(left).localeCompare(markKey(right)) : order;
  });
}

function markKey(mark: Mark): string {
  return JSON.stringify(mark);
}

function normalizeActiveMarks(marks: unknown[]): Mark[] {
  const byType = new Map<Mark["type"], Mark>();
  for (const mark of marks) {
    if (!isActiveMark(mark)) {
      continue;
    }
    byType.set(mark.type, mark);
  }

  return Array.from(byType.values()).sort(
    (left, right) => MARK_ORDER[left.type] - MARK_ORDER[right.type],
  );
}

function isActiveMark(mark: unknown): mark is Mark {
  if (typeof mark !== "object" || mark === null || !("type" in mark)) {
    return false;
  }

  if (mark.type === "bold" || mark.type === "italic" || mark.type === "code") {
    return true;
  }

  return (
    mark.type === "link" &&
    "href" in mark &&
    typeof mark.href === "string" &&
    mark.href.length > 0 &&
    (!("title" in mark) ||
      mark.title === undefined ||
      typeof mark.title === "string")
  );
}

function pendingLinkHrefFromSelection(selection: SelectionSnap): string {
  const context = contextRecord(selection.context);
  const href = context?.[PENDING_LINK_HREF_KEY];

  return typeof href === "string" && href.length > 0 ? href : DEFAULT_LINK_HREF;
}

function contextWithActiveMarks(
  context: SelectionContext | undefined,
  marks: Mark[],
): SelectionContext | undefined {
  const record = contextRecord(context) ?? {};
  if (marks.length === 0) {
    const { [ACTIVE_MARKS_KEY]: _activeMarks, ...rest } = record;
    return Object.keys(rest).length === 0
      ? undefined
      : (rest as SelectionContext);
  }

  return { ...record, [ACTIVE_MARKS_KEY]: marks } as SelectionContext;
}

function contextRecord(
  context: SelectionContext | undefined,
): Record<string, unknown> | null {
  return typeof context === "object" &&
    context !== null &&
    !Array.isArray(context)
    ? { ...context }
    : null;
}

function inlineUnitLength(children: InlineNode[]): number {
  return children.reduce(
    (total, child) => total + (child.type === "text" ? child.text.length : 1),
    0,
  );
}

function textInline(
  text: string,
  marks?: Extract<InlineNode, { type: "text" }>["marks"],
): InlineNode {
  return marks === undefined || marks.length === 0
    ? { kind: "text", type: "text", text }
    : { kind: "text", type: "text", text, marks };
}

function textPath(blockIndex: number, childIndex: number): string {
  return `/root/children/${blockIndex}/children/${childIndex}/text`;
}

function inlinePath(blockIndex: number, childIndex: number): string {
  return `/root/children/${blockIndex}/children/${childIndex}`;
}
