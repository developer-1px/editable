import { expect } from "vitest";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "../noteDocument";
import type { EditorInputResult } from "./inputAdapter";

export function documentWithText(text: string): NoteDocument {
  return createNoteDocument(
    [
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text }],
      },
    ],
    {
      id: "note-test",
      title: "Input",
      tags: [],
    },
  );
}

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Input",
    tags: [],
  });
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

export function blockPatchValue(
  result: Extract<EditorInputResult, { handled: true }>,
): Array<{ id: string }> {
  const operation = result.patch.find(
    (patch) => patch.path === "/root/children",
  ) as { value?: unknown } | undefined;
  expect(Array.isArray(operation?.value)).toBe(true);

  return operation?.value as Array<{ id: string }>;
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
