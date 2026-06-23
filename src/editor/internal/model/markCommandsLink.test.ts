import { describe, expect, it } from "vitest";
import { selectionFromCursorRange } from "./cursorCommands";
import { toggleLink } from "./markCommands";
import { documentWithBlocks, expectOk } from "./markCommandTestUtils";

describe("mark commands for links", () => {
  it("toggles links over selected text with deterministic href policy", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: "https://openai.com" },
    );

    const command = toggleLink(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          {
            type: "text",
            text: "BC",
            marks: [{ type: "link", href: "https://openai.com" }],
          },
          { type: "text", text: "D" },
        ],
      },
    ]);

    const linkedDocument = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [
          { type: "text", text: "A" },
          {
            type: "text",
            text: "BC",
            marks: [{ type: "link", href: "https://openai.com" }],
          },
          { type: "text", text: "D" },
        ],
      },
    ]);
    const remove = toggleLink(
      linkedDocument,
      selectionFromCursorRange(
        linkedDocument,
        { path: "/root/children/0/children/1/text", offset: 0 },
        { path: "/root/children/0/children/1/text", offset: 2 },
      ),
    );

    expectOk(remove);
    expect(remove.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [{ type: "text", text: "ABCD" }],
      },
    ]);
  });

  it("normalizes pending hrefs before writing link marks", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: " https://openai.com/docs " },
    );

    const command = toggleLink(document, selection);

    expectOk(command);
    expect(command.patch).toMatchObject([
      {
        op: "replace",
        path: "/root/children/0/children",
        value: [
          { type: "text", text: "A" },
          {
            type: "text",
            text: "BC",
            marks: [{ type: "link", href: "https://openai.com/docs" }],
          },
          { type: "text", text: "D" },
        ],
      },
    ]);
  });

  it("rejects unsafe pending hrefs before writing link marks", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);
    const selection = selectionFromCursorRange(
      document,
      { path: "/root/children/0/children/0/text", offset: 1 },
      { path: "/root/children/0/children/0/text", offset: 3 },
      { pendingLinkHref: " javascript:alert(1)" },
    );

    expect(toggleLink(document, selection)).toEqual({
      ok: false,
      reason: "Link href is invalid.",
    });
  });

  it("requires a pending href before adding link marks", () => {
    const document = documentWithBlocks([
      {
        id: "block-1",
        type: "paragraph",
        children: [{ type: "text", text: "ABCD" }],
      },
    ]);

    const command = toggleLink(
      document,
      selectionFromCursorRange(
        document,
        { path: "/root/children/0/children/0/text", offset: 1 },
        { path: "/root/children/0/children/0/text", offset: 3 },
      ),
    );

    expect(command).toEqual({
      ok: false,
      reason: "Link href is required.",
    });
  });
});
