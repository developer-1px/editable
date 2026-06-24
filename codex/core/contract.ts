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
  "codex-json-contenteditable-fragment@1";
export const JSON_CONTENT_EDITABLE_MIME =
  "application/x-json-document-fragment";

export type JsonContentEditableOptions<T> = {
  root: HTMLElement;
  document: JSONDocument<T>;
  atomsPath?: JsonContentEditableRelatedPath | null;
  rangesPath?: JsonContentEditableRelatedPath | null;
  atomAttribute?: string;
  textAttribute?: string;
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

export type FlushOptions = {
  intent?: "text-commit" | "range-command";
  label?: string;
  mergeKey?: string;
};

export type JsonContentEditableUpdate =
  | {
      ok: true;
      kind: "no-change" | "selection" | "text";
      selection: SelectionSnap | null;
      patch: ReadonlyArray<JSONPatchOperation>;
    }
  | {
      ok: false;
      code: "missing_root" | "missing_text_path" | "not_string" | "commit_failed";
      reason: string;
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
  flush(options?: FlushOptions): JsonContentEditableUpdate;
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
