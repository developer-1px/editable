import type {
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { RichDocument } from "../model";
import type { EditErrorCode, EditIntent } from "../kernel";

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

type EditableUpdateBase = {
  ok: true;
  kind: "no-change" | "selection" | "text";
  render: boolean;
  selection: SelectionSnap | null;
  patch: ReadonlyArray<JSONPatchOperation>;
};

export type EditableUpdate =
  | (EditableUpdateBase & {
      flow: "dom-to-model";
      command?: EditableSelectionIntent;
    })
  | (EditableUpdateBase & {
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

export type EditableHost = {
  handle(event: Event): EditableUpdate;
  syncSelectionFromDOM(): SelectionSnap | null;
  restoreSelectionToDOM(selection?: SelectionSnap): boolean;
  copy(event?: ClipboardEvent): EditableUpdate;
  cut(event?: ClipboardEvent): EditableUpdate;
  paste(event?: ClipboardEvent): EditableUpdate;
  reset(): void;
  flush(options?: FlushOptions): EditableUpdate;
  dispatch(intent: EditIntent, options?: EditableDispatchOptions): EditableUpdate;
};

export type NativeTextLease = {
  surface: Pointer;
  composing: boolean;
};
