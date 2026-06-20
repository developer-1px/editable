import type { SelectionSnap } from "@interactive-os/json-document";
import { useCallback, useEffect, useRef } from "react";
import type { NoteDocument } from "../model/noteDocument";

type DebugStateReason =
  | "recording-started"
  | "json"
  | "dom"
  | "recording-stopped";

type DebugRecordingEntry =
  | {
      kind: "state";
      reason: DebugStateReason;
      sequence: number;
      at: string;
      elapsedMs: number;
      json: string;
      dom: string | null;
      activeElement: SerializedTarget | null;
    }
  | {
      kind: "input";
      sequence: number;
      at: string;
      elapsedMs: number;
      event: SerializedInputEvent;
    };

type DebugRecordingSession = {
  entries: DebugRecordingEntry[];
  lastStateKey: string | null;
  sequence: number;
  startedAt: string;
  startedAtMs: number;
};

type LatestSnapshot = {
  note: NoteDocument;
  rootElement: HTMLElement | null;
  selection: SelectionSnap | undefined;
};

type SerializedTarget = {
  ariaLabel?: string;
  className?: string;
  dataPath?: string;
  id?: string;
  nodeName: string;
  path?: string;
  role?: string;
  tagName?: string;
  text?: string;
};

type SerializedInputEvent = {
  altKey?: boolean;
  button?: number;
  buttons?: number;
  clientX?: number;
  clientY?: number;
  clipboardText?: string;
  code?: string;
  ctrlKey?: boolean;
  data?: string | null;
  defaultPrevented: boolean;
  deltaMode?: number;
  deltaX?: number;
  deltaY?: number;
  deltaZ?: number;
  eventTimeStamp: number;
  inputType?: string;
  isComposing?: boolean;
  isPrimary?: boolean;
  key?: string;
  location?: number;
  metaKey?: boolean;
  offsetX?: number;
  offsetY?: number;
  pageX?: number;
  pageY?: number;
  pointerId?: number;
  pointerType?: string;
  pressure?: number;
  repeat?: boolean;
  screenX?: number;
  screenY?: number;
  shiftKey?: boolean;
  target: SerializedTarget | null;
  type: string;
  width?: number;
  height?: number;
};

type InputEventLike = Event & {
  data?: string | null;
  inputType?: string;
  isComposing?: boolean;
};

type ClipboardEventLike = Event & {
  clipboardData?: DataTransfer | null;
};

type PointerEventLike = MouseEvent & {
  height?: number;
  isPrimary?: boolean;
  pointerId?: number;
  pointerType?: string;
  pressure?: number;
  width?: number;
};

const RECORDING_SCHEMA = "editable-debug-recording@1";
const RECORDING_HOTKEY = "Cmd+Shift+Backslash";
const INPUT_EVENT_TYPES = [
  "beforeinput",
  "click",
  "compositionend",
  "compositionstart",
  "compositionupdate",
  "contextmenu",
  "copy",
  "cut",
  "dblclick",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mouseenter",
  "mouseleave",
  "mousemove",
  "mouseup",
  "paste",
  "pointercancel",
  "pointerdown",
  "pointermove",
  "pointerup",
  "wheel",
] as const;

