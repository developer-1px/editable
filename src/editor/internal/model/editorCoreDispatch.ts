import {
  createJSONDocument,
  type JSONDocument,
  type JSONPatchOperation,
} from "@interactive-os/json-document";
import type { CommandEvaluation } from "./editorCommandStrategies";
import type {
  EditorCapability,
  EditorResult,
  EditorViewAdapter,
} from "./editorCore";
import {
  commandDescriptorFor,
  type EditorCommand,
  type PatchCommandDescriptor,
} from "./editorCoreDescriptors";
import {
  defaultSelection,
  richSelectionFromSnap,
  selectionForCommand,
} from "./editorSelection";
import { type NoteDocument, NoteDocumentSchema } from "./noteDocument";

export function dispatchEditorCommand(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand | readonly EditorCommand[],
  view: EditorViewAdapter | undefined,
): EditorResult {
  return isCommandArray(command)
    ? dispatchBatch(document, command, view)
    : dispatchSingle(document, command, view);
}

export function dispatchEditorCommandToJSONDocument(
  document: JSONDocument<NoteDocument>,
  command: EditorCommand | readonly EditorCommand[],
  options: {
    view?: EditorViewAdapter;
  } = {},
): EditorResult {
  return dispatchEditorCommand(document, command, options.view);
}

export function canDispatchEditorCommand(
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
      snapshot: snapshotFromDocument(document),
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
      snapshot: snapshotFromDocument(document),
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
    snapshot: snapshotFromDocument(document),
  };
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

function snapshotFromDocument(document: JSONDocument<NoteDocument>) {
  return {
    document: document.value,
    selection: richSelectionFromSnap(document.value, document.selection),
    revision: 0,
  };
}

function isCommandArray(
  command: EditorCommand | readonly EditorCommand[],
): command is readonly EditorCommand[] {
  return Array.isArray(command);
}
