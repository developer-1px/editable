import type { DebugRecordingInspectorState } from "../debug/useDebugInteractionRecorder";

type DebugRecordingInspectorProps = {
  state: DebugRecordingInspectorState;
};

export function DebugRecordingInspector({
  state,
}: DebugRecordingInspectorProps) {
  if (state.phase === "idle") {
    return null;
  }

  return (
    <output
      aria-label="Debug recorder"
      aria-live="polite"
      className={`debug-recorder debug-recorder-${state.phase}`}
    >
      <span className="debug-recorder-dot" />
      <span className="debug-recorder-label">{phaseLabel(state.phase)}</span>
      <span className="debug-recorder-meta">
        {formatSeconds(state.elapsedMs)} {state.entryCount}
      </span>
    </output>
  );
}

function phaseLabel(state: DebugRecordingInspectorState["phase"]): string {
  switch (state) {
    case "recording":
      return "REC";
    case "done":
      return "DONE";
    case "copy-failed":
      return "FAIL";
    case "idle":
      return "IDLE";
  }
}

function formatSeconds(elapsedMs: number): string {
  return `${Math.max(0, Math.floor(elapsedMs / 1000))}s`;
}
