import type { SelectionSnap } from "@interactive-os/json-document";
import type { NoteDocument } from "../model/noteDocument";

export type DebugStateReason =
  | "recording-started"
  | "json"
  | "dom"
  | "recording-stopped";

export type DebugRecordingEntry =
  | {
      kind: "state";
      reason: DebugStateReason;
      sequence: number;
      at: string;
      elapsedMs: number;
      json: string;
      dom: string | null;
      summary: SerializedStateSummary;
      activeElement: SerializedTarget | null;
    }
  | {
      kind: "input";
      sequence: number;
      at: string;
      elapsedMs: number;
      event: SerializedInputEvent;
    }
  | {
      kind: "console";
      sequence: number;
      at: string;
      elapsedMs: number;
      method: ConsoleMethod;
      args: string[];
    };

export type DebugRecordingSession = {
  entries: DebugRecordingEntry[];
  lastStateKey: string | null;
  restoreConsole?: () => void;
  sequence: number;
  startedAt: string;
  startedAtMs: number;
};

export type DebugDiagnostic = {
  level: string;
  message: string;
  sequence?: number;
};

export type PendingMoveGroup = {
  count: number;
  firstSequence: number;
  lastSequence: number;
  summary: string;
};

export type LatestSnapshot = {
  note: NoteDocument;
  rootElement: HTMLElement | null;
  selection: SelectionSnap | undefined;
};

export type DebugRecordingInspectorState = {
  elapsedMs: number;
  entryCount: number;
  phase: "idle" | "recording" | "done" | "copy-failed";
};

export type SerializedTarget = {
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

export type SerializedStateSummary = {
  document: {
    blockCount: number;
    blockIds: string[];
    blocks: string[];
    duplicateBlockIds: string[];
    text: string;
    title: string;
  };
  dom: {
    length: number;
    text: string | null;
  } | null;
  selection: string | null;
};

export type ConsoleMethod = "error" | "warn";

export type SerializedInputEvent = {
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

export const RECORDING_SCHEMA = "editable-debug-trace@3";
export const RECORDING_HOTKEY = "Cmd+Shift+Backslash";
export const INPUT_EVENT_TYPES = [
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
