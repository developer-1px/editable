import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import { type NoteDocument, readBlockText } from "../../model/noteDocument";
import {
  collapseWhitespace,
  roundMs,
  safeStringify,
  stripTags,
  truncate,
} from "./debugInteractionFormat";
import { serializeTarget } from "./debugInteractionTarget";
import type {
  LatestSnapshot,
  SerializedStateSummary,
  SerializedTarget,
  SerializedViewportSummary,
} from "./debugInteractionTypes";
import {
  formatDocumentSurfaceIssue,
  inspectDocumentSurfaceIntegrity,
} from "./documentSurfaceIntegrity";

export function readSnapshot({
  note,
  rootElement,
  selection,
}: LatestSnapshot): {
  activeElement: SerializedTarget | null;
  dom: string | null;
  json: string;
  summary: SerializedStateSummary;
} {
  const dom = rootElement === null ? null : serializeDom(rootElement);

  return {
    activeElement: serializeTarget(
      rootElement?.ownerDocument.activeElement ?? null,
    ),
    dom,
    json: safeStringify({
      document: note,
      selection: selection ?? null,
    }),
    summary: {
      document: summarizeDocument(note, rootElement),
      dom: summarizeDom(dom),
      selection: summarizeSelection(selection),
      viewport: summarizeViewport(rootElement, selection),
    },
  };
}

function serializeDom(rootElement: HTMLElement): string {
  const clone = rootElement.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return rootElement.outerHTML;
  }

  syncFormControlValues(rootElement, clone);

  return clone.outerHTML;
}

function syncFormControlValues(sourceRoot: Element, cloneRoot: Element) {
  const sourceControls = sourceRoot.querySelectorAll("input, select, textarea");
  const cloneControls = cloneRoot.querySelectorAll("input, select, textarea");
  const defaultView = sourceRoot.ownerDocument.defaultView;

  if (defaultView === null) {
    return;
  }

  sourceControls.forEach((sourceControl, index) => {
    const cloneControl = cloneControls[index];
    if (cloneControl === undefined) {
      return;
    }

    if (
      sourceControl instanceof defaultView.HTMLInputElement &&
      cloneControl instanceof defaultView.HTMLInputElement
    ) {
      cloneControl.setAttribute("value", sourceControl.value);
      if (sourceControl.checked) {
        cloneControl.setAttribute("checked", "");
      } else {
        cloneControl.removeAttribute("checked");
      }
      return;
    }

    if (
      sourceControl instanceof defaultView.HTMLTextAreaElement &&
      cloneControl instanceof defaultView.HTMLTextAreaElement
    ) {
      cloneControl.textContent = sourceControl.value;
      return;
    }

    if (
      sourceControl instanceof defaultView.HTMLSelectElement &&
      cloneControl instanceof defaultView.HTMLSelectElement
    ) {
      Array.from(cloneControl.options).forEach((option, optionIndex) => {
        if (sourceControl.options[optionIndex]?.selected) {
          option.setAttribute("selected", "");
        } else {
          option.removeAttribute("selected");
        }
      });
    }
  });
}

function summarizeDocument(
  note: NoteDocument,
  rootElement: HTMLElement | null,
): SerializedStateSummary["document"] {
  const blockIds = note.root.children.map((block) => block.id);
  const blocks = note.root.children.map(
    (block, index) =>
      `${index}:${block.id}:${block.type}:${truncate(readBlockText(block), 48)}`,
  );
  const text = note.root.children.map(readBlockText).join("\n");

  return {
    blockCount: note.root.children.length,
    blockIds,
    blocks,
    duplicateBlockIds: duplicateValues(blockIds),
    surfaceIssues: inspectDocumentSurfaceIntegrity(rootElement, note).map(
      formatDocumentSurfaceIssue,
    ),
    text: truncate(text, 500),
    title: note.title,
  };
}

function summarizeDom(dom: string | null): SerializedStateSummary["dom"] {
  if (dom === null) {
    return null;
  }

  return {
    length: dom.length,
    text: truncate(collapseWhitespace(stripTags(dom)), 500),
  };
}

function summarizeSelection(
  selection: SelectionSnap | undefined,
): string | null {
  if (selection === undefined) {
    return null;
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  const selected =
    selection.selectedPointers.length === 0
      ? ""
      : ` selected=${selection.selectedPointers.join(",")}`;
  if (range === undefined) {
    const focus = formatSelectionPoint(selection.focus);
    return focus === null ? null : `${focus}${selected}`;
  }

  const anchor = formatSelectionPoint(range.anchor);
  const focus = formatSelectionPoint(range.focus);
  if (anchor === null || focus === null) {
    return null;
  }

  if (selectionPointsEqual(range.anchor, range.focus)) {
    return `${focus}${selected}`;
  }

  return `${anchor} -> ${focus}${selected}`;
}

function formatSelectionPoint(point: SelectionPoint | null | undefined) {
  if (point === undefined || point === null) {
    return null;
  }

  if (typeof point === "string") {
    return point;
  }

  if (point.offset !== undefined) {
    return `${point.path}@${point.offset}`;
  }

  if (point.edge !== undefined) {
    return `${point.path}:${point.edge}`;
  }

  return point.path;
}

function selectionPointsEqual(left: SelectionPoint, right: SelectionPoint) {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }

  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}

function summarizeViewport(
  rootElement: HTMLElement | null,
  selection: SelectionSnap | undefined,
): SerializedStateSummary["viewport"] {
  const view = rootElement?.ownerDocument.defaultView ?? null;
  if (view === null) {
    return null;
  }

  const visualViewport = view.visualViewport;

  return {
    layout: {
      height: finiteNumber(view.innerHeight),
      scrollX: finiteNumber(view.scrollX),
      scrollY: finiteNumber(view.scrollY),
      width: finiteNumber(view.innerWidth),
    },
    selectionRect: summarizeSelectionRect(rootElement, selection),
    visual:
      visualViewport == null
        ? null
        : {
            height: finiteNumber(visualViewport.height),
            offsetLeft: finiteNumber(visualViewport.offsetLeft),
            offsetTop: finiteNumber(visualViewport.offsetTop),
            scale: finiteNumber(visualViewport.scale),
            width: finiteNumber(visualViewport.width),
          },
  };
}

function summarizeSelectionRect(
  rootElement: HTMLElement | null,
  selection: SelectionSnap | undefined,
): SerializedViewportSummary["selectionRect"] {
  const path = selectionFocusPath(selection);
  if (rootElement === null || path === null) {
    return null;
  }

  const element = findElementByDataPath(rootElement, path);
  if (element === null) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  return {
    bottom: roundMs(rect.bottom),
    height: roundMs(rect.height),
    left: roundMs(rect.left),
    path,
    right: roundMs(rect.right),
    top: roundMs(rect.top),
    width: roundMs(rect.width),
  };
}

function selectionFocusPath(selection: SelectionSnap | undefined) {
  const focus = selection?.focus;
  if (focus === undefined || focus === null || typeof focus === "string") {
    return null;
  }

  return focus.path;
}

function findElementByDataPath(rootElement: HTMLElement, path: string) {
  for (const element of Array.from(
    rootElement.querySelectorAll("[data-path]"),
  )) {
    if (element.getAttribute("data-path") === path) {
      return element;
    }
  }

  return null;
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? roundMs(value) : 0;
}

function duplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicates];
}
