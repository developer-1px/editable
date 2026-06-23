import { z } from "zod";
import { normalizeLinkHref } from "./linkHref";
import { normalizeFigureSrc } from "./mediaSrc";

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | { [key: string]: JSONValue };

export type NodeFlow = "block" | "inline";
export type NodeKind = "element" | "text" | "atom";

const JSONValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JSONValueSchema),
    z.record(z.string(), JSONValueSchema),
  ]),
);

export const AttrsSchema = z.record(z.string(), JSONValueSchema);

const BoldMarkSchema = z.object({
  type: z.literal("bold"),
  attrs: AttrsSchema.optional(),
});

const ItalicMarkSchema = z.object({
  type: z.literal("italic"),
  attrs: AttrsSchema.optional(),
});

const CodeMarkSchema = z.object({
  type: z.literal("code"),
  attrs: AttrsSchema.optional(),
});

const LinkMarkSchema = z.object({
  type: z.literal("link"),
  href: z
    .string()
    .min(1)
    .refine((href) => normalizeLinkHref(href) !== null),
  title: z.string().optional(),
  attrs: AttrsSchema.optional(),
});

export const MarkSchema = z.discriminatedUnion("type", [
  BoldMarkSchema,
  ItalicMarkSchema,
  CodeMarkSchema,
  LinkMarkSchema,
]);

export const TextNodeSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.literal("text").default("text"),
  type: z.literal("text").default("text"),
  text: z.string(),
  marks: z.array(MarkSchema).optional(),
});

const NodeAttrsSchema = {
  id: z.string().min(1),
  attrs: AttrsSchema.optional(),
};

export type Mark = z.infer<typeof MarkSchema>;
export type TextNode = z.output<typeof TextNodeSchema>;

export const MentionInlineSchema = z.object({
  ...NodeAttrsSchema,
  kind: z.literal("atom").default("atom"),
  type: z.literal("mention"),
  flow: z.literal("inline").default("inline"),
  label: z.string().min(1),
});

export const InlineNodeSchema = z.union([TextNodeSchema, MentionInlineSchema]);

export type MentionInline = z.output<typeof MentionInlineSchema>;
export type MentionInlineInput = z.input<typeof MentionInlineSchema>;
export type InlineNode = z.output<typeof InlineNodeSchema>;
export type InlineNodeInput = z.input<typeof InlineNodeSchema>;

const TextChildrenSchema = z
  .array(InlineNodeSchema)
  .default([{ kind: "text", type: "text", text: "" }]);

const ElementBlockBaseSchema = z.object({
  ...NodeAttrsSchema,
  kind: z.literal("element").default("element"),
  flow: z.literal("block").default("block"),
});

export const ParagraphBlockSchema = ElementBlockBaseSchema.extend({
  type: z.literal("paragraph"),
  children: TextChildrenSchema,
});

export const HeadingBlockSchema = ElementBlockBaseSchema.extend({
  type: z.literal("heading"),
  level: z.number().int().min(1).max(6).default(2),
  children: TextChildrenSchema,
});

export const QuoteBlockSchema = ElementBlockBaseSchema.extend({
  type: z.literal("quote"),
  children: TextChildrenSchema,
});

export const ListItemBlockSchema = ElementBlockBaseSchema.extend({
  type: z.literal("listItem"),
  ordered: z.boolean().default(false),
  depth: z.number().int().min(0).default(0),
  children: TextChildrenSchema,
});

export const InlineTextBlockSchema = z.union([
  ParagraphBlockSchema,
  HeadingBlockSchema,
  QuoteBlockSchema,
  ListItemBlockSchema,
]);

export const CodeBlockSchema = ElementBlockBaseSchema.extend({
  type: z.literal("codeBlock"),
  language: z.string().min(1).optional(),
  text: z.string().default(""),
  children: z.array(TextNodeSchema).default([]),
});

export const FigureBlockSchema = z.object({
  ...NodeAttrsSchema,
  kind: z.literal("atom").default("atom"),
  type: z.literal("figure"),
  flow: z.literal("block").default("block"),
  src: z
    .string()
    .min(1)
    .refine((src) => normalizeFigureSrc(src) !== null),
  alt: z.string().optional(),
});

