import { ATOM_REPLACEMENT } from "../../model";

export function editableTextContent(node: Node, atomAttribute: string): string {
  if (isAtomElement(node, atomAttribute)) {
    return ATOM_REPLACEMENT;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }
  let text = "";
  for (const child of Array.from(node.childNodes)) {
    text += editableTextContent(child, atomAttribute);
  }
  return text;
}

export function atomOffsetsInElement(
  element: Element,
  atomAttribute: string,
): Map<string, number> {
  const offsets = new Map<string, number>();
  let offset = 0;
  const visit = (node: Node) => {
    if (isAtomElement(node, atomAttribute)) {
      const id = node.getAttribute(atomAttribute);
      if (id !== null) {
        offsets.set(id, offset);
      }
      offset += 1;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      offset += node.textContent?.length ?? 0;
      return;
    }
    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
  };
  for (const child of Array.from(element.childNodes)) {
    visit(child);
  }
  return offsets;
}

export function textOffsetInElement(
  element: Element,
  node: Node,
  offset: number,
  atomAttribute: string,
): number {
  const atom = closestAttributeElement(
    element as HTMLElement,
    node,
    atomAttribute,
  );
  if (atom !== null && element.contains(atom)) {
    return textOffsetForNode(element, atom, atomAttribute) + (offset > 0 ? 1 : 0);
  }

  if (node === element) {
    return offsetInElementChildren(element, offset, atomAttribute);
  }

  return textOffsetForNode(element, node, atomAttribute) + offset;
}

export function textDOMPositionForOffset(
  element: Element,
  offset: number,
  atomAttribute: string,
): { node: Node; offset: number } {
  const position = textDOMPositionInChildren(
    element,
    Math.max(0, offset),
    atomAttribute,
  );
  if (position !== null) {
    return position;
  }

  const text = element.ownerDocument.createTextNode("");
  element.append(text);
  return { node: text, offset: 0 };
}

export function closestAttributeElement(
  root: HTMLElement,
  node: Node,
  attribute: string,
): HTMLElement | null {
  const start = isHTMLElement(node) ? node : node.parentElement;
  const element = start?.closest(`[${attribute}]`) ?? null;
  return isHTMLElement(element) && root.contains(element) ? element : null;
}

export function findElementByAttribute(
  root: HTMLElement,
  attribute: string,
  value: string,
): HTMLElement | null {
  if (root.getAttribute(attribute) === value) {
    return root;
  }
  for (const element of Array.from(root.querySelectorAll(`[${attribute}]`))) {
    if (
      isHTMLElement(element) &&
      element.getAttribute(attribute) === value
    ) {
      return element;
    }
  }
  return null;
}

function editableTextLength(node: Node, atomAttribute: string): number {
  if (isAtomElement(node, atomAttribute)) {
    return 1;
  }
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent?.length ?? 0;
  }
  let length = 0;
  for (const child of Array.from(node.childNodes)) {
    length += editableTextLength(child, atomAttribute);
  }
  return length;
}

function textOffsetForNode(
  element: Element,
  target: Node,
  atomAttribute: string,
): number {
  let total = 0;
  let found = false;

  const visit = (node: Node): boolean => {
    if (node === target) {
      found = true;
      return false;
    }
    if (isAtomElement(node, atomAttribute)) {
      total += 1;
      return true;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      total += node.textContent?.length ?? 0;
      return true;
    }
    for (const child of Array.from(node.childNodes)) {
      if (!visit(child)) {
        return false;
      }
    }
    return true;
  };

  for (const child of Array.from(element.childNodes)) {
    if (!visit(child)) {
      break;
    }
  }
  return found ? total : editableTextLength(element, atomAttribute);
}

function offsetInElementChildren(
  element: Element,
  offset: number,
  atomAttribute: string,
): number {
  let total = 0;
  const children = Array.from(element.childNodes).slice(0, offset);
  for (const child of children) {
    total += editableTextLength(child, atomAttribute);
  }
  return total;
}

function textDOMPositionInChildren(
  element: Element,
  offset: number,
  atomAttribute: string,
): { node: Node; offset: number } | null {
  let remaining = offset;
  const children = Array.from(element.childNodes);
  for (const child of children) {
    if (isAtomElement(child, atomAttribute)) {
      const index = indexInParent(child);
      if (remaining <= 0) {
        return { node: element, offset: index };
      }
      if (remaining <= 1) {
        return { node: element, offset: index + 1 };
      }
      remaining -= 1;
      continue;
    }

    if (child.nodeType === Node.TEXT_NODE) {
      const length = child.textContent?.length ?? 0;
      if (remaining <= length) {
        return { node: child, offset: remaining };
      }
      remaining -= length;
      continue;
    }

    if (isElement(child)) {
      const length = editableTextLength(child, atomAttribute);
      if (remaining <= length) {
        return textDOMPositionInChildren(child, remaining, atomAttribute);
      }
      remaining -= length;
    }
  }
  return { node: element, offset: children.length };
}

function isAtomElement(
  node: Node,
  atomAttribute: string,
): node is HTMLElement {
  return isHTMLElement(node) && node.hasAttribute(atomAttribute);
}

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isHTMLElement(node: Node | null): node is HTMLElement {
  return (
    node !== null &&
    node.nodeType === Node.ELEMENT_NODE &&
    typeof (node as HTMLElement).hasAttribute === "function"
  );
}

function indexInParent(element: Element): number {
  return element.parentElement === null
    ? 0
    : Array.from(element.parentElement.childNodes).indexOf(element);
}
