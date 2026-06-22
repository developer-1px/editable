import {
  currentUrl,
  currentUserAgent,
  roundMs,
  truncate,
} from "./debugInteractionFormat";
import {
  formatTimeline,
  summarizeTimelineEntry,
} from "./debugInteractionTimeline";
import type {
  DebugDiagnostic,
  DebugRecordingEntry,
  DebugRecordingSession,
  SerializedStateSummary,
} from "./debugInteractionTypes";
import { RECORDING_HOTKEY, RECORDING_SCHEMA } from "./debugInteractionTypes";

export function buildReport(
  session: DebugRecordingSession,
  stoppedAtMs: number,
) {
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

export function formatDebugReport(
  report: ReturnType<typeof buildReport>,
): string {
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

export function storeRawReport(report: ReturnType<typeof buildReport>) {
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

function diagnoseDuplicateBlockIds(
  duplicateBlockIds: string[],
): DebugDiagnostic[] {
  return duplicateBlockIds.map((id) => ({
    level: "error",
    message: `Duplicate block id detected: ${id}. React keys are block ids, so this can trigger duplicate-key warnings in DocumentRenderer.`,
  }));
}
