export type UnicodeGraphemeFixture = {
  id: string;
  grapheme: string;
  note: string;
};

export const unicodeGraphemeCorpus = [
  {
    id: "variation-selector-heart",
    grapheme: "\u2764\uFE0F",
    note: "BMP code point plus emoji variation selector",
  },
  {
    id: "keycap",
    grapheme: "#\uFE0F\u20E3",
    note: "base key plus variation selector plus combining keycap",
  },
  {
    id: "zwj-family",
    grapheme: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}",
    note: "emoji ZWJ sequence",
  },
  {
    id: "multiple-combining-marks",
    grapheme: "a\u0301\u0327",
    note: "Latin base plus multiple combining marks",
  },
  {
    id: "hangul-jamo",
    grapheme: "\u1112\u1161\u11AB",
    note: "committed Hangul jamo sequence",
  },
] as const satisfies readonly UnicodeGraphemeFixture[];

export function unicodeFixtureText(fixture: UnicodeGraphemeFixture) {
  return `A${fixture.grapheme}B`;
}

export function unicodeFixtureClusterStart() {
  return 1;
}

export function unicodeFixtureClusterEnd(fixture: UnicodeGraphemeFixture) {
  return unicodeFixtureClusterStart() + fixture.grapheme.length;
}
