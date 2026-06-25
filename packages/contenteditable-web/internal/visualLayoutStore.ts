import type {
  JsonContentEditableVisualLayout,
  JsonContentEditableVisualLayoutStore,
} from "../contract";

export function createVisualLayoutStore(
  initial: JsonContentEditableVisualLayout | null = null,
): JsonContentEditableVisualLayoutStore {
  let current = initial;
  return {
    read() {
      return current;
    },
    reset() {
      current = null;
    },
    write(layout) {
      current = layout;
    },
  };
}
