import { selectionFromCursorPoint } from "../cursorCommands";
import type { InlineNode } from "../noteDocument";
import { textInline } from "../noteDocument";
import { textPath } from "./textCommandAddressing";
import type { TextCommandResult } from "./textCommandResult";

export type InlineTextMarks = Extract<InlineNode, { type: "text" }>["marks"];

export function addInlineText(
  blockIndex: number,
  childIndex: number,
  text: string,
  marks?: InlineTextMarks,
): TextCommandResult {
  const child = textInline(text, marks);
  const insertedTextPath = textPath(blockIndex, childIndex);

  return {
    ok: true,
    patch: [
      {
        op: "add",
        path: `/root/children/${blockIndex}/children/${childIndex}`,
        value: child,
      },
    ],
    selectionAfter: selectionFromCursorPoint({
      path: insertedTextPath,
      offset: text.length,
    }),
  };
}
