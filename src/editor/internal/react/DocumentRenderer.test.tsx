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
  it("renders the root inspection surface for the current selection", () => {
    const selection = {
      ...selectionFromCursorPoint({
        path: "/root/children/0/children/1",
        edge: "after",
      }),
      selectedPointers: ["/root/children/0/children/1"],
      selectionRanges: [
        {
          anchor: { path: "/root/children/0/children/0/text", offset: 1 },
          focus: {
            path: "/root/children/0/children/1",
            edge: "after" as const,
          },
        },
      ],
      anchor: { path: "/root/children/0/children/0/text", offset: 1 },
      focus: { path: "/root/children/0/children/1", edge: "after" as const },
    };
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            { type: "text", text: "Hi " },
            { type: "mention", id: "user-1", label: "Ada" },
          ],
        },
      ]),
      selection,
    );

    expect(html).toContain('class="document-view"');
    expect(html).toContain('aria-label="Document"');
    expect(html).toContain('role="document"');
    expect(html).toContain(
      'data-selection-anchor-path="/root/children/0/children/0/text"',
    );
    expect(html).toContain('data-selection-anchor-offset="1"');
    expect(html).toContain(
      'data-selection-focus-path="/root/children/0/children/1"',
    );
    expect(html).toContain('data-selection-focus-edge="after"');
    expect(html).toContain('data-selection-range-count="1"');
    expect(html).toContain(
      'data-selection-selected-pointers="/root/children/0/children/1"',
    );
  });

  it("renders the initial rich demo fragments", () => {
    const html = renderDocument(initialNoteDocument);

    expect(html).toContain('<strong class="rich-strong">bold</strong>');
    expect(html).toContain('<em class="rich-emphasis">italic</em>');
    expect(html).toContain('<code class="rich-code">code</code>');
    expect(html).toContain(
      '<a class="rich-link" href="https://example.com">link</a>',
    );
    expect(html).toContain('data-mention-id="user-ada"');
    expect(html).toContain('<img alt="Figure" src="/sample-figure.svg"/>');
  });

  it("does not render unsafe link hrefs as clickable anchors", () => {
    const legacyUnsafeDocument = {
      schemaVersion: 1,
      id: "legacy-note",
      title: "Legacy renderer input",
      tags: [],
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        children: [
          {
            id: "block-1",
            kind: "element",
            type: "paragraph",
            flow: "block",
            children: [
              {
                kind: "text",
                type: "text",
                text: "unsafe",
                marks: [{ type: "link", href: " javascript:alert(1)" }],
              },
            ],
          },
        ],
      },
    } as NoteDocument;

    const html = renderDocument(legacyUnsafeDocument);

    expect(html).toContain('<a class="rich-link">unsafe</a>');
    expect(html).not.toContain("javascript:");
  });

  it("renders http, mail, phone, and relative link hrefs", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [
            {
              type: "text",
              text: "site",
              marks: [{ type: "link", href: " https://example.com/a " }],
            },
            {
              type: "text",
              text: " mail",
              marks: [{ type: "link", href: "mailto:ada@example.com" }],
            },
            {
              type: "text",
              text: " phone",
              marks: [{ type: "link", href: "tel:+15550100" }],
            },
            {
              type: "text",
              text: " relative",
              marks: [{ type: "link", href: "/docs/editor" }],
            },
          ],
        },
      ]),
    );

    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('href="mailto:ada@example.com"');
    expect(html).toContain('href="tel:+15550100"');
    expect(html).toContain('href="/docs/editor"');
  });

  it("does not project attrs as renderer DOM attributes", () => {
    const note: NoteDocument = {
      schemaVersion: 1,
      id: "attrs-note",
      title: "Attrs",
      tags: [],
      attrs: { owner: "attrs-document" },
      root: {
        id: "root",
        kind: "element",
        type: "doc",
        flow: "block",
        attrs: { outline: "attrs-root" },
        children: [
          {
            id: "block-1",
            kind: "element",
            type: "paragraph",
            flow: "block",
            attrs: { section: "attrs-block" },
            children: [
              {
                kind: "text",
                type: "text",
                text: "Hello ",
                marks: [{ type: "bold", attrs: { source: "attrs-mark" } }],
              },
              {
                id: "user-1",
                kind: "atom",
                type: "mention",
                flow: "inline",
                label: "Ada",
                attrs: { source: "attrs-mention" },
              },
            ],
          },
          {
            id: "figure-1",
            kind: "atom",
            type: "figure",
            flow: "block",
            src: "/sample-figure.svg",
            alt: "Figure",
            attrs: { source: "attrs-figure" },
          },
        ],
      },
    };

    const html = renderDocument(note);

    expect(html).toContain('<strong class="rich-strong">Hello </strong>');
    expect(html).toContain('data-mention-id="user-1"');
    expect(html).toContain('<img alt="Figure" src="/sample-figure.svg"/>');
    expect(html).not.toContain("attrs-document");
    expect(html).not.toContain("attrs-root");
    expect(html).not.toContain("attrs-block");
    expect(html).not.toContain("attrs-mark");
    expect(html).not.toContain("attrs-mention");
    expect(html).not.toContain("attrs-figure");
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

  it("renders a synthetic empty text run for raw empty inline blocks", () => {
    const note = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [],
      },
    ]);

    const html = renderDocument(
      note,
      selectionFromCursorPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      }),
    );

    expect(html).toContain('data-empty-text="true"');
    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain('data-cursor="focus"');
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
    expect(html).not.toContain("draggable");
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
    expect(html).not.toContain("draggable");
  });

  it("renders figures without alt text as decorative images", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "figure-1",
          type: "figure",
          src: "/image.png",
        },
      ]),
    );

    expect(html).toContain('<img alt="" src="/image.png"/>');
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
    expect(html).toContain('data-heading-level="2"');
    expect(html).toContain('data-path="/root/children/0/children/0/text"');
    expect(html).toContain('class="quote-block text-block"');
    expect(html).toContain('data-path="/root/children/1/children/0/text"');
    expect(html).toContain('class="list-item-block text-block"');
    expect(html).toContain('data-list-depth="0"');
    expect(html).toContain('data-list-ordered="false"');
    expect(html).toContain('data-path="/root/children/2/children/0/text"');
    expect(html).toContain('class="code-block-text text-run"');
    expect(html).toContain('data-path="/root/children/3/text"');
  });

  it("renders code blocks from the canonical text field", () => {
    const html = renderDocument(
      documentWithBlocks([
        {
          id: "code-1",
          type: "codeBlock",
          language: "ts",
          text: "const current = 1;",
          children: [{ type: "text", text: "legacy child" }],
        },
      ]),
      selectionFromCursorPoint({
        path: "/root/children/0/text",
        offset: 0,
      }),
    );

    expect(html).toContain('data-path="/root/children/0/text"');
    expect(html).toContain("const current = 1;");
    expect(html).not.toContain("legacy child");
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
