import {
  createJSONDocument,
  type JSONDocument,
  type JSONDocumentOptions,
} from "@interactive-os/json-document";
import type { CursorGeometryAdapter } from "./cursorCommands";
import {
  type EditorCommand,
  type EditorQuery,
  type EditorQueryResult,
  queryDescriptorFor,
} from "./editorCoreDescriptors";
import {
  canDispatchEditorCommand,
  dispatchEditorCommand,
} from "./editorCoreDispatch";
import {
  restoreInitialSelection,
  richSelectionFromSnap,
} from "./editorSelection";
import { initialNoteDocument } from "./initialNoteDocument";
import { type NoteDocument, NoteDocumentSchema } from "./noteDocument";
import type { RichSelection } from "./richSelection";

export type {
  EditorDeleteUnit,
  EditorMoveDirection,
  EditorMoveUnit,
  InsertableEditorNode,
  ToggleMarkCommandType,
} from "./editorCommandStrategies";
export type {
  EditorCommand,
  EditorQuery,
  EditorQueryResult,
} from "./editorCoreDescriptors";
export { dispatchEditorCommandToJSONDocument } from "./editorCoreDispatch";

export type Editor = {
  snapshot(): EditorSnapshot;
  subscribe(listener: EditorListener): () => void;
  dispatch(command: EditorCommand | readonly EditorCommand[]): EditorResult;
  can(command: EditorCommand): EditorCapability;
  query<Query extends EditorQuery>(query: Query): EditorQueryResult<Query>;
  dispose(): void;
};

export type EditorSnapshot = {
  document: NoteDocument;
  selection: RichSelection | null;
  revision: number;
};

export type EditorListener = (snapshot: EditorSnapshot) => void;

export type EditorResult =
  | {
      ok: true;
      changed: boolean;
      snapshot: EditorSnapshot;
    }
  | {
      ok: false;
      reason: string;
    };

export type EditorCapability =
  | {
      ok: true;
    }
  | {
      ok: false;
      reason: string;
    };

export type EditorViewAdapter = {
  geometry(): CursorGeometryAdapter | null;
};

export type CreateEditorOptions = {
  initial?: NoteDocument;
  history?: JSONDocumentOptions["history"];
  selection?: RichSelection;
  view?: EditorViewAdapter;
};

export function createEditor(options: CreateEditorOptions = {}): Editor {
  const document = createJSONDocument(
    NoteDocumentSchema,
    options.initial ?? initialNoteDocument,
    {
      history: options.history ?? 100,
      selection: true,
      trustedInitial: true,
    },
  );
  let revision = 0;
  let disposed = false;
  const listeners = new Set<EditorListener>();

  restoreInitialSelection(document, options.selection);

  const snapshot = (): EditorSnapshot => ({
    document: document.value,
    selection: richSelectionFromSnap(document.value, document.selection),
    revision,
  });

  const notify = () => {
    const current = snapshot();
    for (const listener of listeners) {
      listener(current);
    }
  };

  const editor: Editor = {
    snapshot,
    subscribe(listener) {
      assertNotDisposed(disposed);
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(command) {
      assertNotDisposed(disposed);
      const before = snapshot();
      const result = dispatchEditorCommand(document, command, options.view);

      if (!result.ok) {
        return result;
      }

      const afterWithoutRevision = snapshot();
      const changed = !snapshotsEqual(before, afterWithoutRevision);
      if (changed) {
        revision += 1;
        notify();
      }

      return {
        ok: true,
        changed,
        snapshot: snapshot(),
      };
    },
    can(command) {
      assertNotDisposed(disposed);
      return canDispatchEditorCommand(document, command, options.view);
    },
    query: <Query extends EditorQuery>(
      query: Query,
    ): EditorQueryResult<Query> => {
      assertNotDisposed(disposed);
      return queryEditor(document, snapshot(), query, editor.can);
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };

  return editor;
}

function queryEditor<Query extends EditorQuery>(
  document: JSONDocument<NoteDocument>,
  snapshot: EditorSnapshot,
  query: Query,
  can: (command: EditorCommand) => EditorCapability,
): EditorQueryResult<Query> {
  return queryDescriptorFor(query).read({
    document,
    snapshot,
    query,
    can,
  }) as EditorQueryResult<Query>;
}

function snapshotsEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return (
    JSON.stringify(left.document) === JSON.stringify(right.document) &&
    JSON.stringify(left.selection) === JSON.stringify(right.selection)
  );
}

function assertNotDisposed(disposed: boolean) {
  if (disposed) {
    throw new Error("Editor has been disposed.");
  }
}
