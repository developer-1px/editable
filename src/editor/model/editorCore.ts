import {
  createJSONDocument,
  type JSONCapabilityResult,
  type JSONDocument,
  type JSONDocumentOptions,
  type JSONPatchOperation,
  type SelectionPoint,
  type SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CursorDirection,
  type CursorPoint,
  type CursorPointInput,
  normalizeCursorPoint,
} from "./cursor";
import {
  type CursorCommandResult,
  type CursorGeometryAdapter,
  moveBlockEnd,
  moveBlockStart,
  moveDown,
  moveEnd,
  moveLeft,
  moveLineEnd,
  moveLineStart,
  movePageDown,
  movePageUp,
  moveRight,
  moveStart,
  moveUp,
  moveVisualLeft,
  moveVisualRight,
  moveWordLeft,
  moveWordRight,
  selectAll,
} from "./cursorCommands";
import {
  activeMarksFromSelection,
  toggleLink,
  toggleMark,
} from "./markCommands";
import {
  type InlineNode,
  initialNoteDocument,
  type Mark,
  type NoteBlock,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";
import {
  cursorPointInputFromSelectionPoint,
  type RichSelection,
  selectionFromRichSelection,
} from "./richSelection";
import {
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
  insertFigure,
  insertMention,
  insertText,
  splitParagraph,
  type TextCommandResult,
} from "./textCommands";

export type Editor = {
  snapshot(): EditorSnapshot;
  subscribe(listener: EditorListener): () => void;
  dispatch(
    command: EditorCommand | readonly EditorCommand[],
    options?: DispatchOptions,
  ): EditorResult;
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

export type DispatchOptions = {
  label?: string;
  origin?: string;
  mergeKey?: string;
};

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

export type EditorMoveUnit =
  | "character"
  | "word"
  | "line"
  | "block"
  | "page"
  | "document";
export type EditorMoveDirection = CursorDirection | "up" | "down";
export type EditorDeleteUnit = "character" | "word";
export type ToggleMarkCommandType = Extract<
  Mark["type"],
  "bold" | "italic" | "code" | "link"
>;

export type EditorViewAdapter = {
  geometry(): CursorGeometryAdapter | null;
};

export type CreateEditorOptions = {
  initial?: NoteDocument;
  history?: JSONDocumentOptions["history"];
  selection?: RichSelection;
  view?: EditorViewAdapter;
};

type CommandEvaluation =
  | {
      ok: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: false;
      reason: string;
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

type InsertNodeStrategy<Node extends { type: string }> = (
  document: NoteDocument,
  selection: SelectionSnap,
  node: Node,
) => CommandEvaluation;

type InsertableNodeFromStrategy<Strategy> =
  Strategy extends InsertNodeStrategy<infer Node> ? Node : never;

type ToggleMarkStrategy = (
  document: NoteDocument,
  selection: SelectionSnap,
) => CommandEvaluation;

type DeleteStrategy = (
  document: NoteDocument,
  selection: SelectionSnap,
) => CommandEvaluation;

type MoveStrategy = (
  document: NoteDocument,
  selection: SelectionSnap,
  view: EditorViewAdapter | undefined,
  extend: { extend: boolean },
) => CommandEvaluation;

type MoveSelectionCommand = {
  type: "moveSelection";
  unit: EditorMoveUnit;
  direction: EditorMoveDirection;
  extend?: boolean;
};

type DeleteCommand = {
  type: "delete";
  direction: CursorDirection;
  unit?: EditorDeleteUnit;
};

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

const insertNodeStrategies = {
  mention: defineInsertNodeStrategy<Extract<InlineNode, { type: "mention" }>>(
    (document, selection, node) =>
      textCommandResult(insertMention(document, selection, node)),
  ),
  figure: defineInsertNodeStrategy<Extract<NoteBlock, { type: "figure" }>>(
    (document, selection, node) =>
      textCommandResult(insertFigure(document, selection, node)),
  ),
};

export type InsertableEditorNode = InsertableNodeFromStrategy<
  (typeof insertNodeStrategies)[keyof typeof insertNodeStrategies]
>;

const toggleMarkStrategies = {
  bold: defineToggleMarkStrategy((document, selection) =>
    textCommandResult(toggleMark(document, selection, "bold")),
  ),
  italic: defineToggleMarkStrategy((document, selection) =>
    textCommandResult(toggleMark(document, selection, "italic")),
  ),
  code: defineToggleMarkStrategy((document, selection) =>
    textCommandResult(toggleMark(document, selection, "code")),
  ),
  link: defineToggleMarkStrategy((document, selection) =>
    textCommandResult(toggleLink(document, selection)),
  ),
};

const deleteStrategies = {
  "character:backward": defineDeleteStrategy((document, selection) =>
    textCommandResult(deleteBackward(document, selection)),
  ),
  "character:forward": defineDeleteStrategy((document, selection) =>
    textCommandResult(deleteForward(document, selection)),
  ),
  "word:backward": defineDeleteStrategy((document, selection) =>
    textCommandResult(deleteWordBackward(document, selection)),
  ),
  "word:forward": defineDeleteStrategy((document, selection) =>
    textCommandResult(deleteWordForward(document, selection)),
  ),
};

const moveStrategies = {
  "character:backward": defineMoveStrategy(
    (document, selection, view, extend) => {
      const geometry = view?.geometry();
      return cursorCommandResult(
        geometry === null || geometry === undefined
          ? moveLeft(document, selection, extend)
          : moveVisualLeft(document, selection, geometry, extend),
      );
    },
  ),
  "character:forward": defineMoveStrategy(
    (document, selection, view, extend) => {
      const geometry = view?.geometry();
      return cursorCommandResult(
        geometry === null || geometry === undefined
          ? moveRight(document, selection, extend)
          : moveVisualRight(document, selection, geometry, extend),
      );
    },
  ),
  "word:backward": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveWordLeft(document, selection, extend)),
  ),
  "word:forward": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveWordRight(document, selection, extend)),
  ),
  "block:backward": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveBlockStart(document, selection, extend)),
  ),
  "block:up": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveBlockStart(document, selection, extend)),
  ),
  "block:forward": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveBlockEnd(document, selection, extend)),
  ),
  "block:down": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveBlockEnd(document, selection, extend)),
  ),
  "document:backward": defineMoveStrategy(
    (document, selection, _view, extend) =>
      cursorCommandResult(moveStart(document, selection, extend)),
  ),
  "document:up": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveStart(document, selection, extend)),
  ),
  "document:forward": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveEnd(document, selection, extend)),
  ),
  "document:down": defineMoveStrategy((document, selection, _view, extend) =>
    cursorCommandResult(moveEnd(document, selection, extend)),
  ),
  "line:backward": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(moveLineStart(document, selection, geometry, extend)),
    ),
  ),
  "line:forward": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(moveLineEnd(document, selection, geometry, extend)),
    ),
  ),
  "line:up": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(moveUp(document, selection, geometry, extend)),
    ),
  ),
  "line:down": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(moveDown(document, selection, geometry, extend)),
    ),
  ),
  "page:backward": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(movePageUp(document, selection, geometry, extend)),
    ),
  ),
  "page:up": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(movePageUp(document, selection, geometry, extend)),
    ),
  ),
  "page:forward": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(movePageDown(document, selection, geometry, extend)),
    ),
  ),
  "page:down": defineMoveStrategy((document, selection, view, extend) =>
    withGeometry(view, (geometry) =>
      cursorCommandResult(movePageDown(document, selection, geometry, extend)),
    ),
  ),
};

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
          reason: parsed.error.issues[0]?.message ?? "Document is invalid.",
        };
      }

      return {
        ok: true,
        patch: [{ op: "replace", path: "", value: command.document }],
        selectionAfter: defaultSelection(command.document),
      };
    },
  }),
  applyPatch: definePatchCommand<{
    type: "applyPatch";
    patch: readonly JSONPatchOperation[];
  }>({
    evaluate({ document, selection, command }) {
      const canPatch = document.canPatch(command.patch);
      if (!canPatch.ok) {
        return { ok: false, reason: canPatch.reason ?? canPatch.code };
      }

      return {
        ok: true,
        patch: [...command.patch],
        selectionAfter: selection,
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
    dispatch(command, dispatchOptions = {}) {
      assertNotDisposed(disposed);
      const before = snapshot();
      const result = isCommandArray(command)
        ? dispatchBatch(document, command, options.view, dispatchOptions)
        : dispatchSingle(document, command, options.view, dispatchOptions);

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
    query(query) {
      assertNotDisposed(disposed);
      return queryEditor(document, snapshot(), query, editor.can) as never;
    },
    dispose() {
      disposed = true;
      listeners.clear();
    },
  };

  return editor;
}

function dispatchSingle(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand,
  view: EditorViewAdapter | undefined,
  options: DispatchOptions,
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

  return applyEvaluation(document, evaluation, options);
}

function dispatchBatch(
  document: JSONDocument<NoteDocument>,
  commands: readonly EditorCommand[],
  view: EditorViewAdapter | undefined,
  options: DispatchOptions,
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

  return applyEvaluation(
    document,
    { ok: true, patch, selectionAfter },
    options,
  );
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

function moveSelectionCommand(
  document: NoteDocument,
  selection: SelectionSnap,
  command: MoveSelectionCommand,
  view: EditorViewAdapter | undefined,
): CommandEvaluation {
  const strategy = moveStrategies[moveStrategyKey(command)];
  return strategy === undefined
    ? {
        ok: false,
        reason: "Move direction is not valid for the requested unit.",
      }
    : strategy(document, selection, view, { extend: command.extend === true });
}

function applyEvaluation(
  document: JSONDocument<NoteDocument>,
  evaluation: Extract<CommandEvaluation, { ok: true }>,
  options: DispatchOptions,
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
    ...options,
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

function defineInsertNodeStrategy<Node extends { type: string }>(
  strategy: InsertNodeStrategy<Node>,
): InsertNodeStrategy<Node> {
  return strategy;
}

function defineToggleMarkStrategy(
  strategy: ToggleMarkStrategy,
): ToggleMarkStrategy {
  return strategy;
}

function defineDeleteStrategy(strategy: DeleteStrategy): DeleteStrategy {
  return strategy;
}

function defineMoveStrategy(strategy: MoveStrategy): MoveStrategy {
  return strategy;
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

function insertNodeCommand(
  document: NoteDocument,
  selection: SelectionSnap,
  node: InsertableEditorNode,
): CommandEvaluation {
  const strategy = insertNodeStrategies[
    node.type as keyof typeof insertNodeStrategies
  ] as InsertNodeStrategy<typeof node> | undefined;

  return strategy === undefined
    ? { ok: false, reason: "Unsupported insertable node." }
    : strategy(document, selection, node);
}

function toggleMarkCommand(
  document: NoteDocument,
  selection: SelectionSnap,
  mark: ToggleMarkCommandType,
): CommandEvaluation {
  const strategy = toggleMarkStrategies[mark];

  return strategy(document, selection);
}

function deleteCommand(
  document: NoteDocument,
  selection: SelectionSnap,
  command: DeleteCommand,
): CommandEvaluation {
  const strategy = deleteStrategies[deleteStrategyKey(command)];

  return strategy === undefined
    ? { ok: false, reason: "Delete direction is not valid for the unit." }
    : strategy(document, selection);
}

function deleteStrategyKey(
  command: DeleteCommand,
): keyof typeof deleteStrategies {
  return `${command.unit ?? "character"}:${command.direction}` as keyof typeof deleteStrategies;
}

function moveStrategyKey(
  command: MoveSelectionCommand,
): keyof typeof moveStrategies {
  return `${command.unit}:${command.direction}` as keyof typeof moveStrategies;
}

function withGeometry(
  view: EditorViewAdapter | undefined,
  run: (geometry: CursorGeometryAdapter) => CommandEvaluation,
): CommandEvaluation {
  const geometry = view?.geometry();
  return geometry === null || geometry === undefined
    ? { ok: false, reason: "View geometry is required." }
    : run(geometry);
}

function textCommandResult(result: TextCommandResult): CommandEvaluation {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    patch: result.patch,
    selectionAfter: result.selectionAfter,
  };
}

function cursorCommandResult(result: CursorCommandResult): CommandEvaluation {
  return {
    ok: true,
    patch: [],
    selectionAfter: result.selectionAfter,
  };
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

function restoreInitialSelection(
  document: JSONDocument<NoteDocument>,
  selection: RichSelection | undefined,
) {
  document.selection?.restore(
    selection === undefined
      ? defaultSelection(document.value)
      : selectionFromRichSelection(document.value, selection),
  );
}

function defaultSelection(document: NoteDocument): SelectionSnap {
  return selectionFromRichSelection(document, {
    type: "caret",
    point: normalizeCursorPoint(document, {
      path: "/blocks/0",
      edge: "before",
    }),
  });
}

function selectionForCommand(document: JSONDocument<NoteDocument>) {
  const selection = document.selection?.snapshot();
  if (selection === undefined) {
    return defaultSelection(document.value);
  }

  const richSelection = richSelectionFromSnap(document.value, selection);
  return richSelection === null
    ? defaultSelection(document.value)
    : selectionFromRichSelection(document.value, richSelection);
}

function richSelectionFromSnap(
  document: NoteDocument,
  selection: SelectionSnap | undefined,
): RichSelection | null {
  if (selection === undefined || selection.focus === null) {
    return null;
  }

  const range = selection.selectionRanges[selection.primaryIndex];
  if (range === undefined) {
    return null;
  }

  if (selectionPointsEqual(range.anchor, range.focus)) {
    return {
      type: "caret",
      point: normalizeCursorPoint(
        document,
        cursorPointInputFromSelectionPoint(selection.focus),
      ),
      ...(selection.context === undefined
        ? {}
        : { context: selection.context }),
    };
  }

  if (isNodeSelectionSnap(selection, range)) {
    return {
      type: "node",
      target: selection.selectedPointers[0] ?? "",
      ...(selection.context === undefined
        ? {}
        : { context: selection.context }),
    };
  }

  return {
    type: "range",
    anchor: normalizeEditorCursorPoint(
      document,
      cursorPointInputFromSelectionPoint(range.anchor),
    ),
    focus: normalizeEditorCursorPoint(
      document,
      cursorPointInputFromSelectionPoint(range.focus),
    ),
    ...(selection.context === undefined ? {} : { context: selection.context }),
  };
}

function normalizeEditorCursorPoint(
  document: NoteDocument,
  point: CursorPointInput,
): CursorPoint {
  return normalizeCursorPoint(document, point);
}

function snapshotsEqual(left: EditorSnapshot, right: EditorSnapshot): boolean {
  return (
    JSON.stringify(left.document) === JSON.stringify(right.document) &&
    JSON.stringify(left.selection) === JSON.stringify(right.selection)
  );
}

function isNodeSelectionSnap(
  selection: SelectionSnap,
  range: SelectionSnap["selectionRanges"][number],
): boolean {
  const target = selection.selectedPointers[0];
  if (target === undefined || selection.selectedPointers.length !== 1) {
    return false;
  }

  return (
    (pointIsEdge(range.anchor, target, "before") &&
      pointIsEdge(range.focus, target, "after")) ||
    (pointIsEdge(range.anchor, target, "after") &&
      pointIsEdge(range.focus, target, "before"))
  );
}

function pointIsEdge(
  point: SelectionPoint,
  path: string,
  edge: "before" | "after",
): boolean {
  return (
    typeof point === "object" &&
    point !== null &&
    point.path === path &&
    point.edge === edge
  );
}

function selectionPointsEqual(left: SelectionPoint, right: SelectionPoint) {
  if (typeof left === "string" || typeof right === "string") {
    return left === right;
  }

  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge
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
