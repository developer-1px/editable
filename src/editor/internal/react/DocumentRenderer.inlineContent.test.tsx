// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import { initialNoteDocument } from "../model/initialNoteDocument";
import type { NoteDocument } from "../model/noteDocument";
import {
  documentWithBlocks,
  renderDocument,
} from "./documentRendererTestUtils";

describe("DocumentRenderer inline content", () => {
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
});
