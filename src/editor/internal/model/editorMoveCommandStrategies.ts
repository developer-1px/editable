import type { SelectionSnap } from "@interactive-os/json-document";
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
import type { CommandEvaluation } from "./editorCommandStrategies";
import type { NoteDocument } from "./noteDocument";

export type EditorMoveUnit =
  | "character"
  | "word"
  | "line"
  | "block"
  | "page"
  | "document";
export type EditorMoveDirection = CursorDirection | "up" | "down";

export type MoveSelectionCommand = {
  type: "moveSelection";
  unit: EditorMoveUnit;
  direction: EditorMoveDirection;
  extend?: boolean;
};

type EditorGeometryViewAdapter = {
  geometry(): CursorGeometryAdapter | null;
};

type MoveStrategy = (
  document: NoteDocument,
  selection: SelectionSnap,
  view: EditorGeometryViewAdapter | undefined,
  extend: { extend: boolean },
) => CommandEvaluation;

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

function cursorCommandResult(result: CursorCommandResult): CommandEvaluation {
  return {
    ok: true,
    patch: [],
    selectionAfter: result.selectionAfter,
  };
}

function defineMoveStrategy(strategy: MoveStrategy): MoveStrategy {
  return strategy;
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
