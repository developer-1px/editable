// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  p0AtomReplacementTrace,
  p0MarkdownDropTrace,
  p0SelectionDeletionClipboardTraces,
} from "../fixtures/input/p0SelectionDeletionClipboardTrace";
import { replayEditorTrace } from "../testing/editorTraceReplay";
import { assertPreventedEditingEventsCovered } from "../testing/preventedEventAudit";
import { BlockEditor } from "./BlockEditor";

const p0TraceCases = p0SelectionDeletionClipboardTraces.map(
  (trace) => [trace.name, trace] as const,
);

afterEach(() => {
  document.getSelection()?.removeAllRanges();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: undefined,
  });
  cleanup();
  vi.restoreAllMocks();
});

describe("BlockEditor P0 input trace replay", () => {
  it.each(p0TraceCases)(
    "replays %s",
    async (_name, trace) => {
      render(<BlockEditor />);
      const editor = screen.getByRole("textbox", { name: "Document body" });
      await waitFor(() => expect(document.activeElement).toBe(editor));

      const events = await replayEditorTrace(editor, trace);

      expect(() => assertPreventedEditingEventsCovered(events)).not.toThrow();
      if (trace.name === p0AtomReplacementTrace.name) {
        expect(editor.querySelector(".mention-chip")).toBe(null);
      }
      if (trace.name === p0MarkdownDropTrace.name) {
        expect(editor.querySelectorAll(".mention-chip")).toHaveLength(2);
      }
    },
    10_000,
  );
});
