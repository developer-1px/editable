import { normalizeLinkHref } from "./linkHref";
import { normalizeInlineChildren } from "./normalizer";
import {
  type InlineNode,
  type Mark,
  mentionInline,
  textInline,
} from "./noteDocument";

export function parseMarkdownInlineNodes(
  markdown: string,
  activeMarks: Mark[] = [],
): InlineNode[] {
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
        children.push(...parseMarkdownInlineNodes(link.label, activeMarks));
        index = link.end;
        continue;
      }

      const linkMark: Mark = {
        type: "link",
        href,
        ...(link.title === undefined ? {} : { title: link.title }),
      };
      children.push(
        ...parseMarkdownInlineNodes(link.label, [...activeMarks, linkMark]),
      );
      index = link.end;
      continue;
    }

    if (markdown.startsWith("**", index)) {
      const end = markdown.indexOf("**", index + 2);
      if (end !== -1) {
        children.push(
          ...parseMarkdownInlineNodes(markdown.slice(index + 2, end), [
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
          ...parseMarkdownInlineNodes(markdown.slice(index + 1, end), [
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
    label: unescapeMarkdownInlineText(parsed.label),
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
  const closeLabel = findUnescapedMarkdown(markdown, "]", start + 1);
  if (closeLabel === -1 || markdown[closeLabel + 1] !== "(") {
    return null;
  }

  const closeTarget = findUnescapedMarkdown(markdown, ")", closeLabel + 2);
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
    href: unescapeMarkdownUrl(target.href),
    ...(target.title === undefined
      ? {}
      : { title: unescapeMarkdownInlineText(target.title) }),
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

function pushText(children: InlineNode[], text: string, marks: Mark[]) {
  if (text.length === 0) {
    return;
  }

  children.push(textInline(text, marks.length === 0 ? undefined : marks));
}

export function findUnescapedMarkdown(
  text: string,
  needle: string,
  from: number,
): number {
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

export function unescapeMarkdownInlineText(text: string): string {
  return text.replace(/\\(.)/g, "$1");
}

export function unescapeMarkdownUrl(url: string): string {
  return safeDecodeURI(url);
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
