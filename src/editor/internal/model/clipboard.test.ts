import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../fixtures/unicodeGraphemeCorpus";
import {
  EDITABLE_CLIPBOARD_MIME,
  readClipboardTextFromTransfer,
  readTextFromTransfer,
  serializeSelectionForClipboard,
} from "./clipboard";
import { selectionFromCursorRange } from "./cursorCommands";
import {
  createNoteDocument,
  initialNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "./noteDocument";
import { selectionFromNodeTarget } from "./richSelection";

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Clipboard",
    tags: [],
  });
}

describe("clipboard", () => {
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

  it("keeps non-text structured metadata out of the paste contract", () => {
    const transfer = transferData({
      [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
        schema: "editable-clipboard@1",
        plainText: "plain fallback",
        markdown: "@[Ada](mention:user-ada)",
        selectedPointers: ["/root/children/0/children/0"],
        nodes: [
          {
            id: "figure-1",
            type: "figure",
            src: "/restored-only-from-node-graph.png",
          },
        ],
      }),
    });

    expect(readClipboardTextFromTransfer(transfer)).toEqual({
      text: "@[Ada](mention:user-ada)",
      format: "markdown",
    });
  });

  it("does not treat HTML data-pm-slice context as current paste input", () => {
    const htmlOnly = transferData({
      "text/html": '<ul data-pm-slice="1 1 []"><li><p>Nested</p></li></ul>',
    });
    const htmlWithPlainFallback = transferData({
      "text/html":
        '<table data-pm-slice="0 0 []"><tr><td>Cell</td></tr></table>',
      "text/plain": "Cell",
    });

    expect(readClipboardTextFromTransfer(htmlOnly)).toBe(null);
    expect(readClipboardTextFromTransfer(htmlWithPlainFallback)).toEqual({
      text: "Cell",
      format: "plain",
    });
  });

  it("reads uri-list fallback data as plain text without importing HTML", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          "text/html": '<a href="https://example.com">Example</a>',
          "text/uri-list":
            "# copied from Safari share\nhttps://example.com/\r\n\nhttps://example.com/next",
        }),
      ),
    ).toEqual({
      text: "https://example.com/\nhttps://example.com/next",
      format: "plain",
    });
  });

  it("ignores empty or comment-only uri-list data", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          "text/html": '<a href="https://example.com">Example</a>',
          "text/uri-list": "# only a comment\n\n",
        }),
      ),
    ).toBe(null);
  });

  it("reads structured plain transfer text before external fallback data", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "structured",
          }),
          "text/plain": "plain",
          "text/markdown": "**markdown**",
        }),
      ),
    ).toEqual({ text: "structured", format: "plain" });
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "structured",
          }),
          "text/plain": "plain",
          "text/markdown": "**markdown**",
        }),
      ),
    ).toBe("structured");
    expect(readTextFromTransfer(transferData({ "text/plain": "plain" }))).toBe(
      "plain",
    );
    expect(
      readTextFromTransfer(transferData({ "text/markdown": "**markdown**" })),
    ).toBe("**markdown**");
  });

  it("reads editor-owned markdown transfer text as markdown format", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "@Ada",
            markdown: "@[Ada](mention:user-ada)",
          }),
        }),
      ),
    ).toEqual({
      text: "@[Ada](mention:user-ada)",
      format: "markdown",
    });
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "@Ada",
            markdown: "@[Ada](mention:user-ada)",
          }),
        }),
      ),
    ).toBe("@[Ada](mention:user-ada)");
  });

  it("uses structured markdown when structured plain text is empty", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "",
            markdown: "![](/image.png)",
          }),
          "text/markdown": "fallback",
        }),
      ),
    ).toEqual({
      text: "![](/image.png)",
      format: "markdown",
    });
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "",
            markdown: "![](/image.png)",
          }),
          "text/markdown": "![](/image.png)",
        }),
      ),
    ).toBe("![](/image.png)");
  });

  it("falls back when structured transfer text is empty", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "",
            markdown: "",
          }),
          "text/markdown": "![](/image.png)",
        }),
      ),
    ).toEqual({
      text: "![](/image.png)",
      format: "markdown",
    });
  });

  it("falls back to plain text for unsupported structured transfer data", () => {
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: "{not json",
          "text/plain": "plain",
        }),
      ),
    ).toBe("plain");
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "unknown-clipboard@1",
            plainText: "structured",
          }),
          "text/plain": "plain",
        }),
      ),
    ).toBe("plain");
  });
});

function transferData(values: Record<string, string>) {
  return {
    getData(type: string) {
      return values[type] ?? "";
    },
  };
}
