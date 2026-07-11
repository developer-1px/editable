// @ts-expect-error jsdom does not bundle declarations in this fixture dependency.
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { createEditableDocument, mountJsonEditable } from "./index";

describe("owner-document DOM realm", () => {
  it("mounts without global browser constructors", () => {
    expect(globalThis.Text).toBeUndefined();
    expect(globalThis.HTMLElement).toBeUndefined();
    const dom = new JSDOM("<!doctype html><div id='editor'></div>");
    const root = dom.window.document.querySelector("#editor") as HTMLElement | null;
    if (root === null) {
      throw new Error("Expected the editor host.");
    }

    const editor = mountJsonEditable({
      root,
      document: createEditableDocument(),
    });

    expect(root.querySelectorAll("[data-editable-block]")).toHaveLength(4);
    editor.destroy();
    expect(root.hasAttribute("contenteditable")).toBe(false);
    dom.window.close();
  });
});
