import type { SelectionSnap } from "@interactive-os/json-document";
import { useCallback, useEffect, useRef, useState } from "react";
import { type NoteDocument, readBlockText } from "../model/noteDocument";

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

type DebugRecordingSession = {
  entries: DebugRecordingEntry[];
  lastStateKey: string | null;
  restoreConsole?: () => void;
  sequence: number;
  startedAt: string;
  startedAtMs: number;
};

type DebugDiagnostic = {
  level: string;
  message: string;
  sequence?: number;
};

type PendingMoveGroup = {
  count: number;
  firstSequence: number;
  lastSequence: number;
  summary: string;
};

type LatestSnapshot = {
  note: NoteDocument;
  rootElement: HTMLElement | null;
  selection: SelectionSnap | undefined;
};

export type DebugRecordingInspectorState = {
  elapsedMs: number;
  entryCount: number;
  phase: "idle" | "recording" | "done" | "copy-failed";
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

type SerializedStateSummary = {
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

type ConsoleMethod = "error" | "warn";

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

const RECORDING_SCHEMA = "editable-debug-trace@3";
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
  const [inspector, setInspector] = useState<DebugRecordingInspectorState>({
    elapsedMs: 0,
    entryCount: 0,
    phase: "idle",
  });
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
    session.restoreConsole?.();

    const stoppedAtMs = nowMs();
    const rawReport = buildReport(session, stoppedAtMs);
    const report = formatDebugReport(rawReport);
    storeRawReport(rawReport);
    const elapsedMs = roundMs(stoppedAtMs - session.startedAtMs);
    setInspector({
      elapsedMs,
      entryCount: session.entries.length,
      phase: "done",
    });

    console.log(report);
    void copyTextToClipboard(report).then((copied) => {
      if (!copied) {
        setInspector({
          elapsedMs,
          entryCount: session.entries.length,
          phase: "copy-failed",
        });
        console.warn("Debug recording could not be copied to the clipboard.");
      }
    });
  }, [recordState]);

  const startRecording = useCallback(() => {
    const session: DebugRecordingSession = {
      entries: [],
      lastStateKey: null,
      sequence: 0,
      startedAt: new Date().toISOString(),
      startedAtMs: nowMs(),
    };
    sessionRef.current = session;
    session.restoreConsole = patchConsole((method, args) => {
      if (sessionRef.current !== session) {
        return;
      }

      session.entries.push({
        kind: "console",
        method,
        args: args.map(serializeConsoleArgument),
        ...entryTiming(session),
      });
    });
    recordState("recording-started");
    setInspector({
      elapsedMs: 0,
      entryCount: session.entries.length,
      phase: "recording",
    });
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
    if (inspector.phase !== "recording") {
      return;
    }

    const interval = window.setInterval(() => {
      const session = sessionRef.current;
      if (session === null) {
        return;
      }

      setInspector({
        elapsedMs: roundMs(nowMs() - session.startedAtMs),
        entryCount: session.entries.length,
        phase: "recording",
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [inspector.phase]);

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

  return inspector;
}

function readSnapshot({ note, rootElement, selection }: LatestSnapshot): {
  activeElement: SerializedTarget | null;
  dom: string | null;
  json: string;
  summary: SerializedStateSummary;
} {
  const dom = rootElement === null ? null : serializeDom(rootElement);

  return {
    activeElement: serializeTarget(
      rootElement?.ownerDocument.activeElement ?? null,
    ),
    dom,
    json: safeStringify({
      document: note,
      selection: selection ?? null,
    }),
    summary: {
      document: summarizeDocument(note),
      dom: summarizeDom(dom),
      selection: summarizeSelection(selection),
    },
  };
}

function buildReport(session: DebugRecordingSession, stoppedAtMs: number) {
  const latestState = [...session.entries]
    .reverse()
    .find((entry) => entry.kind === "state");
  const consoleEntries = session.entries.filter(
    (entry): entry is Extract<DebugRecordingEntry, { kind: "console" }> =>
      entry.kind === "console",
  );
  const duplicateBlockIds =
    latestState?.kind === "state"
      ? latestState.summary.document.duplicateBlockIds
      : [];
  const diagnostics: DebugDiagnostic[] = [
    ...diagnoseDuplicateBlockIds(duplicateBlockIds),
    ...consoleEntries.map((entry) => ({
      level: entry.method,
      message: entry.args.join(" "),
      sequence: entry.sequence,
    })),
  ];

  return {
    schema: RECORDING_SCHEMA,
    hotkey: RECORDING_HOTKEY,
    summary: {
      startedAt: session.startedAt,
      stoppedAt: new Date().toISOString(),
      durationMs: roundMs(stoppedAtMs - session.startedAtMs),
      url: currentUrl(),
      userAgent: currentUserAgent(),
      entryCount: session.entries.length,
      inputCount: session.entries.filter((entry) => entry.kind === "input")
        .length,
      stateCount: session.entries.filter((entry) => entry.kind === "state")
        .length,
      consoleCount: consoleEntries.length,
      finalDocument: latestState?.kind === "state" ? latestState.summary : null,
    },
    diagnostics,
    timeline: session.entries.map(summarizeTimelineEntry),
    rawEntries: session.entries,
  };
}

function formatDebugReport(report: ReturnType<typeof buildReport>): string {
  const lines = [
    "EDITABLE DEBUG TRACE",
    `schema: ${report.schema}`,
    `hotkey: ${report.hotkey}`,
    `url: ${report.summary.url ?? "unknown"}`,
    `started: ${report.summary.startedAt}`,
    `duration: ${report.summary.durationMs}ms`,
    `counts: entries=${report.summary.entryCount} input=${report.summary.inputCount} state=${report.summary.stateCount} console=${report.summary.consoleCount}`,
    "",
    "DIAGNOSTICS",
    ...formatDiagnostics(report.diagnostics),
    "",
    "FINAL DOCUMENT",
    ...formatFinalDocument(report.summary.finalDocument),
    "",
    "TIMELINE",
    ...formatTimeline(report.timeline),
    "",
    "RAW",
    "full JSON/DOM omitted from clipboard; available while the page is open at window.__editableDebugRecordings.at(-1)",
  ];

  return `${lines.join("\n")}\n`;
}

function formatDiagnostics(diagnostics: DebugDiagnostic[]): string[] {
  if (diagnostics.length === 0) {
    return ["  none"];
  }

  const grouped = new Map<
    string,
    { count: number; level: string; message: string; sequences: number[] }
  >();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.level}:${diagnostic.message}`;
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, {
        count: 1,
        level: diagnostic.level,
        message: diagnostic.message,
        sequences:
          diagnostic.sequence === undefined ? [] : [diagnostic.sequence],
      });
      continue;
    }

    existing.count += 1;
    if (diagnostic.sequence !== undefined) {
      existing.sequences.push(diagnostic.sequence);
    }
  }

  return [...grouped.values()].map((diagnostic) => {
    const count = diagnostic.count > 1 ? ` x${diagnostic.count}` : "";
    const sequences =
      diagnostic.sequences.length === 0
        ? ""
        : ` #${diagnostic.sequences.slice(0, 6).join(",#")}`;
    return `  ! ${diagnostic.level}${count}${sequences}: ${truncate(
      diagnostic.message,
      500,
    )}`;
  });
}

function formatFinalDocument(
  finalDocument: SerializedStateSummary | null,
): string[] {
  if (finalDocument === null) {
    return ["  unavailable"];
  }

  const duplicateLine =
    finalDocument.document.duplicateBlockIds.length === 0
      ? "none"
      : finalDocument.document.duplicateBlockIds.join(", ");

  return [
    `  title: ${finalDocument.document.title}`,
    `  blocks: ${finalDocument.document.blockCount}`,
    `  ids: ${finalDocument.document.blockIds.join(", ")}`,
    `  duplicates: ${duplicateLine}`,
    `  selection: ${finalDocument.selection ?? "none"}`,
    `  domText: ${finalDocument.dom?.text ?? "none"}`,
    "  outline:",
    ...finalDocument.document.blocks.map((block) => `    ${block}`),
  ];
}

function formatTimeline(
  timeline: ReturnType<typeof buildReport>["timeline"],
): string[] {
  const lines: string[] = [];
  let lastStateSignature: string | null = null;
  let pendingMove: PendingMoveGroup | null = null;

  const flushMove = () => {
    if (pendingMove === null) {
      return;
    }

    const range =
      pendingMove.firstSequence === pendingMove.lastSequence
        ? `#${pendingMove.firstSequence}`
        : `#${pendingMove.firstSequence}-#${pendingMove.lastSequence}`;
    lines.push(
      `  ${range} pointer/mouse move x${pendingMove.count}: ${pendingMove.summary}`,
    );
    pendingMove = null;
  };

  for (const entry of timeline) {
    if (entry.kind === "input") {
      const event = entry.event;
      const inputSummary = formatInputSummary(event);
      if (isMoveEvent(event.type)) {
        pendingMove = appendPendingMove(
          pendingMove,
          entry.sequence,
          inputSummary,
        );
        continue;
      }

      flushMove();
      lines.push(
        `  #${entry.sequence} +${entry.elapsedMs}ms input: ${inputSummary}`,
      );
      continue;
    }

    flushMove();

    if (entry.kind === "console") {
      lines.push(
        `  #${entry.sequence} +${entry.elapsedMs}ms console.${entry.method}: ${truncate(
          entry.message,
          500,
        )}`,
      );
      continue;
    }

    const stateSignature = [
      entry.blocks.join("|"),
      entry.duplicateBlockIds.join(","),
      entry.selection ?? "",
      entry.domText ?? "",
    ].join("\n");
    if (entry.reason === "dom" && stateSignature === lastStateSignature) {
      continue;
    }

    lastStateSignature = stateSignature;
    const duplicateText =
      entry.duplicateBlockIds.length === 0
        ? "none"
        : entry.duplicateBlockIds.join(",");
    lines.push(
      `  #${entry.sequence} +${entry.elapsedMs}ms state:${entry.reason} selection=${
        entry.selection ?? "none"
      } duplicates=${duplicateText}`,
    );
    lines.push(`      text: ${entry.domText ?? "none"}`);
  }

  flushMove();

  if (lines.length === 0) {
    return ["  none"];
  }

  const maxLines = 120;
  if (lines.length <= maxLines) {
    return lines;
  }

  return [
    ...lines.slice(0, maxLines),
    `  ... ${lines.length - maxLines} more timeline lines omitted`,
  ];
}

function formatInputSummary(
  event: ReturnType<typeof summarizeInputEvent>,
): string {
  const modifiers =
    event.modifiers.length === 0 ? "" : `${event.modifiers.join("+")}+`;
  const target = formatTarget(event.target);

  if (event.type === "keydown" || event.type === "keyup") {
    return `${event.type} ${modifiers}${event.key ?? event.code ?? "unknown"} target=${target}`;
  }

  if (event.type === "beforeinput" || event.type === "input") {
    const data =
      event.data === undefined || event.data === null
        ? ""
        : ` data=${quote(event.data)}`;
    return `${event.type} ${event.inputType ?? "unknown"}${data} target=${target}`;
  }

  if (event.type === "paste" || event.type === "copy" || event.type === "cut") {
    const clipboard =
      event.clipboardText === undefined ? "" : ` ${quote(event.clipboardText)}`;
    return `${event.type}${clipboard} target=${target}`;
  }

  const client =
    event.client === undefined ? "" : ` @${event.client.x},${event.client.y}`;
  const button = event.button === undefined ? "" : ` button=${event.button}`;
  return `${event.type}${button}${client} target=${target}`;
}

function formatTarget(target: SerializedTarget | null | undefined): string {
  if (target === null || target === undefined) {
    return "unknown";
  }

  if (target.dataPath !== undefined) {
    return target.dataPath;
  }

  if (target.ariaLabel !== undefined) {
    return `${target.tagName ?? target.nodeName}[aria=${quote(target.ariaLabel)}]`;
  }

  if (target.role !== undefined) {
    return `${target.tagName ?? target.nodeName}[role=${target.role}]`;
  }

  if (target.className !== undefined) {
    return `${target.tagName ?? target.nodeName}.${target.className.split(/\s+/)[0]}`;
  }

  return target.tagName ?? target.nodeName;
}

function isMoveEvent(type: string): boolean {
  return type === "mousemove" || type === "pointermove";
}

function appendPendingMove(
  pendingMove: PendingMoveGroup | null,
  sequence: number,
  summary: string,
): PendingMoveGroup {
  return {
    count: pendingMove === null ? 1 : pendingMove.count + 1,
    firstSequence: pendingMove === null ? sequence : pendingMove.firstSequence,
    lastSequence: sequence,
    summary,
  };
}

function quote(value: string): string {
  return `"${truncate(value.replace(/\s+/g, " "), 120)}"`;
}

function summarizeTimelineEntry(entry: DebugRecordingEntry) {
  if (entry.kind === "state") {
    return {
      sequence: entry.sequence,
      elapsedMs: entry.elapsedMs,
      kind: entry.kind,
      reason: entry.reason,
      blocks: entry.summary.document.blocks,
      duplicateBlockIds: entry.summary.document.duplicateBlockIds,
      selection: entry.summary.selection,
      activeElement: entry.activeElement,
      domText: entry.summary.dom?.text ?? null,
      rawEntry: entry.sequence,
    };
  }

  if (entry.kind === "console") {
    return {
      sequence: entry.sequence,
      elapsedMs: entry.elapsedMs,
      kind: entry.kind,
      method: entry.method,
      message: entry.args.join(" "),
    };
  }

  return {
    sequence: entry.sequence,
    elapsedMs: entry.elapsedMs,
    kind: entry.kind,
    event: summarizeInputEvent(entry.event),
  };
}

function summarizeInputEvent(event: SerializedInputEvent) {
  return {
    type: event.type,
    key: event.key,
    code: event.code,
    inputType: event.inputType,
    data: event.data,
    clipboardText: event.clipboardText,
    pointerType: event.pointerType,
    button: event.button,
    client:
      event.clientX === undefined || event.clientY === undefined
        ? undefined
        : { x: event.clientX, y: event.clientY },
    modifiers: modifierSummary(event),
    target: event.target,
    defaultPrevented: event.defaultPrevented,
  };
}

function modifierSummary(event: SerializedInputEvent): string[] {
  const modifiers: string[] = [];
  if (event.metaKey) {
    modifiers.push("Meta");
  }
  if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }

  return modifiers;
}

