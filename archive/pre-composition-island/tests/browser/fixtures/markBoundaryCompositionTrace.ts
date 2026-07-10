type MarkBoundaryScenario = {
  boundary: "end" | "inside" | "range" | "start";
  data: string;
  endOffset?: number;
  followWithEnter?: boolean;
  mark: "bold" | "code" | "italic" | "link";
  name: string;
  offset: number;
};

type MarkBoundaryTraceEntry = {
  canonicalSelection: unknown;
  documentText: string;
  eventType: string;
  nativeSelection: {
    anchorInSurface: boolean;
    focusInSurface: boolean;
    isCollapsed: boolean;
    text: string;
  };
  phase: string;
  target: string | null;
};

type MarkBoundaryCompositionTrace = {
  boundary: MarkBoundaryScenario["boundary"];
  data: string;
  documentText: string;
  eventOrder: string[];
  finalCanonicalSelection: unknown;
  finalNativeSelection: MarkBoundaryTraceEntry["nativeSelection"];
  mark: MarkBoundaryScenario["mark"];
  name: string;
  trace: MarkBoundaryTraceEntry[];
};

const MARK_TEXT_PATH = "/blocks/2/text";

const scenarios: MarkBoundaryScenario[] = [
  { boundary: "start", data: "가", mark: "bold", name: "bold-start-ko", offset: 15 },
  { boundary: "end", data: "あ", mark: "bold", name: "bold-end-ja", offset: 19 },
  { boundary: "start", data: "你", mark: "italic", name: "italic-start-zh", offset: 21 },
  { boundary: "end", data: "나", mark: "code", name: "code-end-ko", offset: 44 },
  { boundary: "start", data: "い", mark: "link", name: "link-start-ja", offset: 61 },
  { boundary: "inside", data: "한", mark: "bold", name: "bold-active-caret-ko", offset: 17 },
  {
    boundary: "range",
    data: "중",
    endOffset: 20,
    mark: "bold",
    name: "bold-boundary-range-ko",
    offset: 14,
  },
  {
    boundary: "start",
    data: "글 ",
    mark: "code",
    name: "code-start-ko-space-commit",
    offset: 40,
  },
  {
    boundary: "end",
    data: "끝",
    followWithEnter: true,
    mark: "italic",
    name: "italic-end-ko-enter-after-commit",
    offset: 27,
  },
];

export async function runMarkBoundaryCompositionTrace(): Promise<
  MarkBoundaryCompositionTrace[]
> {
  const results: MarkBoundaryCompositionTrace[] = [];
  for (const scenario of scenarios) {
    await resetDemo();
    const trace: MarkBoundaryTraceEntry[] = [];
    const cleanup = installRecorder(trace);

    selectTextSurfaceRange(
      scenario.offset,
      scenario.endOffset ?? scenario.offset,
    );
    editorElement().dispatchEvent(new Event("select", { bubbles: true }));
    await nextFrame();
    trace.push(snapshot("before-composition"));

    editorElement().dispatchEvent(
      new CompositionEvent("compositionstart", {
        bubbles: true,
        data: "",
      }),
    );
    insertCompositionDOMText(
      scenario.offset,
      scenario.endOffset ?? scenario.offset,
      scenario.data,
    );
    editorElement().dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: scenario.data,
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
    trace.push(snapshot("during-composition"));

    editorElement().dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: scenario.data,
      }),
    );
    editorElement().dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: scenario.data,
        inputType: "insertFromComposition",
      }),
    );
    await nextFrame();
    trace.push(snapshot("after-composition-commit"));

    if (scenario.followWithEnter === true) {
      editorElement().dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "Enter",
        }),
      );
      await nextFrame();
      trace.push(snapshot("after-enter"));
    }

    cleanup();
    results.push({
      boundary: scenario.boundary,
      data: scenario.data,
      documentText: documentText(),
      eventOrder: trace.map((entry) => entry.eventType),
      finalCanonicalSelection: stateValue("selection"),
      finalNativeSelection: nativeSelectionSnapshot(),
      mark: scenario.mark,
      name: scenario.name,
      trace,
    });
  }
  return results;
}

