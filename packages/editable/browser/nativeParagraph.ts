import {
  applyTextChange,
  clampTextRange,
  diffTextNearRange,
  type EditableDocumentValue,
  type TextChange,
  type TextRange,
} from "../core";
import {
  EDITABLE_PLACEHOLDER_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
} from "./editableDOM";
import {
  isCanonicalBlockElement,
  isCanonicalSurfaceElement,
} from "./documentProjection";

export type NativeParagraphEffect = {
  text: string;
  splitOffset: number;
  change: TextChange | null;
};

export type NativeParagraphIntentFacts = {
  compositionId: number;
  blockId: string;
  sourceElement: HTMLElement;
  sourceSurface: HTMLElement;
  sourceText: Text;
  sourcePlaceholder: HTMLBRElement | null;
  blockElements: ReadonlyArray<HTMLElement>;
  splitOffset: number;
  canonicalText: string;
  nativeRecords: ReadonlyArray<MutationRecord>;
};

export type NativeParagraphSessionFacts = {
  id: number;
  blockId: string;
  range: TextRange;
};

type InspectNativeParagraphEffectOptions = {
  root: HTMLElement;
  value: EditableDocumentValue;
  intent: NativeParagraphIntentFacts;
  session: NativeParagraphSessionFacts;
  isCompositionPinIntact: (surface: HTMLElement) => boolean;
};

/**
 * Captures the identity of the editor-owned placeholder next to a pinned Text
 * node. A later native paragraph inspection accepts this exact node, not merely
 * another element carrying the same attribute.
 */
export function captureCompositionPlaceholder(
  surface: HTMLElement,
  sourceText: Text,
): HTMLBRElement | null {
  const children = Array.from(surface.childNodes);
  const candidate = children[1];
  return children.length === 2 &&
    children[0] === sourceText &&
    isCanonicalOwnedPlaceholder(candidate)
    ? (candidate as HTMLBRElement)
    : null;
}

/**
 * Derives the one native paragraph effect admitted by an active composition
 * lease. The caller remains responsible for committing or rejecting it.
 */
export function inspectNativeParagraphEffect({
  root,
  value,
  intent,
  session,
  isCompositionPinIntact,
}: InspectNativeParagraphEffectOptions): NativeParagraphEffect | null {
  if (
    session.id !== intent.compositionId ||
    session.blockId !== intent.blockId ||
    intent.blockElements.length !== value.blocks.length ||
    intent.nativeRecords.some((record) => record.type === "attributes")
  ) {
    return null;
  }

  const children = Array.from(root.childNodes);
  if (
    children.some((node) => node.nodeType !== 1) ||
    children.length !== intent.blockElements.length + 1
  ) {
    return null;
  }

  const sourceIndex = intent.blockElements.indexOf(intent.sourceElement);
  if (sourceIndex < 0) {
    return null;
  }
  for (let index = 0; index < intent.blockElements.length; index += 1) {
    const expected = intent.blockElements[index];
    const actual = children[index <= sourceIndex ? index : index + 1];
    if (actual !== expected) {
      return null;
    }
  }

  const nativeBlock = children[sourceIndex + 1] as HTMLElement;
  if (
    (nativeBlock.tagName !== "DIV" && nativeBlock.tagName !== "P") ||
    nativeBlock.attributes.length !== 0 ||
    intent.sourceElement.parentNode !== root ||
    intent.sourceElement.childNodes.length !== 1 ||
    intent.sourceElement.firstChild !== intent.sourceSurface ||
    !isCompositionPinIntact(intent.sourceSurface) ||
    !isCanonicalBlockElement(
      intent.sourceElement,
      value,
      intent.blockId,
    ) ||
    !isCanonicalSurfaceElement(
      intent.sourceSurface,
      value,
      intent.blockId,
    )
  ) {
    return null;
  }

  for (const record of intent.nativeRecords) {
    const target = record.target;
    if (
      target !== root &&
      target !== intent.sourceElement &&
      !intent.sourceElement.contains(target) &&
      target !== nativeBlock &&
      !nativeBlock.contains(target)
    ) {
      return null;
    }
  }

  const left = readPinnedCompositionText(intent);
  const right = textFromNativeBlock(nativeBlock, intent.sourceSurface);
  if (left === null || right === null) {
    return null;
  }

  const text = left + right;
  const change = diffTextNearRange(
    intent.canonicalText,
    text,
    session.range,
  );
  if (text === intent.canonicalText) {
    return left.length === intent.splitOffset
      ? { text, splitOffset: left.length, change: null }
      : null;
  }

  const range = clampTextRange(session.range, intent.canonicalText.length);
  if (
    change === null ||
    applyTextChange(intent.canonicalText, change) !== text ||
    change.from < range.from ||
    change.to > range.to ||
    left.length !== mapTextOffset(intent.splitOffset, change)
  ) {
    return null;
  }
  return { text, splitOffset: left.length, change };
}

