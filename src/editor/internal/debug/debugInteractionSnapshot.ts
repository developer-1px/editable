import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import { type NoteDocument, readBlockText } from "../model/noteDocument";
import {
  collapseWhitespace,
  cssIdentifier,
  safeStringify,
  stripTags,
  truncate,
} from "./debugInteractionFormat";
import type {
  LatestSnapshot,
  SerializedStateSummary,
  SerializedTarget,
} from "./debugInteractionTypes";

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
      document: summarizeDocument(note),
      dom: summarizeDom(dom),
      selection: summarizeSelection(selection),
    },
  };
}

export function serializeTarget(
  target: EventTarget | null,
): SerializedTarget | null {
  if (
    target === null ||
    typeof Node === "undefined" ||
    !(target instanceof Node)
  ) {
    return null;
  }

  const element =
    target instanceof Element
      ? target
      : (target.parentElement ?? target.parentNode?.parentElement ?? null);

  if (element === null) {
    return {
      nodeName: target.nodeName,
    };
  }

  const className =
    typeof element.className === "string" && element.className.length > 0
      ? element.className
      : undefined;
  const text = collapseWhitespace(element.textContent ?? "");

  return {
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    className,
    dataPath: element.getAttribute("data-path") ?? undefined,
    id: element.id.length > 0 ? element.id : undefined,
    nodeName: target.nodeName,
    path: elementPath(element),
    role: element.getAttribute("role") ?? undefined,
    tagName: element.tagName.toLowerCase(),
    text: text.length > 0 ? truncate(text, 180) : undefined,
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

function elementPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current !== null && parts.length < 8) {
    parts.unshift(elementPathSegment(current));
    if (current.id.length > 0) {
      break;
    }
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function elementPathSegment(element: Element): string {
  const dataPath = element.getAttribute("data-path");
  if (dataPath !== null) {
    return `${element.tagName.toLowerCase()}[data-path="${dataPath}"]`;
  }

  let segment = element.tagName.toLowerCase();
  if (element.id.length > 0) {
    return `${segment}#${cssIdentifier(element.id)}`;
  }

  const className =
    typeof element.className === "string" ? element.className.trim() : "";
  const firstClassName = className.split(/\s+/).find(Boolean);
  if (firstClassName !== undefined) {
    segment = `${segment}.${cssIdentifier(firstClassName)}`;
  }

  const parent = element.parentElement;
  if (parent !== null) {
    const sameTagSiblings = Array.from(parent.children).filter(
      (sibling) => sibling.tagName === element.tagName,
    );
    if (sameTagSiblings.length > 1) {
      segment = `${segment}:nth-of-type(${
        sameTagSiblings.indexOf(element) + 1
      })`;
    }
  }

  return segment;
}
