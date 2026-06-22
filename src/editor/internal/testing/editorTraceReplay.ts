import { act } from "@testing-library/react";

export type EditorTraceReplay = {
  name: string;
  schema: "editable-trace-replay@1";
  steps: EditorTraceStep[];
};

export type EditorTraceStep =
  | {
      kind: "event";
      event: EditorTraceEvent;
      expect?: EditorTraceExpectation;
    }
  | {
      kind: "selection";
      path: string;
      offset: number;
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
  | TransferTraceEvent;

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
  type: "drop" | "paste";
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

  for (const step of trace.steps) {
    if (step.kind === "event") {
      act(() => {
        const before = readReplayedEditorState(root);
        const event = createTraceEvent(root, step.event);
        root.dispatchEvent(event);
        const after = readReplayedEditorState(root);
        assertTraceExpectation({
          after,
          before,
          event: step.event,
          eventIndex: events.length,
          expectation: step.expect,
        });
        events.push({
          after,
          before,
          defaultPrevented: event.defaultPrevented,
          event: step.event,
          index: events.length,
          stateChanged: !replayedEditorStatesEqual(before, after),
        });
      });
      continue;
    }

    if (step.kind === "selection") {
      setTextSelection(root, step.path, step.offset);
      continue;
    }

    if (step.kind === "text") {
      replaceTextRun(root, step.path, step.text, step.offset);
      continue;
    }

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
  }

  return events;
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

  if (event.type === "paste" || event.type === "drop") {
    const transfer = createTraceTransferData(event);
    const transferEvent = new window.Event(event.type, {
      bubbles: true,
      cancelable: true,
    });
    if (event.type === "paste") {
      defineEventValue(transferEvent, "clipboardData", transfer);
    } else {
      defineEventValue(transferEvent, "dataTransfer", transfer);
      defineEventValue(transferEvent, "clientX", event.clientX ?? 0);
      defineEventValue(transferEvent, "clientY", event.clientY ?? 0);
    }
    return transferEvent;
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
}: {
  after: ReplayedEditorState;
  before: ReplayedEditorState;
  event: EditorTraceEvent;
  eventIndex: number;
  expectation?: EditorTraceExpectation;
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
  });
  assertStateExpectation({
    actual: after,
    event,
    eventIndex,
    expectation: expectation.after,
    phase: "after",
  });
}

function assertStateExpectation({
  actual,
  event,
  eventIndex,
  expectation,
  phase,
}: {
  actual: ReplayedEditorState;
  event: EditorTraceEvent;
  eventIndex: number;
  expectation?: ReplayedEditorStateExpectation;
  phase: "after" | "before";
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
}: {
  actual: unknown;
  event: EditorTraceEvent;
  eventIndex: number;
  expected: unknown;
  field: string;
}): Error {
  return new Error(
    `Trace expectation failed at #${eventIndex} ${describeTraceEvent(
      event,
    )} ${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(
      actual,
    )}`,
  );
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
    left.selectionSelectedPointers === right.selectionSelectedPointers
  );
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

function setTextSelection(root: HTMLElement, path: string, offset: number) {
  const element = findElementByDataPath(root, path);
  if (element === null) {
    throw new Error(`Missing text run for ${path}.`);
  }

  const position = textPositionForOffset(element, offset);
  if (position === null) {
    throw new Error(`Missing text node for ${path}.`);
  }

  const range = root.ownerDocument.createRange();
  range.setStart(position.node, position.offset);
  range.collapse(true);

  const selection = root.ownerDocument.getSelection();
  if (selection === null) {
    throw new Error("Selection is unavailable.");
  }

  selection.removeAllRanges();
  selection.addRange(range);
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
