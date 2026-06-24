import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Cursor",
    tags: [],
  });
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
