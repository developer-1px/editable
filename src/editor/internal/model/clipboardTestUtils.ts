import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Clipboard",
    tags: [],
  });
}

export function transferData(values: Record<string, string>) {
  return {
    getData(type: string) {
      return values[type] ?? "";
    },
  };
}
