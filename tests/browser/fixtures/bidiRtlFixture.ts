import { createJSONDocument, type SelectionSnap } from "@interactive-os/json-document";
import {
  ATOM_REPLACEMENT,
  createRichBlock,
  createRichDocument,
  EDITABLE_ATOM_ATTRIBUTE,
  EDITABLE_ATOM_TYPE_ATTRIBUTE,
  EDITABLE_MARK_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  type RichDocument,
} from "../../../packages/editable";
import {
  createEditableHost,
  createVisualLayoutStore,
  measureVisualLayout,
  type VisualCaret,
} from "../../../packages/editable/dom";
import { RichDocumentSchema } from "../../../packages/editable/schema";

type BidiRtlTrace = {
  geometry: {
    carets: Array<{
      bottom: number;
      offset: number;
      top: number;
      x: number;
    }>;
    lineCount: number;
  };
  logicalBackwardOffsets: number[];
  logicalForwardOffsets: number[];
  nativeVisualMovement: {
    leftOffset: number | null;
    rightOffset: number | null;
    supported: boolean;
  };
  policy: {
    geometry: "dom-rect-trace-only";
    horizontalArrow: "browser-native-visual-sync";
    modelMovement: "logical-forward-backward";
  };
  text: string;
};

type SelectionDocument = {
  selection?: {
    snapshot(): SelectionSnap | null;
  };
};

const RTL_TEXT = `שלום abc ${ATOM_REPLACEMENT} مرحبا xyz`;
const ATOM_OFFSET = "שלום abc ".length;
const TEXT_PATH = "/blocks/0/text";

export function runBidiRtlTrace(): BidiRtlTrace {
  const target = document.createElement("section");
  target.dataset.testid = "bidi-rtl-fixture";
  document.body.append(target);
  const documentModel = createJSONDocument(RichDocumentSchema, bidiDocument(), {
    history: 20,
    selection: true,
    trustedInitial: true,
  });
  const visualLayout = createVisualLayoutStore();
  const root = document.createElement("div");
  root.contentEditable = "plaintext-only";
  root.dir = "rtl";
  root.style.font = "18px/28px sans-serif";
  root.style.whiteSpace = "pre-wrap";
  root.style.width = "190px";
  target.append(root);

  const host = createEditableHost({
    root,
    document: documentModel,
    visualLayout: visualLayout.read,
  });
  renderBidiSurface(root);
  visualLayout.write(measureVisualLayout({ root }));

  const logicalForwardOffsets = recordLogicalOffsets(host, documentModel, 0, [
    "forward",
    "forward",
    "forward",
  ]);
  const logicalBackwardOffsets = recordLogicalOffsets(host, documentModel, 3, [
    "backward",
    "backward",
    "backward",
  ]);
  const nativeVisualMovement = recordNativeVisualMovement(host);
  visualLayout.write(measureVisualLayout({ root }));
  const geometry = visualLayout.read().layout;

  return {
    geometry: {
      carets: [0, 5, ATOM_OFFSET, ATOM_OFFSET + 1, RTL_TEXT.length]
        .map((offset) => caretForOffset(geometry?.lines.flatMap((line) => line.carets) ?? [], offset))
        .filter((caret): caret is VisualCaret => caret !== null)
        .map((caret) => ({
          bottom: caret.bottom,
          offset: caret.offset,
          top: caret.top,
          x: caret.x,
        })),
      lineCount: geometry?.lines.length ?? 0,
    },
    logicalBackwardOffsets,
    logicalForwardOffsets,
    nativeVisualMovement,
    policy: {
      geometry: "dom-rect-trace-only",
      horizontalArrow: "browser-native-visual-sync",
      modelMovement: "logical-forward-backward",
    },
    text: RTL_TEXT,
  };
}

function bidiDocument(): RichDocument {
  return createRichDocument({
    id: "bidi-rtl",
    blocks: [
      createRichBlock({
        id: "rtl-block",
        text: RTL_TEXT,
      }),
    ],
  });
}

function renderBidiSurface(root: HTMLElement) {
  root.replaceChildren();
  const surface = document.createElement("span");
  surface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, TEXT_PATH);
  surface.append(document.createTextNode("שלום "));
  const mark = document.createElement("strong");
  mark.setAttribute(EDITABLE_MARK_ATTRIBUTE, "bold");
  mark.textContent = "abc";
  surface.append(mark);
  surface.append(document.createTextNode(" "));
  const atom = document.createElement("span");
  atom.contentEditable = "false";
  atom.setAttribute(EDITABLE_ATOM_ATTRIBUTE, "inline-chip");
  atom.setAttribute(EDITABLE_ATOM_TYPE_ATTRIBUTE, "mention");
  atom.textContent = "@A";
  surface.append(atom);
  surface.append(document.createTextNode(" مرحبا xyz"));
  root.append(surface);
}

function recordLogicalOffsets(
  host: ReturnType<typeof createEditableHost>,
  documentModel: SelectionDocument,
  startOffset: number,
  directions: Array<"backward" | "forward">,
): number[] {
  host.dispatch({
    type: "setBaseAndExtent",
    anchor: { path: TEXT_PATH, offset: startOffset },
    focus: { path: TEXT_PATH, offset: startOffset },
  });
  const offsets = [selectionOffset(documentModel.selection?.snapshot() ?? null)];
  for (const direction of directions) {
    host.dispatch({
      type: "modifySelection",
      alter: "move",
      direction,
      granularity: "character",
    });
    offsets.push(selectionOffset(documentModel.selection?.snapshot() ?? null));
  }
  return offsets;
}

function recordNativeVisualMovement(
  host: ReturnType<typeof createEditableHost>,
): BidiRtlTrace["nativeVisualMovement"] {
  host.dispatch({
    type: "setBaseAndExtent",
    anchor: { path: TEXT_PATH, offset: 5 },
    focus: { path: TEXT_PATH, offset: 5 },
  });
  host.restoreSelectionToDOM();
  const selection = document.getSelection();
  if (selection === null || typeof selection.modify !== "function") {
    return { leftOffset: null, rightOffset: null, supported: false };
  }
  selection.modify("move", "left", "character");
  host.syncSelectionFromDOM();
  const leftOffset = selectionOffsetAfterSync(host);
  host.dispatch({
    type: "setBaseAndExtent",
    anchor: { path: TEXT_PATH, offset: 5 },
    focus: { path: TEXT_PATH, offset: 5 },
  });
  host.restoreSelectionToDOM();
  selection.modify("move", "right", "character");
  host.syncSelectionFromDOM();
  return {
    leftOffset,
    rightOffset: selectionOffsetAfterSync(host),
    supported: true,
  };
}

function selectionOffsetAfterSync(
  host: ReturnType<typeof createEditableHost>,
): number | null {
  return selectionOffset(host.syncSelectionFromDOM());
}

function selectionOffset(selection: SelectionSnap | null): number {
  const focus = selection?.focus;
  return typeof focus === "object" &&
    focus !== null &&
    "offset" in focus &&
    typeof focus.offset === "number"
    ? focus.offset
    : -1;
}

function caretForOffset(
  carets: ReadonlyArray<VisualCaret>,
  offset: number,
): VisualCaret | null {
  return carets.find((caret) => caret.offset === offset) ?? null;
}
