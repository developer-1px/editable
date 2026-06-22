import { readTextFromTransfer } from "../model/clipboard";
import { roundMs, safeStringify, truncate } from "./debugInteractionFormat";
import { serializeTarget } from "./debugInteractionSnapshot";
import type {
  ConsoleMethod,
  SerializedInputEvent,
} from "./debugInteractionTypes";

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

export function serializeInputEvent(event: Event): SerializedInputEvent {
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
    const clipboardText =
      event.clipboardData === null || event.clipboardData === undefined
        ? null
        : readTextFromTransfer(event.clipboardData);
    if (clipboardText !== null) {
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

export function isRecordingHotkey(event: KeyboardEvent): boolean {
  return (
    event.metaKey &&
    event.shiftKey &&
    !event.ctrlKey &&
    !event.altKey &&
    isBackslashKey(event)
  );
}

export function isBackslashKey(event: KeyboardEvent): boolean {
  return event.code === "Backslash" || event.key === "\\" || event.key === "|";
}

export function patchConsole(
  record: (method: ConsoleMethod, args: unknown[]) => void,
): () => void {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    record("error", args);
    originalError.apply(console, args);
  };
  console.warn = (...args: unknown[]) => {
    record("warn", args);
    originalWarn.apply(console, args);
  };

  return () => {
    console.error = originalError;
    console.warn = originalWarn;
  };
}

export function serializeConsoleArgument(value: unknown): string {
  if (value instanceof Error) {
    return truncate(value.stack ?? value.message, 800);
  }

  if (typeof value === "string") {
    return truncate(value, 800);
  }

  return truncate(safeStringify(value), 800);
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
