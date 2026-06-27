import type { JSONPatchOperation, Pointer } from "@interactive-os/json-document";

export type EditorContractResult<T, Code extends string> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      code: Code;
      reason: string;
    };

export function editorContractOk<T>(
  value: T,
): EditorContractResult<T, never> {
  return { ok: true, value };
}

export function editorContractBlocked<Code extends string>(
  code: Code,
  reason: string,
): EditorContractResult<never, Code> {
  return { ok: false, code, reason };
}

export type TextSurfaceId = Pointer;

export type EditorAffinity = "before" | "after";

export type EditorPoint = {
  path: Pointer;
  offset: number;
  affinity: EditorAffinity;
};

export type EditorSelectionDirection = "forward" | "backward" | "none";

export type EditorSelection = {
  anchor: EditorPoint;
  focus: EditorPoint;
  direction: EditorSelectionDirection;
  goalX: number | null;
};

export type EditorTextUnit =
  | "grapheme"
  | "word"
  | "logical-line"
  | "visual-line"
  | "block"
  | "document";

export type EditorBoundaryKind =
  | "text"
  | "atom-before"
  | "atom-after"
  | "syntax"
  | "word-start"
  | "word-end"
  | "line-start"
  | "line-end"
  | "block-start"
  | "block-end";

export type NativeTextLease = {
  surface: TextSurfaceId;
  composing: boolean;
};

export type CompositionState =
  | {
      active: false;
    }
  | {
      active: true;
      surface: TextSurfaceId;
      range: {
        start: number;
        end: number;
      };
      text: string;
    };

export type TransientTextSnapshot = {
  surface: TextSurfaceId;
  text: string;
  selection: EditorSelection | null;
  composition: CompositionState;
};

export type NativeTextCommit = {
  surface: TextSurfaceId;
  previousText: string;
  nextText: string;
  selectionAfter: EditorSelection | null;
  composition: CompositionState;
};

export type TextInputAdapterErrorCode =
  | "outside-editor"
  | "missing-text-surface"
  | "missing-dom-selection"
  | "stale-lease"
  | "composition-active"
  | "unsupported-input";

export type InputDiffErrorCode =
  | "invalid-text-diff"
  | "unsupported-composition"
  | "surface-mismatch";

export type CommandRouterErrorCode =
  | "not-command"
  | "unsupported-input"
  | "composition-active";

export type SelectionModelErrorCode =
  | "invalid-selection"
  | "missing-boundary"
  | "missing-layout"
  | "unsupported-operation"
  | "unsupported-unit";

export type RenderSyncErrorCode = "render-unavailable" | "invalid-projection";

export type DOMSelectionSyncErrorCode =
  | "outside-editor"
  | "missing-text-surface"
  | "invalid-selection";

export type ModelTextOperation = {
  type: "replaceText";
  path: Pointer;
  range: {
    start: number;
    end: number;
  };
  text: string;
  selectionAfter: EditorSelection | null;
};

export type ModelOperation =
  | ModelTextOperation
  | {
      type: "patch";
      patch: ReadonlyArray<JSONPatchOperation>;
      selectionAfter: EditorSelection | null;
    };

export type EditCommand =
  | {
      type: "move";
      unit: EditorTextUnit;
      direction: "backward" | "forward" | "up" | "down" | "start" | "end";
      extend: boolean;
    }
  | {
      type: "delete";
      unit: "grapheme" | "word" | "selection";
      direction: "backward" | "forward";
    }
  | {
      type: "insertLineBreak";
    }
  | {
      type: "paste";
    }
  | {
      type: "format";
      mark: string;
    };

export type RenderBoundary = {
  kind: EditorBoundaryKind;
  point: EditorPoint;
  x: number;
  top: number;
  bottom: number;
};

export type RenderLine = {
  id: string;
  start: EditorPoint;
  end: EditorPoint;
  boundaries: ReadonlyArray<RenderBoundary>;
};

export type RenderFrame = {
  lines: ReadonlyArray<RenderLine>;
  boundaries: ReadonlyArray<RenderBoundary>;
};

export type RenderResult = {
  frame: RenderFrame | null;
  selectionAfter: EditorSelection | null;
};

export type BrowserTextInputAdapter = {
  canHandle(event: Event): boolean;
  begin(event: Event): EditorContractResult<
    NativeTextLease,
    TextInputAdapterErrorCode
  >;
  snapshot(): EditorContractResult<
    TransientTextSnapshot,
    TextInputAdapterErrorCode
  >;
  commit(event: Event): EditorContractResult<
    NativeTextCommit,
    TextInputAdapterErrorCode
  >;
  reset(): void;
};

export type InputDiff = {
  diff(
    commit: NativeTextCommit,
  ): EditorContractResult<ModelTextOperation, InputDiffErrorCode>;
};

export type EditCommandRouter = {
  route(
    event: Event,
  ): EditorContractResult<EditCommand | null, CommandRouterErrorCode>;
};

export type SelectionModel = {
  collapse(selection: EditorSelection, edge: "anchor" | "focus"): EditorSelection;
  move(
    selection: EditorSelection,
    command: Extract<EditCommand, { type: "move" }>,
  ): EditorContractResult<EditorSelection, SelectionModelErrorCode>;
  deleteRange(
    selection: EditorSelection,
    command: Extract<EditCommand, { type: "delete" }>,
  ): EditorContractResult<ModelTextOperation | null, SelectionModelErrorCode>;
};

export type LayoutModel = {
  measure(): EditorContractResult<RenderFrame, SelectionModelErrorCode>;
  boundaryAt(
    point: EditorPoint,
  ): EditorContractResult<RenderBoundary, SelectionModelErrorCode>;
  moveVertical(
    selection: EditorSelection,
    direction: "up" | "down",
    extend: boolean,
  ): EditorContractResult<EditorSelection, SelectionModelErrorCode>;
};

export type RenderSync = {
  render(model: unknown): EditorContractResult<RenderResult, RenderSyncErrorCode>;
};

export type DOMSelectionSync = {
  read(): EditorContractResult<EditorSelection | null, DOMSelectionSyncErrorCode>;
  write(
    selection: EditorSelection,
  ): EditorContractResult<boolean, DOMSelectionSyncErrorCode>;
};
