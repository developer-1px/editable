import { createJSONDocument, type SelectionSnap } from "@interactive-os/json-document";
import {
  createRichBlock,
  createRichDocument,
  EDITABLE_TEXT_ATTRIBUTE,
  type EditIntent,
  type RichDocument,
} from "../../../packages/editable";
import {
  createEditableHost,
  createVisualLayoutStore,
  measureVisualLayout,
  type EditableUpdate,
} from "../../../packages/editable/dom";
import { RichDocumentSchema } from "../../../packages/editable/schema";

type RootKind = "iframe" | "portal" | "shadow";

type FixtureTrace = {
  activeElement: {
    documentActiveElement: string | null;
    shadowActiveElement: string | null;
  };
  clipboard: {
    copiedText: string;
    cutText: string;
    ownerDocumentMatched: boolean;
    ownerWindowMatched: boolean;
    parentSelectionText: string;
  };
  composition: {
    afterCommit: string;
    ownerDocumentMatched: boolean;
  };
  geometry: {
    lineCount: number;
    overlayOwnerDocumentMatched: boolean;
    rootOwnerDocumentMatched: boolean;
  };
  rootKind: RootKind;
  selection: {
    afterArrowRight: SelectionSnap | null;
    afterShiftArrowRight: SelectionSnap | null;
    sourceDocumentMatched: boolean;
    text: string;
  };
  textAfterDrop: string;
  textAfterPaste: string;
};

type MountedFixture = {
  copySelectedRange(start: number, end: number): string;
  currentSelection(): SelectionSnap | null;
  cutSelectedRange(start: number, end: number): string;
  dispatchKey(key: string, options?: KeyboardEventInit): EditableUpdate | undefined;
  dispatchModelIntent(intent: EditIntent): EditableUpdate;
  modelText(): string;
  pasteTextAt(offset: number, text: string): EditableUpdate;
  recordGeometry(): FixtureTrace["geometry"];
  recordOwnerDocumentClipboard(text: string): FixtureTrace["clipboard"];
  recordComposition(): FixtureTrace["composition"];
  root: HTMLElement;
  rootKind: RootKind;
  selectRange(start: number, end: number): SelectionSnap | null;
  selectionSourceDocumentMatched(): boolean;
  selectionText(): string;
  traceActiveElement(): FixtureTrace["activeElement"];
};

export function runIframeCrossRootTrace(): FixtureTrace {
  installParentSelection();

  const iframe = document.createElement("iframe");
  iframe.dataset.testid = "cross-root-iframe";
  document.body.append(iframe);
  const iframeDocument = iframe.contentDocument;
  if (iframeDocument === null) {
    throw new Error("Same-origin iframe document was unavailable.");
  }
  iframeDocument.open();
  iframeDocument.write("<!doctype html><html><body></body></html>");
  iframeDocument.close();

  const fixture = mountFixture(iframeDocument.body, "iframe");
  return runCrossRootTrace(fixture);
}

export function runShadowCrossRootTrace(): FixtureTrace {
  const host = document.createElement("section");
  host.dataset.testid = "cross-root-shadow-host";
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const fixture = mountFixture(shadow, "shadow");
  return runCrossRootTrace(fixture);
}

export function runPortalDocumentTrace(): FixtureTrace {
  installParentSelection();

  const frame = document.createElement("iframe");
  frame.dataset.testid = "cross-root-portal-frame";
  document.body.append(frame);
  const portalDocument = frame.contentDocument;
  if (portalDocument === null) {
    throw new Error("Portal iframe document was unavailable.");
  }
  portalDocument.open();
  portalDocument.write("<!doctype html><html><body></body></html>");
  portalDocument.close();
  const portalRoot = portalDocument.createElement("main");
  portalDocument.body.append(portalRoot);
  const fixture = mountFixture(portalRoot, "portal");
  return runCrossRootTrace(fixture);
}

function runCrossRootTrace(fixture: MountedFixture): FixtureTrace {
  fixture.root.focus();
  fixture.selectRange(0, 0);
  fixture.dispatchKey("ArrowRight");
  const afterArrowRight = fixture.currentSelection();
  fixture.dispatchKey("ArrowRight", { shiftKey: true });
  const afterShiftArrowRight = fixture.currentSelection();
  const selected = fixture.selectRange(0, 5);
  const selectionText = fixture.selectionText();
  const clipboard = fixture.recordOwnerDocumentClipboard("Plain");
  const cutText = fixture.cutSelectedRange(0, 5);
  fixture.pasteTextAt(0, "Paste ");
  const textAfterPaste = fixture.modelText();
  fixture.dispatchModelIntent({ type: "insertFromDrop", data: "Drop " });
  const textAfterDrop = fixture.modelText();
  const composition = fixture.recordComposition();
  const geometry = fixture.recordGeometry();

  return {
    activeElement: fixture.traceActiveElement(),
    clipboard: {
      ...clipboard,
      cutText,
    },
    composition,
    geometry,
    rootKind: fixture.rootKind,
    selection: {
      afterArrowRight,
      afterShiftArrowRight,
      sourceDocumentMatched: fixture.selectionSourceDocumentMatched(),
      text: selected === null ? "" : selectionText,
    },
    textAfterDrop,
    textAfterPaste,
  };
}

