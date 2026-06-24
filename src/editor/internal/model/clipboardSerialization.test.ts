import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../fixtures/unicodeGraphemeCorpus";
import {
  EDITABLE_CLIPBOARD_MIME,
  serializeSelectionForClipboard,
} from "./clipboard";
import { documentWithBlocks } from "./clipboardTestUtils";
import { selectionFromCursorRange } from "./cursorCommands";
import { initialNoteDocument } from "./initialNoteDocument";
import { selectionFromNodeTarget } from "./richSelection";

describe("clipboard serialization", () => {
  it("returns null for collapsed selections", () => {
    expect(
      serializeSelectionForClipboard(
        initialNoteDocument,
        selectionFromCursorRange(
          initialNoteDocument,
          { path: "/root/children/0/children/0/text", offset: 1 },
          { path: "/root/children/0/children/0/text", offset: 1 },
        ),
      ),
    ).toBe(null);
  });

  it("serializes selected text ranges as plain text", () => {
    const data = serializeSelectionForClipboard(
      initialNoteDocument,
      selectionFromCursorRange(
        initialNoteDocument,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/0/text", offset: 5 },
      ),
    );

    expect(data?.["text/plain"]).toBe("Plain");
    expect(data?.["text/markdown"]).toBe("Plain");
  });

  it("serializes marked text selections as markdown", () => {
    const data = serializeSelectionForClipboard(
      initialNoteDocument,
      selectionFromCursorRange(
        initialNoteDocument,
        { path: "/root/children/0/children/1/text", offset: 0 },
        { path: "/root/children/0/children/1/text", offset: 4 },
      ),
    );

    expect(data?.["text/plain"]).toBe("bold");
    expect(data?.["text/markdown"]).toBe("**bold**");
  });

  it("serializes grapheme clusters without dropping multi-code-unit text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A😀B" }],
      },
    ]);

    const data = serializeSelectionForClipboard(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/0/text", offset: 4 },
      ),
    );

    expect(data?.["text/plain"]).toBe("A😀B");
    expect(data?.["text/markdown"]).toBe("A😀B");
  });

  it("serializes the Unicode grapheme corpus without dropping cluster text", () => {
    for (const fixture of unicodeGraphemeCorpus) {
      const document = documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: unicodeFixtureText(fixture) }],
        },
      ]);

      const data = serializeSelectionForClipboard(
        document,
        selectionFromCursorRange(
          document,
          {
            path: "/root/children/0/children/0/text",
            offset: unicodeFixtureClusterStart(),
          },
          {
            path: "/root/children/0/children/0/text",
            offset: unicodeFixtureClusterEnd(fixture),
          },
        ),
      );

      expect(data?.["text/plain"], fixture.id).toBe(fixture.grapheme);
      expect(data?.["text/markdown"], fixture.id).toBe(fixture.grapheme);
      expect(
        JSON.parse(data?.[EDITABLE_CLIPBOARD_MIME] ?? "{}").plainText,
        fixture.id,
      ).toBe(fixture.grapheme);
    }
  });

  it("serializes paragraph boundaries as markdown paragraph breaks", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "Alpha" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Beta" }],
      },
    ]);

    const data = serializeSelectionForClipboard(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/1/children/0/text", offset: 4 },
      ),
    );

    expect(data?.["text/plain"]).toBe("Alpha\nBeta");
    expect(data?.["text/markdown"]).toBe("Alpha\n\nBeta");
  });

  it("serializes ranges from code blocks to paragraphs with block separators", () => {
    const document = documentWithBlocks([
      {
        id: "code-1",
        type: "codeBlock",
        text: "const value = 1;",
      },
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "After" }],
      },
    ]);

    const data = serializeSelectionForClipboard(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/text", offset: 0 },
        { path: "/root/children/1/children/0/text", offset: 5 },
      ),
    );

    expect(data?.["text/plain"]).toBe("const value = 1;\nAfter");
    expect(data?.["text/markdown"]).toBe("const value = 1;\n\nAfter");
  });

  it("serializes selected atom nodes with plain and markdown fallbacks", () => {
    const mention = serializeSelectionForClipboard(
      initialNoteDocument,
      selectionFromNodeTarget("/root/children/0/children/9"),
    );
    const figure = serializeSelectionForClipboard(
      initialNoteDocument,
      selectionFromNodeTarget("/root/children/1"),
    );

    expect(mention?.["text/plain"]).toBe("@Ada");
    expect(mention?.["text/markdown"]).toBe("@[Ada](mention:user-ada)");
    expect(figure?.["text/plain"]).toBe("Figure");
    expect(figure?.["text/markdown"]).toBe("![Figure](/sample-figure.svg)");
  });

  it("escapes mention ids in clipboard markdown", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "mention", id: "user)a", label: "Ada" }],
      },
    ]);

    const data = serializeSelectionForClipboard(
      document,
      selectionFromNodeTarget("/root/children/0/children/0"),
    );

    expect(data?.["text/markdown"]).toBe("@[Ada](mention:user%29a)");
  });

  it("includes the current structured text and markdown transfer envelope", () => {
    const data = serializeSelectionForClipboard(
      initialNoteDocument,
      selectionFromNodeTarget("/root/children/0/children/9"),
    );

    expect(data).not.toBe(null);
    const structured = JSON.parse(data?.[EDITABLE_CLIPBOARD_MIME] ?? "");
    expect(structured).toEqual({
      schema: "editable-clipboard@1",
      plainText: "@Ada",
      markdown: "@[Ada](mention:user-ada)",
    });
  });
});
