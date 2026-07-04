import type {
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  createRichCursorFrame,
  mergeAdjacentRichBlocks,
  moveRichVirtualSelection,
  replaceRichTextRange,
  richCursorPointAt,
  richTextPathForBlock,
  richVirtualSelectionRange,
  splitRichBlock,
  toggleRichInlineRangeForSelection,
  type RichCursorAffinity,
  type RichCursorBlockFrame,
  type RichCursorFrame,
  type RichCursorMoveCommand,
  type RichCursorPoint,
  type RichDocument,
  type RichDocumentPlan,
  type RichTextFragment,
  type RichVirtualSelection,
  type RichVirtualSelectionRange,
  type RichVisualLineSeed,
} from "./index";

// The single editing interface.
//
// Intent vocabulary is not invented here: text intents are W3C Input Events
// `inputType` values, selection intents are the Selection API (`modify`,
// `setBaseAndExtent`). Output is the document standard already used by every
// plan in this package: JSON Patch (RFC 6902) plus `selectionAfter`.
//
// `edit` is pure: it never mutates and never touches the DOM. History intents
// resolve to a host instruction because history state lives in the document
// store, not in `(document, selection)`.

export type EditPoint = {
  path: Pointer;
  offset: number;
};

export type EditAlter = "move" | "extend";
export type EditDirection = "forward" | "backward";
export type EditGranularity =
  | "character"
  | "word"
  | "line"
  | "lineboundary"
  | "documentboundary";

export type EditIntent =
  | { type: "insertText"; text: string }
  | { type: "insertLineBreak" }
  | { type: "insertParagraph" }
  | { type: "insertFromPaste"; data: string | RichTextFragment }
  | { type: "deleteContentBackward" }
  | { type: "deleteContentForward" }
  | { type: "deleteWordBackward" }
  | { type: "deleteWordForward" }
  | { type: "deleteSoftLineBackward" }
  | { type: "deleteSoftLineForward" }
  | { type: "formatBold" }
  | { type: "formatItalic" }
  | { type: "formatUnderline" }
  | { type: "formatStrikeThrough" }
  | { type: "historyUndo" }
  | { type: "historyRedo" }
  | {
      type: "modifySelection";
      alter: EditAlter;
      direction: EditDirection;
      granularity: EditGranularity;
    }
  | { type: "setBaseAndExtent"; anchor: EditPoint; focus: EditPoint };

export type EditState = {
  document: RichDocument;
  selection: SelectionSnap | null;
  goalX?: number | null;
};

export type EditEnvironment = {
  lineSeeds?: ReadonlyArray<RichVisualLineSeed> | null;
};

export type EditErrorCode =
  | "block_not_found"
  | "empty_selection"
  | "id_conflict"
  | "invalid_range"
  | "no_selection"
  | "not_adjacent"
  | "unsupported_block"
  | "unsupported_intent";

export type EditResult =
  | {
      ok: true;
      kind: "no-change" | "selection" | "text";
      value: RichDocument;
      patch: ReadonlyArray<JSONPatchOperation>;
      selectionAfter: SelectionSnap | null;
      goalX: number | null;
    }
  | { ok: true; kind: "history"; command: "redo" | "undo" }
  | { ok: false; code: EditErrorCode; reason: string };

export function edit(
  state: EditState,
  intent: EditIntent,
  env: EditEnvironment = {},
): EditResult {
  switch (intent.type) {
    case "historyUndo":
      return { ok: true, kind: "history", command: "undo" };
    case "historyRedo":
      return { ok: true, kind: "history", command: "redo" };
    case "modifySelection":
      return modifySelection(state, intent, env);
    case "setBaseAndExtent":
      return setBaseAndExtent(state, intent, env);
    case "insertText":
      return insertContent(state, intent.text, env);
    case "insertLineBreak":
      return insertContent(state, "\n", env);
    case "insertFromPaste":
      return insertContent(state, intent.data, env);
    case "insertParagraph":
      return insertParagraph(state, env);
    case "deleteContentBackward":
      return deleteByGranularity(state, "character", "backward", env);
    case "deleteContentForward":
      return deleteByGranularity(state, "character", "forward", env);
    case "deleteWordBackward":
      return deleteByGranularity(state, "word", "backward", env);
    case "deleteWordForward":
      return deleteByGranularity(state, "word", "forward", env);
    case "deleteSoftLineBackward":
      return deleteByGranularity(state, "lineboundary", "backward", env);
    case "deleteSoftLineForward":
      return deleteByGranularity(state, "lineboundary", "forward", env);
    case "formatBold":
      return format(state, "bold");
    case "formatItalic":
      return format(state, "italic");
    case "formatUnderline":
      return format(state, "underline");
    case "formatStrikeThrough":
      return format(state, "strike");
    default:
      return {
        ok: false,
        code: "unsupported_intent",
        reason: `Unsupported edit intent: ${(intent as { type: string }).type}.`,
      };
  }
}

