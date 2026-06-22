import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorPoint,
  documentCursorPointAt,
  moveDocumentCursor,
  normalizeCursorPoint,
  resolveDocumentCursorIndex,
} from "./cursor";
import { exportInlineMarkdown } from "./markdown";
import {
  type InlineNode,
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "./noteDocument";
import { cursorPointInputFromSelectionPoint } from "./richSelection";

export const EDITABLE_CLIPBOARD_MIME = "application/x-editable-selection+json";

export type EditorClipboardData = {
  "text/plain": string;
  "text/markdown": string;
  [EDITABLE_CLIPBOARD_MIME]: string;
};

export type ClipboardTransfer = {
  getData(type: string): string;
};

export type ClipboardFormat = "plain" | "markdown";

export type ClipboardText = {
  text: string;
  format: ClipboardFormat;
};

export function serializeSelectionForClipboard(
  document: NoteDocument,
  selection: SelectionSnap,
): EditorClipboardData | null {
  const range = orderedSelectionRange(document, selection);
  if (range === null) {
    return null;
  }

  const plainText = serializeCursorRange(document, range, "plain");
  const markdown = serializeCursorRange(document, range, "markdown");
  if (plainText.length === 0 && markdown.length === 0) {
    return null;
  }

  return {
    "text/plain": plainText,
    "text/markdown": markdown,
    [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
      schema: "editable-clipboard@1",
      plainText,
      markdown,
    }),
  };
}

export function readTextFromTransfer(
  transfer: ClipboardTransfer,
): string | null {
  return readClipboardTextFromTransfer(transfer)?.text ?? null;
}

export function readClipboardTextFromTransfer(
  transfer: ClipboardTransfer,
): ClipboardText | null {
  const structured = readStructuredClipboardData(
    transfer.getData(EDITABLE_CLIPBOARD_MIME),
  );
  if (structured !== null) {
    return structured;
  }

  const plainText = transfer.getData("text/plain");
  if (plainText.length > 0) {
    return { text: plainText, format: "plain" };
  }

  const markdown = transfer.getData("text/markdown");
  if (markdown.length > 0) {
    return { text: markdown, format: "markdown" };
  }

  const uriList = readUriListText(transfer.getData("text/uri-list"));
  return uriList === null ? null : { text: uriList, format: "plain" };
}

function readStructuredClipboardData(value: string): ClipboardText | null {
  if (value.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "schema" in parsed &&
      "plainText" in parsed &&
      parsed.schema === "editable-clipboard@1" &&
      typeof parsed.plainText === "string"
    ) {
      if (
        "markdown" in parsed &&
        typeof parsed.markdown === "string" &&
        parsed.markdown.length > 0
      ) {
        return { text: parsed.markdown, format: "markdown" };
      }

      return parsed.plainText.length === 0
        ? null
        : { text: parsed.plainText, format: "plain" };
    }
  } catch {
    return null;
  }

  return null;
}

function readUriListText(value: string): string | null {
  const uris = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  return uris.length === 0 ? null : uris.join("\n");
}

function orderedSelectionRange(
  document: NoteDocument,
  selection: SelectionSnap,
): {
  anchor: CursorPoint;
  focus: CursorPoint;
  start: number;
  end: number;
} | null {
  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  const anchor = normalizeSelectionPoint(document, range.anchor);
  const focus = normalizeSelectionPoint(document, range.focus);
  const anchorIndex = resolveDocumentCursorIndex(document, anchor);
  const focusIndex = resolveDocumentCursorIndex(document, focus);
  if (anchorIndex === focusIndex) {
    return null;
  }

  return anchorIndex < focusIndex
    ? { anchor, focus, start: anchorIndex, end: focusIndex }
    : { anchor: focus, focus: anchor, start: focusIndex, end: anchorIndex };
}

function normalizeSelectionPoint(
  document: NoteDocument,
  point: SelectionPoint,
): CursorPoint {
  return normalizeCursorPoint(
    document,
    cursorPointInputFromSelectionPoint(point),
  );
}

function serializeCursorRange(
  document: NoteDocument,
  range: {
    anchor: CursorPoint;
    focus: CursorPoint;
    start: number;
    end: number;
  },
  format: ClipboardFormat,
): string {
  if (
    range.anchor.offset !== undefined &&
    range.focus.offset !== undefined &&
    range.anchor.path === range.focus.path
  ) {
    return serializeTextSlice(
      document,
      range.anchor.path,
      range.anchor.offset,
      range.focus.offset,
      format,
    );
  }

  const parts: string[] = [];
  let from = documentCursorPointAt(document, range.start);
  for (let index = range.start; index < range.end; index += 1) {
    const to = moveDocumentCursor(document, from, "forward");
    if (cursorPointsEqual(from, to)) {
      break;
    }

    const unit = serializeCursorUnit(document, from, to, format);
    if (unit !== null) {
      parts.push(unit);
    }
    from = to;
  }

  return parts.join("");
}

