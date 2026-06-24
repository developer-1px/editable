import { findElementByDataPath } from "./editorTraceReplayDom";
import type {
  EditorTraceEvent,
  TransferTraceEvent,
} from "./editorTraceReplayTypes";

export function createTraceEvent(
  root: HTMLElement,
  event: EditorTraceEvent,
): Event {
  const window = root.ownerDocument.defaultView;
  if (window === null) {
    throw new Error("Trace replay requires a DOM window.");
  }

  if (event.type === "keydown" || event.type === "keyup") {
    const keyboardEvent = new window.KeyboardEvent(event.type, {
      altKey: event.altKey ?? false,
      bubbles: true,
      cancelable: true,
      code: event.code,
      ctrlKey: event.ctrlKey ?? false,
      key: event.key,
      metaKey: event.metaKey ?? false,
      shiftKey: event.shiftKey ?? false,
    });
    defineEventValue(keyboardEvent, "isComposing", event.isComposing ?? false);
    if (event.keyCode !== undefined) {
      defineEventValue(keyboardEvent, "keyCode", event.keyCode);
    }
    return keyboardEvent;
  }

  if (event.type === "beforeinput" || event.type === "input") {
    const inputEvent = new window.InputEvent(event.type, {
      bubbles: true,
      cancelable: event.type === "beforeinput",
      data: event.data ?? null,
      inputType: event.inputType,
    });
    defineEventValue(inputEvent, "isComposing", event.isComposing ?? false);
    return inputEvent;
  }

  if (event.type === "paste" || event.type === "drop" || event.type === "cut") {
    const transfer = createTraceTransferData(event);
    const transferEvent = new window.Event(event.type, {
      bubbles: true,
      cancelable: true,
    });
    if (event.type === "paste" || event.type === "cut") {
      defineEventValue(transferEvent, "clipboardData", transfer);
    } else {
      defineEventValue(transferEvent, "dataTransfer", transfer);
      defineEventValue(transferEvent, "clientX", event.clientX ?? 0);
      defineEventValue(transferEvent, "clientY", event.clientY ?? 0);
    }
    return transferEvent;
  }

  if (event.type === "blur" || event.type === "focus") {
    return new window.FocusEvent(event.type, {
      bubbles: true,
      cancelable: false,
    });
  }

  if (event.type === "pointerdown") {
    const pointerEventInit = {
      bubbles: true,
      button: event.button ?? 0,
      cancelable: true,
      clientX: event.clientX ?? 0,
      clientY: event.clientY ?? 0,
      detail: event.detail ?? 1,
      pointerId: event.pointerId ?? 1,
      shiftKey: event.shiftKey ?? false,
    };
    const pointerEvent =
      typeof window.PointerEvent === "function"
        ? new window.PointerEvent(event.type, pointerEventInit)
        : new window.MouseEvent(event.type, pointerEventInit);
    defineEventValue(pointerEvent, "pointerId", event.pointerId ?? 1);
    return pointerEvent;
  }

  const compositionData =
    event.type === "compositionstart" ||
    event.type === "compositionupdate" ||
    event.type === "compositionend"
      ? (event.data ?? "")
      : "";
  const compositionEvent =
    typeof window.CompositionEvent === "function"
      ? new window.CompositionEvent(event.type, {
          bubbles: true,
          cancelable: true,
          data: compositionData,
        })
      : new window.Event(event.type, {
          bubbles: true,
          cancelable: true,
        });
  defineEventValue(compositionEvent, "data", compositionData);
  return compositionEvent;
}

export function traceEventTarget(
  root: HTMLElement,
  event: EditorTraceEvent,
): Element {
  if (event.type !== "pointerdown" || event.targetPath === undefined) {
    return root;
  }

  const target = findElementByDataPath(root, event.targetPath);
  if (target === null) {
    throw new Error(`Missing event target for ${event.targetPath}.`);
  }

  return target;
}

function createTraceTransferData(event: TransferTraceEvent) {
  const data = new Map<string, string>();
  for (const [type, value] of Object.entries(event.data ?? {})) {
    data.set(type, value);
  }
  if (event.text !== undefined) {
    data.set("text/plain", event.text);
    if (event.format === "markdown") {
      data.set("text/markdown", event.text);
    }
  }

  return {
    get types() {
      return Array.from(data.keys());
    },
    clearData(type?: string) {
      if (type === undefined) {
        data.clear();
      } else {
        data.delete(type);
      }
    },
    getData(type: string) {
      return data.get(type) ?? "";
    },
    setData(type: string, value: string) {
      data.set(type, value);
    },
  };
}

function defineEventValue(event: Event, key: string, value: unknown) {
  Object.defineProperty(event, key, {
    configurable: true,
    value,
  });
}
