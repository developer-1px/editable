import { describe, expect, it } from "vitest";
import type {
  EditorTraceEvent,
  ReplayedEditorEvent,
  ReplayedEditorState,
} from "./editorTraceReplay";
import { assertPreventedEditingEventsCovered } from "./preventedEventAudit";

describe("prevented editing event audit", () => {
  it("fails when a prevented editing event has no command or no-op policy", () => {
    const events = [
      event({
        defaultPrevented: true,
        traceEvent: { type: "keydown", key: "Enter" },
      }),
    ];

    expect(() => assertPreventedEditingEventsCovered(events)).toThrow(
      /prevented without state change/,
    );
  });

  it("allows immediate state changes, deferred commands, and explicit no-ops", () => {
    const events = [
      event({
        defaultPrevented: true,
        traceEvent: { type: "beforeinput", inputType: "insertText", data: "x" },
        after: state({ text: "AxB", selectionOffset: "2" }),
      }),
      event({
        defaultPrevented: true,
        index: 1,
        traceEvent: { type: "keydown", key: "Enter" },
      }),
      event({
        defaultPrevented: true,
        index: 2,
        traceEvent: {
          type: "beforeinput",
          inputType: "insertText",
          data: "안",
        },
        after: state({ text: "A안B", selectionOffset: "0" }),
      }),
      event({
        defaultPrevented: true,
        index: 3,
        traceEvent: { type: "keydown", key: "Enter", altKey: true },
      }),
    ];

    expect(() =>
      assertPreventedEditingEventsCovered(events, {
        deferredCommands: [{ type: "keydown", key: "Enter", altKey: false }],
        explicitNoOps: [{ type: "keydown", key: "Enter", altKey: true }],
      }),
    ).not.toThrow();
  });

  it("fails when a pass-through event is prevented", () => {
    const events = [
      event({
        defaultPrevented: true,
        traceEvent: { type: "keydown", key: "F1" },
      }),
    ];

    expect(() =>
      assertPreventedEditingEventsCovered(events, {
        passThrough: [{ type: "keydown", key: "F1" }],
      }),
    ).toThrow(/declared pass-through/);
  });
});

function event({
  after,
  defaultPrevented,
  index = 0,
  traceEvent,
}: {
  after?: ReplayedEditorState;
  defaultPrevented: boolean;
  index?: number;
  traceEvent: EditorTraceEvent;
}): ReplayedEditorEvent {
  const before = state();
  const eventAfter = after ?? before;

  return {
    after: eventAfter,
    before,
    defaultPrevented,
    event: traceEvent,
    index,
    stateChanged: JSON.stringify(before) !== JSON.stringify(eventAfter),
  };
}

function state(
  overrides: Partial<ReplayedEditorState> = {},
): ReplayedEditorState {
  const base: ReplayedEditorState = {
    domSelectionAnchorOffset: null,
    domSelectionAnchorPath: null,
    domSelectionCollapsed: null,
    domSelectionFocusOffset: null,
    domSelectionFocusPath: null,
    domSelectionText: "",
    pathText: {},
    selectionAnchorEdge: null,
    selectionAnchorOffset: "1",
    selectionAnchorPath: "/root/children/0/children/0/text",
    selectionEdge: null,
    selectionFocusEdge: null,
    selectionFocusOffset: "1",
    selectionFocusPath: "/root/children/0/children/0/text",
    selectionOffset: "1",
    selectionPath: "/root/children/0/children/0/text",
    selectionRangeCount: "1",
    selectionSelectedPointers: "",
    text: "AB",
  };

  return Object.assign(base, overrides);
}
