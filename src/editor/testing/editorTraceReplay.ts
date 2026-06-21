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
  | InputTraceEvent;

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

export type ReplayedEditorEvent = {
  defaultPrevented: boolean;
  event: EditorTraceEvent;
};

export async function replayEditorTrace(
  root: HTMLElement,
  trace: EditorTraceReplay,
): Promise<ReplayedEditorEvent[]> {
  const events: ReplayedEditorEvent[] = [];

  for (const step of trace.steps) {
    if (step.kind === "event") {
      await act(async () => {
        const event = createTraceEvent(root, step.event);
        root.dispatchEvent(event);
        events.push({
          defaultPrevented: event.defaultPrevented,
          event: step.event,
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

  const compositionData = "data" in event ? (event.data ?? "") : "";
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
