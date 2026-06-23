import type {
  CodeBlock,
  FigureBlock,
  InlineTextBlock,
  NoteBlock,
  TextBlock,
} from "./noteDocument";

export function isInlineTextBlock(
  block: NoteBlock | undefined,
): block is InlineTextBlock {
  return (
    block?.kind === "element" &&
    (block.type === "paragraph" ||
      block.type === "heading" ||
      block.type === "quote" ||
      block.type === "listItem")
  );
}

export function isCodeBlock(block: NoteBlock | undefined): block is CodeBlock {
  return block?.kind === "element" && block.type === "codeBlock";
}

export function isTextBlock(block: NoteBlock | undefined): block is TextBlock {
  return isInlineTextBlock(block) || isCodeBlock(block);
}

export function isFigureBlock(
  block: NoteBlock | undefined,
): block is FigureBlock {
  return block?.kind === "atom" && block.type === "figure";
}

export function readBlockText(block: NoteBlock): string {
  if (isFigureBlock(block)) {
    return "";
  }

  if (isCodeBlock(block)) {
    return block.text ?? "";
  }

  if (!isInlineTextBlock(block)) {
    return "";
  }

  return block.children
    .map((child) => (child.kind === "text" ? child.text : `@${child.label}`))
    .join("");
}
