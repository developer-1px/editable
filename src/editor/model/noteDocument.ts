import { z } from "zod";

const BoldMarkSchema = z.object({
  type: z.literal("bold"),
});

const ItalicMarkSchema = z.object({
  type: z.literal("italic"),
});

const CodeMarkSchema = z.object({
  type: z.literal("code"),
});

const LinkMarkSchema = z.object({
  type: z.literal("link"),
  href: z.string().min(1),
  title: z.string().optional(),
});

export const MarkSchema = z.discriminatedUnion("type", [
  BoldMarkSchema,
  ItalicMarkSchema,
  CodeMarkSchema,
  LinkMarkSchema,
]);

const TextInlineSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  marks: z.array(MarkSchema).optional(),
});

const MentionInlineSchema = z.object({
  type: z.literal("mention"),
  id: z.string().min(1),
  label: z.string().min(1),
});

export const InlineNodeSchema = z.discriminatedUnion("type", [
  TextInlineSchema,
  MentionInlineSchema,
]);

export const ParagraphBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("paragraph"),
  children: z.array(InlineNodeSchema).min(1),
});

export const HeadingBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("heading"),
  level: z.number().int().min(1).max(6),
  children: z.array(InlineNodeSchema).min(1),
});

export const QuoteBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("quote"),
  children: z.array(InlineNodeSchema).min(1),
});

export const ListItemBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("listItem"),
  ordered: z.boolean(),
  depth: z.number().int().min(0),
  children: z.array(InlineNodeSchema).min(1),
});

export const CodeBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("codeBlock"),
  text: z.string(),
  language: z.string().min(1).optional(),
});

export const FigureBlockSchema = z.object({
  id: z.string().min(1),
  type: z.literal("figure"),
  src: z.string().min(1),
  alt: z.string().optional(),
});

export const NoteBlockSchema = z.discriminatedUnion("type", [
  ParagraphBlockSchema,
  HeadingBlockSchema,
  QuoteBlockSchema,
  ListItemBlockSchema,
  CodeBlockSchema,
  FigureBlockSchema,
]);

export const NoteDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  tags: z.array(z.string()),
  blocks: z.array(NoteBlockSchema).min(1),
});

export type InlineNode = z.infer<typeof InlineNodeSchema>;
export type Mark = z.infer<typeof MarkSchema>;
export type NoteBlock = z.infer<typeof NoteBlockSchema>;
export type NoteDocument = z.infer<typeof NoteDocumentSchema>;
export type InlineTextBlock = Extract<
  NoteBlock,
  { type: "paragraph" | "heading" | "quote" | "listItem" }
>;
export type CodeBlock = Extract<NoteBlock, { type: "codeBlock" }>;
export type FigureBlock = Extract<NoteBlock, { type: "figure" }>;
export type TextBlock = InlineTextBlock | CodeBlock;

export const initialNoteDocument: NoteDocument = {
  id: "note-1",
  title: "Rich note",
  tags: ["json-document", "rich"],
  blocks: [
    {
      id: "block-1",
      type: "paragraph",
      children: [
        { type: "text", text: "Plain " },
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " " },
        { type: "text", text: "italic", marks: [{ type: "italic" }] },
        { type: "text", text: " " },
        { type: "text", text: "code", marks: [{ type: "code" }] },
        { type: "text", text: " " },
        {
          type: "text",
          text: "link",
          marks: [{ type: "link", href: "https://example.com" }],
        },
        { type: "text", text: " " },
        { type: "mention", id: "user-ada", label: "Ada" },
      ],
    },
    {
      id: "figure-1",
      type: "figure",
      src: "/logo192.png",
      alt: "Figure",
    },
    {
      id: "block-2",
      type: "paragraph",
      children: [{ type: "text", text: "After figure." }],
    },
    {
      id: "heading-1",
      type: "heading",
      level: 2,
      children: [{ type: "text", text: "Outline" }],
    },
    {
      id: "quote-1",
      type: "quote",
      children: [{ type: "text", text: "Quote block" }],
    },
    {
      id: "list-1",
      type: "listItem",
      ordered: false,
      depth: 0,
      children: [{ type: "text", text: "List item" }],
    },
    {
      id: "code-1",
      type: "codeBlock",
      language: "ts",
      text: "const value = 1;",
    },
  ],
};

let nextBlockId = 1;

export function createParagraphBlock(text = ""): NoteBlock {
  nextBlockId += 1;

  return {
    id: `block-${nextBlockId}`,
    type: "paragraph",
    children: [{ type: "text", text }],
  };
}

export function isInlineTextBlock(
  block: NoteBlock | undefined,
): block is InlineTextBlock {
  return (
    block?.type === "paragraph" ||
    block?.type === "heading" ||
    block?.type === "quote" ||
    block?.type === "listItem"
  );
}

export function isCodeBlock(block: NoteBlock | undefined): block is CodeBlock {
  return block?.type === "codeBlock";
}

export function isTextBlock(block: NoteBlock | undefined): block is TextBlock {
  return isInlineTextBlock(block) || isCodeBlock(block);
}

export function isFigureBlock(
  block: NoteBlock | undefined,
): block is FigureBlock {
  return block?.type === "figure";
}

export function readBlockText(block: NoteBlock): string {
  if (block.type === "figure") {
    return "";
  }

  if (block.type === "codeBlock") {
    return block.text;
  }

  return block.children
    .map((child) => (child.type === "text" ? child.text : `@${child.label}`))
    .join("");
}
