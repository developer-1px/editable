import { useCallback, useEffect, useRef, useState } from "react";
import {
  isBackslashKey,
  isRecordingHotkey,
  patchConsole,
  serializeConsoleArgument,
  serializeInputEvent,
} from "./debugInteractionEvents";
import { nowMs, roundMs, safeStringify } from "./debugInteractionFormat";
import {
  buildReport,
  formatDebugReport,
  storeRawReport,
} from "./debugInteractionReport";
import { readSnapshot } from "./debugInteractionSnapshot";
import {
  type DebugRecordingInspectorState,
  type DebugRecordingSession,
  type DebugStateReason,
  INPUT_EVENT_TYPES,
  type LatestSnapshot,
} from "./debugInteractionTypes";

export type { DebugRecordingInspectorState } from "./debugInteractionTypes";

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
      window.addEventListener(eventType, handleInputEvent, {
        capture: !isClipboardInputEvent(eventType),
      });
    }

    return () => {
      window.removeEventListener("keydown", handleToggleKeyDown, {
        capture: true,
      });
      for (const eventType of INPUT_EVENT_TYPES) {
        window.removeEventListener(eventType, handleInputEvent, {
          capture: !isClipboardInputEvent(eventType),
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    navigator.clipboard?.writeText === undefined
  ) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isClipboardInputEvent(eventType: (typeof INPUT_EVENT_TYPES)[number]) {
  return eventType === "copy" || eventType === "cut" || eventType === "paste";
}
