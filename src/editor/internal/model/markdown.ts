import { normalizeLinkHref } from "./linkHref";
import { normalizeFigureSrc } from "./mediaSrc";
import { normalizeDocument, normalizeInlineChildren } from "./normalizer";
import {
  createNoteDocument,
  type InlineNode,
  type Mark,
  mentionInline,
  type NoteBlock,
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
        children: parseInline(heading[2] ?? ""),
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
        children: parseInline(quote[1] ?? ""),
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
        children: parseInline(listItem[3] ?? ""),
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
      children: parseInline(joinParagraphLines(paragraphLines)),
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

export function exportMarkdown(document: NoteDocument): string {
  return document.root.children.map(exportBlock).join("\n\n");
}

export function exportInlineMarkdown(children: InlineNode[]): string {
  return exportInline(children);
}

function exportBlock(block: NoteBlock): string {
  if (block.type === "heading") {
    return `${"#".repeat(block.level)} ${exportInline(block.children)}`;
  }
  if (block.type === "quote") {
    return `> ${exportInline(block.children)}`;
  }
  if (block.type === "listItem") {
    const marker = block.ordered ? "1." : "-";
    return `${"  ".repeat(block.depth)}${marker} ${exportInline(block.children)}`;
  }
  if (block.type === "codeBlock") {
    const fence = codeFenceForText(block.text);
    return [`${fence}${block.language ?? ""}`, block.text, fence].join("\n");
  }
  if (block.type === "figure") {
    return `![${escapeInlineText(block.alt ?? "")}](${escapeUrl(block.src)})`;
  }

  return escapeParagraphBlockSyntax(exportInline(block.children));
}

function parseInline(markdown: string, activeMarks: Mark[] = []): InlineNode[] {
  const children: InlineNode[] = [];
  let index = 0;

  while (index < markdown.length) {
    if (markdown[index] === "\\" && index + 1 < markdown.length) {
      pushText(children, markdown[index + 1] ?? "", activeMarks);
      index += 2;
      continue;
    }

    const mention = parseMention(markdown, index);
    if (mention !== null) {
      children.push(mentionInline(mention.id, mention.label));
      index = mention.end;
      continue;
    }

    const link = parseLink(markdown, index);
    if (link !== null) {
      const href = normalizeLinkHref(link.href);
      if (href === null) {
        children.push(...parseInline(link.label, activeMarks));
        index = link.end;
        continue;
      }

      const linkMark: Mark = {
        type: "link",
        href,
        ...(link.title === undefined ? {} : { title: link.title }),
      };
      children.push(...parseInline(link.label, [...activeMarks, linkMark]));
      index = link.end;
      continue;
    }

    if (markdown.startsWith("**", index)) {
      const end = markdown.indexOf("**", index + 2);
      if (end !== -1) {
        children.push(
          ...parseInline(markdown.slice(index + 2, end), [
            ...activeMarks,
            { type: "bold" },
          ]),
        );
        index = end + 2;
        continue;
      }
    }

    if (markdown[index] === "`") {
      const codeSpan = parseCodeSpan(markdown, index);
      if (codeSpan !== null) {
        pushText(children, codeSpan.text, [...activeMarks, { type: "code" }]);
        index = codeSpan.end;
        continue;
      }
    }

    if (markdown[index] === "*" || markdown[index] === "_") {
      const marker = markdown[index] ?? "";
      const end = markdown.indexOf(marker, index + 1);
      if (end !== -1) {
        children.push(
          ...parseInline(markdown.slice(index + 1, end), [
            ...activeMarks,
            { type: "italic" },
          ]),
        );
        index = end + 1;
        continue;
      }
    }

    pushText(children, markdown[index] ?? "", activeMarks);
    index += 1;
  }

  return normalizeInlineChildren(children);
}

function exportInline(children: InlineNode[]): string {
  return children.map(exportInlineNode).join("");
}

function exportInlineNode(child: InlineNode): string {
  if (child.type === "mention") {
    return `@[${escapeInlineText(child.label)}](mention:${escapeUrl(child.id)})`;
  }

  return exportMarkedText(child.text, child.marks ?? []);
}

function exportMarkedText(text: string, marks: Mark[]): string {
  let value = escapeInlineText(text);
  const code = marks.find((mark) => mark.type === "code");
  const italic = marks.find((mark) => mark.type === "italic");
  const bold = marks.find((mark) => mark.type === "bold");
  const link = marks.find((mark) => mark.type === "link");

  if (code !== undefined) {
    value = exportCodeSpan(text);
  }
  if (italic !== undefined) {
    value = `_${value}_`;
  }
  if (bold !== undefined) {
    value = `**${value}**`;
  }
  if (link !== undefined) {
    value = `[${value}](${escapeUrl(link.href)}${link.title === undefined ? "" : ` "${escapeTitle(link.title)}"`})`;
  }

  return value;
}

function parseCodeSpan(
  markdown: string,
  start: number,
): { text: string; end: number } | null {
  const opener = backtickRunLength(markdown, start);
  if (opener === 0) {
    return null;
  }

  let index = start + opener;
  while (index < markdown.length) {
    if (markdown[index] !== "`") {
      index += 1;
      continue;
    }

    const closer = backtickRunLength(markdown, index);
    if (closer === opener) {
      return {
        text: normalizeCodeSpanText(markdown.slice(start + opener, index)),
        end: index + closer,
      };
    }
    index += closer;
  }

  return null;
}

function parseMention(
  markdown: string,
  start: number,
): { label: string; id: string; end: number } | null {
  if (!markdown.startsWith("@[", start)) {
    return null;
  }

  const parsed = parseBracketLink(markdown, start + 1);
  if (parsed === null || !parsed.href.startsWith("mention:")) {
    return null;
  }

  return {
    label: unescapeInlineText(parsed.label),
    id: safeDecodeURIComponent(parsed.href.slice("mention:".length)),
    end: parsed.end,
  };
}

function parseLink(
  markdown: string,
  start: number,
): { label: string; href: string; title?: string; end: number } | null {
  if (markdown[start] !== "[") {
    return null;
  }

  const parsed = parseBracketLink(markdown, start);
  if (parsed === null || parsed.href.startsWith("mention:")) {
    return null;
  }

  return parsed;
}

function parseBracketLink(
  markdown: string,
  start: number,
): { label: string; href: string; title?: string; end: number } | null {
  const closeLabel = findUnescaped(markdown, "]", start + 1);
  if (closeLabel === -1 || markdown[closeLabel + 1] !== "(") {
    return null;
  }

  const closeTarget = findUnescaped(markdown, ")", closeLabel + 2);
  if (closeTarget === -1) {
    return null;
  }

  const label = markdown.slice(start + 1, closeLabel);
  const target = parseLinkTarget(markdown.slice(closeLabel + 2, closeTarget));
  if (target === null) {
    return null;
  }

  return {
    label,
    href: unescapeUrl(target.href),
    ...(target.title === undefined
      ? {}
      : { title: unescapeInlineText(target.title) }),
    end: closeTarget + 1,
  };
}

function parseLinkTarget(
  target: string,
): { href: string; title?: string } | null {
  const hrefEnd = target.search(/\s/);
  const href = hrefEnd === -1 ? target : target.slice(0, hrefEnd);
  if (href.length === 0) {
    return null;
  }
  if (hrefEnd === -1) {
    return { href };
  }

  let index = hrefEnd;
  while (target[index] === " " || target[index] === "\t") {
    index += 1;
  }
  if (target[index] !== '"') {
    return null;
  }

  index += 1;
  let title = "";
  while (index < target.length) {
    const char = target[index] ?? "";
    if (char === "\\") {
      if (index + 1 >= target.length) {
        return null;
      }
      title += `${char}${target[index + 1] ?? ""}`;
      index += 2;
      continue;
    }
    if (char === '"') {
      index += 1;
      while (target[index] === " " || target[index] === "\t") {
        index += 1;
      }
      return index === target.length ? { href, title } : null;
    }
    title += char;
    index += 1;
  }

  return null;
}

function parseFigureLine(line: string): { alt: string; src: string } | null {
  if (!line.startsWith("![")) {
    return null;
  }

  const closeLabel = findUnescaped(line, "]", 2);
  if (closeLabel === -1 || line[closeLabel + 1] !== "(") {
    return null;
  }

  const closeTarget = findUnescaped(line, ")", closeLabel + 2);
  if (closeTarget !== line.length - 1) {
    return null;
  }

  return {
    alt: unescapeInlineText(line.slice(2, closeLabel)),
    src: unescapeUrl(line.slice(closeLabel + 2, closeTarget)),
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

function pushText(children: InlineNode[], text: string, marks: Mark[]) {
  if (text.length === 0) {
    return;
  }

  children.push(textInline(text, marks.length === 0 ? undefined : marks));
}

function blockId(kind: BlockKind, index: number): string {
  return `md-${kind}-${index + 1}`;
}

function findUnescaped(text: string, needle: string, from: number): number {
  let index = from;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === needle) {
      return index;
    }
    index += 1;
  }

  return -1;
}

function escapeInlineText(text: string): string {
  return text
    .replace(/[\\[\]()!*_`]/g, (match) => `\\${match}`)
    .replaceAll("\n", "\\\n");
}

function escapeParagraphBlockSyntax(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) =>
      paragraphLineLooksLikeBlockSyntax(line)
        ? escapeBlockSyntaxMarker(line)
        : line,
    )
    .join("\n");
}

function paragraphLineLooksLikeBlockSyntax(line: string): boolean {
  return (
    /^(\s*)#{1,6}\s+/.test(line) ||
    /^(\s*)>\s?/.test(line) ||
    /^(\s*)((?:[-*+])|(?:\d+\.))\s+/.test(line) ||
    /^(\s*)`{3,}/.test(line) ||
    /^(\s*)!\[/.test(line)
  );
}

function escapeBlockSyntaxMarker(line: string): string {
  return line.replace(/^(\s*)(.)/, "$1\\$2");
}

function unescapeInlineText(text: string): string {
  return text.replace(/\\(.)/g, "$1");
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

function escapeUrl(url: string): string {
  return encodeURI(url).replaceAll(")", "%29");
}

function unescapeUrl(url: string): string {
  return safeDecodeURI(url);
}

function closingCodeFenceMatches(line: string, openerLength: number): boolean {
  const match = /^(`{3,})\s*$/.exec(line);
  return (match?.[1]?.length ?? 0) >= openerLength;
}

function codeFenceForText(text: string): string {
  const longest = longestBacktickRunOnLine(text);
  return "`".repeat(Math.max(3, longest + 1));
}

function longestBacktickRunOnLine(text: string): number {
  let longest = 0;
  for (const line of text.split("\n")) {
    let current = 0;
    for (const char of line) {
      if (char === "`") {
        current += 1;
        longest = Math.max(longest, current);
      } else {
        current = 0;
      }
    }
  }
  return longest;
}

function exportCodeSpan(text: string): string {
  const delimiter = "`".repeat(Math.max(1, longestBacktickRun(text) + 1));
  const needsPadding =
    text.startsWith("`") ||
    text.endsWith("`") ||
    text.startsWith(" ") ||
    text.endsWith(" ");
  const content = needsPadding ? ` ${text} ` : text;
  return `${delimiter}${content}${delimiter}`;
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  let current = 0;
  for (const char of text) {
    if (char === "`") {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

function backtickRunLength(text: string, start: number): number {
  let index = start;
  while (text[index] === "`") {
    index += 1;
  }
  return index - start;
}

function normalizeCodeSpanText(text: string): string {
  if (
    text.length >= 2 &&
    text.startsWith(" ") &&
    text.endsWith(" ") &&
    /[^ ]/.test(text.slice(1, -1))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function safeDecodeURI(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function escapeTitle(title: string): string {
  return escapeInlineText(title).replaceAll('"', '\\"');
}
