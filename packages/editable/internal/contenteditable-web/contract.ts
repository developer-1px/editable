import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  ATOM_REPLACEMENT,
  EDITABLE_ATOM_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  RICH_FRAGMENT_MIME,
  RICH_FRAGMENT_SCHEMA,
  type EditIntent,
  type RichDocument,
  type RichInlineAtom,
  type RichInlineRange,
  type RichTextFragment,
} from "../rich-document";

export const JSON_TEXT_ATTRIBUTE = EDITABLE_TEXT_ATTRIBUTE;
export const JSON_ATOM_ATTRIBUTE = EDITABLE_ATOM_ATTRIBUTE;
export const JSON_ATOM_REPLACEMENT = ATOM_REPLACEMENT;
export const JSON_CONTENT_EDITABLE_FRAGMENT_SCHEMA = RICH_FRAGMENT_SCHEMA;
export const JSON_CONTENT_EDITABLE_MIME = RICH_FRAGMENT_MIME;

export type EditableRelatedPath =
  | Pointer
  | ((textPath: Pointer) => Pointer | null);

export type EditableHostOptions = {
  root: HTMLElement;
  document: JSONDocument<RichDocument>;
  atomsPath?: EditableRelatedPath | null;
  rangesPath?: EditableRelatedPath | null;
  atomAttribute?: string;
  textAttribute?: string;
  projection?: TextProjectionProvider | null;
  visualLayout?: VisualLayoutProvider | null;
};

export type TextChange =
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

export type TextProjection = {
  editableTextToDocumentText(editableText: string): string;
  editableOffsetToDocumentOffset(offset: number): number;
  documentOffsetToEditableOffset(offset: number): number;
  applyTextChange?: (input: {
    document: JSONDocument<RichDocument>;
    editableText: string;
    path: Pointer;
    selection: SelectionSnap | null;
  }) => TextChange;
};

export type TextProjectionProvider = (path: Pointer) => TextProjection | null;

export type VisualCaret = {
  path: Pointer;
  offset: number;
  x: number;
  top: number;
  bottom: number;
};

export type VisualLineKind = "text" | "empty" | "atom-only";

export type VisualBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VisualLineSeed = {
  id: string;
  path: Pointer;
  startOffset: number;
  endOffset: number;
  kind: VisualLineKind;
  blockId?: string;
  lineIndex?: number;
};

export type VisualLine = VisualLineSeed & {
  sourceId: string;
  path: Pointer;
  startOffset: number;
  endOffset: number;
  top: number;
  bottom: number;
  box: VisualBox;
  carets: ReadonlyArray<VisualCaret>;
};

export type VisualLayout = {
  lines: ReadonlyArray<VisualLine>;
};

export type VisualLayoutSnapshot =
  | {
      ok: true;
      layout: VisualLayout | null;
      revision: number;
    }
  | {
      ok: false;
      code: "visual_layout_stale";
      reason: string;
      layout: VisualLayout | null;
      revision: number;
    };

export type VisualLayoutProvider = () => VisualLayoutSnapshot;

export type VisualLayoutStore = {
  read(): VisualLayoutSnapshot;
  invalidate(reason?: string): void;
  write(layout: VisualLayout | null): void;
  reset(): void;
};

export type VisualLayoutOptions = {
  root: HTMLElement;
  atomAttribute?: string;
  textAttribute?: string;
  projection?: TextProjectionProvider | null;
  lineSeeds?: ReadonlyArray<VisualLineSeed> | null;
};

export type FlushOptions = {
  label?: string;
  mergeKey?: string;
};

export type EditableDispatchOptions = {
  label?: string;
  selection?: SelectionSnap | null;
};

export type EditableSelectionIntent = Extract<
  EditIntent,
  { type: "modifySelection" }
>;

export type EditableFlow = "dom-to-model" | "model-to-dom";

type EditableHostUpdateBase = {
  ok: true;
  kind: "no-change" | "selection" | "text";
  render: boolean;
  selection: SelectionSnap | null;
  patch: ReadonlyArray<JSONPatchOperation>;
};

