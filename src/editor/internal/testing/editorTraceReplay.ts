import { act } from "@testing-library/react";

export type EditorTraceReplay = {
  contractIds?: readonly EditorInputContractId[];
  name: string;
  schema: "editable-trace-replay@1";
  steps: EditorTraceStep[];
};

export type EditorInputContractId =
  | "CLIP-01"
  | "CLIP-02"
  | "CLIP-03"
  | "DEL-01"
  | "DEL-02"
  | "DEL-03"
  | "HIST-01"
  | "HIST-02"
  | "IME-01"
  | "IME-02"
  | "IME-03"
  | "IME-04"
  | "MUT-01"
  | "MUT-02"
  | "RO-01"
  | "RO-02"
  | "SEL-01"
  | "SEL-02"
  | "SEL-03"
  | "SEL-04";

export type EditorTraceStep =
  | {
      kind: "event";
      event: EditorTraceEvent;
      expect?: EditorTraceExpectation;
    }
  | {
      kind: "selection";
      anchor?: {
        offset: number;
        path: string;
      };
      focus?: {
        offset: number;
        path: string;
      };
      offset?: number;
      path?: string;
    }
  | {
      kind: "text";
      path: string;
      text: string;
      offset?: number;
    }
  | {
      kind: "timers";
    };

export type EditorTraceEvent =
  | KeyboardTraceEvent
  | CompositionTraceEvent
  | InputTraceEvent
  | TransferTraceEvent
  | FocusTraceEvent
  | PointerTraceEvent;

export type KeyboardTraceEvent = {
  altKey?: boolean;
  code?: string;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  type: "keydown" | "keyup";
};

export type CompositionTraceEvent = {
  data?: string;
  type: "compositionend" | "compositionstart" | "compositionupdate";
};

export type InputTraceEvent = {
  data?: string | null;
  inputType: string;
  isComposing?: boolean;
  type: "beforeinput" | "input";
};

export type TransferTraceEvent = {
  clientX?: number;
  clientY?: number;
  data?: Record<string, string>;
  format?: "markdown" | "plain";
  text?: string;
  type: "cut" | "drop" | "paste";
};

export type FocusTraceEvent = {
  type: "blur" | "focus";
};

export type PointerTraceEvent = {
  button?: number;
  clientX?: number;
  clientY?: number;
  detail?: number;
  pointerId?: number;
  shiftKey?: boolean;
  targetPath?: string;
  type: "pointerdown";
};

export type EditorTraceExpectation = {
  after?: ReplayedEditorStateExpectation;
  before?: ReplayedEditorStateExpectation;
};

export type ReplayedEditorStateExpectation = Partial<
  Omit<ReplayedEditorState, "pathText">
> & {
  pathText?: Record<string, string>;
};

export type ReplayedEditorState = {
  domSelectionAnchorOffset: string | null;
  domSelectionAnchorPath: string | null;
  domSelectionCollapsed: string | null;
  domSelectionFocusOffset: string | null;
  domSelectionFocusPath: string | null;
  domSelectionText: string;
  pathText: Record<string, string>;
  selectionAnchorEdge: string | null;
  selectionAnchorOffset: string | null;
  selectionAnchorPath: string | null;
  selectionEdge: string | null;
  selectionFocusEdge: string | null;
  selectionFocusOffset: string | null;
  selectionFocusPath: string | null;
  selectionOffset: string | null;
  selectionPath: string | null;
  selectionRangeCount: string | null;
  selectionSelectedPointers: string | null;
  text: string;
};

export type ReplayedEditorEvent = {
  after: ReplayedEditorState;
  before: ReplayedEditorState;
  defaultPrevented: boolean;
  event: EditorTraceEvent;
  index: number;
  stateChanged: boolean;
};

