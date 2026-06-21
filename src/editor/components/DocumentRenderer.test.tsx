// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import {
  createNoteDocument,
  initialNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "../model/noteDocument";
import { DocumentRenderer } from "./DocumentRenderer";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDocument(
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

function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Renderer",
    tags: [],
  });
}

describe("DocumentRenderer", () => {
  it("renders the initial rich demo fragments", () => {
    const html = renderDocument(initialNoteDocument);

    expect(html).toContain('<strong class="rich-strong">bold</strong>');
    expect(html).toContain('<em class="rich-emphasis">italic</em>');
    expect(html).toContain('<code class="rich-code">code</code>');
    expect(html).toContain(
      '<a class="rich-link" href="https://example.com">link</a>',
    );
    expect(html).toContain('data-mention-id="user-ada"');
    expect(html).toContain('<img alt="Figure" src="/logo192.png"/>');
  });

  it("does not emit duplicate-key warnings for duplicate block ids", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {
      return;
    });
    const note = documentWithBlocks([
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "First" }],
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "Second" }],
      },
    ]);

    render(<DocumentRenderer note={note} />);

    expect(
      consoleError.mock.calls.some((call) =>
        call.some(
          (value) =>
            typeof value === "string" &&
            value.includes("Encountered two children with the same key"),
        ),
      ),
    ).toBe(false);
  });

  it("renders text runs with stable data paths", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "Hello" }],
        },
      ]),
    );

    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain(">Hello</span>");
  });

  it("marks empty text runs so empty-line carets keep a visible box", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "" }],
        },
      ]),
    );

    expect(html).toContain('data-empty-text="true"');
    expect(html).toContain('data-path="/root/children/0/children/0/text"');
  });

  it("renders structured marks without delimiter text", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "bold", marks: [{ type: "bold" }] },
            { type: "text", text: " and " },
            { type: "text", text: "code", marks: [{ type: "code" }] },
          ],
        },
      ]),
    );

    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain('<strong class="rich-strong">bold</strong>');
    expect(html).toContain('<code class="rich-code">code</code>');
    expect(html).not.toContain("**");
    expect(html).not.toContain("`code`");
  });

  it("renders mention chips as non-editable atom nodes with stable data paths", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Hello " },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
      ]),
    );

    expect(html).toContain('data-path="/root/children/0/children/1"');
    expect(html).toContain('contentEditable="false"');
    expect(html).toContain('data-mention-id="user-1"');
    expect(html).toContain("@Ada</span>");
  });

  it("renders figures as non-editable block atom nodes with stable data paths", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "figure-1",
          type: "figure",
          src: "/image.png",
          alt: "Image",
        },
      ]),
    );

    expect(html).toContain('data-path="/root/children/0"');
    expect(html).toContain('contentEditable="false"');
    expect(html).toContain('<img alt="Image" src="/image.png"/>');
  });

  it("renders rich text block variants with stable cursor paths", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "heading-1",
          type: "heading",
          level: 2,
          children: [{ type: "text", text: "Heading" }],
        },
        {
          id: "quote-1",
          type: "quote",
          children: [{ type: "text", text: "Quote" }],
        },
        {
          id: "list-1",
          type: "listItem",
          ordered: false,
          depth: 0,
          children: [{ type: "text", text: "Item" }],
        },
        {
          id: "code-1",
          type: "codeBlock",
          language: "ts",
          text: "const value = 1;",
        },
      ]),
    );

    expect(html).toContain('class="heading-block text-block"');
    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain('class="quote-block text-block"');
    expect(html).toContain('data-path="/root/children/1/children/0/text"');
    expect(html).toContain('class="list-item-block text-block"');
    expect(html).toContain('data-path="/root/children/2/children/0/text"');
    expect(html).toContain('class="code-block-text text-run"');
    expect(html).toContain('data-path="/root/children/3/text"');
  });

  it("reflects the current headless selection for inspection", () => {
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Hello " },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
      ]),
      selection,
    );

    expect(html).toContain('data-selection-path="/root/children/0/children/1"');
    expect(html).toContain('data-selection-edge="after"');
    expect(html).toContain('data-cursor="focus"');
    expect(html).toContain('data-cursor-edge="after"');
  });
});