function installRecorder(trace: MarkBoundaryTraceEntry[]): () => void {
  const editor = editorElement();
  const listener = (event: Event) => {
    trace.push(snapshot(`event:${event.type}`, event));
  };
  const documentEvents = ["selectionchange"];
  const editorEvents = [
    "beforeinput",
    "compositionend",
    "compositionstart",
    "input",
    "keydown",
    "select",
  ];
  for (const type of documentEvents) {
    document.addEventListener(type, listener, true);
  }
  for (const type of editorEvents) {
    editor.addEventListener(type, listener, true);
  }
  return () => {
    for (const type of documentEvents) {
      document.removeEventListener(type, listener, true);
    }
    for (const type of editorEvents) {
      editor.removeEventListener(type, listener, true);
    }
  };
}

async function resetDemo() {
  const reset = document.querySelector("button[aria-label='Reset']");
  if (!(reset instanceof HTMLElement)) {
    throw new Error("Missing reset button.");
  }
  reset.click();
  await nextFrame();
}

function selectTextSurfaceRange(start: number, end: number) {
  const surface = textSurfaceElement();
  const range = document.createRange();
  const startPosition = domPositionForOffset(surface, start);
  const endPosition = domPositionForOffset(surface, end);
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  editorElement().focus();
}

function insertCompositionDOMText(start: number, end: number, text: string) {
  const surface = textSurfaceElement();
  const range = document.createRange();
  const startPosition = domPositionForOffset(surface, start);
  const endPosition = domPositionForOffset(surface, end);
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  const caret = document.createRange();
  caret.setStart(textNode, text.length);
  caret.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(caret);
}

function domPositionForOffset(
  surface: HTMLElement,
  offset: number,
): { node: Node; offset: number } {
  let remaining = offset;
  const visit = (node: Node): { node: Node; offset: number } | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      const length = node.textContent?.length ?? 0;
      if (remaining <= length) {
        return { node, offset: remaining };
      }
      remaining -= length;
      return null;
    }
    if (
      node instanceof HTMLElement &&
      node.hasAttribute("data-editable-atom")
    ) {
      const index = node.parentElement === null
        ? 0
        : Array.from(node.parentElement.childNodes).indexOf(node);
      if (remaining <= 0) {
        return { node: node.parentElement ?? surface, offset: index };
      }
      if (remaining <= 1) {
        return { node: node.parentElement ?? surface, offset: index + 1 };
      }
      remaining -= 1;
      return null;
    }
    for (const child of Array.from(node.childNodes)) {
      const found = visit(child);
      if (found !== null) {
        return found;
      }
    }
    return null;
  };

  return visit(surface) ?? { node: surface, offset: surface.childNodes.length };
}

function snapshot(
  phase: string,
  event: Event | null = null,
): MarkBoundaryTraceEntry {
  return {
    canonicalSelection: stateValue("selection"),
    documentText: documentText(),
    eventType: event?.type ?? "checkpoint",
    nativeSelection: nativeSelectionSnapshot(),
    phase,
    target: eventTargetName(event),
  };
}

function nativeSelectionSnapshot(): MarkBoundaryTraceEntry["nativeSelection"] {
  const selection = document.getSelection();
  const surface = textSurfaceElement();
  return {
    anchorInSurface:
      selection?.anchorNode !== null &&
      selection?.anchorNode !== undefined &&
      surface.contains(selection.anchorNode),
    focusInSurface:
      selection?.focusNode !== null &&
      selection?.focusNode !== undefined &&
      surface.contains(selection.focusNode),
    isCollapsed: selection?.isCollapsed ?? true,
    text: selection?.toString() ?? "",
  };
}

function eventTargetName(event: Event | null): string | null {
  if (event === null) {
    return null;
  }
  const target = event.composedPath()[0] ?? event.target;
  if (!(target instanceof Element)) {
    return null;
  }
  if (target.classList.contains("contenteditable-editor")) {
    return "editor";
  }
  const path = target.closest("[data-editable-text]")?.getAttribute(
    "data-editable-text",
  );
  return path ?? target.tagName.toLowerCase();
}

function editorElement(): HTMLElement {
  const editor = document.querySelector(".contenteditable-editor");
  if (!(editor instanceof HTMLElement)) {
    throw new Error("Missing contenteditable editor.");
  }
  return editor;
}

function textSurfaceElement(): HTMLElement {
  const surface = document.querySelector(
    `[data-editable-text="${MARK_TEXT_PATH}"]`,
  );
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Missing marked text surface.");
  }
  return surface;
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

function documentText(): string {
  const value = stateValue("value");
  return isRecord(value) && Array.isArray(value.blocks)
    ? String(value.blocks[2]?.text ?? "")
    : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function nextFrame() {
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}
