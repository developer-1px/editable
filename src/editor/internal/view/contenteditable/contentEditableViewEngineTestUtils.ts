import { afterEach } from "vitest";
import { EDITABLE_CLIPBOARD_MIME } from "../../model/clipboard";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
} from "../../model/noteDocument";

export const firstTextPath = "/root/children/0/children/0/text";
export const secondTextPath = "/root/children/1/children/0/text";

export function installContentEditableViewTestCleanup() {
  afterEach(() => {
    document.body.innerHTML = "";
    document.getSelection()?.removeAllRanges();
  });
}

export function documentWithBlocks(blocks: NoteBlockInput[]): NoteDocument {
  return createNoteDocument(blocks, {
    id: "note-test",
    title: "Native",
    tags: [],
  });
}

export function setupTextRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="text-block" data-path="/root/children/0">',
    `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
    "</p>",
    '<p class="text-block" data-path="/root/children/1">',
    `<span class="text-run" data-path="${secondTextPath}">Beta</span>`,
    "</p>",
  ].join("");
  document.body.append(root);

  return {
    root,
    first: textRun(root, firstTextPath),
    second: textRun(root, secondTextPath),
  };
}

export function setupShadowTextRoot() {
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="text-block" data-path="/root/children/0">',
    `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
    "</p>",
  ].join("");
  shadowRoot.append(root);
  document.body.append(host);

  return {
    root,
    shadowRoot,
    first: textRun(root, firstTextPath),
  };
}

export function installShadowSelection(shadowRoot: ShadowRoot) {
  let range: Range | null = null;
  const selection = {
    get anchorNode() {
      return range?.startContainer ?? null;
    },
    get anchorOffset() {
      return range?.startOffset ?? 0;
    },
    get focusNode() {
      return range?.endContainer ?? null;
    },
    get focusOffset() {
      return range?.endOffset ?? 0;
    },
    removeAllRanges() {
      range = null;
    },
    addRange(nextRange: Range) {
      range = nextRange.cloneRange();
    },
  };

  Object.defineProperty(shadowRoot, "getSelection", {
    configurable: true,
    value: () => selection as Selection,
  });

  return selection;
}

export function setupInlineAtomTextRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="text-block" data-path="/root/children/0">',
    `<span class="text-run" data-path="${firstTextPath}">Alpha</span>`,
    '<span class="mention-chip" contenteditable="false" data-path="/root/children/0/children/1">@Ada</span>',
    '<span class="text-run" data-path="/root/children/0/children/2/text">Beta</span>',
    "</p>",
  ].join("");
  document.body.append(root);

  const block = root.querySelector('[data-path="/root/children/0"]');
  const mention = root.querySelector(
    '[data-path="/root/children/0/children/1"]',
  );
  if (!(block instanceof HTMLElement) || !(mention instanceof HTMLElement)) {
    throw new Error("Fixture failed to render inline atom root.");
  }

  return {
    root,
    block,
    first: textRun(root, firstTextPath),
    mention,
    second: textRun(root, "/root/children/0/children/2/text"),
  };
}

export function textRun(root: ParentNode, path: string): HTMLElement {
  const element = root.querySelector(`[data-path="${path}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Missing text run for ${path}.`);
  }

  return element;
}

export function firstTextNodeInside(element: HTMLElement): Text {
  const textWalker = element.ownerDocument.createTreeWalker(element, 4);
  const textNode = textWalker.nextNode();
  if (!(textNode instanceof Text)) {
    throw new Error("Element must contain a text node.");
  }

  return textNode;
}

export function setDOMSelection(element: HTMLElement, offset: number) {
  const textNode = element.firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error("Text run must contain a text node.");
  }

  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

export function setDOMRangeSelection(
  anchor: HTMLElement,
  anchorOffset: number,
  focus: HTMLElement,
  focusOffset: number,
) {
  const anchorText = anchor.firstChild;
  const focusText = focus.firstChild;
  if (!(anchorText instanceof Text) || !(focusText instanceof Text)) {
    throw new Error("Text run must contain a text node.");
  }

  const range = document.createRange();
  range.setStart(anchorText, anchorOffset);
  range.setEnd(focusText, focusOffset);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

export function setDOMBoundarySelection(node: Node, offset: number) {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(range);
}

export function installVisualViewport(
  viewport: Pick<VisualViewport, "height" | "offsetTop" | "width"> | undefined,
) {
  const descriptor = Object.getOwnPropertyDescriptor(window, "visualViewport");
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value:
      viewport === undefined
        ? undefined
        : {
            offsetLeft: 0,
            pageLeft: 0,
            pageTop: viewport.offsetTop,
            scale: 1,
            ...viewport,
          },
  });

  return () => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(window, "visualViewport");
      return;
    }

    Object.defineProperty(window, "visualViewport", descriptor);
  };
}

export function installWindowScrollBy(scrollBy: typeof window.scrollBy) {
  const descriptor = Object.getOwnPropertyDescriptor(window, "scrollBy");
  Object.defineProperty(window, "scrollBy", {
    configurable: true,
    value: scrollBy,
  });

  return () => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(window, "scrollBy");
      return;
    }

    Object.defineProperty(window, "scrollBy", descriptor);
  };
}

export function rect(
  x: number,
  y: number,
  width: number,
  height: number,
): DOMRect {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    top: y,
    width,
    x,
    y,
    toJSON() {
      return { x, y, width, height };
    },
  } as DOMRect;
}

export function beforeInputTransferEvent(
  inputType: string,
  data: Record<string, string>,
) {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    inputType,
  });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      getData(type: string) {
        return data[type] ?? "";
      },
    },
  });

  return event;
}

export { EDITABLE_CLIPBOARD_MIME };
