import type { NoteBlock } from "../model/noteDocument";
import { createParagraphBlock } from "../model/noteDocument";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isParagraphNode,
} from "./lexicalRuntime";

export function seedLexicalParagraphs(blocks: NoteBlock[]): void {
	const root = $getRoot();
	root.clear();

	for (const block of blocks) {
		const paragraph = $createParagraphNode();

		if (block.text.length > 0) {
			paragraph.append($createTextNode(block.text));
		}

		root.append(paragraph);
	}
}

export function readLexicalParagraphs(
	previousBlocks: NoteBlock[],
): NoteBlock[] {
	const paragraphs = $getRoot()
		.getChildren()
		.filter($isParagraphNode)
		.map((node, index) => {
			const existing = previousBlocks[index];

			return {
				id: existing?.id ?? createParagraphBlock().id,
				type: "paragraph" as const,
				text: node.getTextContent(),
			};
		});

	return paragraphs.length > 0 ? paragraphs : [createParagraphBlock()];
}