export type HostUpdate =
  | (EditableHostUpdateBase & {
      flow: "dom-to-model";
      command?: EditableSelectionIntent;
    })
  | (EditableHostUpdateBase & {
      flow: "model-to-dom";
      command?: never;
    })
  | {
      ok: false;
      code:
        | "missing_root"
        | "missing_text_path"
        | "not_string"
        | "commit_failed"
        | "empty_selection"
        | "clipboard_unavailable"
        | "invalid_payload";
      reason: string;
    }
  | {
      ok: false;
      code: "visual_layout_stale";
      command: EditableSelectionIntent;
      reason: string;
      selection: SelectionSnap | null;
    };

export type JsonContentEditableClipboardResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      code: "empty_selection" | "clipboard_unavailable" | "invalid_payload";
      reason: string;
    };

export type EditableUpdate = HostUpdate;

export type EditableHost = {
  handle(event: Event): EditableUpdate;
  syncSelectionFromDOM(): SelectionSnap | null;
  restoreSelectionToDOM(selection?: SelectionSnap): boolean;
  copy(event?: ClipboardEvent): EditableUpdate;
  cut(event?: ClipboardEvent): EditableUpdate;
  paste(event?: ClipboardEvent): EditableUpdate;
  reset(): void;
  flush(options?: FlushOptions): HostUpdate;
  dispatch(intent: EditIntent, options?: EditableDispatchOptions): EditableUpdate;
};

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

export type JsonContentEditableRelatedPath = EditableRelatedPath;
export type JsonContentEditableAtomRecord = RichInlineAtom;
export type JsonContentEditableFragment = RichTextFragment;
export type JsonContentEditableRangeRecord = RichInlineRange;
export type JsonContentEditableTextChange = TextChange;

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

export type JsonContentEditableVisualCaret = VisualCaret;
export type JsonContentEditableVisualLineKind = VisualLineKind;
export type JsonContentEditableVisualBox = VisualBox;
export type JsonContentEditableVisualLineSeed = VisualLineSeed;
export type JsonContentEditableVisualLine = VisualLine;
export type JsonContentEditableVisualLayout = VisualLayout;
export type JsonContentEditableVisualLayoutSnapshot = VisualLayoutSnapshot;
export type JsonContentEditableVisualLayoutProvider = VisualLayoutProvider;
export type JsonContentEditableVisualLayoutStore = VisualLayoutStore;

export type JsonContentEditableVisualLayoutOptions<T> = {
  root: HTMLElement;
  atomAttribute?: string;
  textAttribute?: string;
  projection?: JsonContentEditableProjectionProvider<T> | null;
  lineSeeds?: ReadonlyArray<JsonContentEditableVisualLineSeed> | null;
};

export type JsonContentEditableSelectionIntent = EditableSelectionIntent;
export type JsonContentEditableFlow = EditableFlow;
export type JsonContentEditableUpdate = HostUpdate;

export type JsonContentEditable<T> = {
  handle(event: Event): JsonContentEditableUpdate | JsonContentEditableClipboardResult<T>;
  flushDOMToModel(options?: FlushOptions): JsonContentEditableUpdate;
  runCommand(intent: JsonContentEditableSelectionIntent): JsonContentEditableUpdate;
  syncSelectionFromDOM(): SelectionSnap | null;
  restoreSelectionToDOM(selection?: SelectionSnap): boolean;
  copy(event?: ClipboardEvent): JsonContentEditableClipboardResult<T>;
  cut(event?: ClipboardEvent): JsonContentEditableClipboardResult<T>;
  paste(event?: ClipboardEvent): JsonContentEditableClipboardResult<T>;
  pasteFragment(
    fragment: JsonContentEditableFragment,
    selection?: SelectionSnap | null,
  ): JsonContentEditableClipboardResult<T>;
  pasteText(
    text: string,
    selection?: SelectionSnap | null,
  ): JsonContentEditableClipboardResult<T>;
  undo(): JSONCapabilityResult;
  redo(): JSONCapabilityResult;
  reset(): void;
};

export type JsonContentEditableHost<T> = JsonContentEditable<T> & {
  flush(options?: FlushOptions): JsonContentEditableUpdate;
  dispatch(intent: JsonContentEditableSelectionIntent): JsonContentEditableUpdate;
};

export type RichTextProjection = TextProjection;
