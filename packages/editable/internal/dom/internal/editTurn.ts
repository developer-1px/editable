import type { InternalSelectionIntent } from "../contract";
import type { SelectionIntent } from "./editFlow";

export type EditModelInstruction =
  | {
      type: "command";
      command: InternalSelectionIntent;
    }
  | {
      type: "insertText";
      text: string;
      label: string;
    };

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
      type: "flush-before-model-instruction";
      instruction: EditModelInstruction;
    }
  | {
      type: "history";
      command: "redo" | "undo";
    }
  | {
      type: "no-change";
    }
  | {
      type: "run-model-instruction";
      instruction: EditModelInstruction;
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
    case "flush-before-model-instruction":
    case "history":
    case "paste":
    case "run-model-instruction":
    case "suppress-beforeinput-composition-commit":
      return true;
    default:
      return false;
  }
}

export function editTurnResetsVerticalGoal(turn: EditTurn): boolean {
  switch (turn.type) {
    case "block-composing-history":
    case "flush-before-model-instruction":
      return false;
    case "run-model-instruction":
      return turn.instruction.type === "insertText";
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
      return state.composing
        ? flushBeforeModelInstructionEditTurn(lineBreakInstruction())
        : runModelInstructionEditTurn(lineBreakInstruction());
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
    if (isLineBreakKey(event)) {
      return isComposing
        ? flushBeforeModelInstructionEditTurn(lineBreakInstruction())
        : runModelInstructionEditTurn(lineBreakInstruction());
    }

    const command = modelCommandFromKey(event);
    if (command !== null) {
      return isComposing
        ? flushBeforeModelInstructionEditTurn(commandInstruction(command))
        : runModelInstructionEditTurn(commandInstruction(command));
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

function flushBeforeModelInstructionEditTurn(
  instruction: EditModelInstruction,
): EditTurn {
  return {
    type: "flush-before-model-instruction",
    instruction,
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
  if (event.altKey || event.ctrlKey) {
    return null;
  }
  if (event.key === "Home") {
    return "line-start";
  }
  if (event.key === "End") {
    return "line-end";
  }
  if (!event.metaKey) {
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
): InternalSelectionIntent | null {
  const alter = event.shiftKey ? "extend" : "move";
  const verticalMotionCommand = verticalMotionCommandFromKey(event);
  if (verticalMotionCommand !== null) {
    return {
      type: "modifySelection",
      alter,
      direction: verticalMotionCommand === "up" ? "backward" : "forward",
      granularity: "line",
    };
  }

  const lineBoundaryCommand = lineBoundaryCommandFromKey(event);
  if (lineBoundaryCommand !== null) {
    return {
      type: "modifySelection",
      alter,
      direction: lineBoundaryCommand === "line-start" ? "backward" : "forward",
      granularity: "lineboundary",
    };
  }

  return null;
}

function runModelInstructionEditTurn(
  instruction: EditModelInstruction,
): EditTurn {
  return {
    type: "run-model-instruction",
    instruction,
  };
}

function commandInstruction(
  command: InternalSelectionIntent,
): EditModelInstruction {
  return {
    type: "command",
    command,
  };
}

function lineBreakInstruction(): EditModelInstruction {
  return {
    type: "insertText",
    text: "\n",
    label: "insert line break",
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
