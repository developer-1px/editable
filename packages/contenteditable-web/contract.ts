import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";

export const JSON_TEXT_ATTRIBUTE = "data-json-text";
export const JSON_ATOM_ATTRIBUTE = "data-json-atom";
export const JSON_ATOM_REPLACEMENT = "\uFFFC";
export const JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA =
  "json-document-contenteditable-fragment@1";
export const JSON_CONTENT_EDITABLE_MIME =
  "application/x-json-document-fragment";

export type JsonContentEditableOptions<T> = {
  root: HTMLElement;
  document: JSONDocument<T>;
  atomsPath?: JsonContentEditableRelatedPath | null;
  rangesPath?: JsonContentEditableRelatedPath | null;
  atomAttribute?: string;
  textAttribute?: string;
  projection?: JsonContentEditableProjectionProvider<T> | null;
  visualLayout?: JsonContentEditableVisualLayoutProvider | null;
};

export type JsonContentEditableRelatedPath =
  | Pointer
  | ((textPath: Pointer) => Pointer | null);

export type JsonContentEditableAtomRecord = {
  offset: number;
  [key: string]: unknown;
};

export type JsonContentEditableFragment = {
  schema: typeof JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA;
  text: string;
  atoms?: Record<string, JsonContentEditableAtomRecord>;
  ranges?: Record<string, JsonContentEditableRangeRecord>;
};

export type JsonContentEditableRangeRecord = {
  start: number;
  end: number;
  [key: string]: unknown;
};

export type JsonContentEditableTextChange =
  | {
      ok: true;
      kind: "no-change" | "text";
      patch: ReadonlyArray<JSONPatchOperation>;
      selection: SelectionSnap | null;
    }
  | {
      ok: false;
      code: "commit_failed" | "invalid_projection";
      reason: string;
    };

export type JsonContentEditableTextProjection<T> = {
  editableTextToDocumentText(editableText: string): string;
  editableOffsetToDocumentOffset(offset: number): number;
  documentOffsetToEditableOffset(offset: number): number;
  applyTextChange?: (input: {
    document: JSONDocument<T>;
    editableText: string;
    path: Pointer;
    selection: SelectionSnap | null;
  }) => JsonContentEditableTextChange;
};

export type JsonContentEditableProjectionProvider<T> = (
  path: Pointer,
) => JsonContentEditableTextProjection<T> | null;

export type JsonContentEditableVisualCaret = {
  path: Pointer;
  offset: number;
  x: number;
  top: number;
  bottom: number;
};

export type JsonContentEditableVisualLineKind = "text" | "empty" | "atom-only";

export type JsonContentEditableVisualBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type JsonContentEditableVisualLineSeed = {
  id: string;
  path: Pointer;
  startOffset: number;
  endOffset: number;
  kind: JsonContentEditableVisualLineKind;
  blockId?: string;
  lineIndex?: number;
};

export type JsonContentEditableVisualLine = JsonContentEditableVisualLineSeed & {
  sourceId: string;
  path: Pointer;
  startOffset: number;
  endOffset: number;
  top: number;
  bottom: number;
  box: JsonContentEditableVisualBox;
  carets: ReadonlyArray<JsonContentEditableVisualCaret>;
};

export type JsonContentEditableVisualLayout = {
  lines: ReadonlyArray<JsonContentEditableVisualLine>;
};

export type JsonContentEditableVisualLayoutSnapshot =
  | {
      ok: true;
      layout: JsonContentEditableVisualLayout | null;
      revision: number;
    }
  | {
      ok: false;
      code: "visual_layout_stale";
      reason: string;
      layout: JsonContentEditableVisualLayout | null;
      revision: number;
    };

export type JsonContentEditableRenderBoundaryUnit =
  | "text"
  | "atom"
  | "syntax"
  | "line-start"
  | "line-end";

export type JsonContentEditableRenderBoundary = {
  id: string;
  lineId: string;
  path: Pointer;
  offset: number;
  x: number;
  top: number;
  bottom: number;
  affinity: "before" | "after";
  unit: JsonContentEditableRenderBoundaryUnit;
};

