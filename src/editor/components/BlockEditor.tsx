import { useJSONDocument } from "@interactive-os/json-document/react";
import { useCallback, useMemo, useRef } from "react";
import {
	readLexicalParagraphs,
	seedLexicalParagraphs,
} from "../donor/lexicalAdapter";
import {
	ContentEditable,
	type EditorState,
	HistoryPlugin,
	type InitialConfigType,
	LexicalComposer,
	type LexicalEditor,
	LexicalErrorBoundary,
	OnChangePlugin,
	PlainTextPlugin,
} from "../donor/lexicalRuntime";
import type { NoteBlock } from "../model/noteDocument";
import { initialNoteDocument, NoteDocumentSchema } from "../model/noteDocument";

function sameBlocks(left: NoteBlock[], right: NoteBlock[]) {
	return (
		left.length === right.length &&
		left.every((block, index) => {
			const next = right[index];
			return (
				next !== undefined &&
				block.id === next.id &&
				block.type === next.type &&
				block.text === next.text
			);
		})
	);
}

export function BlockEditor() {
	const document = useJSONDocument(NoteDocumentSchema, initialNoteDocument, {
		history: 100,
		selection: true,
		trustedInitial: true,
	});
	const blocksRef = useRef(document.value.blocks);
	blocksRef.current = document.value.blocks;

	const initialConfig = useMemo<InitialConfigType>(
		() => ({
			namespace: "json-document-block-editor",
			onError(error) {
				throw error;
			},
			editorState() {
				seedLexicalParagraphs(blocksRef.current);
			},
			theme: {
				paragraph: "editor-paragraph",
			},
		}),
		[],
	);

	const handleTitleChange = useCallback(
		(value: string) => {
			document.replace("/title", value);
		},
		[document],
	);

	const handleEditorChange = useCallback(
		(editorState: EditorState, _editor: LexicalEditor, _tags: Set<string>) => {
			editorState.read(() => {
				const nextBlocks = readLexicalParagraphs(blocksRef.current);

				if (!sameBlocks(blocksRef.current, nextBlocks)) {
					document.replace("/blocks", nextBlocks);
				}
			});
		},
		[document],
	);

	return (
		<main className="app-shell">
			<aside className="note-list" aria-label="Notes">
				<button className="note-row note-row-active" type="button">
					<span>{document.value.title}</span>
					<small>{document.value.tags.map((tag) => `#${tag}`).join(" ")}</small>
				</button>
			</aside>

			<section className="editor-pane" aria-label="Editor">
				<input
					aria-label="Title"
					className="title-input"
					value={document.value.title}
					onChange={(event) => handleTitleChange(event.target.value)}
				/>

				<LexicalComposer initialConfig={initialConfig}>
					<PlainTextPlugin
						contentEditable={
							<ContentEditable
								aria-label="Body"
								className="editor-input"
								spellCheck={true}
							/>
						}
						ErrorBoundary={LexicalErrorBoundary}
					/>
					<HistoryPlugin />
					<OnChangePlugin onChange={handleEditorChange} />
				</LexicalComposer>
			</section>
		</main>
	);
}
