import type { InlineNode, Mark, NoteBlock, NoteDocument } from "./noteDocument";

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

function escapeUrl(url: string): string {
  return encodeURI(url).replaceAll(")", "%29");
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

function escapeTitle(title: string): string {
  return escapeInlineText(title).replaceAll('"', '\\"');
}