export function useDebugInteractionRecorder({
  note,
  rootElement,
  selection,
}: LatestSnapshot) {
  const sessionRef = useRef<DebugRecordingSession | null>(null);
  const latestSnapshotRef = useRef<LatestSnapshot>({
    note,
    rootElement,
    selection,
  });
  const jsonSnapshotKey = safeStringify({
    document: note,
    selection: selection ?? null,
  });
  latestSnapshotRef.current = { note, rootElement, selection };

  const recordState = useCallback(
    (reason: DebugStateReason, changeKey?: string) => {
      const session = sessionRef.current;
      if (session === null) {
        return;
      }

      const snapshot = readSnapshot(latestSnapshotRef.current);
      const stateKey = `${changeKey ?? snapshot.json}\n${snapshot.dom ?? ""}`;
      if (session.lastStateKey === stateKey && reason !== "recording-stopped") {
        return;
      }

      session.lastStateKey = stateKey;
      session.entries.push({
        kind: "state",
        reason,
        ...entryTiming(session),
        ...snapshot,
      });
    },
    [],
  );

  const stopRecording = useCallback(() => {
    const session = sessionRef.current;
    if (session === null) {
      return;
    }

    recordState("recording-stopped");
    sessionRef.current = null;

    const stoppedAtMs = nowMs();
    const report = JSON.stringify(
      {
        schema: RECORDING_SCHEMA,
        hotkey: RECORDING_HOTKEY,
        startedAt: session.startedAt,
        stoppedAt: new Date().toISOString(),
        durationMs: roundMs(stoppedAtMs - session.startedAtMs),
        url: currentUrl(),
        userAgent: currentUserAgent(),
        entryCount: session.entries.length,
        entries: session.entries,
      },
      null,
      2,
    );

    console.log(report);
    void copyTextToClipboard(report).then((copied) => {
      if (!copied) {
        console.warn("Debug recording could not be copied to the clipboard.");
      }
    });
  }, [recordState]);

  const startRecording = useCallback(() => {
    sessionRef.current = {
      entries: [],
      lastStateKey: null,
      sequence: 0,
      startedAt: new Date().toISOString(),
      startedAtMs: nowMs(),
    };
    recordState("recording-started");
  }, [recordState]);

  const toggleRecording = useCallback(() => {
    if (sessionRef.current === null) {
      startRecording();
      return;
    }

    stopRecording();
  }, [startRecording, stopRecording]);

  useEffect(() => {
    const handleToggleKeyDown = (event: KeyboardEvent) => {
      if (!isRecordingHotkey(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      toggleRecording();
    };

    const handleInputEvent = (event: Event) => {
      const session = sessionRef.current;
      if (session === null) {
        return;
      }
      if (event instanceof KeyboardEvent && isRecordingHotkey(event)) {
        return;
      }
      if (
        event instanceof KeyboardEvent &&
        event.type === "keyup" &&
        isBackslashKey(event)
      ) {
        return;
      }

      session.entries.push({
        kind: "input",
        ...entryTiming(session),
        event: serializeInputEvent(event),
      });
    };

    window.addEventListener("keydown", handleToggleKeyDown, { capture: true });
    for (const eventType of INPUT_EVENT_TYPES) {
      window.addEventListener(eventType, handleInputEvent, { capture: true });
    }

    return () => {
      window.removeEventListener("keydown", handleToggleKeyDown, {
        capture: true,
      });
      for (const eventType of INPUT_EVENT_TYPES) {
        window.removeEventListener(eventType, handleInputEvent, {
          capture: true,
        });
      }
    };
  }, [toggleRecording]);

  useEffect(() => {
    recordState("json", jsonSnapshotKey);
  }, [jsonSnapshotKey, recordState]);

  useEffect(() => {
    if (rootElement === null || typeof MutationObserver === "undefined") {
      return;
    }

    const observer = new MutationObserver(() => {
      recordState("dom");
    });
    observer.observe(rootElement, {
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [recordState, rootElement]);
}

function readSnapshot({ note, rootElement, selection }: LatestSnapshot): {
  activeElement: SerializedTarget | null;
  dom: string | null;
  json: string;
} {
  return {
    activeElement: serializeTarget(
      rootElement?.ownerDocument.activeElement ?? null,
    ),
    dom: rootElement === null ? null : serializeDom(rootElement),
    json: safeStringify({
      document: note,
      selection: selection ?? null,
    }),
  };
}

function serializeInputEvent(event: Event): SerializedInputEvent {
  const serialized: SerializedInputEvent = {
    defaultPrevented: event.defaultPrevented,
    eventTimeStamp: roundMs(event.timeStamp),
    target: serializeTarget(event.target),
    type: event.type,
  };

  if (event instanceof KeyboardEvent) {
    serialized.altKey = event.altKey;
    serialized.code = event.code;
    serialized.ctrlKey = event.ctrlKey;
    serialized.isComposing = event.isComposing;
    serialized.key = event.key;
    serialized.location = event.location;
    serialized.metaKey = event.metaKey;
    serialized.repeat = event.repeat;
    serialized.shiftKey = event.shiftKey;
  }

  if (isInputEventLike(event)) {
    serialized.data = event.data;
    serialized.inputType = event.inputType;
    serialized.isComposing = event.isComposing;
  }

  if (isClipboardEventLike(event)) {
    const clipboardText = event.clipboardData?.getData("text/plain");
    if (clipboardText !== undefined) {
      serialized.clipboardText = clipboardText;
    }
  }

  if (event instanceof MouseEvent) {
    serialized.altKey = event.altKey;
    serialized.button = event.button;
    serialized.buttons = event.buttons;
    serialized.clientX = roundMs(event.clientX);
    serialized.clientY = roundMs(event.clientY);
    serialized.ctrlKey = event.ctrlKey;
    serialized.metaKey = event.metaKey;
    serialized.offsetX = roundMs(event.offsetX);
    serialized.offsetY = roundMs(event.offsetY);
    serialized.pageX = roundMs(event.pageX);
    serialized.pageY = roundMs(event.pageY);
    serialized.screenX = roundMs(event.screenX);
    serialized.screenY = roundMs(event.screenY);
    serialized.shiftKey = event.shiftKey;
  }

  if (isPointerEventLike(event)) {
    serialized.height = event.height;
    serialized.isPrimary = event.isPrimary;
    serialized.pointerId = event.pointerId;
    serialized.pointerType = event.pointerType;
    serialized.pressure = event.pressure;
    serialized.width = event.width;
  }

  if (event instanceof WheelEvent) {
    serialized.deltaMode = event.deltaMode;
    serialized.deltaX = roundMs(event.deltaX);
    serialized.deltaY = roundMs(event.deltaY);
    serialized.deltaZ = roundMs(event.deltaZ);
  }

  return serialized;
}

function isInputEventLike(event: Event): event is InputEventLike {
  return (
    event.type === "beforeinput" ||
    event.type === "input" ||
    "inputType" in event
  );
}

function isClipboardEventLike(event: Event): event is ClipboardEventLike {
  return "clipboardData" in event;
}

function isPointerEventLike(event: Event): event is PointerEventLike {
  return event instanceof MouseEvent && "pointerId" in event;
}

function isRecordingHotkey(event: KeyboardEvent): boolean {
  return (
    event.metaKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    isBackslashKey(event)
  );
}

function isBackslashKey(event: KeyboardEvent): boolean {
  return event.code === "Backslash" || event.key === "\\" || event.key === "|";
}

function entryTiming(session: DebugRecordingSession): {
  at: string;
  elapsedMs: number;
  sequence: number;
} {
  const timing = {
    at: new Date().toISOString(),
    elapsedMs: roundMs(nowMs() - session.startedAtMs),
    sequence: session.sequence,
  };
  session.sequence += 1;

  return timing;
}

function serializeDom(rootElement: HTMLElement): string {
  const clone = rootElement.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return rootElement.outerHTML;
  }

  syncFormControlValues(rootElement, clone);

  return clone.outerHTML;
}

function syncFormControlValues(sourceRoot: Element, cloneRoot: Element) {
  const sourceControls = sourceRoot.querySelectorAll("input, select, textarea");
  const cloneControls = cloneRoot.querySelectorAll("input, select, textarea");
  const defaultView = sourceRoot.ownerDocument.defaultView;

  if (defaultView === null) {
    return;
  }

  sourceControls.forEach((sourceControl, index) => {
    const cloneControl = cloneControls[index];
    if (cloneControl === undefined) {
      return;
    }

    if (
      sourceControl instanceof defaultView.HTMLInputElement &&
      cloneControl instanceof defaultView.HTMLInputElement
    ) {
      cloneControl.setAttribute("value", sourceControl.value);
      if (sourceControl.checked) {
        cloneControl.setAttribute("checked", "");
      } else {
        cloneControl.removeAttribute("checked");
      }
      return;
    }

    if (
      sourceControl instanceof defaultView.HTMLTextAreaElement &&
      cloneControl instanceof defaultView.HTMLTextAreaElement
    ) {
      cloneControl.textContent = sourceControl.value;
      return;
    }

    if (
      sourceControl instanceof defaultView.HTMLSelectElement &&
      cloneControl instanceof defaultView.HTMLSelectElement
    ) {
      Array.from(cloneControl.options).forEach((option, optionIndex) => {
        if (sourceControl.options[optionIndex]?.selected) {
          option.setAttribute("selected", "");
        } else {
          option.removeAttribute("selected");
        }
      });
    }
  });
}

function serializeTarget(target: EventTarget | null): SerializedTarget | null {
  if (
    target === null ||
    typeof Node === "undefined" ||
    !(target instanceof Node)
  ) {
    return null;
  }

  const element =
    target instanceof Element
      ? target
      : (target.parentElement ?? target.parentNode?.parentElement ?? null);

  if (element === null) {
    return {
      nodeName: target.nodeName,
    };
  }

  const className =
    typeof element.className === "string" && element.className.length > 0
      ? element.className
      : undefined;
  const text = collapseWhitespace(element.textContent ?? "");

  return {
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    className,
    dataPath: element.getAttribute("data-path") ?? undefined,
    id: element.id.length > 0 ? element.id : undefined,
    nodeName: target.nodeName,
    path: elementPath(element),
    role: element.getAttribute("role") ?? undefined,
    tagName: element.tagName.toLowerCase(),
    text: text.length > 0 ? truncate(text, 180) : undefined,
  };
}

function elementPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current !== null && parts.length < 8) {
    parts.unshift(elementPathSegment(current));
    if (current.id.length > 0) {
      break;
    }
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function elementPathSegment(element: Element): string {
  const dataPath = element.getAttribute("data-path");
  if (dataPath !== null) {
    return `${element.tagName.toLowerCase()}[data-path="${dataPath}"]`;
  }

  let segment = element.tagName.toLowerCase();
  if (element.id.length > 0) {
    return `${segment}#${cssIdentifier(element.id)}`;
  }

  const className =
    typeof element.className === "string" ? element.className.trim() : "";
  const firstClassName = className.split(/\s+/).find(Boolean);
  if (firstClassName !== undefined) {
    segment = `${segment}.${cssIdentifier(firstClassName)}`;
  }

  const parent = element.parentElement;
  if (parent !== null) {
    const sameTagSiblings = Array.from(parent.children).filter(
      (sibling) => sibling.tagName === element.tagName,
    );
    if (sameTagSiblings.length > 1) {
      segment = `${segment}:nth-of-type(${
        sameTagSiblings.indexOf(element) + 1
      })`;
    }
  }

  return segment;
}

function cssIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return `[Failed to serialize: ${String(error)}]`;
  }
}

function currentUrl(): string | null {
  return typeof window === "undefined" ? null : window.location.href;
}

function currentUserAgent(): string | null {
  return typeof navigator === "undefined" ? null : navigator.userAgent;
}

function nowMs(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back to execCommand below.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.left = "-100vw";
  textarea.style.position = "fixed";
  textarea.style.top = "0";

  const activeElement =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const selection = document.getSelection();
  const ranges: Range[] = [];
  if (selection !== null) {
    for (let index = 0; index < selection.rangeCount; index += 1) {
      ranges.push(selection.getRangeAt(index).cloneRange());
    }
  }

  document.body.append(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
    if (selection !== null) {
      selection.removeAllRanges();
      for (const range of ranges) {
        selection.addRange(range);
      }
    }
    activeElement?.focus();
  }
}
