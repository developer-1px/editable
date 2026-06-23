import { findElementByDataPath } from "./editorTraceReplayDom";
import { readReplayedEditorState } from "./editorTraceReplayState";
import type { ReplayedEditorState } from "./editorTraceReplayTypes";

export function assertReplayedEditorInvariants(
  root: HTMLElement,
  state: ReplayedEditorState = readReplayedEditorState(root),
) {
  assertUniqueRenderedDataPaths(root);
  assertSelectionStateTargets(root, state);
  assertOverlayTargets(root);
}

function assertUniqueRenderedDataPaths(root: HTMLElement) {
  const seen = new Set<string>();
  for (const element of Array.from(root.querySelectorAll("[data-path]"))) {
    const path = element.getAttribute("data-path");
    if (path === null) {
      continue;
    }
    if (seen.has(path)) {
      throw new Error(`Replay invariant failed: duplicate data-path ${path}.`);
    }
    seen.add(path);
  }
}

function assertSelectionStateTargets(
  root: HTMLElement,
  state: ReplayedEditorState,
) {
  const selectionPoints = [
    {
      edge: state.selectionEdge,
      label: "selection",
      offset: state.selectionOffset,
      path: state.selectionPath,
    },
    {
      edge: state.selectionAnchorEdge,
      label: "selection anchor",
      offset: state.selectionAnchorOffset,
      path: state.selectionAnchorPath,
    },
    {
      edge: state.selectionFocusEdge,
      label: "selection focus",
      offset: state.selectionFocusOffset,
      path: state.selectionFocusPath,
    },
    {
      edge: null,
      label: "DOM selection anchor",
      offset: state.domSelectionAnchorOffset,
      path: state.domSelectionAnchorPath,
    },
    {
      edge: null,
      label: "DOM selection focus",
      offset: state.domSelectionFocusOffset,
      path: state.domSelectionFocusPath,
    },
  ];

  for (const point of selectionPoints) {
    assertRenderedPoint(root, point);
  }

  const selectedPointers = selectedPointerPaths(state);
  for (const path of selectedPointers) {
    assertRenderedPath(root, path, "selected pointer");
  }

  if (
    selectedPointers.length > 0 &&
    replayedPointsEqual(
      {
        edge: state.selectionAnchorEdge,
        offset: state.selectionAnchorOffset,
        path: state.selectionAnchorPath,
      },
      {
        edge: state.selectionFocusEdge,
        offset: state.selectionFocusOffset,
        path: state.selectionFocusPath,
      },
    )
  ) {
    throw new Error("Replay invariant failed: collapsed selectedPointers.");
  }

  if (
    state.selectionPath !== null ||
    state.selectionAnchorPath !== null ||
    state.selectionFocusPath !== null
  ) {
    const rangeCount = parseAttributeInteger(
      state.selectionRangeCount,
      "selection range count",
    );
    if (rangeCount === null || rangeCount < 1) {
      throw new Error(
        `Replay invariant failed: invalid selection range count ${state.selectionRangeCount}.`,
      );
    }
  }

  if (
    state.domSelectionCollapsed !== null &&
    state.domSelectionCollapsed !== "true" &&
    state.domSelectionCollapsed !== "false"
  ) {
    throw new Error(
      `Replay invariant failed: invalid DOM selection collapsed value ${state.domSelectionCollapsed}.`,
    );
  }
}

function assertOverlayTargets(root: HTMLElement) {
  const overlayRoot = root.closest(".document-stage") ?? root;
  for (const caret of Array.from(
    overlayRoot.querySelectorAll('[data-overlay="caret"]'),
  )) {
    assertRenderedPoint(root, {
      edge: caret.getAttribute("data-edge"),
      label: "caret overlay",
      offset: caret.getAttribute("data-offset"),
      path: caret.getAttribute("data-path"),
    });
  }

  for (const atom of Array.from(
    overlayRoot.querySelectorAll('[data-overlay="selected-atom"]'),
  )) {
    assertRenderedPath(
      root,
      atom.getAttribute("data-path"),
      "selected atom overlay",
    );
  }
}

function assertRenderedPoint(
  root: HTMLElement,
  point: {
    edge: string | null;
    label: string;
    offset: string | null;
    path: string | null;
  },
) {
  if (point.path === null) {
    if (point.offset !== null || point.edge !== null) {
      throw new Error(
        `Replay invariant failed: ${point.label} has offset/edge without path.`,
      );
    }
    return;
  }

  const target = assertRenderedPath(root, point.path, point.label);
  if (point.offset !== null && point.edge !== null) {
    throw new Error(
      `Replay invariant failed: ${point.label} has both offset and edge.`,
    );
  }

  if (point.offset !== null) {
    const offset = parseAttributeInteger(point.offset, `${point.label} offset`);
    const textLength = target.textContent?.length ?? 0;
    if (offset === null || offset > textLength) {
      throw new Error(
        `Replay invariant failed: ${point.label} offset ${point.offset} is out of range for ${point.path}.`,
      );
    }
    return;
  }

  if (
    point.edge !== null &&
    point.edge !== "before" &&
    point.edge !== "after"
  ) {
    throw new Error(
      `Replay invariant failed: ${point.label} edge ${point.edge} is invalid.`,
    );
  }
}

function assertRenderedPath(
  root: HTMLElement,
  path: string | null,
  label: string,
): Element {
  const target = path === null ? null : findElementByDataPath(root, path);
  if (target === null) {
    throw new Error(
      `Replay invariant failed: missing ${label} target ${path ?? "(null)"}.`,
    );
  }

  return target;
}

function selectedPointerPaths(state: ReplayedEditorState): string[] {
  const raw = state.selectionSelectedPointers;
  if (raw === null || raw.trim().length === 0) {
    return [];
  }

  return raw.trim().split(/\s+/);
}

function replayedPointsEqual(
  left: { edge: string | null; offset: string | null; path: string | null },
  right: { edge: string | null; offset: string | null; path: string | null },
) {
  return (
    left.path !== null &&
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}

function parseAttributeInteger(
  value: string | null,
  label: string,
): number | null {
  if (value === null) {
    return null;
  }
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Replay invariant failed: ${label} ${value} is not an integer.`,
    );
  }

  return Number.parseInt(value, 10);
}
