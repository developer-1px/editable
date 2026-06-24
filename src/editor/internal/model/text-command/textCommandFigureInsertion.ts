import type { SelectionSnap } from "@interactive-os/json-document";
import { type EdgeCursorPoint, normalizeCursorPoint } from "../cursor";
import {
  cursorPointInputFromSelection,
  selectionFromCursorPoint,
} from "../cursorCommands";
import { normalizeFigureSrc } from "../mediaSrc";
import { normalizeInlineChildren } from "../normalizer";
import {
  createParagraphBlock,
  type FigureBlockInput,
  FigureBlockSchema,
  type InlineNode,
  type InlineTextBlock,
  isInlineTextBlock,
  type NoteBlock,
  type NoteDocument,
} from "../noteDocument";
import {
  blockLocationFromPath,
  inlineAtomLocationFromPath,
  type TextLocation,
  textInline,
  textLocationFromPath,
} from "./textCommandAddressing";
import { replaceDocumentRangeWithFigure } from "./textCommandDocumentRange";
import type { TextCommandResult } from "./textCommandResult";
import {
  type SelectedAtom,
  selectedDocumentRange,
  selectedSingleAtom,
  selectedSingleTextRange,
} from "./textCommandSelectionTargets";

type FigureBlock = Extract<NoteBlock, { type: "figure" }>;

export function insertFigure(
  document: NoteDocument,
  selection: SelectionSnap,
  figure: FigureBlockInput,
): TextCommandResult {
  const src = normalizeFigureSrc(figure.src);
  if (src === null) {
    return { ok: false, reason: "Figure src is invalid." };
  }

  const canonicalFigure = FigureBlockSchema.parse({ ...figure, src });
  const selectedTextRange = selectedSingleTextRange(document, selection);
  if (selectedTextRange !== null) {
    return insertFigureAtTextRange(
      document,
      selectedTextRange.location,
      selectedTextRange.startOffset,
      selectedTextRange.endOffset,
      canonicalFigure,
    );
  }

  const selectedAtom = selectedSingleAtom(document, selection);
  if (selectedAtom !== null) {
    return replaceSelectedAtomWithFigure(
      document,
      selectedAtom,
      canonicalFigure,
    );
  }

  const selectedRange = selectedDocumentRange(document, selection);
  if (selectedRange !== null) {
    const result = replaceDocumentRangeWithFigure(
      document,
      selectedRange,
      canonicalFigure,
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

    return insertFigureAtTextRange(
      document,
      location,
      point.offset,
      point.offset,
      canonicalFigure,
    );
  }

  return insertFigureAtAtomEdge(document, point, canonicalFigure);
}

function replaceSelectedAtomWithFigure(
  document: NoteDocument,
  atom: SelectedAtom,
  figure: FigureBlock,
): TextCommandResult {
  if (atom.kind === "figure") {
    return {
      ok: true,
      patch: [
        {
          op: "replace",
          path: `/root/children/${atom.blockIndex}`,
          value: figure,
        },
      ],
      selectionAfter: selectionFromCursorPoint({
        path: `/root/children/${atom.blockIndex}`,
        edge: "after",
      }),
    };
  }

  const block = document.root.children[atom.blockIndex];
  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Inline atom must belong to a paragraph." };
  }

  return insertFigureBetweenParagraphChildren(
    block,
    atom.blockIndex,
    block.children.slice(0, atom.childIndex),
    block.children.slice(atom.childIndex + 1),
    figure,
  );
}

function insertFigureAtTextRange(
  document: NoteDocument,
  location: TextLocation,
  startOffset: number,
  endOffset: number,
  figure: FigureBlock,
): TextCommandResult {
  const block = document.root.children[location.blockIndex];
  if (location.kind === "code") {
    return addFigureBlock(location.blockIndex + 1, figure);
  }

  if (!isInlineTextBlock(block)) {
    return { ok: false, reason: "Expected text block." };
  }

  const beforeChildren: InlineNode[] = [
    ...block.children.slice(0, location.childIndex),
    textInline(location.text.slice(0, startOffset), location.marks),
  ];
  const afterChildren: InlineNode[] = [
    textInline(location.text.slice(endOffset), location.marks),
    ...block.children.slice(location.childIndex + 1),
  ];

  return insertFigureBetweenParagraphChildren(
    block,
    location.blockIndex,
    beforeChildren,
    afterChildren,
    figure,
  );
}

function insertFigureAtAtomEdge(
  document: NoteDocument,
  point: EdgeCursorPoint,
  figure: FigureBlock,
): TextCommandResult {
  const inline = inlineAtomLocationFromPath(document, point.path);
  if (inline !== null) {
    const block = document.root.children[inline.blockIndex];
    if (!isInlineTextBlock(block)) {
      return { ok: false, reason: "Expected text block." };
    }
    const splitIndex =
      point.edge === "before" ? inline.childIndex : inline.childIndex + 1;

    return insertFigureBetweenParagraphChildren(
      block,
      inline.blockIndex,
      block.children.slice(0, splitIndex),
      block.children.slice(splitIndex),
      figure,
    );
  }

  const blockIndex = blockLocationFromPath(document, point.path);
  if (blockIndex !== null) {
    return addFigureBlock(
      point.edge === "before" ? blockIndex : blockIndex + 1,
      figure,
    );
  }

  return { ok: false, reason: "Cursor atom path does not exist." };
}

function insertFigureBetweenParagraphChildren(
  block: InlineTextBlock,
  blockIndex: number,
  beforeChildren: InlineNode[],
  afterChildren: InlineNode[],
  figure: FigureBlock,
): TextCommandResult {
  const beforeBlock = {
    ...block,
    children: normalizeInlineChildren(beforeChildren),
  };
  const afterBlock = {
    ...createParagraphBlock(""),
    children: normalizeInlineChildren(afterChildren),
  };
  const figureIndex = blockIndex + 1;

  return {
    ok: true,
    patch: [
      {
        op: "replace",
        path: `/root/children/${blockIndex}`,
        value: beforeBlock,
      },
      { op: "add", path: `/root/children/${figureIndex}`, value: figure },
      {
        op: "add",
        path: `/root/children/${figureIndex + 1}`,
        value: afterBlock,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: `/root/children/${figureIndex}`,
      edge: "after",
    }),
  };
}

function addFigureBlock(
  blockIndex: number,
  figure: FigureBlock,
): TextCommandResult {
  return {
    ok: true,
    patch: [{ op: "add", path: `/root/children/${blockIndex}`, value: figure }],
    selectionAfter: selectionFromCursorPoint({
      path: `/root/children/${blockIndex}`,
      edge: "after",
    }),
  };
}
