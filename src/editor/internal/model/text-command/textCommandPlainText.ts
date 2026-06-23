import type { InlineNode, NoteBlock } from "../noteDocument";
import { isCodeBlock, isFigureBlock, isInlineTextBlock } from "../noteDocument";

export function inlineNodesPlainText(children: InlineNode[]): string {
  return children
    .map((child) => (child.type === "mention" ? `@${child.label}` : child.text))
    .join("");
}

export function blockPlainText(block: NoteBlock): string {
  if (isFigureBlock(block)) {
    return block.alt ?? "";
  }
  if (isCodeBlock(block)) {
    return block.text;
  }
  return isInlineTextBlock(block) ? inlineNodesPlainText(block.children) : "";
}
