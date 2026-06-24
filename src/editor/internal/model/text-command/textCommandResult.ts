import type {
  JSONPatchOperation,
  SelectionSnap,
} from "@interactive-os/json-document";

export type TextCommandResult =
  | {
      ok: true;
      patch: JSONPatchOperation[];
      selectionAfter: SelectionSnap;
    }
  | {
      ok: false;
      reason: string;
    };
