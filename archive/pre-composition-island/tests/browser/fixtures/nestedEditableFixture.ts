type NestedEditableTrace = {
  iframe: {
    iframeActiveElement: string | null;
    outerSelectionSuspended: boolean;
    parentActiveElement: string | null;
    textFlushedBeforeFocus: string;
  };
  nested: {
    arrowTrace: {
      afterLeftText: string;
      afterRightText: string;
      beforeText: string;
      selectionModifySupported: boolean;
    };
    innerSelectionText: string;
    outerRawEvents: string[];
    outerWouldHandle: Record<string, boolean>;
  };
};

export function runNestedEditableTrace(): NestedEditableTrace {
  const nested = runNestedEditableSelectionTrace();
  const iframe = runIframeFocusHandoffTrace();
  return { iframe, nested };
}

function runNestedEditableSelectionTrace(): NestedEditableTrace["nested"] {
  const host = document.createElement("section");
  host.dataset.testid = "nested-editable-fixture";
  document.body.append(host);
  const outer = document.createElement("div");
  outer.contentEditable = "true";
  outer.dataset.testid = "outer-editable";
  outer.append(document.createTextNode("outer "));
  const island = document.createElement("span");
  island.contentEditable = "false";
  island.dataset.testid = "outer-false-island";
  const inner = document.createElement("div");
  inner.contentEditable = "true";
  inner.dataset.testid = "inner-editable";
  inner.textContent = "inner";
  island.append(inner);
  outer.append(island);
  outer.append(document.createTextNode(" tail"));
  host.append(outer);

  const outerRawEvents: string[] = [];
  const outerWouldHandle: Record<string, boolean> = {};
  for (const eventType of ["copy", "cut", "keydown", "paste"]) {
    outer.addEventListener(eventType, (event) => {
      outerRawEvents.push(event.type);
      outerWouldHandle[event.type] = outerOwnsEvent(outer, inner, event);
    });
  }

  selectNodeText(inner.firstChild);
  inner.focus();
  for (const event of [
    new ClipboardEvent("copy", { bubbles: true, cancelable: true }),
    new ClipboardEvent("cut", { bubbles: true, cancelable: true }),
    new ClipboardEvent("paste", { bubbles: true, cancelable: true }),
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowRight",
    }),
  ]) {
    inner.dispatchEvent(event);
  }

  const arrowTrace = recordNestedArrowTrace(inner);

  return {
    arrowTrace,
    innerSelectionText: "inner",
    outerRawEvents,
    outerWouldHandle,
  };
}

function runIframeFocusHandoffTrace(): NestedEditableTrace["iframe"] {
  const outer = document.createElement("div");
  outer.contentEditable = "true";
  outer.dataset.testid = "iframe-handoff-outer";
  outer.textContent = "outer draft";
  document.body.append(outer);
  const textNode = outer.firstChild;
  if (textNode === null) {
    throw new Error("Missing outer text node.");
  }
  const selection = document.getSelection();
  const range = document.createRange();
  range.setStart(textNode, 5);
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
  outer.focus();
  textNode.textContent = "outer preedit draft";
  const textFlushedBeforeFocus = outer.textContent ?? "";

  const frame = document.createElement("iframe");
  frame.dataset.testid = "handoff-frame";
  document.body.append(frame);
  const iframeDocument = frame.contentDocument;
  if (iframeDocument === null) {
    throw new Error("Missing iframe document.");
  }
  iframeDocument.open();
  iframeDocument.write("<!doctype html><html><body></body></html>");
  iframeDocument.close();
  const inner = iframeDocument.createElement("div");
  inner.contentEditable = "true";
  inner.dataset.testid = "iframe-inner-editable";
  inner.textContent = "iframe inner";
  iframeDocument.body.append(inner);
  inner.focus();

  return {
    iframeActiveElement:
      iframeDocument.activeElement?.getAttribute("data-testid") ?? null,
    outerSelectionSuspended: document.activeElement === frame,
    parentActiveElement:
      document.activeElement?.getAttribute("data-testid") ??
      document.activeElement?.tagName ??
      null,
    textFlushedBeforeFocus,
  };
}

function outerOwnsEvent(
  outer: HTMLElement,
  inner: HTMLElement,
  event: Event,
): boolean {
  const target = event.composedPath()[0] ?? event.target;
  return (
    target instanceof Node &&
    outer.contains(target) &&
    !inner.contains(target) &&
    document.activeElement === outer
  );
}

function recordNestedArrowTrace(
  inner: HTMLElement,
): NestedEditableTrace["nested"]["arrowTrace"] {
  selectNodeText(inner.firstChild);
  const selection = document.getSelection();
  if (selection === null || typeof selection.modify !== "function") {
    return {
      afterLeftText: "",
      afterRightText: "",
      beforeText: document.getSelection()?.toString() ?? "",
      selectionModifySupported: false,
    };
  }
  const beforeText = selection.toString();
  selection.modify("move", "left", "character");
  const afterLeftText = selection.toString();
  selectNodeText(inner.firstChild);
  selection.modify("move", "right", "character");
  return {
    afterLeftText,
    afterRightText: selection.toString(),
    beforeText,
    selectionModifySupported: true,
  };
}

function selectNodeText(node: ChildNode | null) {
  if (node === null) {
    throw new Error("Missing text node.");
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