export function readPinnedCompositionText(
  intent: NativeParagraphIntentFacts,
): string | null {
  const children = Array.from(intent.sourceSurface.childNodes);
  if (children[0] !== intent.sourceText) {
    return null;
  }
  if (children.length === 1) {
    return intent.sourcePlaceholder === null ||
      intent.sourcePlaceholder.parentNode === null
      ? intent.sourceText.data
      : null;
  }
  if (
    children.length === 2 &&
    children[1] === intent.sourcePlaceholder &&
    isCanonicalOwnedPlaceholder(children[1])
  ) {
    return intent.sourceText.data;
  }
  return null;
}

function textFromNativeBlock(
  element: HTMLElement,
  sourceSurface: HTMLElement,
): string | null {
  const children = Array.from(element.childNodes);
  if (children.length === 1 && children[0]?.nodeType === 1) {
    const surface = children[0] as HTMLElement;
    if (surface.tagName === "BR" && surface.attributes.length === 0) {
      return "";
    }
    const sourcePath = sourceSurface.getAttribute(EDITABLE_TEXT_ATTRIBUTE);
    const hasAllowedAttributes =
      surface.attributes.length === 0 ||
      (surface.attributes.length === 1 &&
        surface.getAttribute(EDITABLE_TEXT_ATTRIBUTE) === sourcePath);
    if (surface.tagName !== "SPAN" || !hasAllowedAttributes) {
      return null;
    }
    return strictTextFromContainer(surface, true);
  }
  return strictTextFromContainer(element, false);
}

function strictTextFromContainer(
  element: HTMLElement,
  allowOwnedPlaceholder: boolean,
): string | null {
  let text = "";
  let breakCount = 0;
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      text += (child as Text).data;
      continue;
    }
    if (child.nodeType !== 1 || (child as HTMLElement).tagName !== "BR") {
      return null;
    }
    const lineBreak = child as HTMLElement;
    const allowedPlaceholder =
      allowOwnedPlaceholder &&
      lineBreak.attributes.length === 1 &&
      lineBreak.hasAttribute(EDITABLE_PLACEHOLDER_ATTRIBUTE);
    if (lineBreak.attributes.length !== 0 && !allowedPlaceholder) {
      return null;
    }
    breakCount += 1;
  }
  if (breakCount > 0 && (breakCount !== 1 || text !== "")) {
    return null;
  }
  return text;
}

function isCanonicalOwnedPlaceholder(
  node: Node | undefined,
): node is HTMLBRElement {
  return (
    node?.nodeType === 1 &&
    (node as HTMLElement).tagName === "BR" &&
    (node as HTMLElement).attributes.length === 1 &&
    (node as HTMLElement).getAttribute(EDITABLE_PLACEHOLDER_ATTRIBUTE) ===
      "true"
  );
}

function mapTextOffset(offset: number, change: TextChange): number {
  if (offset < change.from) {
    return offset;
  }
  if (offset > change.to) {
    return offset + change.insert.length - (change.to - change.from);
  }
  return change.from + change.insert.length;
}
