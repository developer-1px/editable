// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { EditableBlock, EditableDocumentValue } from "../model";
import {
  captureCompositionPlaceholder,
  inspectNativeParagraphEffect,
  type NativeParagraphIntentFacts,
} from "./nativeParagraph";

const value: EditableDocumentValue = {
  schema: "interactive-os.editable-document@2",
  id: "native-paragraph-test",
  blocks: [
    { id: "alpha", type: "paragraph", text: "한" },
    { id: "beta", type: "paragraph", text: "second" },
  ],
};

describe("native paragraph inspection", () => {
  it("accepts the captured empty-surface placeholder beside composing text", () => {
    const fixture = nativeParagraphFixture();

    expect(
      inspectNativeParagraphEffect({
        root: fixture.root,
        value,
        intent: fixture.intent,
        session: { id: 1, blockId: "alpha", range: { from: 0, to: 1 } },
        isCompositionPinIntact: (surface) =>
          surface === fixture.sourceSurface &&
          surface.firstChild === fixture.sourceText,
      }),
    ).toEqual({
      text: "한",
      splitOffset: 1,
      change: null,
    });
  });

  it("rejects an attribute-identical replacement for the captured placeholder", () => {
    const fixture = nativeParagraphFixture();
    const forged = document.createElement("br");
    forged.setAttribute("data-editable-placeholder", "true");
    fixture.sourcePlaceholder.replaceWith(forged);

    expect(
      inspectNativeParagraphEffect({
        root: fixture.root,
        value,
        intent: fixture.intent,
        session: { id: 1, blockId: "alpha", range: { from: 0, to: 1 } },
        isCompositionPinIntact: () => true,
      }),
    ).toBeNull();
  });

  it("accepts the pinned Text after the captured placeholder is removed", () => {
    const fixture = nativeParagraphFixture();
    fixture.sourcePlaceholder.remove();

    expect(
      inspectNativeParagraphEffect({
        root: fixture.root,
        value,
        intent: fixture.intent,
        session: { id: 1, blockId: "alpha", range: { from: 0, to: 1 } },
        isCompositionPinIntact: () => true,
      }),
    ).toEqual({ text: "한", splitOffset: 1, change: null });
  });
});

function nativeParagraphFixture() {
  const root = document.createElement("div");
  const alpha = canonicalBlock(
    { ...(value.blocks[0] as EditableBlock), text: "" },
    0,
  );
  const beta = canonicalBlock(value.blocks[1] as EditableBlock, 1);
  const sourceSurface = alpha.firstChild as HTMLElement;
  const sourceText = sourceSurface.firstChild as Text;
  const sourcePlaceholder = captureCompositionPlaceholder(
    sourceSurface,
    sourceText,
  );
  if (sourcePlaceholder === null) {
    throw new Error("Expected an owned placeholder.");
  }
  sourceText.data = "한";

  const nativeBlock = document.createElement("div");
  nativeBlock.append(document.createElement("br"));
  root.append(alpha, nativeBlock, beta);

  const intent: NativeParagraphIntentFacts = {
    compositionId: 1,
    blockId: "alpha",
    sourceElement: alpha,
    sourceSurface,
    sourceText,
    sourcePlaceholder,
    blockElements: [alpha, beta],
    splitOffset: 1,
    canonicalText: "한",
    nativeRecords: [],
  };

  return {
    root,
    sourceSurface,
    sourceText,
    sourcePlaceholder,
    intent,
  };
}

function canonicalBlock(block: EditableBlock, index: number): HTMLElement {
  const element = document.createElement("p");
  element.className = "contenteditable-block contenteditable-block-paragraph";
  element.setAttribute("data-editable-block", block.id);
  element.setAttribute("data-block-type", block.type);
  element.setAttribute("data-block-index", String(index));

  const surface = document.createElement("span");
  surface.setAttribute("data-editable-text", `/blocks/${index}/text`);
  surface.append(document.createTextNode(block.text));
  if (block.text === "") {
    const placeholder = document.createElement("br");
    placeholder.setAttribute("data-editable-placeholder", "true");
    surface.append(placeholder);
  }
  element.append(surface);
  return element;
}
