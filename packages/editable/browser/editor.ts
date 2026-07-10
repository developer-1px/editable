import type {
  JSONDocument,
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type {
  EditableDocumentValue,
  EditorDocumentCommand,
} from "../core";

export { mountJsonEditable } from "./editorCoordinator";

export type EditorPhase =
  | "idle"
  | "native-input"
  | "composing"
  | "settling";

export type EditorSnapshot = {
  phase: EditorPhase;
  revision: number;
  queuedChanges: number;
  selection: SelectionSnap | null;
  composition: {
    blockId: string;
    from: number;
    to: number;
  } | null;
};

export type EditorFault = {
  code:
    | "out_of_band_document_write"
    | "foreign_dom_mutation"
    | "native_change_commit_failed"
    | "input_state_lost"
    | "composition_overlap"
    | "composition_conflict"
    | "queued_change_commit_failed";
  recoverable: boolean;
  reason: string;
};

export type EditorAction =
  | {
      type: "patch";
      patch: ReadonlyArray<JSONPatchOperation>;
      label?: string;
      origin?: string;
      selectionAfter?: SelectionSnap | null;
    }
  | EditorDocumentCommand
  | { type: "undo" | "redo" | "reset" };

export type EditorResult =
  | {
      ok: true;
      change: "none" | "selection" | "document" | "queued";
      patch: ReadonlyArray<JSONPatchOperation>;
    }
  | {
      ok: false;
      code:
        | "destroyed"
        | "reentrant_transaction"
        | "block_not_found"
        | "selection_unavailable"
        | "composition_conflict"
        | "commit_failed";
      reason: string;
    };

export type JsonEditable = {
  dispatch(action: EditorAction): EditorResult;
  getSnapshot(): EditorSnapshot;
  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void;
  destroy(): void;
};

export type MountJsonEditableOptions = {
  root: HTMLElement;
  document: JSONDocument<EditableDocumentValue>;
  onFault?: (fault: EditorFault) => void;
};
