import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { CursorDirection } from "./cursor";
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
  moveWordLeft,
  moveWordRight,
} from "./cursorCommands";
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

type EditorGeometryViewAdapter = {
  geometry(): CursorGeometryAdapter | null;
};

type MoveStrategy = (
  document: NoteDocument,
  selection: SelectionSnap,
  view: EditorGeometryViewAdapter | undefined,
  extend: { extend: boolean },
) => CommandEvaluation;

export type MoveSelectionCommand = {
  type: "moveSelection";
  unit: EditorMoveUnit;
  direction: EditorMoveDirection;
  extend?: boolean;
};

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

const moveStrategies = {
  "character:backward": defineMoveStrategy(
    (document, selection, _view, extend) =>
      cursorCommandResult(moveLeft(document, selection, extend)),
  ),
  "character:forward": defineMoveStrategy(
    (document, selection, _view, extend) =>
      cursorCommandResult(moveRight(document, selection, extend)),
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

export function moveSelectionCommand(
  document: NoteDocument,
  selection: SelectionSnap,
  command: MoveSelectionCommand,
  view: EditorGeometryViewAdapter | undefined,
): CommandEvaluation {
  const strategy = moveStrategies[moveStrategyKey(command)];
  return strategy === undefined
    ? {
        ok: false,
        reason: "Move direction is not valid for the requested unit.",
      }
    : strategy(document, selection, view, { extend: command.extend === true });
}

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

function defineMoveStrategy(strategy: MoveStrategy): MoveStrategy {
  return strategy;
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
  view: EditorGeometryViewAdapter | undefined,
  run: (geometry: CursorGeometryAdapter) => CommandEvaluation,
): CommandEvaluation {
  const geometry = view?.geometry();
  return geometry === null || geometry === undefined
    ? { ok: false, reason: "View geometry is required." }
    : run(geometry);
}
