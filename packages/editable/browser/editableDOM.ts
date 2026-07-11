export const EDITABLE_BLOCK_ATTRIBUTE = "data-editable-block";
export const EDITABLE_TEXT_ATTRIBUTE = "data-editable-text";
export const EDITABLE_PLACEHOLDER_ATTRIBUTE = "data-editable-placeholder";

export function editableSurfaceFromNode(
  root: HTMLElement,
  node: Node | null,
): HTMLElement | null {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;
  const surface = element?.closest<HTMLElement>(`[${EDITABLE_TEXT_ATTRIBUTE}]`);
  return surface != null && root.contains(surface) ? surface : null;
}

export function editableBlockFromNode(
  root: HTMLElement,
  node: Node | null,
): HTMLElement | null {
  const element = isElementNode(node) ? node : node?.parentElement ?? null;
  const block = element?.closest<HTMLElement>(`[${EDITABLE_BLOCK_ATTRIBUTE}]`);
  return block != null && root.contains(block) ? block : null;
}

export function textFromSurface(surface: HTMLElement): string {
  return surface.textContent ?? "";
}

export function ensureCompositionTextNode(
  surface: HTMLElement,
  focusNode: Node | null,
): Text {
  if (isTextNode(focusNode) && surface.contains(focusNode)) {
    return focusNode;
  }

  const first = textNodes(surface)[0];
  if (first !== undefined) {
    return first;
  }

  const node = surface.ownerDocument.createTextNode("");
  surface.insertBefore(node, surface.firstChild);
  return node;
}

export function setCanonicalSurfaceText(
  surface: HTMLElement,
  value: string,
): Text {
  const children = Array.from(surface.childNodes);
  const onlyText = children.length === 1 && isTextNode(children[0]);
  const emptyCanonical =
    children.length === 2 &&
    isTextNode(children[0]) &&
    isElementNode(children[1]) &&
    children[1].hasAttribute(EDITABLE_PLACEHOLDER_ATTRIBUTE);

  if (onlyText || emptyCanonical) {
    const text = children[0] as Text;
    const current = text.data;
    let prefix = 0;
    while (
      prefix < current.length &&
      prefix < value.length &&
      current.charCodeAt(prefix) === value.charCodeAt(prefix)
    ) {
      prefix += 1;
    }
    let currentEnd = current.length;
    let valueEnd = value.length;
    while (
      currentEnd > prefix &&
      valueEnd > prefix &&
      current.charCodeAt(currentEnd - 1) === value.charCodeAt(valueEnd - 1)
    ) {
      currentEnd -= 1;
      valueEnd -= 1;
    }
    if (currentEnd > prefix) {
      text.deleteData(prefix, currentEnd - prefix);
    }
    if (valueEnd > prefix) {
      text.insertData(prefix, value.slice(prefix, valueEnd));
    }
    syncPlaceholder(surface);
    return text;
  }

  while (surface.firstChild !== null) {
    surface.removeChild(surface.firstChild);
  }
  const text = surface.ownerDocument.createTextNode(value);
  surface.append(text);
  syncPlaceholder(surface);
  return text;
}

export function textNodes(root: Node): Text[] {
  const nodes: Text[] = [];
  const showText = root.ownerDocument?.defaultView?.NodeFilter.SHOW_TEXT ?? 0x4;
  const walker = root.ownerDocument?.createTreeWalker(root, showText);
  if (walker === undefined) {
    return nodes;
  }
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    nodes.push(node as Text);
  }
  return nodes;
}

function syncPlaceholder(surface: HTMLElement): void {
  const placeholder = surface.querySelector<HTMLElement>(
    `[${EDITABLE_PLACEHOLDER_ATTRIBUTE}]`,
  );
  const hasText = textNodes(surface).some((node) => node.data.length > 0);
  if (hasText) {
    placeholder?.remove();
    return;
  }
  if (placeholder !== null) {
    return;
  }
  const br = surface.ownerDocument.createElement("br");
  br.setAttribute(EDITABLE_PLACEHOLDER_ATTRIBUTE, "true");
  surface.append(br);
}

function isElementNode(node: Node | null | undefined): node is Element {
  return node?.nodeType === 1;
}

function isTextNode(node: Node | null | undefined): node is Text {
  return node?.nodeType === 3;
}
