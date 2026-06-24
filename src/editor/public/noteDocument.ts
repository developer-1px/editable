import {
  type NoteDocument,
  NoteDocumentSchema,
} from "../internal/model/noteDocument";

export type NoteDocumentParseResult =
  | {
      ok: true;
      document: NoteDocument;
    }
  | {
      ok: false;
      reason: string;
    };

export function parseNoteDocument(value: unknown): NoteDocumentParseResult {
  const parsed = NoteDocumentSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "Document is invalid.",
    };
  }

  return {
    ok: true,
    document: parsed.data,
  };
}
