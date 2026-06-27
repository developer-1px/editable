import type {
  JsonContentEditableVisualLayout,
  JsonContentEditableVisualLayoutSnapshot,
  JsonContentEditableVisualLayoutStore,
} from "../contract";

export function createVisualLayoutStore(
  initial: JsonContentEditableVisualLayout | null = null,
): JsonContentEditableVisualLayoutStore {
  let revision = 0;
  let current: JsonContentEditableVisualLayoutSnapshot =
    initial === null
      ? staleSnapshot(null, revision, "Visual layout has not been measured.")
      : freshSnapshot(initial, revision);
  return {
    read() {
      return current;
    },
    invalidate(reason = "Visual layout is stale.") {
      current = staleSnapshot(current.layout, revision, reason);
    },
    reset() {
      revision += 1;
      current = staleSnapshot(null, revision, "Visual layout has been reset.");
    },
    write(layout) {
      revision += 1;
      current = freshSnapshot(layout, revision);
    },
  };
}

function freshSnapshot(
  layout: JsonContentEditableVisualLayout | null,
  revision: number,
): JsonContentEditableVisualLayoutSnapshot {
  return {
    ok: true,
    layout,
    revision,
  };
}

function staleSnapshot(
  layout: JsonContentEditableVisualLayout | null,
  revision: number,
  reason: string,
): JsonContentEditableVisualLayoutSnapshot {
  return {
    ok: false,
    code: "visual_layout_stale",
    layout,
    reason,
    revision,
  };
}