function diagnoseDuplicateBlockIds(
  duplicateBlockIds: string[],
): DebugDiagnostic[] {
  return duplicateBlockIds.map((id) => ({
    level: "error",
    message: `Duplicate block id detected: ${id}. React keys are block ids, so this can trigger duplicate-key warnings in DocumentRenderer.`,
  }));
}

function summarizeDocument(
  note: NoteDocument,
): SerializedStateSummary["document"] {
  const blockIds = note.root.children.map((block) => block.id);
  const blocks = note.root.children.map(
    (block, index) =>
      `${index}:${block.id}:${block.type}:${truncate(readBlockText(block), 48)}`,
  );
  const text = note.root.children.map(readBlockText).join("\n");

  return {
    blockCount: note.root.children.length,
    blockIds,
    blocks,
    duplicateBlockIds: duplicateValues(blockIds),
    text: truncate(text, 500),
    title: note.title,
  };
}

function summarizeDom(dom: string | null): SerializedStateSummary["dom"] {
  if (dom === null) {
    return null;
  }

  return {
    length: dom.length,
    text: truncate(collapseWhitespace(stripTags(dom)), 500),
  };
}

function summarizeSelection(
  selection: SelectionSnap | undefined,
): string | null {
  const focus = selection?.focus;
  if (focus === undefined || focus === null || typeof focus === "string") {
    return null;
  }

  if (focus.offset !== undefined) {
    return `${focus.path}@${focus.offset}`;
  }

  if (focus.edge !== undefined) {
    return `${focus.path}:${focus.edge}`;
  }

  return focus.path;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicates];
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

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, " ");
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

function patchConsole(
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

function serializeConsoleArgument(value: unknown): string {
  if (value instanceof Error) {
    return truncate(value.stack ?? value.message, 800);
  }

  if (typeof value === "string") {
    return truncate(value, 800);
  }

  return truncate(safeStringify(value), 800);
}

function storeRawReport(report: ReturnType<typeof buildReport>) {
  if (typeof window === "undefined") {
    return;
  }

  const debugWindow = window as unknown as {
    __editableDebugRecordings?: Array<ReturnType<typeof buildReport>>;
  };
  const recordings = debugWindow.__editableDebugRecordings ?? [];
  recordings.push(report);
  debugWindow.__editableDebugRecordings = recordings.slice(-5);
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
