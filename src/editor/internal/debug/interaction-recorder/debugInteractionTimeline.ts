import { truncate } from "./debugInteractionFormat";
import type {
  DebugRecordingEntry,
  PendingMoveGroup,
  SerializedInputEvent,
  SerializedTarget,
} from "./debugInteractionTypes";

export type DebugTimelineEntry = ReturnType<typeof summarizeTimelineEntry>;

export function formatTimeline(timeline: DebugTimelineEntry[]): string[] {
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

export function summarizeTimelineEntry(entry: DebugRecordingEntry) {
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

function formatInputSummary(
  event: ReturnType<typeof summarizeInputEvent>,
): string {
  const modifiers =
    event.modifiers.length === 0 ? "" : `${event.modifiers.join("+")}+`;
  const target = formatTarget(event.target);

  if (event.type === "keydown" || event.type === "keyup") {
    const keyCode =
      event.keyCode === undefined ? "" : ` keyCode=${event.keyCode}`;
    const composing = event.isComposing === true ? " composing" : "";
    return `${event.type} ${
      modifiers
    }${event.key ?? event.code ?? "unknown"}${keyCode}${composing} target=${target}`;
  }

  if (event.type === "beforeinput" || event.type === "input") {
    const data =
      event.data === undefined || event.data === null
        ? ""
        : ` data=${quote(event.data)}`;
    const composing = event.isComposing === true ? " composing" : "";
    return `${event.type} ${event.inputType ?? "unknown"}${data}${composing} target=${target}`;
  }

  if (
    event.type === "compositionstart" ||
    event.type === "compositionupdate" ||
    event.type === "compositionend"
  ) {
    const data =
      event.data === undefined || event.data === null
        ? ""
        : ` data=${quote(event.data)}`;
    return `${event.type}${data} target=${target}`;
  }

  if (event.type === "paste" || event.type === "copy" || event.type === "cut") {
    const clipboard =
      event.clipboardText === undefined ? "" : ` ${quote(event.clipboardText)}`;
    const types =
      event.clipboardTypes === undefined || event.clipboardTypes.length === 0
        ? ""
        : ` types=${event.clipboardTypes.join(",")}`;
    return `${event.type}${clipboard}${types} target=${target}`;
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
  return `"${truncate(escapeQuotedText(value), 120)}"`;
}

function escapeQuotedText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
}

function summarizeInputEvent(event: SerializedInputEvent) {
  return {
    type: event.type,
    key: event.key,
    code: event.code,
    keyCode: event.keyCode,
    inputType: event.inputType,
    data: event.data,
    isComposing: event.isComposing,
    clipboardText: event.clipboardText,
    clipboardTypes: event.clipboardTypes,
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
