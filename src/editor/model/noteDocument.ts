import { z } from "zod";

export const NoteBlockSchema = z.object({
	id: z.string().min(1),
	type: z.literal("paragraph"),
	text: z.string(),
});

export const NoteDocumentSchema = z.object({
	id: z.string().min(1),
	title: z.string(),
	tags: z.array(z.string()),
	blocks: z.array(NoteBlockSchema).min(1),
});

export type NoteBlock = z.infer<typeof NoteBlockSchema>;
export type NoteDocument = z.infer<typeof NoteDocumentSchema>;

export const initialNoteDocument: NoteDocument = {
	id: "note-1",
	title: "Untitled",
	tags: ["contenteditable"],
	blocks: [
		{
			id: "block-1",
			type: "paragraph",
			text: "Start writing.",
		},
	],
};

let nextBlockId = 1;

export function createParagraphBlock(text = ""): NoteBlock {
	nextBlockId += 1;

	return {
		id: `block-${nextBlockId}`,
		type: "paragraph",
		text,
	};
}
