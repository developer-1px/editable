import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type {
  JsonContentEditableModelCommand,
  JsonContentEditableUpdate,
} from "../contract";
import {
  historyCommandFromKey,
  lineBoundaryCommandFromKey,
} from "./keyboard";

export type SelectionIntent =
  | "composition-commit"
  | "range-command"
  | "text-commit";

export type EditTurnOwner = "handoff" | "model" | "native" | "none";

export type EditTurn =
  | {
      type: "block-composing-history";
      owner: "native";
      preventDefault: true;
      resetVerticalGoal: false;
    }
  | {
      type: "begin-composition";
      owner: "native";
      preventDefault: false;
      resetVerticalGoal: true;
    }
  | {
      type: "begin-native-text";
      owner: "native";
      preventDefault: false;
      resetVerticalGoal: true;
    }
  | {
      type: "commit-native-text";
      owner: "native";
      preventDefault: false;
      resetVerticalGoal: true;
      selectionIntent: SelectionIntent;
    }
  | {
      type: "composing-input";
      owner: "native";
      preventDefault: false;
      resetVerticalGoal: true;
    }
  | {
      type: "copy" | "cut" | "paste";
      owner: "model";
      preventDefault: true;
      resetVerticalGoal: true;
      event: ClipboardEvent;
    }
  | {
      type: "end-composition";
      owner: "native";
      preventDefault: false;
      resetVerticalGoal: true;
    }
  | {
      type: "handoff-command";
      owner: "handoff";
      preventDefault: true;
      resetVerticalGoal: false;
      command: JsonContentEditableModelCommand;
    }
  | {
      type: "history";
      owner: "model";
      preventDefault: true;
      resetVerticalGoal: true;
      command: "redo" | "undo";
    }
  | {
      type: "insert-line-break";
      owner: "model";
      preventDefault: true;
      resetVerticalGoal: true;
    }
  | {
      type: "no-change";
      owner: "none";
      preventDefault: false;
      resetVerticalGoal: true;
    }
  | {
      type: "run-command";
      owner: "model";
      preventDefault: true;
      resetVerticalGoal: false;
      command: JsonContentEditableModelCommand;
    }
  | {
      type: "suppress-beforeinput-composition-commit";
      owner: "native";
      preventDefault: true;
      resetVerticalGoal: true;
    }
  | {
      type: "suppress-input-composition-commit";
      owner: "native";
      preventDefault: false;
      resetVerticalGoal: true;
    }
  | {
      type: "sync-selection";
      owner: "native";
      preventDefault: false;
      resetVerticalGoal: true;
    };

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
      owner: "native",
      preventDefault: false,
      resetVerticalGoal: true,
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
        ? handoffCommandEditTurn(command)
        : runCommandEditTurn(command);
    }

    const historyCommand = historyCommandFromKey(event);
    if (historyCommand !== null) {
      return historyEditTurn(historyCommand);
    }
  }

  return editTurn("no-change");
}

export function nativeTextUpdate({
  kind,
  patch = [],
  render = false,
  selection,
}: {
  kind: "no-change" | "selection" | "text";
  patch?: ReadonlyArray<JSONPatchOperation>;
  render?: boolean;
  selection: SelectionSnap | null;
}): JsonContentEditableUpdate {
  return editFlowUpdate({
    flow: "native-text",
    kind,
    patch,
    render,
    selection,
  });
}

export function modelCommandUpdate({
  kind,
  patch = [],
  render,
  selection,
}: {
  kind: "no-change" | "selection" | "text";
  patch?: ReadonlyArray<JSONPatchOperation>;
  render: boolean;
  selection: SelectionSnap | null;
}): JsonContentEditableUpdate {
  return editFlowUpdate({
    flow: "model-command",
    kind,
    patch,
    render,
    selection,
  });
}

export function nativeHandoffUpdate({
  command,
  kind,
  patch = [],
  selection,
}: {
  command: JsonContentEditableModelCommand;
  kind: "no-change" | "selection" | "text";
  patch?: ReadonlyArray<JSONPatchOperation>;
  selection: SelectionSnap | null;
}): JsonContentEditableUpdate {
  return {
    ok: true,
    command,
    flow: "native-handoff",
    kind,
    patch,
    render: true,
    selection,
  };
}

export function isLineBreakInput(event: InputEvent): boolean {
  return (
    event.inputType === "insertParagraph" ||
    event.inputType === "insertLineBreak"
  );
}

function clipboardEditTurn(
  type: "copy" | "cut" | "paste",
  event: ClipboardEvent,
): EditTurn {
  return {
    type,
    event,
    owner: "model",
    preventDefault: true,
    resetVerticalGoal: true,
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
    case "block-composing-history":
      return {
        type,
        owner: "native",
        preventDefault: true,
        resetVerticalGoal: false,
      };
    case "insert-line-break":
      return {
        type,
        owner: "model",
        preventDefault: true,
        resetVerticalGoal: true,
      };
    case "no-change":
      return {
        type,
        owner: "none",
        preventDefault: false,
        resetVerticalGoal: true,
      };
    case "suppress-beforeinput-composition-commit":
      return {
        type,
        owner: "native",
        preventDefault: true,
        resetVerticalGoal: true,
      };
    default:
      return {
        type,
        owner: "native",
        preventDefault: false,
        resetVerticalGoal: true,
      };
  }
}

function handoffCommandEditTurn(command: JsonContentEditableModelCommand): EditTurn {
  return {
    type: "handoff-command",
    command,
    owner: "handoff",
    preventDefault: true,
    resetVerticalGoal: false,
  };
}

function historyEditTurn(command: "redo" | "undo"): EditTurn {
  return {
    type: "history",
    command,
    owner: "model",
    preventDefault: true,
    resetVerticalGoal: true,
  };
}

function isLineBreakKey(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey
  );
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
    owner: "model",
    preventDefault: true,
    resetVerticalGoal: false,
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

function editFlowUpdate({
  flow,
  kind,
  patch,
  render,
  selection,
}: {
  flow: "native-text" | "model-command";
  kind: "no-change" | "selection" | "text";
  patch: ReadonlyArray<JSONPatchOperation>;
  render: boolean;
  selection: SelectionSnap | null;
}): JsonContentEditableUpdate {
  return {
    ok: true,
    flow,
    kind,
    patch,
    render,
    selection,
  };
}
