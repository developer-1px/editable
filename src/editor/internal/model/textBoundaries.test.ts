import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../fixtures/unicodeGraphemeCorpus";
import { snapTextOffset, textBoundaryOffsets } from "./textBoundaries";

describe("text boundaries", () => {
  it("segments the Unicode grapheme corpus as user-visible units", () => {
    for (const fixture of unicodeGraphemeCorpus) {
      const text = unicodeFixtureText(fixture);
      const start = unicodeFixtureClusterStart();
      const end = unicodeFixtureClusterEnd(fixture);

      expect(textBoundaryOffsets(text), fixture.id).toEqual([
        0,
        start,
        end,
        text.length,
      ]);

      for (let offset = start + 1; offset < end; offset += 1) {
        expect(snapTextOffset(text, offset, "backward"), fixture.id).toBe(
          start,
        );
        expect(snapTextOffset(text, offset, "forward"), fixture.id).toBe(end);
      }
    }
  });

  it("falls back to code point boundaries when Intl.Segmenter is unavailable", () => {
    const segmenterDescriptor = Object.getOwnPropertyDescriptor(
      Intl,
      "Segmenter",
    );
    Object.defineProperty(Intl, "Segmenter", {
      configurable: true,
      value: undefined,
    });

    try {
      const fixture = unicodeGraphemeCorpus.find(
        (candidate) => candidate.id === "zwj-family",
      );
      if (fixture === undefined) {
        throw new Error("Unicode grapheme corpus is missing zwj-family.");
      }

      const text = unicodeFixtureText(fixture);
      const expected = [0];
      let offset = 0;
      for (const codePoint of Array.from(text)) {
        offset += codePoint.length;
        expected.push(offset);
      }

      expect(textBoundaryOffsets(text)).toEqual(expected);
    } finally {
      if (segmenterDescriptor === undefined) {
        Reflect.deleteProperty(Intl, "Segmenter");
      } else {
        Object.defineProperty(Intl, "Segmenter", segmenterDescriptor);
      }
    }
  });
});