export async function replayEditorTrace(
  root: HTMLElement,
  trace: EditorTraceReplay,
): Promise<ReplayedEditorEvent[]> {
  const events: ReplayedEditorEvent[] = [];
  assertReplayedEditorInvariants(root);

  for (const step of trace.steps) {
    if (step.kind === "event") {
      const before = readReplayedEditorState(root);
      const event = createTraceEvent(root, step.event);
      act(() => {
        traceEventTarget(root, step.event).dispatchEvent(event);
      });
      const after = readReplayedEditorState(root);
      assertTraceExpectation({
        after,
        before,
        event: step.event,
        eventIndex: events.length,
        expectation: step.expect,
        trace,
      });
      assertReplayedEditorInvariants(root, after);
      events.push({
        after,
        before,
        defaultPrevented: event.defaultPrevented,
        event: step.event,
        index: events.length,
        stateChanged: !replayedEditorStatesEqual(before, after),
      });
      continue;
    }

    if (step.kind === "selection") {
      act(() => {
        setTraceSelection(root, step);
        dispatchSelectionChange(root);
      });
      assertReplayedEditorInvariants(root);
      continue;
    }

    if (step.kind === "text") {
      replaceTextRun(root, step.path, step.text, step.offset);
      assertReplayedEditorInvariants(root);
      continue;
    }

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assertReplayedEditorInvariants(root);
  }

  return events;
}

export function assertReplayedEditorInvariants(
  root: HTMLElement,
  state: ReplayedEditorState = readReplayedEditorState(root),
) {
  assertUniqueRenderedDataPaths(root);
  assertSelectionStateTargets(root, state);
  assertOverlayTargets(root);
}

function dispatchSelectionChange(root: HTMLElement) {
  const window = root.ownerDocument.defaultView;
  if (window === null) {
    throw new Error("Trace replay requires a DOM window.");
  }

  root.ownerDocument.dispatchEvent(new window.Event("selectionchange"));
}

