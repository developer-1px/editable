import { describe, expect, it } from "vitest";
import {
  unicodeFixtureClusterEnd,
  unicodeFixtureClusterStart,
  unicodeFixtureText,
  unicodeGraphemeCorpus,
} from "../fixtures/unicodeGraphemeCorpus";
import {
  type CursorPoint,
  cursorLength,
  firstCursorPoint,
  lastCursorPoint,
  moveCursor,
  normalizeCursorPoint,
  resolveCursorIndex,
} from "./cursor";
import { documentWithBlocks } from "./cursorTestUtils";

describe("cursor grapheme text units", () => {
  it("moves through marked text by visible characters", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
      },
    ]);

    let cursor: CursorPoint = firstCursorPoint(document);

    expect(cursor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });

    expect(cursorLength(document)).toBe(4);
    expect(resolveCursorIndex(document, lastCursorPoint(document))).toBe(4);
  });

  it("moves through emoji as a single grapheme boundary", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A😀B" }],
      },
    ]);

    expect(cursorLength(document)).toBe(3);
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/0/text", offset: 3 },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    expect(
      normalizeCursorPoint(document, {
        path: "/root/children/0/children/0/text",
        offset: 2,
      }),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
  });

  it("moves through the Unicode grapheme corpus as single cursor units", () => {
    for (const fixture of unicodeGraphemeCorpus) {
      const document = documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: unicodeFixtureText(fixture) }],
        },
      ]);
      const start = unicodeFixtureClusterStart();
      const end = unicodeFixtureClusterEnd(fixture);

      expect(cursorLength(document), fixture.id).toBe(3);
      expect(
        moveCursor(
          document,
          { path: "/root/children/0/children/0/text", offset: start },
          "forward",
        ),
        fixture.id,
      ).toMatchObject({
        path: "/root/children/0/children/0/text",
        offset: end,
      });
      expect(
        moveCursor(
          document,
          { path: "/root/children/0/children/0/text", offset: end },
          "backward",
        ),
        fixture.id,
      ).toMatchObject({
        path: "/root/children/0/children/0/text",
        offset: start,
      });

      for (let offset = start + 1; offset < end; offset += 1) {
        const normalized = normalizeCursorPoint(document, {
          path: "/root/children/0/children/0/text",
          offset,
        });
        expect([start, end], fixture.id).toContain(normalized.offset);
        expect(
          normalizeCursorPoint(document, {
            path: "/root/children/0/children/0/text",
            offset,
            affinity: "backward",
          }),
          fixture.id,
        ).toMatchObject({
          path: "/root/children/0/children/0/text",
          offset: start,
        });
        expect(
          normalizeCursorPoint(document, {
            path: "/root/children/0/children/0/text",
            offset,
            affinity: "forward",
          }),
          fixture.id,
        ).toMatchObject({
          path: "/root/children/0/children/0/text",
          offset: end,
        });
      }
    }
  });
});
