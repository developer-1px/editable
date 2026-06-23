import type { InlineNode } from "./noteDocument";

export function inlineUnitLength(children: InlineNode[]): number {
  return children.reduce(
    (total, child) => total + (child.type === "text" ? child.text.length : 1),
    0,
  );
}
