export type CursorDirection = "backward" | "forward";
export type CursorEdge = "before" | "after";
export type CursorAffinity = "backward" | "forward";
export type TextCursorPoint = {
  path: string;
  offset: number;
  edge?: never;
  affinity?: CursorAffinity;
};
export type EdgeCursorPoint = {
  path: string;
  edge: CursorEdge;
  offset?: never;
  affinity?: CursorAffinity;
};
export type CursorPoint = TextCursorPoint | EdgeCursorPoint;
export type CursorPointInput = {
  path: string;
  offset?: number;
  edge?: CursorEdge;
  affinity?: CursorAffinity;
};

export {
  createCursorIndexResolver,
  cursorLength,
  cursorPointAt,
  documentCursorPointAt,
  moveDocumentCursor,
  resolveCursorIndex,
  resolveDocumentCursorIndex,
  selectedAtomPointersBetween,
} from "./cursorDocumentIndex";
export { firstCursorPoint, lastCursorPoint } from "./cursorEndpoints";
export {
  moveCursor,
  moveCursorByBlockBoundary,
  moveCursorByWord,
} from "./cursorMovement";
export { normalizeCursorPoint, toSelectionPoint } from "./cursorNormalization";
