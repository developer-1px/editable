import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  editableTextPath,
  findEditableBlockIndex,
  orderedEditableSelection,
  primaryEditablePoint,
  type EditableBlock,
  type EditableBlockType,
  type EditableDocumentValue,
  type OrderedEditableSelection,
} from "./model";
import { clampTextRange } from "./textChange";

export type EditorDocumentCommand =
  | {
      type: "replaceText";
      blockId: string;
      from: number;
      to: number;
      text: string;
      label?: string;
      origin?: string;
    }
  | {
      type: "replaceSelection";
      text: string;
      label?: string;
      origin?: string;
    }
  | {
      type: "setBlockType";
      blockType: EditableBlockType;
      blockId?: string;
    }
  | { type: "insertParagraph" }
  | { type: "deleteBackward" | "deleteForward" }
  | { type: "joinBackward" }
  | { type: "joinForward" };

export type EditorCommandPlan =
  | {
      kind: "commit";
      patch: ReadonlyArray<JSONPatchOperation>;
      label: string;
      source: "app" | "remote";
      selectionAfter?: SelectionSnap | null;
    }
  | { kind: "none" }
  | {
      kind: "failure";
      code: "block_not_found" | "selection_unavailable";
      reason: string;
    };

export function planEditorCommand(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
  action: EditorDocumentCommand,
  allocateBlockId: () => string,
): EditorCommandPlan {
  switch (action.type) {
    case "replaceText":
      return planTextReplacement(value, action);
    case "replaceSelection":
      return planSelectionReplacement(
        value,
        selection,
        action.text,
        action.label ?? "replace selection",
        sourceFromOrigin(action.origin),
      );
    case "setBlockType":
      return planBlockTypeChange(value, selection, action);
    case "insertParagraph":
      return planParagraphInsertion(value, selection, allocateBlockId);
    case "deleteBackward":
      return planDirectionalDelete(value, selection, "backward");
    case "deleteForward":
      return planDirectionalDelete(value, selection, "forward");
    case "joinBackward":
      return planBackwardJoin(value, selection);
    case "joinForward":
      return planForwardJoin(value, selection);
  }
}

function planTextReplacement(
  value: EditableDocumentValue,
  action: Extract<EditorDocumentCommand, { type: "replaceText" }>,
): EditorCommandPlan {
  const index = findEditableBlockIndex(value, action.blockId);
  const block = value.blocks[index];
  if (block === undefined) {
    return failure("block_not_found", `Unknown block: ${action.blockId}`);
  }
  const range = clampTextRange(
    {
      from: Math.min(action.from, action.to),
      to: Math.max(action.from, action.to),
    },
    block.text.length,
  );
  const next =
    block.text.slice(0, range.from) +
    action.text +
    block.text.slice(range.to);
  if (next === block.text) {
    return { kind: "none" };
  }
  return commit(
    [{ op: "replace", path: editableTextPath(index), value: next }],
    action.label ?? "replace text",
    sourceFromOrigin(action.origin),
  );
}

function planSelectionReplacement(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
  text: string,
  label: string,
  source: "app" | "remote",
): EditorCommandPlan {
  const ordered = readOrderedSelection(value, selection);
  if (ordered === null) {
    return noSelection();
  }

  const { start, end } = ordered;
  const startBlock = value.blocks[start.blockIndex];
  const endBlock = value.blocks[end.blockIndex];
  if (startBlock === undefined || endBlock === undefined) {
    return staleSelection();
  }

  const nextText =
    startBlock.text.slice(0, start.offset) +
    text +
    endBlock.text.slice(end.offset);
  const patch: JSONPatchOperation[] = [
    {
      op: "replace",
      path: editableTextPath(start.blockIndex),
      value: nextText,
    },
  ];
  for (let index = end.blockIndex; index > start.blockIndex; index -= 1) {
    patch.push({ op: "remove", path: `/blocks/${index}` });
  }

  return commit(
    patch,
    label,
    source,
    selectionAt(editableTextPath(start.blockIndex), start.offset + text.length),
  );
}

function planDirectionalDelete(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
  direction: "backward" | "forward",
): EditorCommandPlan {
  const ordered = readOrderedSelection(value, selection);
  if (ordered === null) {
    return noSelection();
  }
  if (!isCollapsed(ordered)) {
    return planSelectionReplacement(
      value,
      selection,
      "",
      `delete ${direction}`,
      "app",
    );
  }

  const index = ordered.start.blockIndex;
  const block = value.blocks[index];
  if (block === undefined) {
    return staleSelection();
  }
  const offset = ordered.start.offset;
  if (direction === "backward" && offset === 0) {
    return planBackwardJoin(value, selection);
  }
  if (direction === "forward" && offset === block.text.length) {
    return planForwardJoin(value, selection);
  }

  const from =
    direction === "backward"
      ? previousGraphemeBoundary(block.text, offset)
      : offset;
  const to =
    direction === "forward"
      ? nextGraphemeBoundary(block.text, offset)
      : offset;
  const next = block.text.slice(0, from) + block.text.slice(to);
  return commit(
    [{ op: "replace", path: editableTextPath(index), value: next }],
    `delete ${direction}`,
    "app",
    selectionAt(editableTextPath(index), from),
  );
}

function planBlockTypeChange(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
  action: Extract<EditorDocumentCommand, { type: "setBlockType" }>,
): EditorCommandPlan {
  const point = primaryEditablePoint(value, selectionState(selection));
  const blockId = action.blockId ?? point?.blockId;
  const index =
    blockId === undefined ? -1 : findEditableBlockIndex(value, blockId);
  const block = value.blocks[index];
  if (block === undefined) {
    return failure(
      "selection_unavailable",
      "Select an editable block first.",
    );
  }
  if (block.type === action.blockType) {
    return { kind: "none" };
  }
  return commit(
    [{ op: "replace", path: `/blocks/${index}/type`, value: action.blockType }],
    `set block type: ${action.blockType}`,
    "app",
    selection,
  );
}