export function findReplayedEvent(
  events: ReplayedEditorEvent[],
  type: EditorTraceEvent["type"],
  inputType?: string,
) {
  return events.find((entry) => {
    if (entry.event.type !== type) {
      return false;
    }
    if (inputType === undefined || !("inputType" in entry.event)) {
      return inputType === undefined;
    }

    return entry.event.inputType === inputType;
  });
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

function createTraceEvent(root: HTMLElement, event: EditorTraceEvent): Event {
  const window = root.ownerDocument.defaultView;
  if (window === null) {
    throw new Error("Trace replay requires a DOM window.");
  }

  if (event.type === "keydown" || event.type === "keyup") {
    const keyboardEvent = new window.KeyboardEvent(event.type, {
      altKey: event.altKey ?? false,
      bubbles: true,
      cancelable: true,
      code: event.code,
      ctrlKey: event.ctrlKey ?? false,
      key: event.key,
      metaKey: event.metaKey ?? false,
      shiftKey: event.shiftKey ?? false,
    });
    defineEventValue(keyboardEvent, "isComposing", event.isComposing ?? false);
    return keyboardEvent;
  }

  if (event.type === "beforeinput" || event.type === "input") {
    const inputEvent = new window.InputEvent(event.type, {
      bubbles: true,
      cancelable: event.type === "beforeinput",
      data: event.data ?? null,
      inputType: event.inputType,
    });
    defineEventValue(inputEvent, "isComposing", event.isComposing ?? false);
    return inputEvent;
  }

  if (event.type === "paste" || event.type === "drop" || event.type === "cut") {
    const transfer = createTraceTransferData(event);
    const transferEvent = new window.Event(event.type, {
      bubbles: true,
      cancelable: true,
    });
    if (event.type === "paste" || event.type === "cut") {
      defineEventValue(transferEvent, "clipboardData", transfer);
    } else {
      defineEventValue(transferEvent, "dataTransfer", transfer);
      defineEventValue(transferEvent, "clientX", event.clientX ?? 0);
      defineEventValue(transferEvent, "clientY", event.clientY ?? 0);
    }
    return transferEvent;
  }

  if (event.type === "blur" || event.type === "focus") {
    return new window.FocusEvent(event.type, {
      bubbles: true,
      cancelable: false,
    });
  }

  if (event.type === "pointerdown") {
    const pointerEventInit = {
      bubbles: true,
      button: event.button ?? 0,
      cancelable: true,
      clientX: event.clientX ?? 0,
      clientY: event.clientY ?? 0,
      detail: event.detail ?? 1,
      pointerId: event.pointerId ?? 1,
      shiftKey: event.shiftKey ?? false,
    };
    const pointerEvent =
      typeof window.PointerEvent === "function"
        ? new window.PointerEvent(event.type, pointerEventInit)
        : new window.MouseEvent(event.type, pointerEventInit);
    defineEventValue(pointerEvent, "pointerId", event.pointerId ?? 1);
    return pointerEvent;
  }

  const compositionData =
    event.type === "compositionstart" ||
    event.type === "compositionupdate" ||
    event.type === "compositionend"
      ? (event.data ?? "")
      : "";
  const compositionEvent =
    typeof window.CompositionEvent === "function"
      ? new window.CompositionEvent(event.type, {
          bubbles: true,
          cancelable: true,
          data: compositionData,
        })
      : new window.Event(event.type, {
          bubbles: true,
          cancelable: true,
        });
  defineEventValue(compositionEvent, "data", compositionData);
  return compositionEvent;
}

function traceEventTarget(root: HTMLElement, event: EditorTraceEvent): Element {
  if (event.type !== "pointerdown" || event.targetPath === undefined) {
    return root;
  }

  const target = findElementByDataPath(root, event.targetPath);
  if (target === null) {
    throw new Error(`Missing event target for ${event.targetPath}.`);
  }

  return target;
}

function readReplayedEditorState(root: HTMLElement): ReplayedEditorState {
  const view = root.querySelector(".document-view");
  const domSelection = readDomSelectionState(root);

  return {
    ...domSelection,
    pathText: readPathText(root),
    selectionAnchorEdge:
      view?.getAttribute("data-selection-anchor-edge") ?? null,
    selectionAnchorOffset:
      view?.getAttribute("data-selection-anchor-offset") ?? null,
    selectionAnchorPath:
      view?.getAttribute("data-selection-anchor-path") ?? null,
    selectionEdge: view?.getAttribute("data-selection-edge") ?? null,
    selectionFocusEdge: view?.getAttribute("data-selection-focus-edge") ?? null,
    selectionFocusOffset:
      view?.getAttribute("data-selection-focus-offset") ?? null,
    selectionFocusPath: view?.getAttribute("data-selection-focus-path") ?? null,
    selectionOffset: view?.getAttribute("data-selection-offset") ?? null,
    selectionPath: view?.getAttribute("data-selection-path") ?? null,
    selectionRangeCount:
      view?.getAttribute("data-selection-range-count") ?? null,
    selectionSelectedPointers:
      view?.getAttribute("data-selection-selected-pointers") ?? null,
    text: view?.textContent ?? "",
  };
}

function assertTraceExpectation({
  after,
  before,
  event,
  eventIndex,
  expectation,
  trace,
}: {
  after: ReplayedEditorState;
  before: ReplayedEditorState;
  event: EditorTraceEvent;
  eventIndex: number;
  expectation?: EditorTraceExpectation;
  trace: EditorTraceReplay;
}) {
  if (expectation === undefined) {
    return;
  }

  assertStateExpectation({
    actual: before,
    event,
    eventIndex,
    expectation: expectation.before,
    phase: "before",
    trace,
  });
  assertStateExpectation({
    actual: after,
    event,
    eventIndex,
    expectation: expectation.after,
    phase: "after",
    trace,
  });
}

function assertStateExpectation({
  actual,
  event,
  eventIndex,
  expectation,
  phase,
  trace,
}: {
  actual: ReplayedEditorState;
  event: EditorTraceEvent;
  eventIndex: number;
  expectation?: ReplayedEditorStateExpectation;
  phase: "after" | "before";
  trace: EditorTraceReplay;
}) {
  if (expectation === undefined) {
    return;
  }

  for (const [key, expected] of Object.entries(expectation)) {
    if (key === "pathText") {
      continue;
    }
    const actualValue = actual[key as keyof ReplayedEditorState];
    if (actualValue !== expected) {
      throw traceExpectationError({
        actual: actualValue,
        event,
        eventIndex,
        expected,
        field: `${phase}.${key}`,
        trace,
      });
    }
  }

  for (const [path, expected] of Object.entries(expectation.pathText ?? {})) {
    const actualValue = actual.pathText[path];
    if (actualValue !== expected) {
      throw traceExpectationError({
        actual: actualValue,
        event,
        eventIndex,
        expected,
        field: `${phase}.pathText[${path}]`,
        trace,
      });
    }
  }
}

function traceExpectationError({
  actual,
  event,
  eventIndex,
  expected,
  field,
  trace,
}: {
  actual: unknown;
  event: EditorTraceEvent;
  eventIndex: number;
  expected: unknown;
  field: string;
  trace: EditorTraceReplay;
}): Error {
  return new Error(
    `Trace expectation failed in ${trace.name}${formatTraceContracts(
      trace.contractIds,
    )} at #${eventIndex} ${describeTraceEvent(
      event,
    )} ${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(
      actual,
    )}`,
  );
}

function formatTraceContracts(
  contractIds: readonly EditorInputContractId[] | undefined,
): string {
  if (contractIds === undefined || contractIds.length === 0) {
    return "";
  }

  return ` [${contractIds.join(", ")}]`;
}

function readPathText(root: HTMLElement): Record<string, string> {
  const pathText: Record<string, string> = {};
  for (const element of Array.from(root.querySelectorAll("[data-path]"))) {
    const path = element.getAttribute("data-path");
    if (path !== null) {
      pathText[path] = element.textContent ?? "";
    }
  }

  return pathText;
}

function readDomSelectionState(
  root: HTMLElement,
): Pick<
  ReplayedEditorState,
  | "domSelectionAnchorOffset"
  | "domSelectionAnchorPath"
  | "domSelectionCollapsed"
  | "domSelectionFocusOffset"
  | "domSelectionFocusPath"
  | "domSelectionText"
> {
  const selection = root.ownerDocument.getSelection();
  if (
    selection === null ||
    selection.rangeCount === 0 ||
    selection.anchorNode === null ||
    selection.focusNode === null ||
    !root.contains(selection.anchorNode) ||
    !root.contains(selection.focusNode)
  ) {
    return {
      domSelectionAnchorOffset: null,
      domSelectionAnchorPath: null,
      domSelectionCollapsed: null,
      domSelectionFocusOffset: null,
      domSelectionFocusPath: null,
      domSelectionText: "",
    };
  }

  return {
    domSelectionAnchorOffset: domTextOffsetForNode(
      selection.anchorNode,
      selection.anchorOffset,
    ),
    domSelectionAnchorPath: dataPathForNode(selection.anchorNode),
    domSelectionCollapsed: String(selection.isCollapsed),
    domSelectionFocusOffset: domTextOffsetForNode(
      selection.focusNode,
      selection.focusOffset,
    ),
    domSelectionFocusPath: dataPathForNode(selection.focusNode),
    domSelectionText: selection.toString(),
  };
}

function dataPathForNode(node: Node): string | null {
  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest("[data-path]")?.getAttribute("data-path") ?? null;
}

function domTextOffsetForNode(node: Node, offset: number): string | null {
  const element = node instanceof Element ? node : node.parentElement;
  const pathElement = element?.closest("[data-path]");
  if (pathElement === null || pathElement === undefined) {
    return null;
  }

  let textOffset = 0;
  const walker = pathElement.ownerDocument.createTreeWalker(pathElement, 4);
  let current = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    if (textNode === node) {
      return String(
        clamp(textOffset + offset, 0, pathElement.textContent?.length ?? 0),
      );
    }
    textOffset += textNode.data.length;
    current = walker.nextNode();
  }

  return null;
}

