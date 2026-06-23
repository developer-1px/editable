import type {
  JSONDocument,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  dispatchEditorCommandToJSONDocument,
  type EditorCommand,
  type EditorViewAdapter,
} from "../../model/editorCore";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionFromRichSelection } from "../../model/richSelection";

export type EditorCommandBridgeResult =
  | {
      ok: true;
      changed: boolean;
      selectionAfter: SelectionSnap;
    }
  | {
      ok: false;
      reason: string;
    };

export function dispatchEditorCommandToDocument(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand,
  options: {
    selection: SelectionSnap;
    view?: EditorViewAdapter;
  },
): EditorCommandBridgeResult {
  document.selection?.restore(options.selection);
  const result = dispatchEditorCommandToJSONDocument(document, command, {
    view: options.view,
  });
  if (!result.ok) {
    return result;
  }

  const selectionAfter =
    result.snapshot.selection === null
      ? options.selection
      : selectionFromRichSelection(
          result.snapshot.document,
          result.snapshot.selection,
        );
  return {
    ok: true,
    changed: result.changed,
    selectionAfter,
  };
}
