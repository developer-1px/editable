import { act } from "@testing-library/react";
import { replaceTextRun, setTraceSelection } from "./editorTraceReplayDom";
import { createTraceEvent, traceEventTarget } from "./editorTraceReplayEvents";
import { assertTraceExpectation } from "./editorTraceReplayExpectations";
import { assertReplayedEditorInvariants } from "./editorTraceReplayInvariants";
import {
  readReplayedEditorState,
  replayedEditorStatesEqual,
} from "./editorTraceReplayState";
import type {
  EditorTraceEvent,
  EditorTraceReplay,
  ReplayedEditorEvent,
} from "./editorTraceReplayTypes";

export { assertReplayedEditorInvariants } from "./editorTraceReplayInvariants";
export type {
  CompositionTraceEvent,
  EditorInputContractId,
  EditorTraceEvent,
  EditorTraceExpectation,
  EditorTraceReplay,
  EditorTraceStep,
  FocusTraceEvent,
  InputTraceEvent,
  KeyboardTraceEvent,
  PointerTraceEvent,
  ReplayedEditorEvent,
  ReplayedEditorState,
  ReplayedEditorStateExpectation,
  TransferTraceEvent,
} from "./editorTraceReplayTypes";

export async function replayEditorTrace(
  root: HTMLElement,
  trace: EditorTraceReplay,
): Promise<ReplayedEditorEvent[]> {
  const events: ReplayedEditorEvent[] = [];
  assertReplayedEditorInvariants(root);

  for (const step of trace.steps) {
    if (step.kind === "event") {
      const before = readReplayedEditorState(root);
      const event = createTraceEvent(root, step.event);
      act(() => {
        traceEventTarget(root, step.event).dispatchEvent(event);
      });
      const after = readReplayedEditorState(root);
      assertTraceExpectation({
        after,
        before,
        event: step.event,
        eventIndex: events.length,
        expectation: step.expect,
        trace,
      });
      assertReplayedEditorInvariants(root, after);
      events.push({
        after,
        before,
        defaultPrevented: event.defaultPrevented,
        event: step.event,
        index: events.length,
        stateChanged: !replayedEditorStatesEqual(before, after),
      });
      continue;
    }

    if (step.kind === "selection") {
      act(() => {
        setTraceSelection(root, step);
        dispatchSelectionChange(root);
      });
      assertReplayedEditorInvariants(root);
      continue;
    }

    if (step.kind === "text") {
      replaceTextRun(root, step.path, step.text, step.offset);
      assertReplayedEditorInvariants(root);
      continue;
    }

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    assertReplayedEditorInvariants(root);
  }

  return events;
}

function dispatchSelectionChange(root: HTMLElement) {
  const window = root.ownerDocument.defaultView;
  if (window === null) {
    throw new Error("Trace replay requires a DOM window.");
  }

  root.ownerDocument.dispatchEvent(new window.Event("selectionchange"));
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
