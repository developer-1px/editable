import { describe, expect, it } from "vitest";
import { EDITABLE_CLIPBOARD_MIME } from "./clipboard";
import { transferData } from "./clipboardTestUtils";
import {
  readClipboardTextFromTransfer,
  readTextFromTransfer,
} from "./clipboardTransfer";

describe("clipboard transfer reader", () => {
  it("keeps non-text structured metadata out of the paste contract", () => {
    const transfer = transferData({
      [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
        schema: "editable-clipboard@1",
        plainText: "plain fallback",
        markdown: "@[Ada](mention:user-ada)",
        selectedPointers: ["/root/children/0/children/0"],
        nodes: [
          {
            id: "figure-1",
            type: "figure",
            src: "/restored-only-from-node-graph.png",
          },
        ],
      }),
    });

    expect(readClipboardTextFromTransfer(transfer)).toEqual({
      text: "@[Ada](mention:user-ada)",
      format: "markdown",
    });
  });

  it("does not treat HTML data-pm-slice context as current paste input", () => {
    const htmlOnly = transferData({
      "text/html": '<ul data-pm-slice="1 1 []"><li><p>Nested</p></li></ul>',
    });
    const htmlWithPlainFallback = transferData({
      "text/html":
        '<table data-pm-slice="0 0 []"><tr><td>Cell</td></tr></table>',
      "text/plain": "Cell",
    });

    expect(readClipboardTextFromTransfer(htmlOnly)).toBe(null);
    expect(readClipboardTextFromTransfer(htmlWithPlainFallback)).toEqual({
      text: "Cell",
      format: "plain",
    });
  });

  it("reads uri-list fallback data as plain text without importing HTML", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          "text/html": '<a href="https://example.com">Example</a>',
          "text/uri-list":
            "# copied from Safari share\nhttps://example.com/\r\n\nhttps://example.com/next",
        }),
      ),
    ).toEqual({
      text: "https://example.com/\nhttps://example.com/next",
      format: "plain",
    });
  });

  it("ignores empty or comment-only uri-list data", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          "text/html": '<a href="https://example.com">Example</a>',
          "text/uri-list": "# only a comment\n\n",
        }),
      ),
    ).toBe(null);
  });

  it("reads structured plain transfer text before external fallback data", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "structured",
          }),
          "text/plain": "plain",
          "text/markdown": "**markdown**",
        }),
      ),
    ).toEqual({ text: "structured", format: "plain" });
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "structured",
          }),
          "text/plain": "plain",
          "text/markdown": "**markdown**",
        }),
      ),
    ).toBe("structured");
    expect(readTextFromTransfer(transferData({ "text/plain": "plain" }))).toBe(
      "plain",
    );
    expect(
      readTextFromTransfer(transferData({ "text/markdown": "**markdown**" })),
    ).toBe("**markdown**");
  });

  it("reads editor-owned markdown transfer text as markdown format", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "@Ada",
            markdown: "@[Ada](mention:user-ada)",
          }),
        }),
      ),
    ).toEqual({
      text: "@[Ada](mention:user-ada)",
      format: "markdown",
    });
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "@Ada",
            markdown: "@[Ada](mention:user-ada)",
          }),
        }),
      ),
    ).toBe("@[Ada](mention:user-ada)");
  });

  it("uses structured markdown when structured plain text is empty", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "",
            markdown: "![](/image.png)",
          }),
          "text/markdown": "fallback",
        }),
      ),
    ).toEqual({
      text: "![](/image.png)",
      format: "markdown",
    });
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "",
            markdown: "![](/image.png)",
          }),
          "text/markdown": "![](/image.png)",
        }),
      ),
    ).toBe("![](/image.png)");
  });

  it("falls back when structured transfer text is empty", () => {
    expect(
      readClipboardTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "editable-clipboard@1",
            plainText: "",
            markdown: "",
          }),
          "text/markdown": "![](/image.png)",
        }),
      ),
    ).toEqual({
      text: "![](/image.png)",
      format: "markdown",
    });
  });

  it("falls back to plain text for unsupported structured transfer data", () => {
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: "{not json",
          "text/plain": "plain",
        }),
      ),
    ).toBe("plain");
    expect(
      readTextFromTransfer(
        transferData({
          [EDITABLE_CLIPBOARD_MIME]: JSON.stringify({
            schema: "unknown-clipboard@1",
            plainText: "structured",
          }),
          "text/plain": "plain",
        }),
      ),
    ).toBe("plain");
  });
});
