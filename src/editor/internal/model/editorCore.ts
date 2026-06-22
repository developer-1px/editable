import {
  createJSONDocument,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONDocumentOptions,
  type JSONPatchOperation,
  type SelectionSnap,
} from "@interactive-os/json-document";
import { type CursorGeometryAdapter, selectAll } from "./cursorCommands";
import {
  type CommandEvaluation,
  cursorCommandResult,
  type DeleteCommand,
  deleteCommand,
  type InsertableEditorNode,
  insertNodeCommand,
  type MoveSelectionCommand,
  moveSelectionCommand,
  type ToggleMarkCommandType,
  textCommandResult,
  toggleMarkCommand,
} from "./editorCommandStrategies";
import {
  defaultSelection,
  restoreInitialSelection,
  richSelectionFromSnap,
  selectionForCommand,
} from "./editorSelection";
import { activeMarksFromSelection } from "./markCommands";
import {
  initialNoteDocument,
  type Mark,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";
import {
  type RichSelection,
  selectionFromRichSelection,
} from "./richSelection";
import { insertText, splitParagraph } from "./textCommands";

export type {
  EditorDeleteUnit,
  EditorMoveDirection,
  EditorMoveUnit,
  InsertableEditorNode,
  ToggleMarkCommandType,
} from "./editorCommandStrategies";

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

type CommandEvaluationInput<Command extends { type: string }> = {
  document: JSONDocument<NoteDocument>;
  selection: SelectionSnap;
  command: Command;
  view?: EditorViewAdapter;
};

type CommandDispatchInput<Command extends { type: string }> = {
  document: JSONDocument<NoteDocument>;
  command: Command;
};

type CommandCanInput<Command extends { type: string }> = {
  document: JSONDocument<NoteDocument>;
  command: Command;
  view?: EditorViewAdapter;
};

type PatchCommandDescriptor<Command extends { type: string }> = {
  batchable?: true;
  evaluate(input: CommandEvaluationInput<Command>): CommandEvaluation;
  can?(input: CommandCanInput<Command>): EditorCapability;
};

type DirectCommandDescriptor<Command extends { type: string }> = {
  batchable: false;
  dispatch(input: CommandDispatchInput<Command>): EditorResult;
  can(input: CommandCanInput<Command>): EditorCapability;
};

type EditorCommandDescriptor<Command extends { type: string }> =
  | PatchCommandDescriptor<Command>
  | DirectCommandDescriptor<Command>;

type CommandFromDescriptor<Descriptor> =
  Descriptor extends EditorCommandDescriptor<infer Command> ? Command : never;

type EditorQueryDescriptor<Query extends { type: string }, Result> = {
  read(input: {
    document: JSONDocument<NoteDocument>;
    snapshot: EditorSnapshot;
    query: Query;
    can: (command: EditorCommand) => EditorCapability;
  }): Result;
};

type QueryFromDescriptor<Descriptor> =
  Descriptor extends EditorQueryDescriptor<infer Query, unknown>
    ? Query
    : never;

type QueryResultFromDescriptor<Descriptor> =
  Descriptor extends EditorQueryDescriptor<{ type: string }, infer Result>
    ? Result
    : never;

type QueryDescriptorFor<Type extends EditorQuery["type"]> =
  (typeof queryDescriptors)[Type];

const commandDescriptors = {
  setSelection: definePatchCommand<{
    type: "setSelection";
    selection: RichSelection;
  }>({
    evaluate({ document, command }) {
      return {
        ok: true,
        patch: [],
        selectionAfter: selectionFromRichSelection(
          document.value,
          command.selection,
        ),
      };
    },
  }),
  selectAll: definePatchCommand<{ type: "selectAll" }>({
    evaluate({ document }) {
      return cursorCommandResult(selectAll(document.value));
    },
  }),
  moveSelection: definePatchCommand<MoveSelectionCommand>({
    evaluate({ document, selection, command, view }) {
      return moveSelectionCommand(document.value, selection, command, view);
    },
  }),
  insertText: definePatchCommand<{
    type: "insertText";
    text: string;
  }>({
    evaluate({ document, selection, command }) {
      return textCommandResult(
        insertText(document.value, selection, command.text),
      );
    },
  }),
  insertNode: definePatchCommand<{
    type: "insertNode";
    node: InsertableEditorNode;
  }>({
    evaluate({ document, selection, command }) {
      return insertNodeCommand(document.value, selection, command.node);
    },
  }),
  delete: definePatchCommand<DeleteCommand>({
    evaluate({ document, selection, command }) {
      return deleteCommand(document.value, selection, command);
    },
  }),
  split: definePatchCommand<{ type: "split" }>({
    evaluate({ document, selection }) {
      return textCommandResult(splitParagraph(document.value, selection));
    },
  }),
  toggleMark: definePatchCommand<{
    type: "toggleMark";
    mark: ToggleMarkCommandType;
  }>({
    evaluate({ document, selection, command }) {
      return toggleMarkCommand(document.value, selection, command.mark);
    },
  }),
  undo: defineDirectCommand<{ type: "undo" }>({
    batchable: false,
    dispatch({ document }) {
      return applyHistoryResult(document, document.undo());
    },
    can({ document }) {
      return jsonCapabilityToEditorCapability(document.canUndo());
    },
  }),
  redo: defineDirectCommand<{ type: "redo" }>({
    batchable: false,
    dispatch({ document }) {
      return applyHistoryResult(document, document.redo());
    },
    can({ document }) {
      return jsonCapabilityToEditorCapability(document.canRedo());
    },
  }),
  replaceDocument: definePatchCommand<{
    type: "replaceDocument";
    document: NoteDocument;
  }>({
    evaluate({ command }) {
      const parsed = NoteDocumentSchema.safeParse(command.document);
      if (!parsed.success) {
        return {
          ok: false,
          reason: "Document is invalid.",
        };
      }

      return {
        ok: true,
        patch: [{ op: "replace", path: "", value: command.document }],
        selectionAfter: defaultSelection(command.document),
      };
    },
  }),
};

export type EditorCommand = CommandFromDescriptor<
  (typeof commandDescriptors)[keyof typeof commandDescriptors]
>;

const queryDescriptors = {
  document: defineQuery<{ type: "document" }, NoteDocument>({
    read({ document }) {
      return document.value;
    },
  }),
  selection: defineQuery<{ type: "selection" }, RichSelection | null>({
    read({ snapshot }) {
      return snapshot.selection;
    },
  }),
  activeMarks: defineQuery<{ type: "activeMarks" }, Mark[]>({
    read({ document }) {
      const selection =
        document.selection?.snapshot() ?? defaultSelection(document.value);
      return activeMarksFromSelection(selection);
    },
  }),
  canUndo: defineQuery<{ type: "canUndo" }, boolean>({
    read({ document }) {
      return document.history.canUndo;
    },
  }),
  canRedo: defineQuery<{ type: "canRedo" }, boolean>({
    read({ document }) {
      return document.history.canRedo;
    },
  }),
  can: defineQuery<
    {
      type: "can";
      command: EditorCommand;
    },
    EditorCapability
  >({
    read({ query, can }) {
      return can(query.command);
    },
  }),
};

export type EditorQuery = QueryFromDescriptor<
  (typeof queryDescriptors)[keyof typeof queryDescriptors]
>;

export type EditorQueryResult<Query extends EditorQuery> =
  QueryResultFromDescriptor<QueryDescriptorFor<Query["type"]>>;

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
      const result = isCommandArray(command)
        ? dispatchBatch(document, command, options.view)
        : dispatchSingle(document, command, options.view);

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
      return canDispatch(document, command, options.view);
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

export function dispatchEditorCommandToJSONDocument(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand | readonly EditorCommand[],
  options: {
    view?: EditorViewAdapter;
  } = {},
): EditorResult {
  return isCommandArray(command)
    ? dispatchBatch(document, command, options.view)
    : dispatchSingle(document, command, options.view);
}

function dispatchSingle(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand,
  view: EditorViewAdapter | undefined,
): EditorResult {
  const descriptor = commandDescriptorFor(command);
  if (descriptor === undefined) {
    return { ok: false, reason: "Unsupported editor command." };
  }
  if ("dispatch" in descriptor) {
    return descriptor.dispatch({ document, command });
  }

  const evaluation = evaluatePatchCommand(document, command, descriptor, view);
  if (!evaluation.ok) {
    return evaluation;
  }

  return applyEvaluation(document, evaluation);
}

function dispatchBatch(
  document: JSONDocument<NoteDocument>,
  commands: readonly EditorCommand[],
  view: EditorViewAdapter | undefined,
): EditorResult {
  if (commands.length === 0) {
    return {
      ok: true,
      changed: false,
      snapshot: {
        document: document.value,
        selection: richSelectionFromSnap(document.value, document.selection),
        revision: 0,
      },
    };
  }

  if (
    commands.some(
      (command) => commandDescriptorFor(command)?.batchable === false,
    )
  ) {
    return {
      ok: false,
      reason: "History commands cannot be batched.",
    };
  }

  const draft = createJSONDocument(NoteDocumentSchema, document.value, {
    history: 0,
    selection: true,
    trustedInitial: true,
  });
  const selection = document.selection?.snapshot();
  if (selection !== undefined) {
    draft.selection?.restore(selection);
  }

  const patch: JSONPatchOperation[] = [];
  let selectionAfter = selection ?? defaultSelection(draft.value);

  for (const command of commands) {
    const evaluation = evaluateCommand(draft, command, view);
    if (!evaluation.ok) {
      return evaluation;
    }

    patch.push(...evaluation.patch);
    selectionAfter = evaluation.selectionAfter;
    if (evaluation.patch.length > 0) {
      const apply = draft.commit(evaluation.patch, {
        selectionAfter: evaluation.selectionAfter,
      });
      if (!apply.ok) {
        return { ok: false, reason: apply.reason ?? apply.code };
      }
    } else {
      draft.selection?.restore(evaluation.selectionAfter);
    }
  }

  return applyEvaluation(document, { ok: true, patch, selectionAfter });
}

function evaluateCommand(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand,
  view: EditorViewAdapter | undefined,
): CommandEvaluation {
  const descriptor = commandDescriptorFor(command);
  if (descriptor === undefined || "dispatch" in descriptor) {
    return { ok: false, reason: "Command cannot be evaluated as a patch." };
  }

  return evaluatePatchCommand(document, command, descriptor, view);
}

function applyEvaluation(
  document: JSONDocument<NoteDocument>,
  evaluation: Extract<CommandEvaluation, { ok: true }>,
): EditorResult {
  if (evaluation.patch.length === 0) {
    document.selection?.restore(evaluation.selectionAfter);
    return {
      ok: true,
      changed: true,
      snapshot: {
        document: document.value,
        selection: richSelectionFromSnap(document.value, document.selection),
        revision: 0,
      },
    };
  }

  const result = document.commit(evaluation.patch, {
    selectionAfter: evaluation.selectionAfter,
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason ?? result.code };
  }

  return {
    ok: true,
    changed: true,
    snapshot: {
      document: document.value,
      selection: richSelectionFromSnap(document.value, document.selection),
      revision: 0,
    },
  };
}

function canDispatch(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand,
  view: EditorViewAdapter | undefined,
): EditorCapability {
  const descriptor = commandDescriptorFor(command);
  if (descriptor === undefined) {
    return { ok: false, reason: "Unsupported editor command." };
  }
  if (descriptor.can !== undefined) {
    return descriptor.can({ document, command, view });
  }

  const draft = createJSONDocument(NoteDocumentSchema, document.value, {
    history: 0,
    selection: true,
    trustedInitial: true,
  });
  const selection = document.selection?.snapshot();
  if (selection !== undefined) {
    draft.selection?.restore(selection);
  }

  const evaluation = evaluateCommand(draft, command, view);
  return evaluation.ok ? { ok: true } : evaluation;
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

function definePatchCommand<Command extends { type: string }>(
  descriptor: PatchCommandDescriptor<Command>,
): PatchCommandDescriptor<Command> {
  return descriptor;
}

function defineDirectCommand<Command extends { type: string }>(
  descriptor: DirectCommandDescriptor<Command>,
): DirectCommandDescriptor<Command> {
  return descriptor;
}

function defineQuery<Query extends { type: string }, Result>(
  descriptor: EditorQueryDescriptor<Query, Result>,
): EditorQueryDescriptor<Query, Result> {
  return descriptor;
}

function commandDescriptorFor<Command extends EditorCommand>(
  command: Command,
): EditorCommandDescriptor<Command> | undefined {
  return commandDescriptors[command.type as keyof typeof commandDescriptors] as
    | EditorCommandDescriptor<Command>
    | undefined;
}

function evaluatePatchCommand<Command extends EditorCommand>(
  document: JSONDocument<NoteDocument>,
  command: Command,
  descriptor: PatchCommandDescriptor<Command>,
  view: EditorViewAdapter | undefined,
): CommandEvaluation {
  return descriptor.evaluate({
    document,
    selection: selectionForCommand(document),
    command,
    view,
  });
}

function queryDescriptorFor<Query extends EditorQuery>(
  query: Query,
): EditorQueryDescriptor<Query, EditorQueryResult<Query>> {
  return queryDescriptors[
    query.type as keyof typeof queryDescriptors
  ] as EditorQueryDescriptor<Query, EditorQueryResult<Query>>;
}

function applyHistoryResult(
  document: JSONDocument<NoteDocument>,
  result: JSONCapabilityResult,
): EditorResult {
  return result.ok
    ? {
        ok: true,
        changed: true,
        snapshot: {
          document: document.value,
          selection: richSelectionFromSnap(document.value, document.selection),
          revision: 0,
        },
      }
    : { ok: false, reason: result.reason ?? result.code };
}

function jsonCapabilityToEditorCapability(
  result: JSONCapabilityResult,
): EditorCapability {
  return result.ok
    ? result
    : { ok: false, reason: result.reason ?? result.code };
}

function snapshotsEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return (
    JSON.stringify(left.document) === JSON.stringify(right.document) &&
    JSON.stringify(left.selection) === JSON.stringify(right.selection)
  );
}

function isCommandArray(
  command: EditorCommand | readonly EditorCommand[],
): command is readonly EditorCommand[] {
  return Array.isArray(command);
}

function assertNotDisposed(disposed: boolean) {
  if (disposed) {
    throw new Error("Editor has been disposed.");
  }
}
