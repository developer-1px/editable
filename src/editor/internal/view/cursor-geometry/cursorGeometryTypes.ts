import type { CursorPoint } from "../../model/cursor";

export type CursorGeometry = {
  rectForPoint(point: CursorPoint): DOMRect | null;
  rectsForRange(anchor: CursorPoint, focus: CursorPoint): DOMRect[];
  pointFromCoordinates(x: number, y: number): CursorPoint | null;
  pointForVerticalMovement?(
    origin: CursorPoint,
    x: number,
    direction: "up" | "down",
    distance: "line" | "page",
  ): CursorPoint | null;
  lineStartPoint?(point: CursorPoint): CursorPoint | null;
  lineEndPoint?(point: CursorPoint): CursorPoint | null;
  pageStep(): number;
};

export type LayoutFragment =
  | {
      kind: "text";
      path: string;
      rect: DOMRect;
      startOffset: number;
      endOffset: number;
      offsets: number[];
      caretXs: number[];
      isLineBreak?: boolean;
      orderStart: number;
      orderEnd: number;
    }
  | {
      kind: "atom";
      path: string;
      rect: DOMRect;
      orderStart: number;
      orderEnd: number;
    };

export type TextLayoutFragment = Extract<LayoutFragment, { kind: "text" }>;

export type TextCaretFragment = {
  fragment: TextLayoutFragment;
  offset: number;
};

export type LayoutLine = {
  blockPath: string;
  rect: DOMRect;
  start: CursorPoint;
  end: CursorPoint;
  fragments: LayoutFragment[];
};

export type FigureLayoutAtom = {
  rect: DOMRect;
  orderStart: number;
  orderEnd: number;
};

export type GeometryMap = {
  lines: LayoutLine[];
  figures: Map<string, FigureLayoutAtom>;
};

export type LayoutRow =
  | {
      kind: "line";
      line: LayoutLine;
      rect: DOMRect;
    }
  | {
      kind: "figure";
      path: string;
      rect: DOMRect;
    };

export type InlineLayoutItem = {
  kind: "text" | "atom";
  path: string;
  text: string;
  font: string;
  element: Element;
  consumedOffset: number;
  extraWidth: number;
};
