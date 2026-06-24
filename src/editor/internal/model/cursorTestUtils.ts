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
