import { z } from "zod";
import { RICH_DOCUMENT_SCHEMA } from "./index";
import type { JSONValue } from "./index";

const JSONValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JSONValueSchema),
    z.record(z.string(), JSONValueSchema),
  ]),
);

export const RichInlineAtomSchema = z
  .object({
    type: z.string(),
    offset: z.number().int().nonnegative(),
    label: z.string().optional(),
    text: z.string().optional(),
    target: z.string().optional(),
    href: z.string().optional(),
    data: z.record(z.string(), JSONValueSchema).optional(),
  })
  .catchall(JSONValueSchema.optional());

export const RichInlineRangeSchema = z
  .object({
    type: z.string(),
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    href: z.string().optional(),
    data: z.record(z.string(), JSONValueSchema).optional(),
  })
  .catchall(JSONValueSchema.optional());

const RichTextBlockBaseSchema = z.object({
  id: z.string().min(1),
  text: z.string(),
  atoms: z.record(z.string(), RichInlineAtomSchema),
  ranges: z.record(z.string(), RichInlineRangeSchema),
  metadata: z.record(z.string(), JSONValueSchema).optional(),
});

export const RichBlockSchema = z.discriminatedUnion("type", [
  RichTextBlockBaseSchema.extend({ type: z.literal("paragraph") }),
  RichTextBlockBaseSchema.extend({
    type: z.literal("heading"),
    level: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
      z.literal(6),
    ]),
  }),
  RichTextBlockBaseSchema.extend({
    type: z.literal("listItem"),
    listKind: z.union([
      z.literal("bullet"),
      z.literal("ordered"),
      z.literal("task"),
    ]),
    indent: z.number().int().nonnegative(),
    checked: z.boolean().optional(),
  }),
  RichTextBlockBaseSchema.extend({ type: z.literal("quote") }),
  RichTextBlockBaseSchema.extend({
    type: z.literal("code"),
    language: z.string().optional(),
  }),
  RichTextBlockBaseSchema.extend({
    type: z.literal("extension"),
    kind: z.string().min(1),
    data: z.record(z.string(), JSONValueSchema).optional(),
  }),
]);

export const RichDocumentSchema = z.object({
  schema: z.literal(RICH_DOCUMENT_SCHEMA),
  id: z.string().min(1),
  blocks: z.array(RichBlockSchema),
  metadata: z.record(z.string(), JSONValueSchema).optional(),
});
