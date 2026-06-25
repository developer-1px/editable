import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type {
  JsonContentEditableFlow,
  JsonContentEditableUpdate,
} from "../contract";

export type SelectionIntent = "text-commit" | "range-command";

export function nativeTextUpdate({
  kind,
  patch = [],
  selection,
}: {
  kind: "no-change" | "selection" | "text";
  patch?: ReadonlyArray<JSONPatchOperation>;
  selection: SelectionSnap | null;
}): JsonContentEditableUpdate {
  return editFlowUpdate({
    flow: "native-text",
    kind,
    patch,
    render: false,
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
  flow: JsonContentEditableFlow;
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