function installParentSelection() {
  const parentSelection = document.createElement("span");
  parentSelection.textContent = "parent selection";
  document.body.append(parentSelection);
  const parentRange = document.createRange();
  parentRange.selectNodeContents(parentSelection);
  document.getSelection()?.removeAllRanges();
  document.getSelection()?.addRange(parentRange);
}

function mountFixture(target: HTMLElement | ShadowRoot, rootKind: RootKind): MountedFixture {
  const ownerDocument = target.ownerDocument;
  const value = createRichDocument({
    id: `${rootKind}-document`,
    blocks: [createRichBlock({ id: "block", text: "Plain text" })],
  });
  const documentModel = createJSONDocument(RichDocumentSchema, value, {
    history: 20,
    selection: true,
    trustedInitial: true,
  });
  const visualLayout = createVisualLayoutStore();
  const root = ownerDocument.createElement("div");
  root.contentEditable = "plaintext-only";
  root.dataset.testid = `${rootKind}-editable`;
  root.style.font = "16px/24px sans-serif";
  root.style.whiteSpace = "pre-wrap";
  root.style.width = "240px";
  target.append(root);

  const host = createEditableHost({
    root,
    document: documentModel,
    visualLayout: visualLayout.read,
  });

  const render = () => {
    root.replaceChildren();
    const textSurface = ownerDocument.createElement("span");
    textSurface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, "/blocks/0/text");
    textSurface.textContent = currentText(documentModel.value);
    root.append(textSurface);
    visualLayout.write(measureVisualLayout({ root }));
    host.restoreSelectionToDOM();
  };
  const apply = (update: EditableUpdate | undefined) => {
    if (update !== undefined && update.ok && "render" in update && update.render) {
      render();
    }
  };
  render();

  const selectRange = (start: number, end: number): SelectionSnap | null => {
    const textNode = textNodeFor(root);
    const range = ownerDocument.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const selection = rootSelection(root);
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.focus();
    return host.syncSelectionFromDOM();
  };
  const clipboardText = (type: "copy" | "cut"): string => {
    const clipboard = createClipboardProbe(ownerDocument, type);
    const update = type === "copy" ? host.copy(clipboard.event) : host.cut(clipboard.event);
    apply(update);
    return clipboard.data.getData("text/plain");
  };

  return {
    copySelectedRange(start, end) {
      selectRange(start, end);
      return clipboardText("copy");
    },
    cutSelectedRange(start, end) {
      selectRange(start, end);
      return clipboardText("cut");
    },
    currentSelection: () => documentModel.selection?.snapshot() ?? null,
    dispatchKey(key, options = {}) {
      const event = new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key,
        ...options,
      });
      const update = host.handle(event);
      if (!event.defaultPrevented) {
        applyNativeHorizontalKey(root, key, options);
        host.syncSelectionFromDOM();
      }
      apply(update);
      return update;
    },
    dispatchModelIntent(intent) {
      const update = host.dispatch(intent);
      apply(update);
      return update;
    },
    modelText() {
      return currentText(documentModel.value);
    },
    pasteTextAt(offset, text) {
      selectRange(offset, offset);
      const clipboard = createClipboardProbe(ownerDocument, "paste");
      clipboard.data.setData("text/plain", text);
      const update = host.paste(clipboard.event);
      apply(update);
      return update;
    },
    recordComposition() {
      selectRange(0, 0);
      host.handle(new CompositionEvent("compositionstart", { bubbles: true }));
      const textNode = textNodeFor(root);
      textNode.textContent = `가${textNode.textContent ?? ""}`;
      const range = ownerDocument.createRange();
      range.setStart(textNode, 1);
      range.collapse(true);
      rootSelection(root)?.removeAllRanges();
      rootSelection(root)?.addRange(range);
      host.handle(
        new InputEvent("input", {
          bubbles: true,
          data: "가",
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );
      host.handle(new CompositionEvent("compositionend", { bubbles: true, data: "가" }));
      const update = host.handle(
        new InputEvent("input", {
          bubbles: true,
          data: "가",
          inputType: "insertFromComposition",
        }),
      );
      apply(update);
      return {
        afterCommit: currentText(documentModel.value),
        ownerDocumentMatched: root.ownerDocument === ownerDocument,
      };
    },
    recordGeometry() {
      visualLayout.write(measureVisualLayout({ root }));
      const overlay = ownerDocument.createElement("div");
      overlay.dataset.testid = `${rootKind}-overlay`;
      ownerDocument.body.append(overlay);
      const layout = visualLayout.read();
      return {
        lineCount: layout.layout?.lines.length ?? 0,
        overlayOwnerDocumentMatched: overlay.ownerDocument === ownerDocument,
        rootOwnerDocumentMatched: root.ownerDocument === ownerDocument,
      };
    },
    recordOwnerDocumentClipboard(expectedText) {
      selectRange(0, expectedText.length);
      const clipboard = createClipboardProbe(ownerDocument, "copy");
      apply(host.copy(clipboard.event));
      return {
        copiedText: clipboard.data.getData("text/plain"),
        cutText: "",
        ownerDocumentMatched: clipboard.ownerDocument === root.ownerDocument,
        ownerWindowMatched: clipboard.ownerWindow === root.ownerDocument.defaultView,
        parentSelectionText: document.getSelection()?.toString() ?? "",
      };
    },
    root,
    rootKind,
    selectRange,
    selectionSourceDocumentMatched() {
      return rootSelection(root)?.anchorNode?.ownerDocument === root.ownerDocument;
    },
    selectionText() {
      return rootSelection(root)?.toString() ?? "";
    },
    traceActiveElement() {
      const shadowRoot = root.getRootNode();
      return {
        documentActiveElement:
          ownerDocument.activeElement?.getAttribute("data-testid") ??
          ownerDocument.activeElement?.tagName ??
          null,
        shadowActiveElement:
          shadowRoot instanceof ShadowRoot
            ? shadowRoot.activeElement?.getAttribute("data-testid") ??
              shadowRoot.activeElement?.tagName ??
              null
            : null,
      };
    },
  } satisfies MountedFixture;
}

