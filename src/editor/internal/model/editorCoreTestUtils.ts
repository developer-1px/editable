import { createNoteDocument, type NoteDocument } from "./noteDocument";

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
      title: "Editor core",
      tags: [],
    },
  );
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

export function documentWithInvalidLink(href: string): NoteDocument {
  return {
    schemaVersion: 1,
    id: "invalid-note",
    title: "Invalid note",
    tags: [],
    root: {
      id: "root",
      kind: "element",
      type: "doc",
      flow: "block",
      children: [
        {
          id: "block-1",
          type: "paragraph",
          children: [
            {
              type: "text",
              text: "Invalid link",
              marks: [{ type: "link", href }],
            },
          ],
        },
      ],
    },
  } as unknown as NoteDocument;
}

export function documentWithUnsupportedSchemaVersion(): NoteDocument {
  return {
    schemaVersion: 2,
    id: "future-note",
    title: "Future note",
    tags: [],
    root: {
      id: "root",
      kind: "element",
      type: "doc",
      flow: "block",
      children: [
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Future" }],
        },
      ],
    },
  } as unknown as NoteDocument;
}
