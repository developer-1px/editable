import { makeRect } from "./cursorGeometryRects";

export function textLayoutRectForBlock(
  block: Element,
  blockRect: DOMRect,
  fallbackWidth: number,
): DOMRect {
  const style = ownerWindow(block)?.getComputedStyle(block);
  const paddingLeft = cssPixels(style?.paddingLeft ?? "");
  const paddingRight = cssPixels(style?.paddingRight ?? "");
  const paddingTop = cssPixels(style?.paddingTop ?? "");
  const paddingBottom = cssPixels(style?.paddingBottom ?? "");
  const contentWidth =
    blockRect.width > 0
      ? Math.max(1, blockRect.width - paddingLeft - paddingRight)
      : fallbackWidth;
  const contentHeight =
    blockRect.height > 0
      ? Math.max(1, blockRect.height - paddingTop - paddingBottom)
      : blockRect.height;

  return makeRect(
    blockRect.left + paddingLeft,
    blockRect.top + paddingTop,
    contentWidth,
    contentHeight,
  );
}

export function measureTextWidth(text: string, font: string): number {
  const context = measureContext();
  if (context === null) {
    return text.length * 10;
  }

  context.font = font;

  return context.measureText(text).width;
}

export function canUsePretextMeasurement(): boolean {
  if (isJsdomRuntime()) {
    return false;
  }

  const globalObject = globalThis as typeof globalThis & {
    OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvas;
  };

  return (
    typeof globalObject.OffscreenCanvas === "function" ||
    typeof document !== "undefined"
  );
}

export function fontForElement(element: Element): string {
  const style = ownerWindow(element)?.getComputedStyle(element);
  if (style === undefined) {
    return "16px sans-serif";
  }

  const font = style.font;
  if (font !== undefined && font !== "") {
    return font;
  }

  const fontSize = style.fontSize || "16px";
  const fontFamily = style.fontFamily || "sans-serif";
  const fontWeight = style.fontWeight || "400";
  const fontStyle = style.fontStyle || "normal";

  return `${fontStyle} ${fontWeight} ${fontSize} ${fontFamily}`;
}

export function primaryTextElement(element: Element): Element {
  const child = Array.from(element.children).find((candidate) =>
    candidate.matches(".rich-strong, .rich-emphasis, .rich-code, .rich-link"),
  );

  return child ?? element;
}

export function lineHeightForElement(element: Element, rect: DOMRect): number {
  const style = ownerWindow(element)?.getComputedStyle(element);
  const parsed = Number.parseFloat(style?.lineHeight ?? "");
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  if (Number.isFinite(rect.height) && rect.height > 0) {
    return rect.height;
  }

  const fontSize = Number.parseFloat(style?.fontSize ?? "");
  if (Number.isFinite(fontSize) && fontSize > 0) {
    return fontSize * 1.2;
  }

  return Math.max(1, rect.height);
}

export function inlineAtomExtraWidth(element: Element): number {
  const style = ownerWindow(element)?.getComputedStyle(element);
  if (style === undefined) {
    return 0;
  }

  return (
    cssPixels(style.paddingLeft) +
    cssPixels(style.paddingRight) +
    cssPixels(style.borderLeftWidth) +
    cssPixels(style.borderRightWidth)
  );
}

export function pageStepForRoot(root: ParentNode): number {
  if (root instanceof Element) {
    const clientHeight = root.clientHeight;
    if (Number.isFinite(clientHeight) && clientHeight > 0) {
      return clientHeight;
    }

    const rect = root.getBoundingClientRect();
    if (Number.isFinite(rect.height) && rect.height > 0) {
      return rect.height;
    }
  }

  const ownerDocument =
    root instanceof Document
      ? root
      : root instanceof Node
        ? root.ownerDocument
        : null;
  const viewportHeight = ownerDocument?.defaultView?.innerHeight;

  return viewportHeight !== undefined &&
    Number.isFinite(viewportHeight) &&
    viewportHeight > 0
    ? viewportHeight
    : 1;
}

export function isTopLevelCursorBlock(element: Element): boolean {
  return /^\/root\/children\/\d+$/.test(
    element.getAttribute("data-path") ?? "",
  );
}

export function isBlockAtom(element: Element): boolean {
  return (
    element.tagName === "FIGURE" || element.classList.contains("figure-block")
  );
}

export function isTextBlockElement(element: Element): boolean {
  return (
    element.classList.contains("text-block") ||
    element.classList.contains("paragraph-block") ||
    element.classList.contains("heading-block") ||
    element.classList.contains("quote-block") ||
    element.classList.contains("list-item-block") ||
    element.classList.contains("code-block")
  );
}

export function isInlineAtom(element: Element): boolean {
  return element.classList.contains("mention-chip");
}

function measureContext():
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null {
  if (isJsdomRuntime()) {
    return null;
  }

  const globalObject = globalThis as typeof globalThis & {
    OffscreenCanvas?: new (width: number, height: number) => OffscreenCanvas;
  };
  if (typeof globalObject.OffscreenCanvas === "function") {
    return new globalObject.OffscreenCanvas(1, 1).getContext("2d");
  }

  if (typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");

  try {
    return canvas.getContext("2d");
  } catch {
    return null;
  }
}

function isJsdomRuntime(): boolean {
  return typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
}

function cssPixels(value: string): number {
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function ownerWindow(element: Element): Window | null {
  return element.ownerDocument.defaultView;
}