function modifySelection(
  state: EditState,
  intent: {
    alter: EditAlter;
    direction: EditDirection;
    granularity: EditGranularity;
  },
  env: EditEnvironment,
): EditResult {
  const frame = frameFor(state, env);
  const selection = virtualSelectionFromState(frame, state);
  if (selection === null) {
    return noSelection();
  }
  const moved = moveRichVirtualSelection(frame, selection, moveCommand(intent));
  return selectionResult(state, moved);
}

function setBaseAndExtent(
  state: EditState,
  intent: { anchor: EditPoint; focus: EditPoint },
  env: EditEnvironment,
): EditResult {
  const frame = frameFor(state, env);
  const anchor = richCursorPointAt(frame, intent.anchor.path, intent.anchor.offset);
  const focus = richCursorPointAt(frame, intent.focus.path, intent.focus.offset);
  if (anchor === null || focus === null) {
    return {
      ok: false,
      code: "block_not_found",
      reason: "setBaseAndExtent points do not resolve to document text.",
    };
  }
  return selectionResult(state, { anchor, focus, goalX: null });
}

function insertContent(
  state: EditState,
  content: string | RichTextFragment,
  env: EditEnvironment,
): EditResult {
  const frame = frameFor(state, env);
  const selection = virtualSelectionFromState(frame, state);
  if (selection === null) {
    return noSelection();
  }
  const range = richVirtualSelectionRange(frame, selection);
  const startBlock = blockFrameForPath(frame, range.start.path);
  if (startBlock === null) {
    return blockNotFound(range.start.path);
  }

  let document = state.document;
  let patch: JSONPatchOperation[] = [];
  if (!range.collapsed) {
    const deleted = deleteVirtualRange(document, frame, range);
    if (!deleted.ok) {
      return deleted;
    }
    document = deleted.value;
    patch = [...deleted.patch];
  }

  const plan = replaceRichTextRange(
    document,
    startBlock.blockId,
    range.start.offset,
    range.start.offset,
    content,
  );
  if (!plan.ok) {
    return planError(plan);
  }
  return {
    ok: true,
    kind: "text",
    value: plan.value,
    patch: [...patch, ...plan.patch],
    selectionAfter: plan.selectionAfter,
    goalX: null,
  };
}

function insertParagraph(state: EditState, env: EditEnvironment): EditResult {
  const frame = frameFor(state, env);
  const selection = virtualSelectionFromState(frame, state);
  if (selection === null) {
    return noSelection();
  }
  const range = richVirtualSelectionRange(frame, selection);
  const startBlock = blockFrameForPath(frame, range.start.path);
  if (startBlock === null) {
    return blockNotFound(range.start.path);
  }

  let document = state.document;
  let patch: JSONPatchOperation[] = [];
  if (!range.collapsed) {
    const deleted = deleteVirtualRange(document, frame, range);
    if (!deleted.ok) {
      return deleted;
    }
    document = deleted.value;
    patch = [...deleted.patch];
  }

  const plan = splitRichBlock(
    document,
    startBlock.blockId,
    range.start.offset,
    splitBlockId(document, startBlock.blockId),
  );
  if (!plan.ok) {
    return planError(plan);
  }
  return {
    ok: true,
    kind: "text",
    value: plan.value,
    patch: [...patch, ...plan.patch],
    selectionAfter: plan.selectionAfter,
    goalX: null,
  };
}

