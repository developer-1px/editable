import {
  fontForElement,
  inlineAtomExtraWidth,
  isInlineAtom,
  measureTextWidth,
  primaryTextElement,
} from "./cursorGeometryDom";
import type { InlineLayoutItem } from "./cursorGeometryTypes";

export function collectInlineItems(block: Element): InlineLayoutItem[] {
  return Array.from(block.querySelectorAll(":scope > [data-path]")).flatMap(
    (element): InlineLayoutItem[] => {
      const path = element.getAttribute("data-path");
      if (path === null) {
        return [];
      }

      const text = element.textContent ?? "";
      const font = fontForElement(primaryTextElement(element));
      if (isInlineAtom(element)) {
        return [
          {
            kind: "atom",
            path,
            text,
            font,
            element,
            consumedOffset: 0,
            extraWidth: inlineAtomExtraWidth(element),
          },
        ];
      }

      return [
        {
          kind: "text",
          path,
          text,
          font,
          element,
          consumedOffset: 0,
          extraWidth: 0,
        },
      ];
    },
  );
}

export function estimatedInlineWidth(inlineItems: InlineLayoutItem[]): number {
  return inlineItems.reduce(
    (total, item) => total + estimatedInlineItemWidth(item),
    0,
  );
}

export function estimatedInlineItemWidth(item: InlineLayoutItem): number {
  if (item.kind === "atom") {
    const rectWidth = item.element.getBoundingClientRect().width;
    if (Number.isFinite(rectWidth) && rectWidth > 0) {
      return rectWidth;
    }

    return Math.max(
      1,
      measureTextWidth(item.text, item.font) + item.extraWidth,
    );
  }

  return Math.max(1, measureTextWidth(item.text, item.font));
}

export function isEmptyTextOnlyBlock(inlineItems: InlineLayoutItem[]): boolean {
  return inlineItems.every(
    (item) => item.kind === "text" && item.text.length === 0,
  );
}

export function hasHardLineBreak(inlineItems: InlineLayoutItem[]): boolean {
  return inlineItems.some(
    (item) => item.kind === "text" && item.text.includes("\n"),
  );
}

export function hardLineCountForItems(inlineItems: InlineLayoutItem[]): number {
  return Math.max(
    1,
    inlineItems.reduce(
      (count, item) =>
        item.kind === "text"
          ? count + Array.from(item.text.matchAll(/\n/g)).length
          : count,
      1,
    ),
  );
}
