import type { SelectionSnap } from "@interactive-os/json-document";
import { type EdgeCursorPoint, normalizeCursorPoint } from "../cursor";
import {
  cursorPointInputFromSelection,
  selectionFromCursorPoint,
} from "../cursorCommands";
import {
  createParagraphBlock,
  type InlineNode,
  isInlineTextBlock,
  type MentionInlineInput,
  MentionInlineSchema,
  type NoteDocument,
} from "../noteDocument";
import {
  blockLocationFromPath,
  inlineAtomLocationFromPath,
  inlinePath,
  type TextLocation,
  textInline,
  textLocationFromPath,
} from "./textCommandAddressing";
import { replaceDocumentRangeWithInlineNode } from "./textCommandDocumentRange";
import type { TextCommandResult } from "./textCommandResult";
import {
  type SelectedAtom,
  selectedDocumentRange,
  selectedSingleAtom,
  selectedSingleTextRange,
} from "./textCommandSelectionTargets";

type MentionInline = Extract<InlineNode, { type: "mention" }>;

export function insertMention(
  document: NoteDocument,
  selection: SelectionSnap,
  mention: MentionInlineInput,
): TextCommandResult {
  const canonicalMention = MentionInlineSchema.parse(mention);
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return insertInlineAtomAtTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      canonicalMention,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithMention(
      document,
      selectedAtom,
      canonicalMention,
    );
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithInlineNode(
      document,
      selectedRange,
      canonicalMention,
    );
    if (result !== null) {
      return result;
    }
  }

  const point = normalizeCursorPoint(
    document,
    cursorPointInputFromSelection(selection),
  );

  if (point.offset !== undefined) {
    const location = textLocationFromPath(document, point.path);
    if (location === null) {
      return { ok: false, reason: "Cursor text path does not exist." };
    }

    return insertInlineAtomAtTextRange(
      document,
      location,
      point.offset,
      point.offset,
      canonicalMention,
    );
  }

  return insertMentionAtAtomEdge(document, point, canonicalMention);
}

function replaceSelectedAtomWithMention(
  _document: NoteDocument,
  atom: SelectedAtom,
  mention: MentionInline,
): TextCommandResult {
  if (atom.kind === "inline") {
    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: inlinePath(atom.blockIndex, atom.childIndex),
          value: mention,
        },
      ],
      selectionAfter: selectionFromCursorPoint({
        path: inlinePath(atom.blockIndex, atom.childIndex),
        edge: "after",
      }),
    };
  }

  const block = {
    ...createParagraphBlock(""),
    children: [mention],
  };

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${atom.blockIndex}`,
        value: block,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(atom.blockIndex, 0),
      edge: "after",
    }),
  };
}

function insertInlineAtomAtTextRange(
  document: NoteDocument,
  location: TextLocation,
  startOffset: number,
  endOffset: number,
  atom: MentionInline,
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (location.kind === "code") {
    return {
      ok: false,
      reason: "Inline atoms cannot be inserted inside code blocks.",
    };
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const nextChildren: InlineNode[] = [
    ...block.children.slice(0, location.childIndex),
  ];
  const beforeText = location.text.slice(0, startOffset);
  if (beforeText.length > 0) {
    nextChildren.push(textInline(beforeText, location.marks));
  }
  const atomIndex = nextChildren.length;
  nextChildren.push(atom);
  const afterText = location.text.slice(endOffset);
  if (afterText.length > 0) {
    nextChildren.push(textInline(afterText, location.marks));
  }
  nextChildren.push(...block.children.slice(location.childIndex + 1));

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${location.blockIndex}/children`,
        value: nextChildren,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(location.blockIndex, atomIndex),
      edge: "after",
    }),
  };
}

function insertMentionAtAtomEdge(
  document: NoteDocument,
  point: EdgeCursorPoint,
  mention: MentionInline,
): TextCommandResult {
  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    const childIndex =
      point.edge === "before" ? inline.childIndex : inline.childIndex + 1;
    return addInlineAtom(inline.blockIndex, childIndex, mention);
  }

  const blockIndex = blockLocationFromPath(document, point.path);
  if (blockIndex !== null) {
    const block = document.root.children[blockIndex];
    if (isInlineTextBlock(block)) {
      return addInlineAtom(
        blockIndex,
        point.edge === "before" ? 0 : block.children.length,
        mention,
      );
    }

    return insertMentionAtFigureEdge(document, blockIndex, point.edge, mention);
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function insertMentionAtFigureEdge(
  document: NoteDocument,
  blockIndex: number,
  edge: "before" | "after",
  mention: MentionInline,
): TextCommandResult {
  if (edge === "before") {
    const previousBlockIndex = blockIndex - 1;
    const previous = document.root.children[previousBlockIndex];
    if (isInlineTextBlock(previous)) {
      return addInlineAtom(
        previousBlockIndex,
        previous.children.length,
        mention,
      );
    }

    return addParagraphWithInlineAtom(blockIndex, mention);
  }

  const nextBlockIndex = blockIndex + 1;
  const next = document.root.children[nextBlockIndex];
  if (isInlineTextBlock(next)) {
    return addInlineAtom(nextBlockIndex, 0, mention);
  }

  return addParagraphWithInlineAtom(nextBlockIndex, mention);
}

function addInlineAtom(
  blockIndex: number,
  childIndex: number,
  atom: MentionInline,
): TextCommandResult {
  return {
    ok: true,
    patch: [
      {
        op: "add",
        path: inlinePath(blockIndex, childIndex),
        value: atom,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(blockIndex, childIndex),
      edge: "after",
    }),
  };
}

function addParagraphWithInlineAtom(
  blockIndex: number,
  atom: MentionInline,
): TextCommandResult {
  const block = {
    ...createParagraphBlock(""),
    children: [atom],
  };

  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${blockIndex}`, value: block }],
    selectionAfter: selectionFromCursorPoint({
      path: inlinePath(blockIndex, 0),
      edge: "after",
    }),
  };
}
