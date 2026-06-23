export function normalizeCompositionCommitText(
  text: string,
  offset: number,
  compositionStartText: string | null,
  compositionStartOffset: number | null,
  lastComposedText: string | null,
  finalCommitText: string | null,
): { text: string; offset: number } {
  if (
    lastComposedText === null ||
    finalCommitText === null ||
    finalCommitText.length === 0
  ) {
    return { text, offset };
  }

  if (
    compositionStartText !== null &&
    lastComposedText !== compositionStartText
  ) {
    return replaceComposedTextWithFinalCommit(
      compositionStartText,
      compositionStartOffset,
      lastComposedText,
      finalCommitText,
    );
  }

  if (
    text === lastComposedText ||
    (compositionStartText !== null && lastComposedText === compositionStartText)
  ) {
    return { text, offset };
  }

  const duplicateCommitIndexes: number[] = [];
  for (
    let index = 0;
    index <= text.length - finalCommitText.length;
    index += 1
  ) {
    if (text.slice(index, index + finalCommitText.length) !== finalCommitText) {
      continue;
    }

    const withoutCommit =
      text.slice(0, index) + text.slice(index + finalCommitText.length);
    if (withoutCommit !== lastComposedText) {
      continue;
    }

    duplicateCommitIndexes.push(index);
  }

  const duplicateCommitIndex =
    duplicateCommitIndexes.find(
      (index) =>
        compositionStartOffset === null || index >= compositionStartOffset,
    ) ?? duplicateCommitIndexes[0];
  if (duplicateCommitIndex !== undefined) {
    return {
      text: lastComposedText,
      offset:
        offset > duplicateCommitIndex
          ? Math.max(duplicateCommitIndex, offset - finalCommitText.length)
          : offset,
    };
  }

  return { text, offset };
}

function replaceComposedTextWithFinalCommit(
  compositionStartText: string,
  compositionStartOffset: number | null,
  lastComposedText: string,
  finalCommitText: string,
): { text: string; offset: number } {
  const anchoredRange = changedRangeAroundCompositionStart(
    compositionStartText,
    lastComposedText,
    compositionStartOffset,
  );
  if (anchoredRange !== null) {
    return {
      text:
        compositionStartText.slice(0, anchoredRange.start) +
        finalCommitText +
        compositionStartText.slice(anchoredRange.end),
      offset: anchoredRange.start + finalCommitText.length,
    };
  }

  const prefixLength = commonPrefixLength(
    compositionStartText,
    lastComposedText,
  );
  const suffixLength = commonSuffixLength(
    compositionStartText,
    lastComposedText,
    prefixLength,
  );

  if (
    prefixLength === compositionStartText.length &&
    prefixLength === lastComposedText.length
  ) {
    const insertAt = clamp(
      compositionStartOffset ?? compositionStartText.length,
      0,
      compositionStartText.length,
    );

    return {
      text:
        compositionStartText.slice(0, insertAt) +
        finalCommitText +
        compositionStartText.slice(insertAt),
      offset: insertAt + finalCommitText.length,
    };
  }

  const suffixStart = compositionStartText.length - suffixLength;

  return {
    text:
      compositionStartText.slice(0, prefixLength) +
      finalCommitText +
      compositionStartText.slice(suffixStart),
    offset: prefixLength + finalCommitText.length,
  };
}

function changedRangeAroundCompositionStart(
  before: string,
  after: string,
  compositionStartOffset: number | null,
): { start: number; end: number } | null {
  if (compositionStartOffset === null) {
    return null;
  }

  const anchor = clamp(compositionStartOffset, 0, before.length);
  let best: { start: number; end: number; score: number } | null = null;

  for (let start = 0; start <= before.length; start += 1) {
    for (let end = start; end <= before.length; end += 1) {
      if (anchor < start || anchor > end) {
        continue;
      }

      const prefix = before.slice(0, start);
      const suffix = before.slice(end);
      if (
        prefix.length + suffix.length > after.length ||
        !after.startsWith(prefix) ||
        !after.endsWith(suffix)
      ) {
        continue;
      }

      const score =
        Math.abs(start - anchor) * 2 +
        Math.abs(end - anchor) * 2 +
        (end - start);
      if (best === null || score < best.score) {
        best = { start, end, score };
      }
    }
  }

  return best === null ? null : { start: best.start, end: best.end };
}

function commonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function commonSuffixLength(
  left: string,
  right: string,
  prefixLength: number,
): number {
  let length = 0;
  const maxLength = Math.min(left.length, right.length) - prefixLength;
  while (
    length < maxLength &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }

  return length;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}