function deleteByGranularity(
  state: EditState,
  granularity: Extract<EditGranularity, "character" | "lineboundary" | "word">,
  direction: EditDirection,
  env: EditEnvironment,
): EditResult {
  const frame = frameFor(state, env);
  const selection = virtualSelectionFromState(frame, state);
  if (selection === null) {
    return noSelection();
  }
  let range = richVirtualSelectionRange(frame, selection);
  if (range.collapsed) {
    const expanded = moveRichVirtualSelection(
      frame,
      { anchor: range.start, focus: range.start, goalX: null },
      moveCommand({ alter: "extend", direction, granularity }),
    );
    range = richVirtualSelectionRange(frame, expanded);
    if (range.collapsed) {
      return noChange(state);
    }
  }
  const deleted = deleteVirtualRange(state.document, frame, range);
  if (!deleted.ok) {
    return deleted;
  }
  return {
    ok: true,
    kind: "text",
    value: deleted.value,
    patch: deleted.patch,
    selectionAfter: deleted.selectionAfter,
    goalX: null,
  };
}

function format(
  state: EditState,
  type: "bold" | "italic" | "strike" | "underline",
): EditResult {
  const plan = toggleRichInlineRangeForSelection(state.document, state.selection, {
    type,
  });
  if (!plan.ok) {
    return planError(plan);
  }
  return {
    ok: true,
    kind: "text",
    value: plan.value,
    patch: plan.patch,
    selectionAfter: plan.selectionAfter,
    goalX: state.goalX ?? null,
  };
}

type DeleteRangeResult =
  | {
      ok: true;
      value: RichDocument;
      patch: ReadonlyArray<JSONPatchOperation>;
      selectionAfter: SelectionSnap | null;
    }
  | { ok: false; code: EditErrorCode; reason: string };

function deleteVirtualRange(
  document: RichDocument,
  frame: RichCursorFrame,
  range: RichVirtualSelectionRange,
): DeleteRangeResult {
  const startBlock = blockFrameForPath(frame, range.start.path);
  const endBlock = blockFrameForPath(frame, range.end.path);
  if (startBlock === null) {
    return blockNotFound(range.start.path);
  }
  if (endBlock === null) {
    return blockNotFound(range.end.path);
  }

  if (startBlock.blockId === endBlock.blockId) {
    const plan = replaceRichTextRange(
      document,
      startBlock.blockId,
      range.start.offset,
      range.end.offset,
      "",
    );
    if (!plan.ok) {
      return planError(plan);
    }
    return {
      ok: true,
      value: plan.value,
      patch: plan.patch,
      selectionAfter: plan.selectionAfter,
    };
  }

  const startTrim = replaceRichTextRange(
    document,
    startBlock.blockId,
    range.start.offset,
    startBlock.textLength,
    "",
  );
  if (!startTrim.ok) {
    return planError(startTrim);
  }
  const endTrim = replaceRichTextRange(
    startTrim.value,
    endBlock.blockId,
    0,
    range.end.offset,
    "",
  );
  if (!endTrim.ok) {
    return planError(endTrim);
  }
  const withoutMiddle: RichDocument = {
    ...endTrim.value,
    blocks: endTrim.value.blocks.filter(
      (_, index) => index <= startBlock.blockIndex || index >= endBlock.blockIndex,
    ),
  };
  const merged = mergeAdjacentRichBlocks(
    withoutMiddle,
    startBlock.blockId,
    endBlock.blockId,
  );
  if (!merged.ok) {
    return planError(merged);
  }
  return {
    ok: true,
    value: merged.value,
    patch: [{ op: "replace", path: "/blocks", value: merged.value.blocks }],
    selectionAfter: caretSnap(
      richTextPathForBlock(startBlock.blockIndex),
      range.start.offset,
    ),
  };
}

function frameFor(state: EditState, env: EditEnvironment): RichCursorFrame {
  return createRichCursorFrame(
    state.document,
    env.lineSeeds == null ? {} : { lineSeeds: env.lineSeeds },
  );
}

