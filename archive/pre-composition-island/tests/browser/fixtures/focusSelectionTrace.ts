type FocusSelectionTraceEntry = {
  activeElement: string | null;
  canonicalSelection: unknown;
  documentText: string;
  domSelection: {
    anchorInEditor: boolean;
    focusInEditor: boolean;
    isCollapsed: boolean;
    text: string;
  };
  eventType: string;
  label: string;
  overlay: {
    cursorLineCount: number;
    visualLineCount: number;
    visualLayoutOk: boolean;
  };
  target: string | null;
  time: number;
};

type FocusSelectionTraceState = {
  cleanup(): void;
  entries: FocusSelectionTraceEntry[];
};

declare global {
  interface Window {
    __editableFocusSelectionTrace?: FocusSelectionTraceState;
  }
}

export function installFocusSelectionTrace() {
  window.__editableFocusSelectionTrace?.cleanup();

  const entries: FocusSelectionTraceEntry[] = [];
  const listener = (event: Event) => {
    entries.push(snapshot(`event:${event.type}`, event));
  };
  const documentEvents = [
    "beforeinput",
    "click",
    "focusin",
    "focusout",
    "input",
    "keydown",
    "keyup",
    "mousedown",
    "pointerdown",
    "pointerup",
    "selectionchange",
  ];
  for (const type of documentEvents) {
    document.addEventListener(type, listener, true);
  }

  const editor = editorElement();
  editor.addEventListener("select", listener, true);

  window.__editableFocusSelectionTrace = {
    cleanup() {
      for (const type of documentEvents) {
        document.removeEventListener(type, listener, true);
      }
      editor.removeEventListener("select", listener, true);
    },
    entries,
  };
  entries.push(snapshot("checkpoint:installed"));
}

export function recordFocusSelectionCheckpoint(label: string) {
  window.__editableFocusSelectionTrace?.entries.push(
    snapshot(`checkpoint:${label}`),
  );
}

export function readFocusSelectionTrace(): FocusSelectionTraceEntry[] {
  return [...(window.__editableFocusSelectionTrace?.entries ?? [])];
}

export function ensureFocusSelectionOutsideInput() {
  const existing = document.querySelector("[data-testid='outside-focus-input']");
  if (existing instanceof HTMLInputElement) {
    return;
  }
  const input = document.createElement("input");
  input.dataset.testid = "outside-focus-input";
  input.setAttribute("aria-label", "Outside focus target");
  input.style.position = "fixed";
  input.style.left = "8px";
  input.style.bottom = "8px";
  input.style.width = "160px";
  document.body.append(input);
}

function snapshot(label: string, event: Event | null = null): FocusSelectionTraceEntry {
  const selection = document.getSelection();
  const editor = editorElement();
  const visualLayout = stateValue("visual layout");
  const cursorFrame = stateValue("cursor frame");
  const value = stateValue("value");

  return {
    activeElement: describeElement(document.activeElement),
    canonicalSelection: stateValue("selection"),
    documentText:
      isRecord(value) && Array.isArray(value.blocks)
        ? String(value.blocks[0]?.text ?? "")
        : "",
    domSelection: {
      anchorInEditor:
        selection?.anchorNode !== null &&
        selection?.anchorNode !== undefined &&
        editor.contains(selection.anchorNode),
      focusInEditor:
        selection?.focusNode !== null &&
        selection?.focusNode !== undefined &&
        editor.contains(selection.focusNode),
      isCollapsed: selection?.isCollapsed ?? true,
      text: selection?.toString() ?? "",
    },
    eventType: event?.type ?? "checkpoint",
    label,
    overlay: {
      cursorLineCount:
        isRecord(cursorFrame) && Array.isArray(cursorFrame.lines)
          ? cursorFrame.lines.length
          : 0,
      visualLineCount:
        isRecord(visualLayout) && Array.isArray(visualLayout.lines)
          ? visualLayout.lines.length
          : 0,
      visualLayoutOk:
        isRecord(visualLayout) && typeof visualLayout.ok === "boolean"
          ? visualLayout.ok
          : false,
    },
    target: describeEventTarget(event),
    time: Math.round(performance.now()),
  };
}

function editorElement(): HTMLElement {
  const editor = document.querySelector(".contenteditable-editor");
  if (!(editor instanceof HTMLElement)) {
    throw new Error("Missing contenteditable editor.");
  }
  return editor;
}

function stateValue(label: string): unknown {
  const blocks = Array.from(
    document.querySelectorAll(".contenteditable-state-block"),
  );
  const stateBlock = blocks.find(
    (block) => block.querySelector("h2")?.textContent === label,
  );
  return JSON.parse(stateBlock?.querySelector("pre")?.textContent ?? "null");
}

function describeEventTarget(event: Event | null): string | null {
  if (event === null) {
    return null;
  }
  const target = event.composedPath()[0] ?? event.target;
  return target instanceof Element ? describeElement(target) : null;
}

function describeElement(element: Element | null): string | null {
  if (element === null) {
    return null;
  }
  if (element.classList.contains("contenteditable-editor")) {
    return "editor";
  }
  const button = element.closest("button[aria-label]");
  if (button !== null) {
    return `toolbar:${button.getAttribute("aria-label") ?? ""}`;
  }
  const testId = element.getAttribute("data-testid");
  if (testId !== null) {
    return testId;
  }
  if (element instanceof HTMLInputElement) {
    return element.getAttribute("aria-label") ?? "input";
  }
  return element.tagName.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
