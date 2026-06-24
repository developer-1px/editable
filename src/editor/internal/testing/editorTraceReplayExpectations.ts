import type {
  EditorInputContractId,
  EditorTraceEvent,
  EditorTraceExpectation,
  EditorTraceReplay,
  ReplayedEditorState,
  ReplayedEditorStateExpectation,
} from "./editorTraceReplayTypes";

export function assertTraceExpectation({
  after,
  before,
  event,
  eventIndex,
  expectation,
  trace,
}: {
  after: ReplayedEditorState;
  before: ReplayedEditorState;
  event: EditorTraceEvent;
  eventIndex: number;
  expectation?: EditorTraceExpectation;
  trace: EditorTraceReplay;
}) {
  if (expectation === undefined) {
    return;
  }

  assertStateExpectation({
    actual: before,
    event,
    eventIndex,
    expectation: expectation.before,
    phase: "before",
    trace,
  });
  assertStateExpectation({
    actual: after,
    event,
    eventIndex,
    expectation: expectation.after,
    phase: "after",
    trace,
  });
}

function assertStateExpectation({
  actual,
  event,
  eventIndex,
  expectation,
  phase,
  trace,
}: {
  actual: ReplayedEditorState;
  event: EditorTraceEvent;
  eventIndex: number;
  expectation?: ReplayedEditorStateExpectation;
  phase: "after" | "before";
  trace: EditorTraceReplay;
}) {
  if (expectation === undefined) {
    return;
  }

  for (const [key, expected] of Object.entries(expectation)) {
    if (key === "pathText") {
      continue;
    }
    const actualValue = actual[key as keyof ReplayedEditorState];
    if (actualValue !== expected) {
      throw traceExpectationError({
        actual: actualValue,
        event,
        eventIndex,
        expected,
        field: `${phase}.${key}`,
        trace,
      });
    }
  }

  for (const [path, expected] of Object.entries(expectation.pathText ?? {})) {
    const actualValue = actual.pathText[path];
    if (actualValue !== expected) {
      throw traceExpectationError({
        actual: actualValue,
        event,
        eventIndex,
        expected,
        field: `${phase}.pathText[${path}]`,
        trace,
      });
    }
  }
}

function traceExpectationError({
  actual,
  event,
  eventIndex,
  expected,
  field,
  trace,
}: {
  actual: unknown;
  event: EditorTraceEvent;
  eventIndex: number;
  expected: unknown;
  field: string;
  trace: EditorTraceReplay;
}): Error {
  return new Error(
    `Trace expectation failed in ${trace.name}${formatTraceContracts(
      trace.contractIds,
    )} at #${eventIndex} ${describeTraceEvent(
      event,
    )} ${field}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(
      actual,
    )}`,
  );
}

function formatTraceContracts(
  contractIds: readonly EditorInputContractId[] | undefined,
): string {
  if (contractIds === undefined || contractIds.length === 0) {
    return "";
  }

  return ` [${contractIds.join(", ")}]`;
}

function describeTraceEvent(event: EditorTraceEvent): string {
  const parts: string[] = [event.type];
  if ("key" in event) {
    parts.push(event.key);
  }
  if ("inputType" in event) {
    parts.push(event.inputType);
  }

  return parts.join(" ");
}
