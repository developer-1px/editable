import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import { selectionSnapshotPoint } from "./blockEditorSelection";

describe("block editor selection", () => {
  it("preserves cursor affinity for wrapped line-boundary rendering", () => {
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "backward",
    });

    expect(selectionSnapshotPoint(selection)).toEqual({
      path: "/root/children/0/children/0/text",
      offset: 2,
      affinity: "backward",
    });
  });
});
