import type {
  InternalVisualLayout,
  InternalVisualLayoutSnapshot,
  InternalVisualLayoutStore,
} from "../contract";

export function createVisualLayoutStore(
  initial: InternalVisualLayout | null = null,
): InternalVisualLayoutStore {
  let revision = 0;
  let current: InternalVisualLayoutSnapshot =
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
  layout: InternalVisualLayout | null,
  revision: number,
): InternalVisualLayoutSnapshot {
  return {
    ok: true,
    layout,
    revision,
  };
}

function staleSnapshot(
  layout: InternalVisualLayout | null,
  revision: number,
  reason: string,
): InternalVisualLayoutSnapshot {
  return {
    ok: false,
    code: "visual_layout_stale",
    layout,
    reason,
    revision,
  };
}
