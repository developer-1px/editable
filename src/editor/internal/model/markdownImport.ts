import {
  findUnescapedMarkdown,
  parseMarkdownInlineNodes,
  unescapeMarkdownInlineText,
  unescapeMarkdownUrl,
} from "./markdownInlineImport";
import { normalizeFigureSrc } from "./mediaSrc";
import { normalizeDocument } from "./normalizer";
import {
  createNoteDocument,
  type NoteBlockInput,
  type NoteDocument,
  textInline,
} from "./noteDocument";

type MarkdownImportOptions = {
  id?: string;
  title?: string;
  tags?: string[];
};

type BlockKind = "paragraph" | "heading" | "quote" | "list" | "code" | "figure";

export function importMarkdown(
  markdown: string,
  options: MarkdownImportOptions = {},
): NoteDocument {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: NoteBlockInput[] = [];
  let lineIndex = 0;
  let blockIndex = 0;

  while (lineIndex < lines.length) {
    const line = lines[lineIndex] ?? "";
    if (line.trim().length === 0) {
      lineIndex += 1;
      continue;
    }

    const codeFence = /^(`{3,})([^\s`]*)\s*$/.exec(line);
    if (codeFence !== null) {
      const fenceLength = codeFence[1]?.length ?? 3;
      const codeLines: string[] = [];
      lineIndex += 1;
      while (
        lineIndex < lines.length &&
        !closingCodeFenceMatches(lines[lineIndex] ?? "", fenceLength)
      ) {
        codeLines.push(lines[lineIndex] ?? "");
        lineIndex += 1;
      }
      if (lineIndex < lines.length) {
        lineIndex += 1;
      }
      blocks.push({
        id: blockId("code", blockIndex),
        type: "codeBlock",
        text: codeLines.join("\n"),
        ...(codeFence[2] === undefined || codeFence[2].length === 0
          ? {}
          : { language: codeFence[2] }),
      });
      blockIndex += 1;
      continue;
    }

    const figure = parseFigureLine(line.trim());
    if (figure !== null) {
      const src = normalizeFigureSrc(figure.src);
      if (src !== null) {
        blocks.push({
          id: blockId("figure", blockIndex),
          type: "figure",
          src,
          ...(figure.alt.length === 0 ? {} : { alt: figure.alt }),
        });
        blockIndex += 1;
      } else if (figure.alt.length > 0) {
        blocks.push({
          id: blockId("paragraph", blockIndex),
          type: "paragraph",
          children: [textInline(figure.alt)],
        });
        blockIndex += 1;
      }
      lineIndex += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading !== null) {
      blocks.push({
        id: blockId("heading", blockIndex),
        type: "heading",
        level: heading[1]?.length ?? 1,
        children: parseMarkdownInlineNodes(heading[2] ?? ""),
      });
      blockIndex += 1;
      lineIndex += 1;
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote !== null) {
      blocks.push({
        id: blockId("quote", blockIndex),
        type: "quote",
        children: parseMarkdownInlineNodes(quote[1] ?? ""),
      });
      blockIndex += 1;
      lineIndex += 1;
      continue;
    }

    const listItem = /^(\s*)((?:[-*+])|(?:\d+\.))\s+(.+)$/.exec(line);
    if (listItem !== null) {
      blocks.push({
        id: blockId("list", blockIndex),
        type: "listItem",
        ordered: /\d+\./.test(listItem[2] ?? ""),
        depth: Math.floor((listItem[1] ?? "").length / 2),
        children: parseMarkdownInlineNodes(listItem[3] ?? ""),
      });
      blockIndex += 1;
      lineIndex += 1;
      continue;
    }

    const paragraphLines = [line];
    lineIndex += 1;
    while (
      lineIndex < lines.length &&
      lines[lineIndex]?.trim() !== "" &&
      blockKind(lines[lineIndex] ?? "") === "paragraph"
    ) {
      paragraphLines.push(lines[lineIndex] ?? "");
      lineIndex += 1;
    }
    blocks.push({
      id: blockId("paragraph", blockIndex),
      type: "paragraph",
      children: parseMarkdownInlineNodes(joinParagraphLines(paragraphLines)),
    });
    blockIndex += 1;
  }

  return normalizeDocument(
    createNoteDocument(blocks, {
      id: options.id ?? "markdown-note",
      title: options.title ?? "Markdown note",
      tags: options.tags ?? [],
    }),
  );
}

function parseFigureLine(line: string): { alt: string; src: string } | null {
  if (!line.startsWith("![")) {
    return null;
  }

  const closeLabel = findUnescapedMarkdown(line, "]", 2);
  if (closeLabel === -1 || line[closeLabel + 1] !== "(") {
    return null;
  }

  const closeTarget = findUnescapedMarkdown(line, ")", closeLabel + 2);
  if (closeTarget !== line.length - 1) {
    return null;
  }

  return {
    alt: unescapeMarkdownInlineText(line.slice(2, closeLabel)),
    src: unescapeMarkdownUrl(line.slice(closeLabel + 2, closeTarget)),
  };
}

function blockKind(line: string): BlockKind {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return "paragraph";
  }
  if (/^`{3,}/.test(trimmed)) {
    return "code";
  }
  if (parseFigureLine(trimmed) !== null) {
    return "figure";
  }
  if (/^#{1,6}\s+/.test(trimmed)) {
    return "heading";
  }
  if (/^>\s?/.test(trimmed)) {
    return "quote";
  }
  if (/^\s*((?:[-*+])|(?:\d+\.))\s+/.test(line)) {
    return "list";
  }

  return "paragraph";
}

function blockId(kind: BlockKind, index: number): string {
  return `md-${kind}-${index + 1}`;
}

function joinParagraphLines(lines: string[]): string {
  const [first = "", ...rest] = lines;
  let joined = first;

  for (const line of rest) {
    if (endsWithHardLineBreak(joined)) {
      joined = `${joined.slice(0, -1)}\n${line}`;
    } else {
      joined = `${joined} ${line}`;
    }
  }

  return joined;
}

function endsWithHardLineBreak(text: string): boolean {
  let backslashCount = 0;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    if (text[index] !== "\\") {
      break;
    }
    backslashCount += 1;
  }

  return backslashCount % 2 === 1;
}

function closingCodeFenceMatches(line: string, openerLength: number): boolean {
  const match = /^(`{3,})\s*$/.exec(line);
  return (match?.[1]?.length ?? 0) >= openerLength;
}
