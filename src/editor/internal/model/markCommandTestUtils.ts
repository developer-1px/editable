import { expect } from "vitest";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Marks",
    tags: [],
  });
}

export function expectOk<T extends { ok: boolean }>(
  result: T,
): asserts result is Extract<T, { ok: true }> {
  expect(result.ok).toBe(true);
}
