import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";
import type {
  InternalSelectionIntent,
  InternalEditableUpdate,
} from "../contract";

export type SelectionIntent =
  | "composition-commit"
  | "range-command"
  | "text-commit";

export function domToModelUpdate({
  command,
  kind,
  patch = [],
  render = false,
  selection,
}: {
  command?: InternalSelectionIntent;
  kind: "no-change" | "selection" | "text";
  patch?: ReadonlyArray<JSONPatchOperation>;
  render?: boolean;
  selection: SelectionSnap | null;
}): InternalEditableUpdate {
  const update = {
    ok: true,
    flow: "dom-to-model",
    kind,
    patch,
    render,
    selection,
  } as const;
  return command === undefined ? update : { ...update, command };
}

export function modelToDomUpdate({
  kind,
  patch = [],
  render,
  selection,
}: {
  kind: "no-change" | "selection" | "text";
  patch?: ReadonlyArray<JSONPatchOperation>;
  render: boolean;
  selection: SelectionSnap | null;
}): InternalEditableUpdate {
  return {
    ok: true,
    flow: "model-to-dom",
    kind,
    patch,
    render,
    selection,
  };
}
