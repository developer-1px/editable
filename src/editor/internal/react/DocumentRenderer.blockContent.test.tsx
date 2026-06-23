// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import type { NoteDocument } from "../model/noteDocument";
import {
  documentWithBlocks,
  renderDocument,
} from "./documentRendererTestUtils";

describe("DocumentRenderer block content", () => {
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

  it("does not render unsafe legacy figure sources as fetchable image sources", () => {
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
            id: "figure-1",
            kind: "atom",
            type: "figure",
            flow: "block",
            src: "javascript:alert(1)",
            alt: "Unsafe",
          },
        ],
      },
    } as NoteDocument;

    const html = renderDocument(legacyUnsafeDocument);

    expect(html).toContain('<img alt="Unsafe"/>');
    expect(html).not.toContain("javascript:");
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
});
