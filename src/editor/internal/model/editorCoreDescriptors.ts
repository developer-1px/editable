import type {
  JSONCapabilityResult,
  JSONDocument,
  SelectionSnap,
} from "@interactive-os/json-document";
import { selectAll } from "./cursorCommands";
import {
  type CommandEvaluation,
  cursorCommandResult,
  type DeleteCommand,
  deleteCommand,
  type InsertableEditorNode,
  insertNodeCommand,
  type ToggleMarkCommandType,
  textCommandResult,
  toggleMarkCommand,
} from "./editorCommandStrategies";
import type {
  EditorCapability,
  EditorResult,
  EditorSnapshot,
  EditorViewAdapter,
} from "./editorCore";
import {
  type MoveSelectionCommand,
  moveSelectionCommand,
} from "./editorMoveCommandStrategies";
import { defaultSelection, richSelectionFromSnap } from "./editorSelection";
import { activeMarksFromSelection } from "./markCommands";
import {
  type Mark,
  type NoteDocument,
  NoteDocumentSchema,
} from "./noteDocument";
import {
  type RichSelection,
  selectionFromRichSelection,
} from "./richSelection";
import { insertText, splitParagraph } from "./textCommands";

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

export type PatchCommandDescriptor<Command extends { type: string }> = {
  batchable?: true;
  evaluate(input: CommandEvaluationInput<Command>): CommandEvaluation;
  can?(input: CommandCanInput<Command>): EditorCapability;
};

type DirectCommandDescriptor<Command extends { type: string }> = {
  batchable: false;
  dispatch(input: CommandDispatchInput<Command>): EditorResult;
  can(input: CommandCanInput<Command>): EditorCapability;
};

export type EditorCommandDescriptor<Command extends { type: string }> =
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

export function commandDescriptorFor<Command extends EditorCommand>(
  command: Command,
): EditorCommandDescriptor<Command> | undefined {
  return commandDescriptors[command.type as keyof typeof commandDescriptors] as
    | EditorCommandDescriptor<Command>
    | undefined;
}

export function queryDescriptorFor<Query extends EditorQuery>(
  query: Query,
): EditorQueryDescriptor<Query, EditorQueryResult<Query>> {
  return queryDescriptors[
    query.type as keyof typeof queryDescriptors
  ] as EditorQueryDescriptor<Query, EditorQueryResult<Query>>;
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
