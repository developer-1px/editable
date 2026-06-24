export type TextBoundaryAffinity = "backward" | "forward" | "nearest";

export function textBoundaryOffsets(text: string): number[] {
  if (text.length === 0) {
    return [0];
  }

  const offsets = [0];
  let offset = 0;
  for (const segment of segmentText(text)) {
    offset += segment.length;
    offsets.push(offset);
  }

  if (offsets.at(-1) !== text.length) {
    offsets.push(text.length);
  }

  return offsets;
}

export function textBoundaryOffsetsInRange(
  text: string,
  startOffset: number,
  endOffset: number,
): number[] {
  const start = snapTextOffset(text, startOffset, "forward");
  const end = snapTextOffset(text, endOffset, "backward");
  if (start >= end) {
    return [start];
  }

  const offsets = textBoundaryOffsets(text).filter(
    (offset) => offset >= start && offset <= end,
  );
  if (offsets[0] !== start) {
    offsets.unshift(start);
  }
  if (offsets.at(-1) !== end) {
    offsets.push(end);
  }

  return offsets;
}

export function snapTextOffset(
  text: string,
  offset: number,
  affinity: TextBoundaryAffinity = "nearest",
): number {
  const offsets = textBoundaryOffsets(text);

  return offsets[textBoundaryIndex(offsets, offset, affinity)] ?? 0;
}

export function textBoundaryIndex(
  offsets: readonly number[],
  offset: number,
  affinity: TextBoundaryAffinity = "nearest",
): number {
  if (offsets.length === 0) {
    return 0;
  }

  const clamped = clampOffset(offset, offsets.at(-1) ?? 0);
  for (const [index, boundary] of offsets.entries()) {
    if (clamped === boundary) {
      return index;
    }
    if (clamped < boundary) {
      const previousIndex = Math.max(0, index - 1);
      if (affinity === "forward") {
        return index;
      }
      if (affinity === "backward") {
        return previousIndex;
      }

      const previous = offsets[previousIndex] ?? 0;
      return clamped - previous < boundary - clamped ? previousIndex : index;
    }
  }

  return offsets.length - 1;
}

export function nextTextBoundaryOffset(text: string, offset: number): number {
  const offsets = textBoundaryOffsets(text);
  const index = textBoundaryIndex(offsets, offset, "backward");

  return offsets[Math.min(index + 1, offsets.length - 1)] ?? 0;
}

export function previousTextBoundaryOffset(
  text: string,
  offset: number,
): number {
  const offsets = textBoundaryOffsets(text);
  const index = textBoundaryIndex(offsets, offset, "forward");

  return offsets[Math.max(index - 1, 0)] ?? 0;
}

function segmentText(text: string): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: "grapheme",
    });

    return Array.from(segmenter.segment(text), (segment) => segment.segment);
  }

  return Array.from(text);
}

function clampOffset(offset: number, length: number): number {
  if (!Number.isFinite(offset)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(offset), 0), length);
}
