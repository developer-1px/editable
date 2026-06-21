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

const FENCE = "```";

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

    const codeFence = /^```([^\s`]*)\s*$/.exec(line);
    if (codeFence !== null) {
      const codeLines: string[] = [];
      lineIndex += 1;
      while (
        lineIndex < lines.length &&
        !/^```\s*$/.test(lines[lineIndex] ?? "")
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
        ...(codeFence[1] === undefined || codeFence[1].length === 0
          ? {}
          : { language: codeFence[1] }),
      });
      blockIndex += 1;
      continue;
    }

    const figure = parseFigureLine(line.trim());
    if (figure !== null) {
      blocks.push({
        id: blockId("figure", blockIndex),
        type: "figure",
        src: figure.src,
        ...(figure.alt.length === 0 ? {} : { alt: figure.alt }),
      });
      blockIndex += 1;
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

    const paragraphLines = [line.trim()];
    lineIndex += 1;
    while (
      lineIndex < lines.length &&
      lines[lineIndex]?.trim() !== "" &&
      blockKind(lines[lineIndex] ?? "") === "paragraph"
    ) {
      paragraphLines.push((lines[lineIndex] ?? "").trim());
      lineIndex += 1;
    }
    blocks.push({
      id: blockId("paragraph", blockIndex),
      type: "paragraph",
      children: parseInline(paragraphLines.join(" ")),
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
    return [`${FENCE}${block.language ?? ""}`, block.text, FENCE].join("\n");
  }
  if (block.type === "figure") {
    return `![${escapeInlineText(block.alt ?? "")}](${escapeUrl(block.src)})`;
  }

  return exportInline(block.children);
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
      const linkMark: Mark = {
        type: "link",
        href: link.href,
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
      const end = markdown.indexOf("`", index + 1);
      if (end !== -1) {
        pushText(children, markdown.slice(index + 1, end), [
          ...activeMarks,
          { type: "code" },
        ]);
        index = end + 1;
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
    value = `\`${value.replaceAll("`", "\\`")}\``;
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
    id: decodeURIComponent(parsed.href.slice("mention:".length)),
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
  const target = markdown.slice(closeLabel + 2, closeTarget);
  const targetMatch = /^(\S+)(?:\s+"([^"]*)")?$/.exec(target);
  if (targetMatch === null || targetMatch[1] === undefined) {
    return null;
  }

  return {
    label,
    href: unescapeUrl(targetMatch[1]),
    ...(targetMatch[2] === undefined
      ? {}
      : { title: unescapeInlineText(targetMatch[2]) }),
    end: closeTarget + 1,
  };
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
  if (/^```/.test(trimmed)) {
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
  return text.replace(/[\\[\]()!*_`]/g, (match) => `\\${match}`);
}

function unescapeInlineText(text: string): string {
  return text.replace(/\\(.)/g, "$1");
}

function escapeUrl(url: string): string {
  return encodeURI(url).replaceAll(")", "%29");
}

function unescapeUrl(url: string): string {
  return decodeURI(url);
}

function escapeTitle(title: string): string {
  return escapeInlineText(title).replaceAll('"', '\\"');
}
