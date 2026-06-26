import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type {
  JsonContentEditableModelCommand,
  JsonContentEditableUpdate,
} from "../contract";

export type SelectionIntent =
  | "composition-commit"
  | "range-command"
  | "text-commit";

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
