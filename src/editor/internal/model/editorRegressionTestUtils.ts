import { expect } from "vitest";
import type { EditorInputResult } from "./inputAdapter";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Regression",
    tags: [],
  });
}

export function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
}

export function expectHandled(
  result: EditorInputResult,
): asserts result is Extract<EditorInputResult, { handled: true }> {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error("Expected handled input result.");
  }
  expect(result.handled).toBe(true);
}

export function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return { left, top, width, height };
    },
  } as DOMRect;
}
