import {
  createJSONDocument,
  type JSONDocument,
  type Pointer,
  type SelectionPoint,
  type SelectionState,
} from "@interactive-os/json-document";
import { z } from "zod";

export type EditableBlockType = "paragraph" | "heading" | "quote" | "code";

export type EditableBlock = {
  id: string;
  type: EditableBlockType;
  text: string;
};

export type EditableDocumentValue = {
  schema: "interactive-os.editable-document@2";
  id: string;
  blocks: EditableBlock[];
};

export type EditablePoint = {
  blockId: string;
  blockIndex: number;
  offset: number;
};

export type OrderedEditableSelection = {
  start: EditablePoint;
  end: EditablePoint;
};

const EditableBlockSchema: z.ZodType<EditableBlock> = z.object({
  id: z.string().min(1),
  type: z.enum(["paragraph", "heading", "quote", "code"]),
  text: z.string(),
});

export const EditableDocumentSchema: z.ZodType<EditableDocumentValue> = z
  .object({
    schema: z.literal("interactive-os.editable-document@2"),
    id: z.string().min(1),
    blocks: z.array(EditableBlockSchema),
  })
  .refine(
    (value) =>
      new Set(value.blocks.map((block) => block.id)).size ===
      value.blocks.length,
    {
      message: "Block ids must be unique.",
      path: ["blocks"],
    },
  );

export function createInitialEditableValue(): EditableDocumentValue {
  return {
    schema: "interactive-os.editable-document@2",
    id: "composition-island-demo",
    blocks: [
      {
        id: "welcome",
        type: "heading",
        text: "Composition island editor",
      },
      {
        id: "korean-ime",
        type: "paragraph",
        text: "한글 IME로 입력하는 동안 조합 중인 DOM 노드를 그대로 유지합니다.",
      },
      {
        id: "japanese-ime",
        type: "quote",
        text: "日本語 IME の変換中も、編集中の DOM ノードを置き換えません。",
      },
      {
        id: "render-rule",
        type: "code",
        text: "renderOutside(compositionIsland)",
      },
    ],
  };
}

export function createEditableDocument(
  initial?: EditableDocumentValue,
): JSONDocument<EditableDocumentValue> {
  const options = {
    history: 100,
    selection: { mode: "extended" as const },
  };
  return initial === undefined
    ? createJSONDocument(EditableDocumentSchema, createInitialEditableValue(), {
        ...options,
        trustedInitial: true,
      })
    : createJSONDocument(EditableDocumentSchema, initial, options);
}

export function editableTextPath(blockIndex: number): Pointer {
  if (!Number.isSafeInteger(blockIndex) || blockIndex < 0) {
    throw new RangeError(
      "Editable block index must be a non-negative safe integer.",
    );
  }
  return `/blocks/${blockIndex}/text`;
}

export function editableBlockIndexFromTextPath(path: Pointer): number | null {
  const match = /^\/blocks\/(0|[1-9]\d*)\/text$/u.exec(path);
  if (match === null) {
    return null;
  }
  const blockIndex = Number(match[1]);
  return Number.isSafeInteger(blockIndex) ? blockIndex : null;
}

export function findEditableBlockIndex(
  value: EditableDocumentValue,
  blockId: string,
): number {
  return value.blocks.findIndex((block) => block.id === blockId);
}

export function primaryEditablePoint(
  value: EditableDocumentValue,
  selection: Pick<SelectionState, "primaryRange"> | null | undefined,
): EditablePoint | null {
  const range = selection?.primaryRange;
  return range === null || range === undefined
    ? null
    : resolveEditablePoint(value, range.focus);
}

export function orderedEditableSelection(
  value: EditableDocumentValue,
  selection: Pick<SelectionState, "primaryRange"> | null | undefined,
): OrderedEditableSelection | null {
  const range = selection?.primaryRange;
  if (range === null || range === undefined) {
    return null;
  }

  const anchor = resolveEditablePoint(value, range.anchor);
  const focus = resolveEditablePoint(value, range.focus);
  if (anchor === null || focus === null) {
    return null;
  }

  return compareEditablePoints(anchor, focus) <= 0
    ? { start: anchor, end: focus }
    : { start: focus, end: anchor };
}

function resolveEditablePoint(
  value: EditableDocumentValue,
  point: SelectionPoint,
): EditablePoint | null {
  const path = typeof point === "string" ? point : point.path;
  const blockIndex = editableBlockIndexFromTextPath(path);
  if (blockIndex === null) {
    return null;
  }

  const block = value.blocks[blockIndex];
  if (block === undefined) {
    return null;
  }

  const rawOffset = typeof point === "string" ? 0 : (point.offset ?? 0);
  if (!Number.isFinite(rawOffset)) {
    return null;
  }

  return {
    blockId: block.id,
    blockIndex,
    offset: Math.min(block.text.length, Math.max(0, Math.trunc(rawOffset))),
  };
}

function compareEditablePoints(left: EditablePoint, right: EditablePoint): number {
  return left.blockIndex === right.blockIndex
    ? left.offset - right.offset
    : left.blockIndex - right.blockIndex;
}
