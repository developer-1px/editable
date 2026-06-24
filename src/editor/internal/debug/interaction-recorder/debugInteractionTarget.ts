import {
  collapseWhitespace,
  cssIdentifier,
  truncate,
} from "./debugInteractionFormat";
import type { SerializedTarget } from "./debugInteractionTypes";

export function serializeTarget(
  target: EventTarget | null,
): SerializedTarget | null {
  if (
    target === null ||
    typeof Node === "undefined" ||
    !(target instanceof Node)
  ) {
    return null;
  }

  const element =
    target instanceof Element
      ? target
      : (target.parentElement ?? target.parentNode?.parentElement ?? null);

  if (element === null) {
    return {
      nodeName: target.nodeName,
    };
  }

  const className =
    typeof element.className === "string" && element.className.length > 0
      ? element.className
      : undefined;
  const text = collapseWhitespace(element.textContent ?? "");

  return {
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    className,
    dataPath: element.getAttribute("data-path") ?? undefined,
    id: element.id.length > 0 ? element.id : undefined,
    nodeName: target.nodeName,
    path: elementPath(element),
    role: element.getAttribute("role") ?? undefined,
    tagName: element.tagName.toLowerCase(),
    text: text.length > 0 ? truncate(text, 180) : undefined,
  };
}

function elementPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current !== null && parts.length < 8) {
    parts.unshift(elementPathSegment(current));
    if (current.id.length > 0) {
      break;
    }
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function elementPathSegment(element: Element): string {
  const dataPath = element.getAttribute("data-path");
  if (dataPath !== null) {
    return `${element.tagName.toLowerCase()}[data-path="${dataPath}"]`;
  }

  let segment = element.tagName.toLowerCase();
  if (element.id.length > 0) {
    return `${segment}#${cssIdentifier(element.id)}`;
  }

  const className =
    typeof element.className === "string" ? element.className.trim() : "";
  const firstClassName = className.split(/\s+/).find(Boolean);
  if (firstClassName !== undefined) {
    segment = `${segment}.${cssIdentifier(firstClassName)}`;
  }

  const parent = element.parentElement;
  if (parent !== null) {
    const sameTagSiblings = Array.from(parent.children).filter(
      (sibling) => sibling.tagName === element.tagName,
    );
    if (sameTagSiblings.length > 1) {
      segment = `${segment}:nth-of-type(${
        sameTagSiblings.indexOf(element) + 1
      })`;
    }
  }

  return segment;
}
