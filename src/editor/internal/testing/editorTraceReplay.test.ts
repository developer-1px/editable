// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { assertReplayedEditorInvariants } from "./editorTraceReplay";

const textPath = "/root/children/0/children/0/text";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("editor trace replay invariants", () => {
  it("accepts a coherent rendered selection state", () => {
    const root = renderEditorSurface();

    expect(() => assertReplayedEditorInvariants(root)).not.toThrow();
  });

  it("catches duplicate rendered data paths", () => {
    const root = renderEditorSurface(
      `<span data-path="${textPath}">duplicate</span>`,
    );

    expect(() => assertReplayedEditorInvariants(root)).toThrow(
      /duplicate data-path/,
    );
  });

  it("catches missing selection targets", () => {
    const root = renderEditorSurface("", {
      "data-selection-path": "/root/children/999/children/0/text",
    });

    expect(() => assertReplayedEditorInvariants(root)).toThrow(
      /missing selection target/,
    );
  });

  it("catches out-of-range text offsets", () => {
    const root = renderEditorSurface("", {
      "data-selection-offset": "99",
    });

    expect(() => assertReplayedEditorInvariants(root)).toThrow(
      /offset 99 is out of range/,
    );
  });

  it("catches collapsed selected pointers", () => {
    const root = renderEditorSurface(
      '<figure data-path="/root/children/1"></figure>',
      {
        "data-selection-selected-pointers": "/root/children/1",
      },
    );

    expect(() => assertReplayedEditorInvariants(root)).toThrow(
      /collapsed selectedPointers/,
    );
  });

  it("catches caret overlays whose target is missing", () => {
    const root = renderEditorSurface(
      "",
      {},
      '<div data-overlay="caret" data-path="/missing" data-offset="0"></div>',
    );

    expect(() => assertReplayedEditorInvariants(root)).toThrow(
      /missing caret overlay target/,
    );
  });
});

function renderEditorSurface(
  extraContent = "",
  viewAttributes: Record<string, string> = {},
  overlayHtml = "",
) {
  const baseViewAttributes = {
    "data-selection-anchor-offset": "1",
    "data-selection-anchor-path": textPath,
    "data-selection-focus-offset": "1",
    "data-selection-focus-path": textPath,
    "data-selection-offset": "1",
    "data-selection-path": textPath,
    "data-selection-range-count": "1",
    "data-selection-selected-pointers": "",
    ...viewAttributes,
  };

  document.body.innerHTML = `
    <div class="document-stage">
      <div class="editor-surface" role="textbox">
        <div
          class="document-view"
          ${attributeString(baseViewAttributes)}
        >
          <p data-path="/root/children/0">
            <span data-path="${textPath}">AB</span>
            ${extraContent}
          </p>
        </div>
      </div>
      ${overlayHtml}
    </div>
  `;

  const root = document.querySelector(".editor-surface");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Test editor surface was not rendered.");
  }

  return root;
}

function attributeString(attributes: Record<string, string>) {
  return Object.entries(attributes)
    .map(([key, value]) => `${key}="${value}"`)
    .join(" ");
}