export type JsonContentEditableRenderLine = JsonContentEditableVisualLine & {
  boundaries: ReadonlyArray<JsonContentEditableRenderBoundary>;
};

export type JsonContentEditableRenderFrame = {
  lines: ReadonlyArray<JsonContentEditableRenderLine>;
  boundaries: ReadonlyArray<JsonContentEditableRenderBoundary>;
};

export type JsonContentEditableSelectionFrameEndpoint = {
  boundary: JsonContentEditableRenderBoundary;
};

export type JsonContentEditableSelectionFrameMode = "caret" | "range";

export type JsonContentEditableSelectionFrame = {
  renderFrame: JsonContentEditableRenderFrame;
  selection: SelectionSnap;
  anchor: JsonContentEditableSelectionFrameEndpoint;
  focus: JsonContentEditableSelectionFrameEndpoint;
  mode: JsonContentEditableSelectionFrameMode;
  goalX: number | null;
};

export type JsonContentEditableVisualLayoutProvider =
  () => JsonContentEditableVisualLayoutSnapshot;

export type JsonContentEditableVisualLayoutStore = {
  read(): JsonContentEditableVisualLayoutSnapshot;
  invalidate(reason?: string): void;
  write(layout: JsonContentEditableVisualLayout | null): void;
  reset(): void;
};

export type JsonContentEditableVisualLayoutOptions<T> = {
  root: HTMLElement;
  atomAttribute?: string;
  textAttribute?: string;
  projection?: JsonContentEditableProjectionProvider<T> | null;
  lineSeeds?: ReadonlyArray<JsonContentEditableVisualLineSeed> | null;
};

export type FlushOptions = {
  label?: string;
  mergeKey?: string;
};

export type JsonContentEditableModelCommand =
  | {
      type: "moveVertical";
      direction: "up" | "down";
      extend: boolean;
    }
  | {
      type: "moveLineBoundary";
      boundary: "line-start" | "line-end";
      extend: boolean;
    };

export type JsonContentEditableFlow = "dom-to-model" | "model-to-dom";

type JsonContentEditableUpdateBase = {
  ok: true;
  kind: "no-change" | "selection" | "text";
  render: boolean;
  selection: SelectionSnap | null;
  patch: ReadonlyArray<JSONPatchOperation>;
};

export type JsonContentEditableUpdate =
  | (JsonContentEditableUpdateBase & {
      flow: "dom-to-model";
      command?: JsonContentEditableModelCommand;
    })
  | (JsonContentEditableUpdateBase & {
      flow: "model-to-dom";
      command?: never;
    })
  | {
      ok: false;
      code: "missing_root" | "missing_text_path" | "not_string" | "commit_failed";
      reason: string;
    }
  | {
      ok: false;
      code: "visual_layout_stale";
      command: JsonContentEditableModelCommand;
      reason: string;
      selection: SelectionSnap | null;
    };

export type ClipboardUpdate<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      code: "empty_selection" | "clipboard_unavailable" | "invalid_payload";
      reason: string;
    };

export type JsonContentEditable<T> = {
  handle(event: Event): JsonContentEditableUpdate | ClipboardUpdate<T>;
  flushDOMToModel(options?: FlushOptions): JsonContentEditableUpdate;
  runCommand(command: JsonContentEditableModelCommand): JsonContentEditableUpdate;
  syncSelectionFromDOM(): SelectionSnap | null;
  restoreSelectionToDOM(selection?: SelectionSnap): boolean;
  copy(event?: ClipboardEvent): ClipboardUpdate<T>;
  cut(event?: ClipboardEvent): ClipboardUpdate<T>;
  paste(event?: ClipboardEvent): ClipboardUpdate<T>;
  pasteFragment(
    fragment: JsonContentEditableFragment,
    selection?: SelectionSnap | null,
  ): ClipboardUpdate<T>;
  pasteText(text: string, selection?: SelectionSnap | null): ClipboardUpdate<T>;
  undo(): JSONCapabilityResult;
  redo(): JSONCapabilityResult;
  reset(): void;
};
