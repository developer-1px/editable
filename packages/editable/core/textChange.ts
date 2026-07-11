export type TextChange = {
  from: number;
  to: number;
  insert: string;
};

export type TextRange = {
  from: number;
  to: number;
};

export function diffText(before: string, after: string): TextChange | null {
  if (before === after) {
    return null;
  }

  let from = 0;
  const shared = Math.min(before.length, after.length);
  while (from < shared && before.charCodeAt(from) === after.charCodeAt(from)) {
    from += 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > from &&
    afterEnd > from &&
    before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    from,
    to: beforeEnd,
    insert: after.slice(from, afterEnd),
  };
}

export function diffTextNearRange(
  before: string,
  after: string,
  preferred: TextRange,
): TextChange | null {
  if (before === after) {
    return null;
  }

  let from = 0;
  const prefixLimit = Math.min(
    before.length,
    after.length,
    Math.max(preferred.to, 0),
  );
  while (
    from < prefixLimit &&
    before.charCodeAt(from) === after.charCodeAt(from)
  ) {
    from += 1;
  }

  let beforeEnd = before.length;
  let afterEnd = after.length;
  while (
    beforeEnd > from &&
    afterEnd > from &&
    before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)
  ) {
    beforeEnd -= 1;
    afterEnd -= 1;
  }

  return {
    from,
    to: beforeEnd,
    insert: after.slice(from, afterEnd),
  };
}

export function applyTextChange(value: string, change: TextChange): string {
  return value.slice(0, change.from) + change.insert + value.slice(change.to);
}

export function textChangeDelta(change: TextChange): number {
  return change.insert.length - (change.to - change.from);
}

export function accumulateNativeCompositionRange(
  range: TextRange,
  change: TextChange,
  nextLength: number,
): TextRange {
  const mappedFrom = mapCompositionBoundary(range.from, change, "start");
  const mappedTo = mapCompositionBoundary(range.to, change, "end");
  return clampTextRange(
    {
      from: Math.min(mappedFrom, change.from),
      to: Math.max(mappedTo, change.from + change.insert.length),
    },
    nextLength,
  );
}

export function clampTextRange(range: TextRange, length: number): TextRange {
  const from = clamp(range.from, 0, length);
  const to = clamp(range.to, from, length);
  return { from, to };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function mapCompositionBoundary(
  point: number,
  change: TextChange,
  affinity: "start" | "end",
): number {
  if (point < change.from) {
    return point;
  }
  if (point > change.to) {
    return point + textChangeDelta(change);
  }
  if (change.from === change.to) {
    return affinity === "start" ? point + change.insert.length : point;
  }
  return affinity === "start"
    ? change.from
    : change.from + change.insert.length;
}
