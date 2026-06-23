import { afterEach, vi } from "vitest";
import {
  createNoteDocument,
  type InlineNodeInput,
  type NoteBlockInput,
  type NoteDocument,
} from "../../model/noteDocument";
import { createDOMCursorGeometry } from "./cursorGeometry";

export function installCursorGeometryTestCleanup() {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });
}

export function rect(
  x: number,
  y: number,
  width: number,
  height: number,
): DOMRect {
  return new DOMRect(x, y, width, height);
}

export function rectShape(value: DOMRect | null) {
  if (value === null) {
    return null;
  }

  return {
    left: value.left,
    top: value.top,
    width: value.width,
    height: value.height,
  };
}

export function rectShapes(values: DOMRect[]) {
  return values.map((value) => rectShape(value));
}

export function setRect(element: Element, value: DOMRect) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
}

export function geometryForRoot(root: Element) {
  return createDOMCursorGeometry(root, noteDocumentFromRoot(root));
}

export function noteDocumentFromRoot(root: Element): NoteDocument {
  const blocks = Array.from(root.children)
    .map((element) => {
      const path = element.getAttribute("data-path");
      const match = path?.match(/^\/root\/children\/(\d+)$/);
      return match === null || match === undefined
        ? null
        : { element, index: Number.parseInt(match[1] ?? "0", 10) };
    })
    .filter(
      (entry): entry is { element: Element; index: number } => entry !== null,
    )
    .sort((left, right) => left.index - right.index)
    .map(({ element, index }) => blockInputFromElement(element, index));

  return createNoteDocument(blocks, {
    id: "geometry-test",
    title: "Geometry test",
    tags: [],
  });
}

export function blockInputFromElement(
  element: Element,
  blockIndex: number,
): NoteBlockInput {
  const id = `block-${blockIndex}`;

  if (element.classList.contains("figure-block")) {
    return { id, type: "figure", src: "/figure.png" };
  }

  if (element.classList.contains("code-block")) {
    return {
      id,
      type: "codeBlock",
      text: element.querySelector(":scope > [data-path]")?.textContent ?? "",
    };
  }

  const children = inlineNodeInputsFromElement(element, blockIndex);
  if (element.tagName === "H1" || element.tagName === "H2") {
    return { id, type: "heading", level: headingLevel(element), children };
  }

  if (element.tagName === "BLOCKQUOTE") {
    return { id, type: "quote", children };
  }

  if (element.tagName === "LI") {
    return { id, type: "listItem", children };
  }

  return { id, type: "paragraph", children };
}

export function inlineNodeInputsFromElement(
  element: Element,
  blockIndex: number,
): InlineNodeInput[] {
  const children = Array.from(element.children)
    .filter((child) =>
      child
        .getAttribute("data-path")
        ?.startsWith(`/root/children/${blockIndex}/children/`),
    )
    .map((child, inlineIndex): InlineNodeInput => {
      const path = child.getAttribute("data-path") ?? "";
      if (path.endsWith("/text")) {
        return { type: "text", text: child.textContent ?? "" };
      }

      return {
        id: `mention-${blockIndex}-${inlineIndex}`,
        type: "mention",
        label: mentionLabel(child),
      };
    });

  return children.length > 0 ? children : [{ type: "text", text: "" }];
}

export function headingLevel(element: Element): number {
  const level = Number.parseInt(element.tagName.slice(1), 10);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level : 2;
}

export function mentionLabel(element: Element): string {
  const label = (element.textContent ?? "").replace(/^@/, "").trim();
  return label.length > 0 ? label : "Mention";
}

export function setupRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="paragraph-block text-block" data-path="/root/children/0">',
    '<span class="text-run" data-path="/root/children/0/children/0/text">Hello</span>',
    '<span class="mention-chip" data-path="/root/children/0/children/1">@Ada</span>',
    "</p>",
    '<figure class="figure-block" data-path="/root/children/1"></figure>',
  ].join("");
  document.body.append(root);

  const text = root.querySelector(
    '[data-path="/root/children/0/children/0/text"]',
  );
  const mention = root.querySelector(
    '[data-path="/root/children/0/children/1"]',
  );
  const paragraph = root.querySelector('[data-path="/root/children/0"]');
  const figure = root.querySelector('[data-path="/root/children/1"]');
  if (
    text === null ||
    mention === null ||
    paragraph === null ||
    figure === null
  ) {
    throw new Error("Fixture failed to render.");
  }

  setRect(paragraph, rect(10, 10, 100, 24));
  setRect(text, rect(10, 10, 50, 20));
  setRect(mention, rect(70, 10, 40, 20));
  setRect(figure, rect(10, 50, 200, 120));

  return root;
}
