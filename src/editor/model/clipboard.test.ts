import { describe, expect, it } from "vitest";
import { plainTextFromSelection } from "./clipboard";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "./cursorCommands";
import { createNoteDocument } from "./noteDocument";

describe("plainTextFromSelection", () => {
  it("returns an empty string for collapsed selections", () => {
    const document = createNoteDocument([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Plain" }],
      },
    ]);

    expect(
      plainTextFromSelection(
        document,
        selectionFromCursorPoint({
          path: "/root/children/0/children/0/text",
          offset: 1,
        }),
      ),
    ).toBe("");
  });

  it("serializes selected text in document order", () => {
    const document = createNoteDocument([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Plain" }],
      },
    ]);

    expect(
      plainTextFromSelection(
        document,
        selectionFromCursorRange(
          document,
          { path: "/root/children/0/children/0/text", offset: 1 },
          { path: "/root/children/0/children/0/text", offset: 4 },
        ),
      ),
    ).toBe("lai");
  });

  it("preserves the first character after collapsed adjacent text boundaries", () => {
    const document = createNoteDocument([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "Plain " },
          { type: "text", text: "bold" },
        ],
      },
    ]);

    expect(
      plainTextFromSelection(
        document,
        selectionFromCursorRange(
          document,
          { path: "/root/children/0/children/0/text", offset: 0 },
          { path: "/root/children/0/children/1/text", offset: 4 },
        ),
      ),
    ).toBe("Plain bold");
  });

  it("serializes inline and block atoms as one cursor unit each", () => {
    const document = createNoteDocument([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B" },
        ],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
        alt: "Diagram",
      },
      {
        id: "block-2",
        type: "codeBlock",
        text: "const value = 1;",
      },
    ]);

    expect(
      plainTextFromSelection(
        document,
        selectionFromCursorRange(
          document,
          { path: "/root/children/0/children/0/text", offset: 0 },
          { path: "/root/children/2/text", offset: 5 },
        ),
      ),
    ).toBe("A@AdaB\nDiagram\nconst");
  });
});
