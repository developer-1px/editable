import { describe, expect, it } from "vitest";
import {
  type CursorPoint,
  cursorLength,
  moveCursor,
  selectedAtomPointersBetween,
} from "./cursor";
import { documentWithBlocks } from "./cursorTestUtils";

describe("cursor atom units", () => {
  it("keeps an inline atom as one cursor unit between marked text", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "bo", marks: [{ type: "bold" }] },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "ld", marks: [{ type: "bold" }] },
        ],
      },
    ]);

    expect(cursorLength(document)).toBe(7);
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/1", edge: "before" },
        "forward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(
      moveCursor(
        document,
        { path: "/root/children/0/children/1", edge: "after" },
        "backward",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });
  });

  it("reports atom pointers fully covered by a cursor range", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B" },
        ],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
      },
    ]);

    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/0/children/1", edge: "before" },
        { path: "/root/children/0/children/1", edge: "after" },
      ),
    ).toEqual(["/root/children/0/children/1"]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/1", edge: "before" },
        { path: "/root/children/1", edge: "after" },
      ),
    ).toEqual(["/root/children/1"]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/1", edge: "before" },
        { path: "/root/children/1", edge: "before" },
      ),
    ).toEqual([]);
  });

  it("does not report an atom pointer until both atom edges are covered", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
        ],
      },
    ]);

    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/1", edge: "before" },
      ),
    ).toEqual([]);
    expect(
      selectedAtomPointersBetween(
        document,
        { path: "/root/children/0/children/0/text", offset: 0 },
        { path: "/root/children/0/children/1", edge: "after" },
      ),
    ).toEqual(["/root/children/0/children/1"]);
  });

  it("treats an inline mention chip as one cursor unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          { type: "mention", id: "user-1", label: "Ada" },
          { type: "text", text: "B" },
        ],
      },
    ]);

    let cursor: CursorPoint = {
      path: "/root/children/0/children/0/text",
      offset: 1,
    };

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/0/children/2/text",
      offset: 0,
    });
  });

  it("treats a figure block as one cursor unit", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "A" }],
      },
      {
        id: "figure-1",
        type: "figure",
        src: "/image.png",
        alt: "Image",
      },
      {
        id: "block-2",
        type: "paragraph",
        children: [{ type: "text", text: "B" }],
      },
    ]);

    let cursor: CursorPoint = {
      path: "/root/children/0/children/0/text",
      offset: 1,
    };

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({ path: "/root/children/1", edge: "before" });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({ path: "/root/children/1", edge: "after" });

    cursor = moveCursor(document, cursor, "forward");
    expect(cursor).toMatchObject({
      path: "/root/children/2/children/0/text",
      offset: 0,
    });

    cursor = moveCursor(document, cursor, "backward");
    expect(cursor).toMatchObject({ path: "/root/children/1", edge: "after" });
  });
});