function currentText(document: RichDocument): string {
  return document.blocks[0]?.text ?? "";
}

function textNodeFor(root: HTMLElement): Text {
  const textSurface = root.querySelector(`[${EDITABLE_TEXT_ATTRIBUTE}]`);
  const textNode = textSurface?.firstChild;
  if (textNode?.nodeType !== Node.TEXT_NODE) {
    throw new Error("Missing editable text node.");
  }
  return textNode as Text;
}

function applyNativeHorizontalKey(
  root: HTMLElement,
  key: string,
  options: KeyboardEventInit,
) {
  if (key !== "ArrowRight" && key !== "ArrowLeft") {
    return;
  }
  const selection = rootSelection(root);
  if (selection === null || typeof selection.modify !== "function") {
    return;
  }
  selection.modify(
    options.shiftKey === true ? "extend" : "move",
    key === "ArrowRight" ? "forward" : "backward",
    "character",
  );
}

function rootSelection(root: HTMLElement): Selection | null {
  const rootNode = root.getRootNode();
  if (hasGetSelection(rootNode)) {
    return rootNode.getSelection() ?? root.ownerDocument.getSelection();
  }
  return root.ownerDocument.getSelection();
}

function hasGetSelection(
  rootNode: Node,
): rootNode is Node & { getSelection(): Selection | null } {
  return typeof (rootNode as { getSelection?: unknown }).getSelection === "function";
}

function createClipboardProbe(
  ownerDocument: Document,
  type: "copy" | "cut" | "paste",
): {
  data: DataTransfer;
  event: ClipboardEvent;
  ownerDocument: Document;
  ownerWindow: Window | null;
} {
  const data = createClipboardData(ownerDocument);
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", {
    configurable: true,
    value: data,
  });
  return {
    data,
    event,
    ownerDocument,
    ownerWindow: ownerDocument.defaultView,
  };
}

function createClipboardData(ownerDocument: Document): DataTransfer {
  const DataTransferCtor = ownerDocument.defaultView?.DataTransfer;
  if (DataTransferCtor !== undefined) {
    return new DataTransferCtor();
  }

  const store = new Map<string, string>();
  return {
    clearData(format?: string) {
      if (format === undefined) {
        store.clear();
        return;
      }
      store.delete(format);
    },
    getData(format: string) {
      return store.get(format) ?? "";
    },
    setData(format: string, data: string) {
      store.set(format, data);
    },
  } as DataTransfer;
}
