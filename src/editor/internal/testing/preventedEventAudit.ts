import type {
  EditorTraceEvent,
  ReplayedEditorEvent,
} from "./editorTraceReplay";

export type PreventedEventMatcher = {
  altKey?: boolean;
  ctrlKey?: boolean;
  inputType?: string;
  isComposing?: boolean;
  key?: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  type: EditorTraceEvent["type"];
};

export type PreventedEventAuditPolicy = {
  deferredCommands?: PreventedEventMatcher[];
  explicitNoOps?: PreventedEventMatcher[];
  passThrough?: PreventedEventMatcher[];
};

export function assertPreventedEditingEventsCovered(
  events: ReplayedEditorEvent[],
  policy: PreventedEventAuditPolicy = {},
) {
  const failures: string[] = [];

  for (const event of events) {
    if (
      event.defaultPrevented &&
      matchesAny(event.event, policy.passThrough ?? [])
    ) {
      failures.push(
        `${describeEvent(event)} was prevented but is declared pass-through.`,
      );
      continue;
    }

    if (!event.defaultPrevented || !isAuditedEditingEvent(event.event)) {
      continue;
    }

    if (event.stateChanged) {
      continue;
    }

    if (matchesAny(event.event, policy.explicitNoOps ?? [])) {
      continue;
    }

    if (
      matchesAny(event.event, policy.deferredCommands ?? []) &&
      hasLaterStateChange(events, event.index)
    ) {
      continue;
    }

    failures.push(
      `${describeEvent(event)} was prevented without state change, deferred command, or explicit no-op.`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      `Prevented editing event audit failed:\n${failures
        .map((failure) => `- ${failure}`)
        .join("\n")}`,
    );
  }
}

function isAuditedEditingEvent(event: EditorTraceEvent): boolean {
  return (
    event.type === "keydown" ||
    event.type === "beforeinput" ||
    event.type === "paste" ||
    event.type === "drop" ||
    event.type === "compositionstart" ||
    event.type === "compositionupdate" ||
    event.type === "compositionend"
  );
}

function hasLaterStateChange(
  events: ReplayedEditorEvent[],
  eventIndex: number,
): boolean {
  return events.some((event) => event.index > eventIndex && event.stateChanged);
}

function matchesAny(
  event: EditorTraceEvent,
  matchers: PreventedEventMatcher[],
): boolean {
  return matchers.some((matcher) => eventMatches(event, matcher));
}

function eventMatches(
  event: EditorTraceEvent,
  matcher: PreventedEventMatcher,
): boolean {
  if (event.type !== matcher.type) {
    return false;
  }

  if (matcher.key !== undefined) {
    if (!("key" in event) || event.key !== matcher.key) {
      return false;
    }
  }

  if (
    !modifierMatches(event, "altKey", matcher.altKey) ||
    !modifierMatches(event, "ctrlKey", matcher.ctrlKey) ||
    !modifierMatches(event, "metaKey", matcher.metaKey) ||
    !modifierMatches(event, "shiftKey", matcher.shiftKey)
  ) {
    return false;
  }

  if (matcher.inputType !== undefined) {
    if (!("inputType" in event) || event.inputType !== matcher.inputType) {
      return false;
    }
  }

  if (matcher.isComposing !== undefined) {
    if (
      !("isComposing" in event) ||
      event.isComposing !== matcher.isComposing
    ) {
      return false;
    }
  }

  return true;
}

function modifierMatches(
  event: EditorTraceEvent,
  key: "altKey" | "ctrlKey" | "metaKey" | "shiftKey",
  expected: boolean | undefined,
): boolean {
  if (expected === undefined) {
    return true;
  }
  if (!("key" in event)) {
    return expected === false;
  }

  return (event[key] ?? false) === expected;
}

function describeEvent(event: ReplayedEditorEvent): string {
  const parts = [`#${event.index}`, event.event.type];
  if ("key" in event.event) {
    parts.push(event.event.key);
  }
  if ("inputType" in event.event) {
    parts.push(event.event.inputType);
  }
  if ("isComposing" in event.event && event.event.isComposing === true) {
    parts.push("composing");
  }

  return parts.join(" ");
}