export const ElementNodeSchema = z.union([
  InlineTextBlockSchema,
  CodeBlockSchema,
]);

export type InlineTextBlock = z.output<typeof InlineTextBlockSchema>;
export type CodeBlock = z.output<typeof CodeBlockSchema>;
export type ElementNode = z.output<typeof ElementNodeSchema>;
export type FigureBlock = z.output<typeof FigureBlockSchema>;
export type FigureBlockInput = z.input<typeof FigureBlockSchema>;
export type AtomNode = MentionInline | FigureBlock;

export const NoteBlockSchema = z.union([ElementNodeSchema, FigureBlockSchema]);

export type NoteBlock = z.output<typeof NoteBlockSchema>;
export type NoteBlockInput = z.input<typeof NoteBlockSchema>;

export const DocumentRootSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("element").default("element"),
  type: z.literal("doc"),
  flow: z.literal("block"),
  attrs: AttrsSchema.optional(),
  children: z.array(NoteBlockSchema),
});

export const NoteDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  tags: z.array(z.string()),
  attrs: AttrsSchema.optional(),
  root: DocumentRootSchema,
});

export type DocumentRoot = z.output<typeof DocumentRootSchema>;
export type NoteDocument = z.output<typeof NoteDocumentSchema>;
export type NoteBlocks = NoteBlock[];
export type TextBlock = InlineTextBlock;

export {
  isCodeBlock,
  isFigureBlock,
  isInlineTextBlock,
  isTextBlock,
  readBlockText,
} from "./noteDocumentGuards";

let nextBlockId = 0;

export function createDocumentRoot(children: NoteBlockInput[]): DocumentRoot {
  return DocumentRootSchema.parse({
    id: "root",
    kind: "element",
    type: "doc",
    flow: "block",
    children,
  });
}

export function createNoteDocument(
  blocks: NoteBlockInput[],
  options: { id?: string; title?: string; tags?: string[] } = {},
): NoteDocument {
  return NoteDocumentSchema.parse({
    schemaVersion: 1,
    id: options.id ?? "note-test",
    title: options.title ?? "Untitled",
    tags: options.tags ?? [],
    root: createDocumentRoot(blocks),
  });
}

export function createGeneratedBlockId(): string {
  nextBlockId += 1;
  return `block-${nextBlockId}`;
}

export function seedGeneratedBlockIds(blocks: NoteBlock[]): void {
  nextBlockId = Math.max(nextBlockId, maxGeneratedBlockId(blocks));
}

export function createParagraphBlock(text = ""): InlineTextBlock {
  return ParagraphBlockSchema.parse({
    id: createGeneratedBlockId(),
    kind: "element",
    type: "paragraph",
    flow: "block",
    children: [textInline(text)],
  });
}

function maxGeneratedBlockId(blocks: NoteBlock[]): number {
  return blocks.reduce((maxId, block) => {
    const match = /^block-(\d+)$/.exec(block.id);
    if (match === null) {
      return maxId;
    }

    return Math.max(maxId, Number.parseInt(match[1] ?? "0", 10));
  }, 0);
}

export function textInline(text: string, marks?: Mark[]): TextNode {
  return TextNodeSchema.parse(
    marks === undefined || marks.length === 0
      ? { kind: "text", type: "text", text }
      : { kind: "text", type: "text", text, marks },
  );
}

export function mentionInline(id: string, label: string): MentionInline {
  return MentionInlineSchema.parse({
    id,
    kind: "atom",
    type: "mention",
    flow: "inline",
    attrs: { label },
    label,
  });
}

export function figureBlock(
  id: string,
  src: string,
  alt?: string,
): FigureBlock {
  const canonicalSrc = normalizeFigureSrc(src) ?? src;
  return FigureBlockSchema.parse({
    id,
    kind: "atom",
    type: "figure",
    flow: "block",
    attrs:
      alt === undefined ? { src: canonicalSrc } : { src: canonicalSrc, alt },
    src: canonicalSrc,
    ...(alt === undefined ? {} : { alt }),
  });
}
