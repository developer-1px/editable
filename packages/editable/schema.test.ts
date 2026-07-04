import { describe, expect, it } from "vitest";
import * as SchemaPublic from "./schema";
import { createRichBlock, createRichDocument } from "./index";

describe("editable schema entry", () => {
  it("locks the runtime public schema surface", () => {
    expect(Object.keys(SchemaPublic).sort()).toEqual([
      "RichBlockSchema",
      "RichDocumentSchema",
      "RichInlineAtomSchema",
      "RichInlineRangeSchema",
    ]);
  });

  it("parses a rich document without adding zod to the kernel entry", () => {
    const document = createRichDocument({
      id: "doc",
      blocks: [createRichBlock({ id: "b1", type: "paragraph", text: "Plain" })],
    });

    expect(SchemaPublic.RichDocumentSchema.parse(document)).toEqual(document);
  });
});
