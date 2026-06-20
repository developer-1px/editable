import { describe, expect, it } from "vitest";
import {
	createParagraphBlock,
	initialNoteDocument,
	NoteDocumentSchema,
} from "./noteDocument";

describe("note document schema", () => {
	it("accepts the initial paragraph document", () => {
		expect(NoteDocumentSchema.safeParse(initialNoteDocument).success).toBe(
			true,
		);
	});

	it("creates paragraph blocks for editor inserts", () => {
		expect(createParagraphBlock("hello")).toMatchObject({
			type: "paragraph",
			text: "hello",
		});
	});
});
