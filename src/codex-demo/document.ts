import { createJSONDocument } from "@interactive-os/json-document";
import { z } from "zod";
import {
  JSON_ATOM_ATTRIBUTE,
  JSON_ATOM_REPLACEMENT,
  JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
  type JsonContentEditableFragment,
} from "../../codex/core";

export const CODEX_DEMO_ATOMS_PATH = "/atoms";

const INITIAL_MENTION_ID = "mention-ada";
const INITIAL_TEXT = `Plain text. 한글과 日本語 IME. ${JSON_ATOM_REPLACEMENT}`;

const MentionAtomSchema = z.object({
  type: z.literal("mention"),
  userId: z.string(),
  label: z.string(),
  offset: z.number().int().nonnegative(),
});

const CodexDemoDocumentSchema = z.object({
  text: z.string(),
  atoms: z.record(z.string(), MentionAtomSchema),
});

export type CodexDemoDocument = z.infer<typeof CodexDemoDocumentSchema>;
type MentionAtom = z.infer<typeof MentionAtomSchema>;

export function createCodexDemoValue(): CodexDemoDocument {
  return {
    text: INITIAL_TEXT,
    atoms: {
      [INITIAL_MENTION_ID]: {
        type: "mention",
        userId: "ada",
        label: "@Ada",
        offset: INITIAL_TEXT.indexOf(JSON_ATOM_REPLACEMENT),
      },
    },
  };
}

export function createCodexDemoDocument() {
  return createJSONDocument(CodexDemoDocumentSchema, createCodexDemoValue(), {
    history: 100,
    selection: true,
    trustedInitial: true,
  });
}

export function createMentionFragment(): JsonContentEditableFragment {
  const id = `mention-${Date.now().toString(36)}`;
  return {
    schema: JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA,
    text: JSON_ATOM_REPLACEMENT,
    atoms: {
      [id]: {
        type: "mention",
        userId: "ada",
        label: "@Ada",
        offset: 0,
      },
    },
  };
}

export function renderCodexDemoContent(
  root: HTMLElement,
  document: CodexDemoDocument,
): void {
  const byOffset = new Map<number, [string, MentionAtom]>();
  for (const entry of Object.entries(document.atoms)) {
    byOffset.set(entry[1].offset, entry);
  }

  root.replaceChildren();
  let buffer = "";
  const flushText = () => {
    if (buffer.length === 0) {
      return;
    }
    root.append(root.ownerDocument.createTextNode(buffer));
    buffer = "";
  };

  for (let offset = 0; offset < document.text.length; offset += 1) {
    const atomEntry = byOffset.get(offset);
    if (
      document.text[offset] !== JSON_ATOM_REPLACEMENT ||
      atomEntry === undefined
    ) {
      buffer += document.text[offset] ?? "";
      continue;
    }

    flushText();
    const [id, atom] = atomEntry;
    const element = root.ownerDocument.createElement("span");
    element.className = "mention-chip";
    element.contentEditable = "false";
    element.setAttribute(JSON_ATOM_ATTRIBUTE, id);
    element.textContent = atom.label;
    root.append(element);
  }

  flushText();
}
