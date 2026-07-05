import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  ATOM_REPLACEMENT,
  RICH_FRAGMENT_MIME,
  RICH_FRAGMENT_SCHEMA,
  type RichDocument,
  type RichInlineAtom,
  type RichInlineRange,
  type RichTextFragment,
} from "../model";
import {
  EDITABLE_ATOM_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
} from "../projection";
import type { EditErrorCode, EditIntent } from "../kernel";

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
        | "clipboard_unavailable"
        | "invalid_payload"
        | EditErrorCode;
      reason: string;
    }
  | {
      ok: false;
      code: "visual_layout_stale";
      command: EditableSelectionIntent;
      reason: string;
      selection: SelectionSnap | null;
    };

export type InternalClipboardResult =
  | {
      ok: true;
      value: unknown;
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

export type InternalEditableHostOptions = {
  root: HTMLElement;
  document: JSONDocument<RichDocument>;
  atomsPath?: InternalEditableRelatedPath | null;
  rangesPath?: InternalEditableRelatedPath | null;
  atomAttribute?: string;
  textAttribute?: string;
  projection?: InternalProjectionProvider | null;
  visualLayout?: InternalVisualLayoutProvider | null;
};

export type InternalEditableRelatedPath = EditableRelatedPath;
export type InternalEditableAtomRecord = RichInlineAtom;
export type { RichTextFragment };
export type InternalEditableRangeRecord = RichInlineRange;
export type InternalTextChange = TextChange;

export type InternalTextProjection = TextProjection;
export type InternalProjectionProvider = TextProjectionProvider;

export type InternalVisualCaret = VisualCaret;
export type InternalVisualLineKind = VisualLineKind;
export type InternalVisualBox = VisualBox;
export type InternalVisualLineSeed = VisualLineSeed;
export type InternalVisualLine = VisualLine;
export type InternalVisualLayout = VisualLayout;
export type InternalVisualLayoutSnapshot = VisualLayoutSnapshot;
export type InternalVisualLayoutProvider = VisualLayoutProvider;
export type InternalVisualLayoutStore = VisualLayoutStore;

export type InternalVisualLayoutOptions = {
  root: HTMLElement;
  atomAttribute?: string;
  textAttribute?: string;
  projection?: InternalProjectionProvider | null;
  lineSeeds?: ReadonlyArray<InternalVisualLineSeed> | null;
};

export type InternalSelectionIntent = EditableSelectionIntent;
export type InternalEditableFlow = EditableFlow;
export type InternalEditableUpdate = HostUpdate;

export type InternalEditableController = {
  handle(event: Event): InternalEditableUpdate | InternalClipboardResult;
  flushDOMToModel(options?: FlushOptions): InternalEditableUpdate;
  dispatchSelectionIntent(intent: InternalSelectionIntent): InternalEditableUpdate;
  syncSelectionFromDOM(): SelectionSnap | null;
  restoreSelectionToDOM(selection?: SelectionSnap): boolean;
  copy(event?: ClipboardEvent): InternalClipboardResult;
  cut(event?: ClipboardEvent): InternalEditableUpdate | InternalClipboardResult;
  paste(event?: ClipboardEvent): InternalEditableUpdate;
  insertFragment(
    fragment: RichTextFragment,
    selection?: SelectionSnap | null,
  ): InternalEditableUpdate;
  insertText(
    text: string,
    selection?: SelectionSnap | null,
  ): InternalEditableUpdate;
  applyHistoryUndo(): JSONCapabilityResult;
  applyHistoryRedo(): JSONCapabilityResult;
  verticalGoal(): number | null;
  setVerticalGoal(goalX: number | null): void;
  reset(): void;
};

export type InternalEditableHost = InternalEditableController & {
  flush(options?: FlushOptions): InternalEditableUpdate;
  dispatch(intent: InternalSelectionIntent): InternalEditableUpdate;
};

export type RichTextProjection = TextProjection;
