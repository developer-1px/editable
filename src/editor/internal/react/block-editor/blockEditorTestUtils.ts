import { act, cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

export function installBlockEditorTestCleanup() {
  afterEach(() => {
    document.getSelection()?.removeAllRanges();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    cleanup();
    vi.restoreAllMocks();
  });
}

export function setDOMSelection(node: ChildNode, offset: number) {
  setDOMRangeSelection(node, offset, node, offset);
}

export function setDOMRangeSelection(
  anchorNode: ChildNode,
  anchorOffset: number,
  focusNode: ChildNode,
  focusOffset: number,
) {
  const range = document.createRange();
  const selection = document.getSelection();
  if (selection === null) {
    throw new Error("Selection is unavailable.");
  }

  range.setStart(anchorNode, anchorOffset);
  range.setEnd(focusNode, focusOffset);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function hasHiddenSelectionClass(root: Element) {
  const hiddenSelectionSelector =
    ".ProseMirror-hideselection, .editable-hideselection, .editable-hidden-selection";
  return (
    root.matches(hiddenSelectionSelector) ||
    root.querySelector(hiddenSelectionSelector) !== null
  );
}

export function createClipboardData(): DataTransfer {
  const data = new Map<string, string>();

  return {
    getData: (type: string) => data.get(type) ?? "",
    setData: (type: string, value: string) => {
      data.set(type, value);
    },
    clearData: (type?: string) => {
      if (type === undefined) {
        data.clear();
      } else {
        data.delete(type);
      }
    },
  } as DataTransfer;
}

export function dispatchKeyboard(
  element: Element,
  type: "keydown" | "keyup",
  init: KeyboardEventInit,
) {
  const event = new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });

  act(() => {
    element.dispatchEvent(event);
  });

  return event;
}

export function dispatchPointerEvent(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  init: MouseEventInit & {
    pointerId: number;
    pointerType: string;
  },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperties(event, {
    isPrimary: { configurable: true, value: true },
    pointerId: { configurable: true, value: init.pointerId },
    pointerType: { configurable: true, value: init.pointerType },
  });

  act(() => {
    element.dispatchEvent(event);
  });

  return event;
}

export function installEditorGeometry() {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
    if (!(this instanceof HTMLElement)) {
      return original.call(this);
    }

    const path = this.getAttribute("data-path");
    if (path === "/root/children/0") {
      return rect(0, 0, 800, 24);
    }
    if (path === "/root/children/1") {
      return rect(0, 32, 180, 80);
    }
    if (path !== null) {
      return rect(0, 0, 120, 24);
    }

    return original.call(this);
  };

  return () => {
    Element.prototype.getBoundingClientRect = original;
  };
}

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return {
    x,
    y,
    width,
    height,
    left: x,
    top: y,
    right: x + width,
    bottom: y + height,
    toJSON() {
      return { x, y, width, height };
    },
  } as DOMRect;
}

export function fireBeforeInput(
  element: Element,
  init: {
    inputType: string;
    data?: string | null;
    dataTransfer?: DataTransfer;
    isComposing?: boolean;
  },
) {
  const event = new InputEvent("beforeinput", {
    bubbles: true,
    cancelable: true,
    data: init.data ?? null,
    inputType: init.inputType,
    isComposing: init.isComposing === true,
  });
  if (init.dataTransfer !== undefined) {
    Object.defineProperty(event, "dataTransfer", {
      configurable: true,
      value: init.dataTransfer,
    });
  }

  act(() => {
    element.dispatchEvent(event);
  });

  return event;
}