function describeTraceEvent(event: EditorTraceEvent): string {
  const parts: string[] = [event.type];
  if ("key" in event) {
    parts.push(event.key);
  }
  if ("inputType" in event) {
    parts.push(event.inputType);
  }

  return parts.join(" ");
}

function replayedEditorStatesEqual(
  left: ReplayedEditorState,
  right: ReplayedEditorState,
): boolean {
  return (
    left.text === right.text &&
    left.selectionPath === right.selectionPath &&
    left.selectionOffset === right.selectionOffset &&
    left.selectionEdge === right.selectionEdge &&
    left.selectionAnchorPath === right.selectionAnchorPath &&
    left.selectionAnchorOffset === right.selectionAnchorOffset &&
    left.selectionAnchorEdge === right.selectionAnchorEdge &&
    left.selectionFocusPath === right.selectionFocusPath &&
    left.selectionFocusOffset === right.selectionFocusOffset &&
    left.selectionFocusEdge === right.selectionFocusEdge &&
    left.selectionRangeCount === right.selectionRangeCount &&
    left.selectionSelectedPointers === right.selectionSelectedPointers &&
    pathTextEqual(left.pathText, right.pathText)
  );
}

function pathTextEqual(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftEntries = Object.entries(left);
  if (leftEntries.length !== Object.keys(right).length) {
    return false;
  }

  return leftEntries.every(([path, text]) => right[path] === text);
}

