import type {
  VisualLayout,
  VisualLayoutSnapshot,
  VisualLayoutStore,
} from "../contract";

export function createVisualLayoutStore(
  initial: VisualLayout | null = null,
): VisualLayoutStore {
  let revision = 0;
  let current: VisualLayoutSnapshot =
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
  layout: VisualLayout | null,
  revision: number,
): VisualLayoutSnapshot {
  return {
    ok: true,
    layout,
    revision,
  };
}

function staleSnapshot(
  layout: VisualLayout | null,
  revision: number,
  reason: string,
): VisualLayoutSnapshot {
  return {
    ok: false,
    code: "visual_layout_stale",
    layout,
    reason,
    revision,
  };
}
