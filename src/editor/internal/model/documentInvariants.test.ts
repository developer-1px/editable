import type { SelectionSnap } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { assertNoteDocumentInvariants } from "./documentInvariants";
import {
  createNoteDocument,
  initialNoteDocument,
  type NoteDocument,
} from "./noteDocument";
import { selectionFromCursorPoint } from "./richSelection";

const firstTextPath = "/root/children/0/children/0/text";

describe("note document invariants", () => {
  it("accepts a normalized document and valid selection", () => {
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 1,
    });

    expect(() =>
      assertNoteDocumentInvariants(initialNoteDocument, selection),
    ).not.toThrow();
  });

  it("catches duplicate block ids", () => {
    const document = structuredClone(initialNoteDocument);
    document.root.children[1].id = document.root.children[0].id;

    expect(() => assertNoteDocumentInvariants(document)).toThrow(
      /Duplicate block id/,
    );
  });

  it("catches invalid document schema", () => {
    const document = {
      ...initialNoteDocument,
      root: {
        ...initialNoteDocument.root,
        children: [{ id: "bad-block", type: "table" }],
      },
    } as unknown as NoteDocument;

    expect(() => assertNoteDocumentInvariants(document)).toThrow(
      /Invalid note document/,
    );
  });

  it("catches unnormalized mark order and duplicate marks", () => {
    const document = createNoteDocument([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          {
            type: "text",
            text: "AB",
            marks: [{ type: "italic" }, { type: "bold" }, { type: "bold" }],
          },
        ],
      },
    ]);

    expect(() => assertNoteDocumentInvariants(document)).toThrow(
      /Unnormalized marks/,
    );
  });

  it("catches missing selection paths", () => {
    const selection = selectionFromCursorPoint({
      path: "/root/children/99/children/0/text",
      offset: 0,
    });

    expect(() =>
      assertNoteDocumentInvariants(initialNoteDocument, selection),
    ).toThrow(/Invalid selection.*path/);
  });

  it("catches out-of-range selection offsets", () => {
    const selection = selectionFromCursorPoint({
      path: firstTextPath,
      offset: 999,
    });

    expect(() =>
      assertNoteDocumentInvariants(initialNoteDocument, selection),
    ).toThrow(/Invalid selection.*offset/);
  });

  it("catches collapsed selections with selected pointers", () => {
    const point = { path: firstTextPath, offset: 1 };
    const selection: SelectionSnap = {
      selectedPointers: ["/root/children/1"],
      selectionRanges: [{ anchor: point, focus: point }],
      primaryIndex: 0,
      anchor: point,
      focus: point,
    };

    expect(() =>
      assertNoteDocumentInvariants(initialNoteDocument, selection),
    ).toThrow(/collapsed selectedPointers/);
  });
});
