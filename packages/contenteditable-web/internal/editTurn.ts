import type { JsonContentEditableModelCommand } from "../contract";
import type { SelectionIntent } from "./editFlow";

export type EditTurn =
  | {
      type: "block-composing-history";
    }
  | {
      type: "begin-composition";
    }
  | {
      type: "begin-native-text";
    }
  | {
      type: "commit-native-text";
      selectionIntent: SelectionIntent;
    }
  | {
      type: "composing-input";
    }
  | {
      type: "copy" | "cut" | "paste";
      event: ClipboardEvent;
    }
  | {
      type: "end-composition";
    }
  | {
      type: "flush-before-command";
      command: JsonContentEditableModelCommand;
    }
  | {
      type: "history";
      command: "redo" | "undo";
    }
  | {
      type: "insert-line-break";
    }
  | {
      type: "no-change";
    }
  | {
      type: "run-command";
      command: JsonContentEditableModelCommand;
    }
  | {
      type: "suppress-beforeinput-composition-commit";
    }
  | {
      type: "suppress-input-composition-commit";
    }
  | {
      type: "sync-selection";
    };

export function editTurnPreventsDefault(turn: EditTurn): boolean {
  switch (turn.type) {
    case "block-composing-history":
    case "copy":
    case "cut":
    case "flush-before-command":
    case "history":
    case "insert-line-break":
    case "paste":
    case "run-command":
    case "suppress-beforeinput-composition-commit":
      return true;
    default:
      return false;
  }
}

export function editTurnResetsVerticalGoal(turn: EditTurn): boolean {
  switch (turn.type) {
    case "block-composing-history":
    case "flush-before-command":
    case "run-command":
      return false;
    default:
      return true;
  }
}

export function resolveEditTurn(
  event: Event,
  state: {
    composing: boolean;
    suppressNextCompositionCommit: boolean;
  },
): EditTurn {
  if (event.type === "beforeinput" && event instanceof InputEvent) {
    if (state.suppressNextCompositionCommit) {
      return editTurn("suppress-beforeinput-composition-commit");
    }
    if (
      state.composing &&
      (event.inputType === "historyUndo" || event.inputType === "historyRedo")
    ) {
      return editTurn("block-composing-history");
    }
    if (event.inputType === "historyUndo") {
      return historyEditTurn("undo");
    }
    if (event.inputType === "historyRedo") {
      return historyEditTurn("redo");
    }
    if (isLineBreakInput(event) && !event.isComposing) {
      return editTurn("insert-line-break");
    }
    return editTurn("begin-native-text");
  }

  if (event.type === "compositionstart") {
    return editTurn("begin-composition");
  }

  if (event.type === "compositionend") {
    return editTurn("end-composition");
  }

  if (event.type === "input") {
    if (state.suppressNextCompositionCommit && event instanceof InputEvent) {
      return editTurn("suppress-input-composition-commit");
    }
    if (event instanceof InputEvent && event.isComposing) {
      return editTurn("composing-input");
    }
    return {
      type: "commit-native-text",
      selectionIntent:
        event instanceof InputEvent &&
        event.inputType === "insertFromComposition"
          ? "composition-commit"
          : "text-commit",
    };
  }

  if (event.type === "selectionchange" || event.type === "select") {
    return editTurn("sync-selection");
  }

  if (event.type === "copy" && event instanceof ClipboardEvent) {
    return clipboardEditTurn("copy", event);
  }

  if (event.type === "cut" && event instanceof ClipboardEvent) {
    return clipboardEditTurn("cut", event);
  }

  if (event.type === "paste" && event instanceof ClipboardEvent) {
    return clipboardEditTurn("paste", event);
  }

  if (event.type === "keydown" && event instanceof KeyboardEvent) {
    const isComposing = state.composing || event.isComposing;
    if (isComposing && historyCommandFromKey(event) !== null) {
      return editTurn("block-composing-history");
    }
    if (!isComposing && isLineBreakKey(event)) {
      return editTurn("insert-line-break");
    }

    const command = modelCommandFromKey(event);
    if (command !== null) {
      return isComposing
        ? flushBeforeCommandEditTurn(command)
        : runCommandEditTurn(command);
    }

    const historyCommand = historyCommandFromKey(event);
    if (historyCommand !== null) {
      return historyEditTurn(historyCommand);
    }
  }

  return editTurn("no-change");
}

function clipboardEditTurn(
  type: "copy" | "cut" | "paste",
  event: ClipboardEvent,
): EditTurn {
  return {
    type,
    event,
  };
}

function editTurn(
  type:
    | "begin-composition"
    | "begin-native-text"
    | "block-composing-history"
    | "composing-input"
    | "end-composition"
    | "insert-line-break"
    | "no-change"
    | "suppress-beforeinput-composition-commit"
    | "suppress-input-composition-commit"
    | "sync-selection",
): EditTurn {
  switch (type) {
    case "begin-composition":
      return { type };
    case "begin-native-text":
      return { type };
    case "block-composing-history":
      return { type };
    case "composing-input":
      return { type };
    case "end-composition":
      return { type };
    case "insert-line-break":
      return { type };
    case "no-change":
      return { type };
    case "suppress-beforeinput-composition-commit":
      return { type };
    case "suppress-input-composition-commit":
      return { type };
    case "sync-selection":
      return { type };
  }
}

function flushBeforeCommandEditTurn(
  command: JsonContentEditableModelCommand,
): EditTurn {
  return {
    type: "flush-before-command",
    command,
  };
}

function historyCommandFromKey(event: KeyboardEvent): "undo" | "redo" | null {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) {
    return null;
  }
  const key = event.key.toLowerCase();
  if (key === "z" && event.shiftKey) {
    return "redo";
  }
  if (key === "z") {
    return "undo";
  }
  if (key === "y") {
    return "redo";
  }
  return null;
}

function historyEditTurn(command: "redo" | "undo"): EditTurn {
  return {
    type: "history",
    command,
  };
}

function isLineBreakInput(event: InputEvent): boolean {
  return (
    event.inputType === "insertParagraph" ||
    event.inputType === "insertLineBreak"
  );
}

function isLineBreakKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey
  );
}

function lineBoundaryCommandFromKey(
  event: KeyboardEvent,
): "line-start" | "line-end" | null {
  if (!event.metaKey || event.altKey || event.ctrlKey) {
    return null;
  }
  if (event.key === "ArrowLeft") {
    return "line-start";
  }
  if (event.key === "ArrowRight") {
    return "line-end";
  }
  return null;
}

function modelCommandFromKey(
  event: KeyboardEvent,
): JsonContentEditableModelCommand | null {
  const verticalMotionCommand = verticalMotionCommandFromKey(event);
  if (verticalMotionCommand !== null) {
    return {
      type: "moveVertical",
      direction: verticalMotionCommand,
      extend: event.shiftKey,
    };
  }

  const lineBoundaryCommand = lineBoundaryCommandFromKey(event);
  if (lineBoundaryCommand !== null) {
    return {
      type: "moveLineBoundary",
      boundary: lineBoundaryCommand,
      extend: event.shiftKey,
    };
  }

  return null;
}

function runCommandEditTurn(command: JsonContentEditableModelCommand): EditTurn {
  return {
    type: "run-command",
    command,
  };
}

function verticalMotionCommandFromKey(
  event: KeyboardEvent,
): "up" | "down" | null {
  if (event.metaKey || event.altKey || event.ctrlKey) {
    return null;
  }
  if (event.key === "ArrowUp") {
    return "up";
  }
  if (event.key === "ArrowDown") {
    return "down";
  }
  return null;
}