function planParagraphInsertion(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
  allocateBlockId: () => string,
): EditorCommandPlan {
  const ordered = readOrderedSelection(value, selection);
  if (ordered === null) {
    return noSelection();
  }
  const { start, end } = ordered;
  const startBlock = value.blocks[start.blockIndex];
  const endBlock = value.blocks[end.blockIndex];
  if (startBlock === undefined || endBlock === undefined) {
    return staleSelection();
  }

  const newBlock: EditableBlock = {
    id: allocateBlockId(),
    type: "paragraph",
    text: endBlock.text.slice(end.offset),
  };
  const patch: JSONPatchOperation[] = [
    {
      op: "replace",
      path: editableTextPath(start.blockIndex),
      value: startBlock.text.slice(0, start.offset),
    },
  ];
  for (let index = end.blockIndex; index > start.blockIndex; index -= 1) {
    patch.push({ op: "remove", path: `/blocks/${index}` });
  }
  patch.push({
    op: "add",
    path: `/blocks/${start.blockIndex + 1}`,
    value: newBlock,
  });

  return commit(
    patch,
    "insert paragraph",
    "app",
    selectionAt(editableTextPath(start.blockIndex + 1), 0),
  );
}

function planBackwardJoin(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
): EditorCommandPlan {
  const ordered = readOrderedSelection(value, selection);
  if (ordered === null) {
    return noSelection();
  }
  if (!isCollapsed(ordered)) {
    return planSelectionReplacement(
      value,
      selection,
      "",
      "delete selection",
      "app",
    );
  }
  if (ordered.start.offset !== 0 || ordered.start.blockIndex === 0) {
    return { kind: "none" };
  }

  const currentIndex = ordered.start.blockIndex;
  const previous = value.blocks[currentIndex - 1];
  const current = value.blocks[currentIndex];
  if (previous === undefined || current === undefined) {
    return staleSelection();
  }
  const offset = previous.text.length;
  return commit(
    [
      {
        op: "replace",
        path: editableTextPath(currentIndex - 1),
        value: previous.text + current.text,
      },
      { op: "remove", path: `/blocks/${currentIndex}` },
    ],
    "join backward",
    "app",
    selectionAt(editableTextPath(currentIndex - 1), offset),
  );
}

function planForwardJoin(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
): EditorCommandPlan {
  const ordered = readOrderedSelection(value, selection);
  if (ordered === null) {
    return noSelection();
  }
  if (!isCollapsed(ordered)) {
    return planSelectionReplacement(
      value,
      selection,
      "",
      "delete selection",
      "app",
    );
  }

  const currentIndex = ordered.start.blockIndex;
  const current = value.blocks[currentIndex];
  const next = value.blocks[currentIndex + 1];
  if (
    current === undefined ||
    next === undefined ||
    ordered.start.offset !== current.text.length
  ) {
    return { kind: "none" };
  }
  return commit(
    [
      {
        op: "replace",
        path: editableTextPath(currentIndex),
        value: current.text + next.text,
      },
      { op: "remove", path: `/blocks/${currentIndex + 1}` },
    ],
    "join forward",
    "app",
    selectionAt(editableTextPath(currentIndex), current.text.length),
  );
}

function readOrderedSelection(
  value: EditableDocumentValue,
  selection: SelectionSnap | null,
): OrderedEditableSelection | null {
  return orderedEditableSelection(value, selectionState(selection));
}

function selectionState(selection: SelectionSnap | null): {
  primaryRange: SelectionSnap["selectionRanges"][number] | null;
} {
  return {
    primaryRange:
      selection?.selectionRanges[selection.primaryIndex] ?? null,
  };
}

function isCollapsed(selection: OrderedEditableSelection): boolean {
  return (
    selection.start.blockIndex === selection.end.blockIndex &&
    selection.start.offset === selection.end.offset
  );
}

function sourceFromOrigin(origin: string | undefined): "app" | "remote" {
  return origin === "remote" ? "remote" : "app";
}

function selectionAt(path: string, offset: number): SelectionSnap {
  const anchor = { path, offset };
  const focus = { path, offset };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

function previousGraphemeBoundary(value: string, offset: number): number {
  let previous = 0;
  for (const segment of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(value)) {
    if (segment.index >= offset) {
      break;
    }
    previous = segment.index;
  }
  return previous;
}

function nextGraphemeBoundary(value: string, offset: number): number {
  for (const segment of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(value)) {
    if (segment.index > offset) {
      return segment.index;
    }
  }
  return value.length;
}

function commit(
  patch: ReadonlyArray<JSONPatchOperation>,
  label: string,
  source: "app" | "remote",
  selectionAfter?: SelectionSnap | null,
): EditorCommandPlan {
  return {
    kind: "commit",
    patch,
    label,
    source,
    ...(selectionAfter === undefined ? {} : { selectionAfter }),
  };
}

function noSelection(): EditorCommandPlan {
  return failure(
    "selection_unavailable",
    "No editable selection is active.",
  );
}

function staleSelection(): EditorCommandPlan {
  return failure("selection_unavailable", "The selection is stale.");
}

function failure(
  code: Extract<EditorCommandPlan, { kind: "failure" }>["code"],
  reason: string,
): EditorCommandPlan {
  return { kind: "failure", code, reason };
}
