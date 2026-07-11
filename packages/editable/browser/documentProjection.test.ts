// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { EditableDocumentValue } from "../core";
import {
  findBlockElement,
  isCanonicalBlockElement,
  isCanonicalSurfaceElement,
  projectDocumentDOM,
} from "./documentProjection";

function value(
  blocks: EditableDocumentValue["blocks"],
): EditableDocumentValue {
  return {
    schema: "interactive-os.editable-document@2",
    id: "projection-test",
    blocks,
  };
}

function surface(block: HTMLElement): HTMLElement {
  const result = block.querySelector<HTMLElement>("[data-editable-text]");
  if (result === null) {
    throw new Error("Missing projected text surface.");
  }
  return result;
}

describe("document projection", () => {
  it("reuses keyed block and Text identities while updating canonical content", () => {
    const root = window.document.createElement("div");
    const initial = value([
      { id: "alpha", type: "paragraph", text: "first" },
      { id: "beta", type: "heading", text: "second" },
    ]);
    projectDocumentDOM({ root, value: initial });

    const alpha = findBlockElement(root, "alpha");
    const alphaText = alpha === null ? null : surface(alpha).firstChild;
    const updated = value([
      { id: "alpha", type: "paragraph", text: "first updated" },
      { id: "beta", type: "heading", text: "second" },
    ]);
    projectDocumentDOM({ root, value: updated });

    expect(findBlockElement(root, "alpha")).toBe(alpha);
    expect(surface(alpha as HTMLElement).firstChild).toBe(alphaText);
    expect(surface(alpha as HTMLElement).textContent).toBe("first updated");
  });

  it("keeps the pinned composition Text opaque while projecting other blocks", () => {
    const root = window.document.createElement("div");
    const initial = value([
      { id: "alpha", type: "paragraph", text: "first" },
      { id: "beta", type: "paragraph", text: "second" },
    ]);
    projectDocumentDOM({ root, value: initial });
    const alpha = findBlockElement(root, "alpha") as HTMLElement;
    const alphaSurface = surface(alpha);
    const composingText = alphaSurface.firstChild as Text;
    composingText.insertData(5, "한");
    const invalidate = vi.fn();

    projectDocumentDOM({
      root,
      value: value([
        { id: "alpha", type: "paragraph", text: "first" },
        { id: "beta", type: "paragraph", text: "remote" },
      ]),
      composition: {
        blockId: "alpha",
        node: composingText,
        isPinIntact: (candidate) => candidate === alphaSurface,
        invalidate,
      },
    });

    expect(surface(alpha).firstChild).toBe(composingText);
    expect(composingText.data).toBe("first한");
    expect(findBlockElement(root, "beta")?.textContent).toBe("remote");
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("can explicitly canonicalize the composing block when its lease settles", () => {
    const root = window.document.createElement("div");
    const documentValue = value([
      { id: "alpha", type: "paragraph", text: "first" },
    ]);
    projectDocumentDOM({ root, value: documentValue });
    const alpha = findBlockElement(root, "alpha") as HTMLElement;
    const alphaSurface = surface(alpha);
    const composingText = alphaSurface.firstChild as Text;
    composingText.insertData(5, "한");

    projectDocumentDOM({
      root,
      value: documentValue,
      forceCanonicalBlockId: "alpha",
      composition: {
        blockId: "alpha",
        node: composingText,
        isPinIntact: () => true,
        invalidate: vi.fn(),
      },
    });

    expect(alphaSurface.firstChild).toBe(composingText);
    expect(composingText.data).toBe("first");
  });

  it("uses the same canonical grammar for projection and native inspection", () => {
    const root = window.document.createElement("div");
    const documentValue = value([
      { id: "alpha", type: "paragraph", text: "first" },
    ]);
    projectDocumentDOM({ root, value: documentValue });
    const alpha = findBlockElement(root, "alpha") as HTMLElement;
    const alphaSurface = surface(alpha);

    expect(isCanonicalBlockElement(alpha, documentValue, "alpha")).toBe(true);
    expect(
      isCanonicalSurfaceElement(alphaSurface, documentValue, "alpha"),
    ).toBe(true);

    alpha.setAttribute("data-foreign", "true");
    alphaSurface.setAttribute("data-foreign", "true");
    expect(isCanonicalBlockElement(alpha, documentValue, "alpha")).toBe(false);
    expect(
      isCanonicalSurfaceElement(alphaSurface, documentValue, "alpha"),
    ).toBe(false);
  });
});
