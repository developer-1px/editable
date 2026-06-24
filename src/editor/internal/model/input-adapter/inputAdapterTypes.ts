import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { ClipboardFormat } from "../clipboard";
import type { CursorGeometryAdapter } from "../cursorCommands";
import type { NoteDocument } from "../noteDocument";
import type { EditorPlatform } from "../platformModifier";

export type EditorInput =
  | {
      type: "keydown";
      key: string;
      shiftKey?: boolean;
      metaKey?: boolean;
      ctrlKey?: boolean;
      altKey?: boolean;
      altGraphKey?: boolean;
      code?: string;
      isComposing?: boolean;
    }
  | {
      type: "beforeinput";
      inputType: string;
      data?: string | null;
      format?: ClipboardFormat;
      isComposing?: boolean;
    }
  | {
      type: "paste";
      text: string;
      format?: ClipboardFormat;
    };

export type EditorInputAdapterOptions = {
  geometry?: CursorGeometryAdapter;
  platform?: EditorPlatform;
  readOnly?: boolean;
};

export type EditorInputResult =
  | {
      ok: true;
      handled: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: true;
      handled: false;
    }
  | {
      ok: false;
      reason: string;
    };

export type EditorInputTranslator = (
  document: NoteDocument,
  selection: SelectionSnap,
  input: EditorInput,
  options: EditorInputAdapterOptions,
) => EditorInputResult;