function createTraceTransferData(event: TransferTraceEvent) {
  const data = new Map<string, string>();
  for (const [type, value] of Object.entries(event.data ?? {})) {
    data.set(type, value);
  }
  if (event.text !== undefined) {
    data.set("text/plain", event.text);
    if (event.format === "markdown") {
      data.set("text/markdown", event.text);
    }
  }

  return {
    get types() {
      return Array.from(data.keys());
    },
    clearData(type?: string) {
      if (type === undefined) {
        data.clear();
      } else {
        data.delete(type);
      }
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
    setData(type: string, value: string) {
      data.set(type, value);
    },
  };
}

function replaceTextRun(
  root: HTMLElement,
  path: string,
  text: string,
  offset?: number,
) {
  const element = findElementByDataPath(root, path);
  if (element === null) {
    throw new Error(`Missing text run for ${path}.`);
  }

  element.textContent = text;
  if (offset !== undefined) {
    setTextSelection(root, path, offset);
  }
}

function setTraceSelection(
  root: HTMLElement,
  step: Extract<EditorTraceStep, { kind: "selection" }>,
) {
  if (step.path !== undefined && step.offset !== undefined) {
    setTextSelection(root, step.path, step.offset);
    return;
  }

  if (step.anchor !== undefined && step.focus !== undefined) {
    setTextRangeSelection(root, step.anchor, step.focus);
    return;
  }

  throw new Error("Selection step requires path/offset or anchor/focus.");
}

function setTextSelection(root: HTMLElement, path: string, offset: number) {
  setTextRangeSelection(root, { path, offset }, { path, offset });
}

function setTextRangeSelection(
  root: HTMLElement,
  anchor: { path: string; offset: number },
  focus: { path: string; offset: number },
) {
  const anchorPosition = textPositionForPathOffset(root, anchor);
  const focusPosition = textPositionForPathOffset(root, focus);

  const range = root.ownerDocument.createRange();
  range.setStart(anchorPosition.node, anchorPosition.offset);
  range.setEnd(focusPosition.node, focusPosition.offset);

  const selection = root.ownerDocument.getSelection();
  if (selection === null) {
    throw new Error("Selection is unavailable.");
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function textPositionForPathOffset(
  root: HTMLElement,
  point: { path: string; offset: number },
) {
  const element = findElementByDataPath(root, point.path);
  if (element === null) {
    throw new Error(`Missing text run for ${point.path}.`);
  }

  const position = textPositionForOffset(element, point.offset);
  if (position === null) {
    throw new Error(`Missing text node for ${point.path}.`);
  }

  return position;
}

function textPositionForOffset(
  element: Element,
  offset: number,
): { node: Text; offset: number } | null {
  const textLength = element.textContent?.length ?? 0;
  let remaining = clamp(offset, 0, textLength);
  let lastTextNode: Text | null = null;
  const walker = element.ownerDocument.createTreeWalker(element, 4);

  let current = walker.nextNode();
  while (current !== null) {
    const textNode = current as Text;
    lastTextNode = textNode;

    if (remaining <= textNode.data.length) {
      return { node: textNode, offset: remaining };
    }

    remaining -= textNode.data.length;
    current = walker.nextNode();
  }

  if (lastTextNode !== null) {
    return { node: lastTextNode, offset: lastTextNode.data.length };
  }

  const emptyTextNode = element.ownerDocument.createTextNode("");
  element.append(emptyTextNode);
  return { node: emptyTextNode, offset: 0 };
}

function findElementByDataPath(root: ParentNode, path: string): Element | null {
  for (const element of Array.from(root.querySelectorAll("[data-path]"))) {
    if (element.getAttribute("data-path") === path) {
      return element;
    }
  }

  return null;
}

function defineEventValue(event: Event, key: string, value: unknown) {
  Object.defineProperty(event, key, {
    configurable: true,
    value,
  });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
