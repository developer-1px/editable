import { expect } from "vitest";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "../noteDocument";

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Text",
    tags: [],
  });
}

export function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
}

export function atomSelection(path: string) {
  return {
    selectedPointers: [path],
    selectionRanges: [
      {
        anchor: { path, edge: "before" as const },
        focus: { path, edge: "after" as const },
      },
    ],
    primaryIndex: 0,
    anchor: { path, edge: "before" as const },
    focus: { path, edge: "after" as const },
  };
}
