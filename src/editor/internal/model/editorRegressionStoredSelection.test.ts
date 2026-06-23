import { createJSONDocument } from "@interactive-os/json-document";
import { describe, expect, it } from "vitest";
import { selectionFromCursorPoint } from "./cursorCommands";
import { documentWithBlocks, expectOk } from "./editorRegressionTestUtils";
import { NoteDocumentSchema } from "./noteDocument";
import { deleteBackward, splitParagraph } from "./textCommands";

describe("editor stored selection regressions", () => {
  it("splits and merges paragraphs with stored selections", () => {
    const document = createJSONDocument(
      NoteDocumentSchema,
      documentWithBlocks([
        {
          id: "block-1",
          type: "paragraph",
          children: [{ type: "text", text: "AB" }],
        },
      ]),
      { history: 10, selection: true, trustedInitial: true },
    );
    const selection = selectionFromCursorPoint({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
    document.selection?.restore(selection);

    const split = splitParagraph(document.value, selection);
    expectOk(split);
    document.commit(split.patch, { selectionAfter: split.selectionAfter });

    const merge = deleteBackward(document.value, split.selectionAfter);
    expectOk(merge);
    document.commit(merge.patch, { selectionAfter: merge.selectionAfter });

    expect(document.value.root.children).toMatchObject([
      {
        type: "paragraph",
        children: [{ type: "text", text: "AB" }],
      },
    ]);
    expect(document.selection?.focus).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });
});
