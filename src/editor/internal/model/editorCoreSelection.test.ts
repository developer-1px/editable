import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { createEditor } from "./editorCore";
import { documentWithText } from "./editorCoreTestUtils";
import { selectionForCommand } from "./editorSelection";
import { NoteDocumentSchema } from "./noteDocument";

describe("editor core selection state", () => {
  it("restores a default rich selection when no initial selection is provided", () => {
    const editor = createEditor({ initial: documentWithText("AB") });

    expect(editor.query({ type: "selection" })).toMatchObject({
      type: "caret",
      point: { path: "/root/children/0", edge: "before" },
    });
  });

  it("normalizes invalid low-level selection snapshots before commands", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithText("AB"),
      { history: 10, selection: true, trustedInitial: true },
    );
    document.selection?.restore({
      selectedPointers: ["/root/children/999"],
      selectionRanges: [],
      primaryIndex: 0,
      anchor: null,
      focus: null,
    });

    expect(selectionForCommand(document)).toMatchObject({
      selectedPointers: [],
      selectionRanges: [
        {
          anchor: {
            path: "/root/children/0",
            edge: "before",
          },
          focus: {
            path: "/root/children/0",
            edge: "before",
          },
        },
      ],
    });
  });

  it("stores active marks as selection state and exposes them through query", () => {
    const editor = createEditor({
      initial: documentWithText("A"),
      selection: {
        type: "caret",
        point: { path: "/root/children/0/children/0/text", offset: 1 },
      },
    });

    const result = editor.dispatch({ type: "toggleMark", mark: "bold" });

    expect(result.ok).toBe(true);
    expect(editor.query({ type: "activeMarks" })).toEqual([{ type: "bold" }]);
  });
});
