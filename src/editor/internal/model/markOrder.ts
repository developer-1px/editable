import type { Mark } from "./noteDocument";

export const MARK_ORDER: Record<Mark["type"], number> = {
  bold: 0,
  italic: 1,
  code: 2,
  link: 3,
};

export function markKey(mark: Mark): string {
  return JSON.stringify(mark);
}
