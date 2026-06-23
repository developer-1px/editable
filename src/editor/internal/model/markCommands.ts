import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import { normalizeCursorPoint } from "./cursor";
import {
  cursorPointFromInlineUnitOffset,
  selectedInlineUnitRange,
  textChildrenInInlineUnitRange,
} from "./inlineUnitSelection";
import { inlineUnitLength } from "./inlineUnits";
import { normalizeLinkHref } from "./linkHref";
import { MARK_ORDER, markKey } from "./markOrder";
import {
  activeMarksFromSelection,
  contextWithActiveMarks,
  pendingLinkHrefFromSelection,
} from "./markSelectionContext";
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
import { textInline } from "./text-command/textCommandAddressing";

export {
  activeMarksFromSelection,
  selectionHasActiveTextMarks,
} from "./markSelectionContext";

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
  const pendingHref = pendingLinkHrefFromSelection(selection);
  const href = pendingHref === null ? null : normalizeLinkHref(pendingHref);
  if (pendingHref !== null && href === null) {
    return { ok: false, reason: "Link href is invalid." };
  }

  return toggleInlineMark(
    document,
    selection,
    href === null ? null : { type: "link", href },
    "link",
  );
}

function toggleInlineMark(
  document: NoteDocument,
  selection: SelectionSnap,
  mark: Mark | null,
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

    const activeMarks = activeMarksFromSelection(selection);
    if (!hasMark(activeMarks, markType) && mark === null) {
      return { ok: false, reason: "Link href is required." };
    }

    return {
      ok: true,
      patch: [],
      selectionAfter: selectionFromCursorPoint(
        point,
        contextWithActiveMarks(
          selection.context,
          toggleMarkInSet(activeMarks, mark, markType),
        ),
      ),
    };
  }

  const range = selectedInlineUnitRange(document, selection);
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

  const selectedText = textChildrenInInlineUnitRange(
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
        cursorPointFromInlineUnitOffset(
          range.blockIndex,
          block.children,
          range.startUnit,
          "forward",
        ),
        cursorPointFromInlineUnitOffset(
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
  if (!shouldRemove && mark === null) {
    return { ok: false, reason: "Link href is required." };
  }

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
      cursorPointFromInlineUnitOffset(
        range.blockIndex,
        nextChildren,
        range.startUnit,
        "forward",
      ),
      cursorPointFromInlineUnitOffset(
        range.blockIndex,
        nextChildren,
        range.endUnit,
        "backward",
      ),
    ),
  };
}

function toggleMarkInInlineRange(
  children: InlineNode[],
  startUnit: number,
  endUnit: number,
  mark: Mark | null,
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
            : addMark(child.marks, requiredMark(mark)),
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

function activeMark(markType: ToggleableMarkType): Mark {
  return { type: markType };
}

function toggleMarkInSet(
  marks: Mark[],
  mark: Mark | null,
  markType: Mark["type"],
): Mark[] {
  return hasMark(marks, markType)
    ? removeMark(marks, markType)
    : addMark(marks, requiredMark(mark));
}

function requiredMark(mark: Mark | null): Mark {
  if (mark === null) {
    throw new Error("Expected a mark before adding it.");
  }

  return mark;
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
