// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { contentEditableBeforeInputFromEvent } from "./contentEditableViewEngine";
import {
  beforeInputTransferEvent,
  EDITABLE_CLIPBOARD_MIME,
  installContentEditableViewTestCleanup,
} from "./contentEditableViewEngineTestUtils";

installContentEditableViewTestCleanup();

describe("contenteditable beforeinput transfer parsing", () => {
  it("reads structured transfer text from paste and drop beforeinput events", () => {
    const structured = JSON.stringify({
      schema: "editable-clipboard@1",
      plainText: "structured",
    });

    expect(
      contentEditableBeforeInputFromEvent(
        beforeInputTransferEvent("insertFromPaste", {
          [EDITABLE_CLIPBOARD_MIME]: structured,
        }),
      ),
    ).toMatchObject({ data: "structured", format: "plain" });
    expect(
      contentEditableBeforeInputFromEvent(
        beforeInputTransferEvent("insertFromDrop", {
          "text/markdown": "**markdown**",
        }),
      ),
    ).toMatchObject({ data: "**markdown**", format: "markdown" });
  });
});
