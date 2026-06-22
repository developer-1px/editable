// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { createNoteDocument, type NoteDocument } from "../model/noteDocument";
import {
  formatDocumentSurfaceIssue,
  inspectDocumentSurfaceIntegrity,
} from "./documentSurfaceIntegrity";

const firstBlockPath = "/root/children/0";
const firstTextPath = "/root/children/0/children/0/text";
const secondBlockPath = "/root/children/1";

function note(): NoteDocument {
  return createNoteDocument(
    [
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
      {
        id: "code-1",
        type: "codeBlock",
        text: "const value = 1;",
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ],
    {
      id: "note-test",
      title: "Surface",
      tags: [],
    },
  );
}

function renderSurfaceRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<div class="document-view" role="document">',
    `<p class="paragraph-block text-block" data-path="${firstBlockPath}">`,
    `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
    "</p>",
    `<p class="paragraph-block text-block" data-path="${secondBlockPath}">`,
    '<span class="text-run" data-path="/root/children/1/children/0/text">Beta</span>',
    "</p>",
    '<pre class="code-block text-block" data-path="/root/children/2">',
    '<code class="code-block-text text-run" data-path="/root/children/2/text">const value = 1;</code>',
    "</pre>",
    '<figure class="figure-block" contenteditable="false" data-path="/root/children/3">',
    '<img alt="" src="/image.png">',
    "</figure>",
    "</div>",
  ].join("");
  document.body.append(root);

  return root;
}

function issueSummaries(root: ParentNode) {
  return inspectDocumentSurfaceIntegrity(root, note()).map(
    formatDocumentSurfaceIssue,
  );
}

describe("inspectDocumentSurfaceIntegrity", () => {
  it("accepts the canonical renderer surface topology", () => {
    expect(issueSummaries(renderSurfaceRoot())).toEqual([]);
  });

  it("detects detached contentDOM-equivalent text leaves", () => {
    const root = renderSurfaceRoot();
    root.querySelector(`[data-path="${firstTextPath}"]`)?.remove();

    expect(issueSummaries(root)).toContain(`missing-content: ${firstTextPath}`);
  });

  it("detects replaced text leaves that keep the path but lose renderer shape", () => {
    const root = renderSurfaceRoot();
    const textRun = root.querySelector(`[data-path="${firstTextPath}"]`);
    const replacement = document.createElement("span");
    replacement.setAttribute("data-path", firstTextPath);
    replacement.textContent = "Alpha";

    textRun?.replaceWith(replacement);

    expect(issueSummaries(root)).toContain(`invalid-content: ${firstTextPath}`);
  });

  it("detects text leaves reparented into another block", () => {
    const root = renderSurfaceRoot();
    const textRun = root.querySelector(`[data-path="${firstTextPath}"]`);
    const secondBlock = root.querySelector(`[data-path="${secondBlockPath}"]`);

    if (textRun === null || secondBlock === null) {
      throw new Error("Fixture failed to render blocks.");
    }
    secondBlock.append(textRun);

    expect(issueSummaries(root)).toContain(
      `reparented-content: ${firstTextPath}`,
    );
  });

  it("detects wrapper DOM inserted between a block and its content", () => {
    const root = renderSurfaceRoot();
    const block = root.querySelector(`[data-path="${firstBlockPath}"]`);
    const textRun = root.querySelector(`[data-path="${firstTextPath}"]`);
    const wrapper = document.createElement("span");

    if (block === null || textRun === null) {
      throw new Error("Fixture failed to render block content.");
    }
    textRun.replaceWith(wrapper);
    wrapper.append(textRun);
    block.append(wrapper);

    expect(issueSummaries(root)).toContain(
      `reparented-content: ${firstTextPath}`,
    );
  });
});