function moveCommand(intent: {
  alter: EditAlter;
  direction: EditDirection;
  granularity: EditGranularity;
}): RichCursorMoveCommand {
  const extend = intent.alter === "extend";
  if (intent.granularity === "line") {
    return {
      unit: "visualLine",
      direction: intent.direction === "forward" ? "down" : "up",
      extend,
    };
  }
  return {
    unit:
      intent.granularity === "character"
        ? "grapheme"
        : intent.granularity === "word"
          ? "word"
          : intent.granularity === "lineboundary"
            ? "lineBoundary"
            : "documentBoundary",
    direction: intent.direction,
    extend,
  };
}

function virtualSelectionFromState(
  frame: RichCursorFrame,
  state: EditState,
): RichVirtualSelection | null {
  const snap = state.selection;
  if (snap === null) {
    return null;
  }
  const range = snap.selectionRanges[snap.primaryIndex];
  const anchorPoint = resolveSelectionPoint(snap.anchor ?? range?.anchor ?? null);
  const focusPoint = resolveSelectionPoint(snap.focus ?? range?.focus ?? null);
  if (anchorPoint === null || focusPoint === null) {
    return null;
  }
  const anchor = richCursorPointAt(
    frame,
    anchorPoint.path,
    anchorPoint.offset,
    anchorPoint.affinity,
  );
  const focus = richCursorPointAt(
    frame,
    focusPoint.path,
    focusPoint.offset,
    focusPoint.affinity,
  );
  if (anchor === null || focus === null) {
    return null;
  }
  return { anchor, focus, goalX: state.goalX ?? null };
}

function resolveSelectionPoint(
  point: SelectionSnap["anchor"],
): { path: Pointer; offset: number; affinity: RichCursorAffinity } | null {
  if (point === null || point === undefined) {
    return null;
  }
  if (typeof point === "string") {
    return { path: point, offset: 0, affinity: "after" };
  }
  if (typeof point.offset !== "number") {
    return null;
  }
  return {
    path: point.path,
    offset: point.offset,
    affinity: point.edge === "before" ? "before" : "after",
  };
}

function selectionResult(
  state: EditState,
  selection: RichVirtualSelection,
): EditResult {
  return {
    ok: true,
    kind: "selection",
    value: state.document,
    patch: [],
    selectionAfter: snapFromVirtualSelection(selection),
    goalX: selection.goalX,
  };
}

function snapFromVirtualSelection(selection: RichVirtualSelection): SelectionSnap {
  const anchor = snapPoint(selection.anchor);
  const focus = snapPoint(selection.focus);
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

function snapPoint(point: RichCursorPoint): {
  path: Pointer;
  offset: number;
  edge: RichCursorAffinity;
} {
  // A soft-wrap boundary offset resolves to two carets. "before" restores the
  // line-end caret, "after" the next line-start caret.
  const edge =
    point.visualAffinity?.edge === "end" ? "before" : point.affinity;
  return { path: point.path, offset: point.offset, edge };
}

function caretSnap(path: Pointer, offset: number): SelectionSnap {
  const point = { path, offset };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor: point, focus: point }],
    primaryIndex: 0,
    anchor: point,
    focus: point,
  };
}

function blockFrameForPath(
  frame: RichCursorFrame,
  path: Pointer,
): RichCursorBlockFrame | null {
  return frame.blocks.find((candidate) => candidate.path === path) ?? null;
}

function splitBlockId(document: RichDocument, blockId: string): string {
  const base = `${blockId}~split`;
  if (!document.blocks.some((block) => block.id === base)) {
    return base;
  }
  let counter = 2;
  while (document.blocks.some((block) => block.id === `${base}${counter}`)) {
    counter += 1;
  }
  return `${base}${counter}`;
}

function noChange(state: EditState): EditResult {
  return {
    ok: true,
    kind: "no-change",
    value: state.document,
    patch: [],
    selectionAfter: state.selection,
    goalX: state.goalX ?? null,
  };
}

function noSelection(): EditResult {
  return {
    ok: false,
    code: "no_selection",
    reason: "Edit intents require a selection.",
  };
}

function blockNotFound(path: Pointer): { ok: false; code: EditErrorCode; reason: string } {
  return {
    ok: false,
    code: "block_not_found",
    reason: `No block found for ${path}.`,
  };
}

function planError(plan: Extract<RichDocumentPlan, { ok: false }>): {
  ok: false;
  code: EditErrorCode;
  reason: string;
} {
  return { ok: false, code: plan.code, reason: plan.reason };
}
