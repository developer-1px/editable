import { renderToStaticMarkup } from "react-dom/server";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "../model/noteDocument";
import { DocumentRenderer } from "./DocumentRenderer";

export function renderDocument(
  note: NoteDocument,
  selection = selectionFromCursorPoint({
    path: "/root/children/0/children/0/text",
    offset: 0,
  }),
) {
  return renderToStaticMarkup(
    <DocumentRenderer note={note} selection={selection} />,
  );
}

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Renderer",
    tags: [],
  });
}
