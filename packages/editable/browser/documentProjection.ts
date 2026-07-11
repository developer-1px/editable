import {
  editableTextPath,
  findEditableBlockIndex,
  type EditableBlock,
  type EditableBlockType,
  type EditableDocumentValue,
} from "../core";
import {
  EDITABLE_BLOCK_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  setCanonicalSurfaceText,
} from "./editableDOM";

const OWNED_BLOCK_ATTRIBUTES = new Set([
  "class",
  EDITABLE_BLOCK_ATTRIBUTE,
  "data-block-type",
  "data-block-index",
]);

const OWNED_SURFACE_ATTRIBUTES = new Set([EDITABLE_TEXT_ATTRIBUTE]);

export type DocumentProjectionComposition = {
  blockId: string;
  node: Text;
  isPinIntact(surface: HTMLElement): boolean;
  invalidate(reason: string): void;
};

export type ProjectDocumentDOMOptions = {
  root: HTMLElement;
  value: EditableDocumentValue;
  composition?: DocumentProjectionComposition | null;
  forceCanonicalBlockId?: string;
};

export function projectDocumentDOM({
  root,
  value,
  composition = null,
  forceCanonicalBlockId,
}: ProjectDocumentDOMOptions): void {
  let activeComposition = composition;
  const invalidateComposition = (reason: string): void => {
    if (activeComposition === null) {
      return;
    }
    const invalidated = activeComposition;
    activeComposition = null;
    invalidated.invalidate(reason);
  };

  const current = new Map<string, HTMLElement>();
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType !== 1) {
      node.remove();
      continue;
    }
    const element = node as HTMLElement;
    const id = element.getAttribute(EDITABLE_BLOCK_ATTRIBUTE);
    if (id === null || current.has(id)) {
      if (activeComposition !== null && element.contains(activeComposition.node)) {
        invalidateComposition(
          "The composing block lost its keyed DOM identity.",
        );
      }
      element.remove();
      continue;
    }
    current.set(id, element);
  }

  const desiredIds = new Set(value.blocks.map((block) => block.id));
  for (const [id, element] of current) {
    if (!desiredIds.has(id)) {
      element.remove();
      current.delete(id);
    }
  }

  value.blocks.forEach((block, blockIndex) => {
    const tagName = blockTagName(block.type);
    let element = current.get(block.id) ?? null;
    if (element === null || element.tagName.toLowerCase() !== tagName) {
      if (
        activeComposition !== null &&
        element?.contains(activeComposition.node)
      ) {
        invalidateComposition(
          "The composing block changed its structural element.",
        );
      }
      const replacement = createBlockElement(
        root,
        block,
        blockIndex,
        activeComposition,
      );
      if (element === null) {
        element = replacement;
      } else {
        element.replaceWith(replacement);
        element = replacement;
      }
      current.set(block.id, element);
    }

    configureBlockElement(element, block, blockIndex, activeComposition);
    let surface = Array.from(element.children).find((child) =>
      child.hasAttribute(EDITABLE_TEXT_ATTRIBUTE),
    ) as HTMLElement | undefined;
    if (surface === undefined) {
      surface = root.ownerDocument.createElement("span");
      surface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, editableTextPath(blockIndex));
      element.append(surface);
    }
    if (
      activeComposition === null ||
      !element.contains(activeComposition.node)
    ) {
      removeUnexpectedAttributes(surface, OWNED_SURFACE_ATTRIBUTES);
    }
    for (const child of Array.from(element.childNodes)) {
      if (child === surface) {
        continue;
      }
      if (
        activeComposition !== null &&
        child.contains(activeComposition.node)
      ) {
        invalidateComposition(
          "The composing text was moved outside its owned surface.",
        );
      }
      child.remove();
    }
    surface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, editableTextPath(blockIndex));

    const protectedSurface =
      activeComposition?.blockId === block.id &&
      activeComposition.isPinIntact(surface) &&
      forceCanonicalBlockId !== block.id;
    if (!protectedSurface) {
      setCanonicalSurfaceText(surface, block.text);
    }

    const reference = root.children[blockIndex] ?? null;
    if (reference !== element) {
      if (
        activeComposition !== null &&
        element.contains(activeComposition.node)
      ) {
        invalidateComposition(
          "The composing block moved and could not keep its ancestor identity.",
        );
      }
      root.insertBefore(element, reference);
    }
  });
}

export function findBlockElement(
  root: HTMLElement,
  blockId: string,
): HTMLElement | null {
  return (
    Array.from(
      root.querySelectorAll<HTMLElement>(`[${EDITABLE_BLOCK_ATTRIBUTE}]`),
    ).find(
      (element) => element.getAttribute(EDITABLE_BLOCK_ATTRIBUTE) === blockId,
    ) ?? null
  );
}

export function isCanonicalBlockElement(
  element: HTMLElement,
  value: EditableDocumentValue,
  blockId: string,
): boolean {
  const index = findEditableBlockIndex(value, blockId);
  const block = value.blocks[index];
  return (
    block !== undefined &&
    element.attributes.length === OWNED_BLOCK_ATTRIBUTES.size &&
    element.className ===
      `contenteditable-block contenteditable-block-${block.type}` &&
    element.getAttribute(EDITABLE_BLOCK_ATTRIBUTE) === block.id &&
    element.getAttribute("data-block-type") === block.type &&
    element.getAttribute("data-block-index") === String(index)
  );
}

export function isCanonicalSurfaceElement(
  surface: HTMLElement,
  value: EditableDocumentValue,
  blockId: string,
): boolean {
  const index = findEditableBlockIndex(value, blockId);
  return (
    index >= 0 &&
    surface.attributes.length === OWNED_SURFACE_ATTRIBUTES.size &&
    surface.getAttribute(EDITABLE_TEXT_ATTRIBUTE) === editableTextPath(index)
  );
}

function createBlockElement(
  root: HTMLElement,
  block: EditableBlock,
  blockIndex: number,
  composition: DocumentProjectionComposition | null,
): HTMLElement {
  const element = root.ownerDocument.createElement(blockTagName(block.type));
  configureBlockElement(element, block, blockIndex, composition);
  const surface = root.ownerDocument.createElement("span");
  surface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, editableTextPath(blockIndex));
  element.append(surface);
  setCanonicalSurfaceText(surface, block.text);
  return element;
}

function configureBlockElement(
  element: HTMLElement,
  block: EditableBlock,
  blockIndex: number,
  composition: DocumentProjectionComposition | null,
): void {
  if (composition === null || !element.contains(composition.node)) {
    removeUnexpectedAttributes(element, OWNED_BLOCK_ATTRIBUTES);
  }
  element.className = `contenteditable-block contenteditable-block-${block.type}`;
  element.setAttribute(EDITABLE_BLOCK_ATTRIBUTE, block.id);
  element.setAttribute("data-block-type", block.type);
  element.setAttribute("data-block-index", String(blockIndex));
}

function blockTagName(
  type: EditableBlockType,
): "p" | "h1" | "blockquote" | "pre" {
  switch (type) {
    case "heading":
      return "h1";
    case "quote":
      return "blockquote";
    case "code":
      return "pre";
    case "paragraph":
      return "p";
  }
}

function removeUnexpectedAttributes(
  element: HTMLElement,
  allowed: ReadonlySet<string>,
): void {
  for (const attribute of Array.from(element.attributes)) {
    if (!allowed.has(attribute.name)) {
      element.removeAttribute(attribute.name);
    }
  }
}
