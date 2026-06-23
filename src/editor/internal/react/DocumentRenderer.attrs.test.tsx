// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { NoteDocument } from "../model/noteDocument";
import { renderDocument } from "./documentRendererTestUtils";

describe("DocumentRenderer attrs trust boundary", () => {
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
});
