import {
  createParagraphBlock,
  type InlineNode,
  type InlineNodeInput,
  InlineNodeSchema,
  isInlineTextBlock,
  type Mark,
  type NoteBlock,
  type NoteDocument,
  textInline,
} from "./noteDocument";

const MARK_ORDER: Record<Mark["type"], number> = {
  bold: 0,
  italic: 1,
  code: 2,
  link: 3,
};

export function normalizeDocument(document: NoteDocument): NoteDocument {
  return {
    ...document,
    root: {
      ...document.root,
      children: normalizeBlocks(document.root.children),
    },
  };
}

export function normalizeBlocks(blocks: NoteBlock[]): NoteBlock[] {
  const normalized = blocks.map(normalizeBlock);

  return normalized.length > 0 ? normalized : [createParagraphBlock("")];
}

export function normalizeBlock(block: NoteBlock): NoteBlock {
  if (isInlineTextBlock(block)) {
    return {
      ...block,
      children: normalizeInlineChildren(block.children),
    };
  }

  return block;
}

export function normalizeInlineChildren(
  children: InlineNodeInput[],
): InlineNode[] {
  const normalized = mergeAdjacentText(
    children.filter((child) => child.type !== "text" || child.text.length > 0),
  );

  return normalized.length > 0 ? normalized : [textInline("")];
}

export function mergeAdjacentText(children: InlineNodeInput[]): InlineNode[] {
  const merged: InlineNode[] = [];

  for (const child of children
    .map((candidate) => InlineNodeSchema.parse(candidate))
    .map(normalizeInlineNode)) {
    const previous = merged[merged.length - 1];
    if (
      previous?.type === "text" &&
      child.type === "text" &&
      marksKey(previous.marks) === marksKey(child.marks)
    ) {
      merged[merged.length - 1] = {
        ...previous,
        type: "text",
        text: previous.text + child.text,
      };
    } else {
      merged.push(child);
    }
  }

  return merged;
}

function normalizeInlineNode(child: InlineNode): InlineNode {
  if (child.type !== "text") {
    return child;
  }

  const marks = normalizeMarks(child.marks);

  return marks.length > 0 ? { ...child, marks } : textInline(child.text);
}

function normalizeMarks(marks: Mark[] | undefined): Mark[] {
  if (marks === undefined) {
    return [];
  }

  const byKey = new Map<string, Mark>();
  for (const mark of marks) {
    const normalized = normalizeMark(mark);
    byKey.set(markKey(normalized), normalized);
  }

  return Array.from(byKey.values()).sort((left, right) => {
    const order = MARK_ORDER[left.type] - MARK_ORDER[right.type];
    return order === 0 ? markKey(left).localeCompare(markKey(right)) : order;
  });
}

function marksKey(marks: Mark[] | undefined): string {
  return JSON.stringify(normalizeMarks(marks));
}

function markKey(mark: Mark): string {
  return JSON.stringify(mark);
}

function normalizeMark(mark: Mark): Mark {
  if (mark.type !== "link") {
    return { type: mark.type };
  }

  return mark.title === undefined
    ? { type: "link", href: mark.href }
    : { type: "link", href: mark.href, title: mark.title };
}