function serializeTextSlice(
  document: NoteDocument,
  path: string,
  startOffset: number,
  endOffset: number,
  format: ClipboardFormat,
): string {
  const start = Math.min(startOffset, endOffset);
  const end = Math.max(startOffset, endOffset);
  const textNode = inlineTextNodeAtPath(document, path);
  if (textNode !== null) {
    const text = textNode.text.slice(start, end);
    return format === "markdown"
      ? exportInlineMarkdown([{ ...textNode, text }])
      : text;
  }

  return codeTextAtPath(document, path)?.slice(start, end) ?? "";
}

function serializeCursorUnit(
  document: NoteDocument,
  from: CursorPoint,
  to: CursorPoint,
  format: ClipboardFormat,
): string | null {
  if (
    from.offset !== undefined &&
    to.offset !== undefined &&
    from.path === to.path &&
    to.offset > from.offset
  ) {
    return serializeTextSlice(
      document,
      from.path,
      from.offset,
      to.offset,
      format,
    );
  }

  if (from.edge === "before" && to.edge === "after" && from.path === to.path) {
    return atomTextAtPath(document, from.path, format);
  }

  if (isBlockTransition(from, to) || isAdjacentBlockBoundary(from, to)) {
    return format === "markdown" ? "\n\n" : "\n";
  }

  return null;
}

function inlineTextNodeAtPath(
  document: NoteDocument,
  path: string,
): Extract<InlineNode, { type: "text" }> | null {
  const inline = inlineTextPath(path);
  if (inline === null) {
    return null;
  }

  const block = document.root.children[inline.blockIndex];
  const child = isInlineTextBlock(block)
    ? block.children[inline.childIndex]
    : undefined;

  return child?.type === "text" ? child : null;
}

function codeTextAtPath(document: NoteDocument, path: string): string | null {
  const code = codeTextPath(path);
  if (code === null) {
    return null;
  }

  const block = document.root.children[code.blockIndex];

  return isCodeBlock(block) ? block.text : null;
}

function atomTextAtPath(
  document: NoteDocument,
  path: string,
  format: ClipboardFormat,
): string | null {
  const inline = inlineAtomPath(path);
  if (inline !== null) {
    const block = document.root.children[inline.blockIndex];
    const child = isInlineTextBlock(block)
      ? block.children[inline.childIndex]
      : undefined;
    if (child?.type !== "mention") {
      return null;
    }

    return format === "markdown"
      ? exportInlineMarkdown([child])
      : `@${child.label}`;
  }

  const blockIndex = blockPath(path);
  const block =
    blockIndex === null ? undefined : document.root.children[blockIndex];
  if (!isFigureBlock(block)) {
    return null;
  }

  const label = block.alt ?? "";
  return format === "markdown"
    ? `![${escapeMarkdownLabel(label)}](${encodeURI(block.src).replaceAll(")", "%29")})`
    : label;
}

function isAdjacentBlockBoundary(from: CursorPoint, to: CursorPoint): boolean {
  if (from.edge !== "after" || to.edge !== "before") {
    return false;
  }

  const fromIndex = blockPath(from.path);
  const toIndex = blockPath(to.path);

  return fromIndex !== null && toIndex !== null && toIndex === fromIndex + 1;
}

function isBlockTransition(from: CursorPoint, to: CursorPoint): boolean {
  const fromIndex = blockIndexFromCursorPoint(from);
  const toIndex = blockIndexFromCursorPoint(to);

  return fromIndex !== null && toIndex !== null && fromIndex !== toIndex;
}

function blockIndexFromCursorPoint(point: CursorPoint): number | null {
  return (
    inlineTextPath(point.path)?.blockIndex ??
    inlineAtomPath(point.path)?.blockIndex ??
    codeTextPath(point.path)?.blockIndex ??
    blockPath(point.path)
  );
}

function inlineTextPath(
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const match = /^\/root\/children\/(\d+)\/children\/(\d+)\/text$/.exec(path);
  if (match === null) {
    return null;
  }

  return {
    blockIndex: Number(match[1]),
    childIndex: Number(match[2]),
  };
}

function codeTextPath(path: string): { blockIndex: number } | null {
  const match = /^\/root\/children\/(\d+)\/text$/.exec(path);
  return match === null ? null : { blockIndex: Number(match[1]) };
}

function inlineAtomPath(
  path: string,
): { blockIndex: number; childIndex: number } | null {
  const match = /^\/root\/children\/(\d+)\/children\/(\d+)$/.exec(path);
  if (match === null) {
    return null;
  }

  return {
    blockIndex: Number(match[1]),
    childIndex: Number(match[2]),
  };
}

function blockPath(path: string): number | null {
  const match = /^\/root\/children\/(\d+)$/.exec(path);
  return match === null ? null : Number(match[1]);
}

function escapeMarkdownLabel(text: string): string {
  return text.replace(/[\\[\]()!*_`]/g, (match) => `\\${match}`);
}

function cursorPointsEqual(left: CursorPoint, right: CursorPoint): boolean {
  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
  );
}
