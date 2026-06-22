import type {
  SelectionContext,
  SelectionSnap,
} from "@interactive-os/json-document";
import { normalizeLinkHref } from "./linkHref";
import { MARK_ORDER } from "./markOrder";
import type { Mark } from "./noteDocument";

const ACTIVE_MARKS_KEY = "activeMarks";
const PENDING_LINK_HREF_KEY = "pendingLinkHref";

export function activeMarksFromSelection(selection: SelectionSnap): Mark[] {
  const context = contextRecord(selection.context);
  const activeMarks = context?.[ACTIVE_MARKS_KEY];
  if (!Array.isArray(activeMarks)) {
    return [];
  }

  return normalizeActiveMarks(activeMarks);
}

export function selectionHasActiveTextMarks(selection: SelectionSnap): boolean {
  return activeMarksFromSelection(selection).length > 0;
}

export function pendingLinkHrefFromSelection(
  selection: SelectionSnap,
): string | null {
  const context = contextRecord(selection.context);
  const href = context?.[PENDING_LINK_HREF_KEY];

  return typeof href === "string" && href.length > 0 ? href : null;
}

export function contextWithActiveMarks(
  context: SelectionContext | undefined,
  marks: Mark[],
): SelectionContext | undefined {
  const record = contextRecord(context) ?? {};
  if (marks.length === 0) {
    const { [ACTIVE_MARKS_KEY]: _activeMarks, ...rest } = record;
    return Object.keys(rest).length === 0
      ? undefined
      : (rest as SelectionContext);
  }

  return { ...record, [ACTIVE_MARKS_KEY]: marks } as SelectionContext;
}

function contextRecord(
  context: SelectionContext | undefined,
): Record<string, unknown> | null {
  return typeof context === "object" &&
    context !== null &&
    !Array.isArray(context)
    ? { ...context }
    : null;
}

function normalizeActiveMarks(marks: unknown[]): Mark[] {
  const byType = new Map<Mark["type"], Mark>();
  for (const mark of marks) {
    const normalizedMark = normalizeActiveMark(mark);
    if (normalizedMark === null) {
      continue;
    }
    byType.set(normalizedMark.type, normalizedMark);
  }

  return Array.from(byType.values()).sort(
    (left, right) => MARK_ORDER[left.type] - MARK_ORDER[right.type],
  );
}

function normalizeActiveMark(mark: unknown): Mark | null {
  if (typeof mark !== "object" || mark === null || !("type" in mark)) {
    return null;
  }

  if (mark.type === "bold" || mark.type === "italic" || mark.type === "code") {
    return { type: mark.type };
  }

  if (mark.type !== "link" || !("href" in mark)) {
    return null;
  }

  const href =
    typeof mark.href === "string" ? normalizeLinkHref(mark.href) : null;
  if (href === null) {
    return null;
  }

  if (!("title" in mark) || mark.title === undefined) {
    return { type: "link", href };
  }

  return typeof mark.title === "string"
    ? { type: "link", href, title: mark.title }
    : null;
}
