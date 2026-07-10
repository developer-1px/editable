// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import type { EditableDocumentValue } from "../core";
import {
  inspectNativeTextMutations,
  type NativeTextMutationInspectionOptions,
} from "./nativeTextMutation";

const value: EditableDocumentValue = {
  schema: "interactive-os.editable-document@2",
  id: "native-text-mutation-test",
  blocks: [{ id: "alpha", type: "paragraph", text: "first" }],
};

describe("native text mutation inspection", () => {
  it("accepts evidenced text from the expected owned surface", () => {
    const fixture = createFixture();
    const records = observeMutation(fixture.root, () => {
      fixture.text.data = "fiXrst";
    });

    const result = inspect(records, fixture.root);

    expect(result.rejected).toBe(false);
    expect([...result.dirtyBlockIds]).toEqual(["alpha"]);
    expect([...result.rejectedBlockIds]).toEqual([]);
    expect(result.patch).toEqual([
      { op: "replace", path: "/blocks/0/text", value: "fiXrst" },
    ]);
    expect(result.textChanges.get("alpha")).toEqual({
      from: 2,
      to: 2,
      insert: "X",
    });
  });

  it("rejects foreign structure inside an owned text surface", () => {
    const fixture = createFixture();
    const records = observeMutation(fixture.root, () => {
      const foreign = window.document.createElement("strong");
      foreign.textContent = "foreign";
      fixture.surface.append(foreign);
    });

    const result = inspect(records, fixture.root);

    expect(result.rejected).toBe(true);
    expect([...result.dirtyBlockIds]).toEqual(["alpha"]);
    expect([...result.rejectedBlockIds]).toEqual(["alpha"]);
    expect(result.patch).toEqual([]);
    expect(result.textChanges.size).toBe(0);
  });

  it("converts the browser's bare empty block into an empty text patch", () => {
    const fixture = createFixture();
    const records = observeMutation(fixture.root, () => {
      fixture.block.replaceChildren(window.document.createElement("br"));
    });

    const result = inspect(records, fixture.root);

    expect(result.rejected).toBe(false);
    expect([...result.dirtyBlockIds]).toEqual(["alpha"]);
    expect(result.patch).toEqual([
      { op: "replace", path: "/blocks/0/text", value: "" },
    ]);
    expect(result.textChanges.get("alpha")).toEqual({
      from: 0,
      to: 5,
      insert: "",
    });
  });
});

function inspect(records: MutationRecord[], root: HTMLElement) {
  const options: NativeTextMutationInspectionOptions = {
    root,
    value,
    records,
    nativeEvidence: true,
    phase: "idle",
    nativeEvidenceUntil: 0,
    now: 100,
    lastBeforeInputBlockId: null,
    composition: null,
  };
  return inspectNativeTextMutations(options);
}

function createFixture(): {
  root: HTMLElement;
  block: HTMLElement;
  surface: HTMLElement;
  text: Text;
} {
  const root = window.document.createElement("div");
  const block = window.document.createElement("p");
  block.setAttribute("data-editable-block", "alpha");
  const surface = window.document.createElement("span");
  surface.setAttribute("data-editable-text", "/blocks/0/text");
  const text = window.document.createTextNode("first");
  surface.append(text);
  block.append(surface);
  root.append(block);
  window.document.body.append(root);
  return { root, block, surface, text };
}

function observeMutation(
  root: HTMLElement,
  mutate: () => void,
): MutationRecord[] {
  const observer = new MutationObserver(() => undefined);
  observer.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  mutate();
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
}
