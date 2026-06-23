import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { CursorDirection } from "./cursor";
import type { CursorCommandResult } from "./cursorCommands";
import { toggleLink, toggleMark } from "./markCommands";
import type {
  FigureBlockInput,
  Mark,
  MentionInlineInput,
  NoteDocument,
} from "./noteDocument";
import {
  deleteBackward,
  deleteForward,
  deleteWordBackward,
  deleteWordForward,
  insertFigure,
  insertMention,
  type TextCommandResult,
} from "./textCommands";

export type CommandEvaluation =
  | {
      ok: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: false;
      reason: string;
    };

export type EditorDeleteUnit = "character" | "word";
export type ToggleMarkCommandType = Extract<
  Mark["type"],
  "bold" | "italic" | "code" | "link"
>;
export type {
  EditorMoveDirection,
  EditorMoveUnit,
  MoveSelectionCommand,
} from "./editorMoveCommandStrategies";

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

export type DeleteCommand = {
  type: "delete";
  direction: CursorDirection;
  unit?: EditorDeleteUnit;
};

const insertNodeStrategies = {
  mention: defineInsertNodeStrategy<MentionInlineInput>(
    (document, selection, node) =>
      textCommandResult(insertMention(document, selection, node)),
  ),
  figure: defineInsertNodeStrategy<FigureBlockInput>(
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

export function insertNodeCommand(
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

export function toggleMarkCommand(
  document: NoteDocument,
  selection: SelectionSnap,
  mark: ToggleMarkCommandType,
): CommandEvaluation {
  const strategy = toggleMarkStrategies[mark];

  return strategy(document, selection);
}

export function deleteCommand(
  document: NoteDocument,
  selection: SelectionSnap,
  command: DeleteCommand,
): CommandEvaluation {
  const strategy = deleteStrategies[deleteStrategyKey(command)];

  return strategy === undefined
    ? { ok: false, reason: "Delete direction is not valid for the unit." }
    : strategy(document, selection);
}

export function textCommandResult(
  result: TextCommandResult,
): CommandEvaluation {
  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    patch: result.patch,
    selectionAfter: result.selectionAfter,
  };
}

export function cursorCommandResult(
  result: CursorCommandResult,
): CommandEvaluation {
  return {
    ok: true,
    patch: [],
    selectionAfter: result.selectionAfter,
  };
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

function deleteStrategyKey(
  command: DeleteCommand,
): keyof typeof deleteStrategies {
  return `${command.unit ?? "character"}:${command.direction}` as keyof typeof deleteStrategies;
}
