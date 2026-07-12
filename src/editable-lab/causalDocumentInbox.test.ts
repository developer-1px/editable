// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEditableDocument,
  type JsonEditable,
  mountJsonEditable,
} from "../../packages/editable";
import { createEditableCausalInbox } from "./causalDocumentInbox";

let editor: JsonEditable | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
  window.document.body.replaceChildren();
  vi.useRealTimers();
});

describe("editable lab causal inbox", () => {
  it("retries a deferred envelope in a microtask after composition settles", async () => {
    vi.useFakeTimers();
    const document = createEditableDocument({
      schema: "interactive-os.editable-document@2",
      id: "causal-lab-test",
      blocks: [
        { id: "alpha", type: "paragraph", text: "abcdef" },
        { id: "beta", type: "paragraph", text: "second" },
      ],
    });
    const root = window.document.createElement("div");
    window.document.body.append(root);
    editor = mountJsonEditable({ root, document });
    const inbox = createEditableCausalInbox(document, editor);
    const base = document.value;
    const node = root.querySelector(
      '[data-editable-block="alpha"] [data-editable-text]',
    )?.firstChild;
    if (!(node instanceof Text)) {
      throw new Error("Missing alpha Text node.");
    }
    setDOMCaret(node, 2);
    root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );

    const result = inbox.ingest({
      id: "delayed",
      dependsOn: [],
      intent: {
        kind: "positional",
        base,
        baseRevision: 0,
        operations: [
          { op: "replace", path: "/blocks/1/text", value: "settled" },
        ],
      },
    });
    expect(result).toMatchObject({ ok: false, code: "host_not_ready" });

    root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(document.value.blocks[1]?.text).toBe("settled");
    expect(inbox.current()).toMatchObject({
      status: "active",
      frontier: ["delayed"],
      queued: [],
    });
    inbox.dispose();
  });

  it("does not retry a recovered pin until the browser composition ends", async () => {
    vi.useFakeTimers();
    const document = createEditableDocument({
      schema: "interactive-os.editable-document@2",
      id: "causal-recovery-test",
      blocks: [
        { id: "alpha", type: "paragraph", text: "abcdef" },
        { id: "beta", type: "paragraph", text: "second" },
      ],
    });
    const root = window.document.createElement("div");
    window.document.body.append(root);
    editor = mountJsonEditable({ root, document });
    const inbox = createEditableCausalInbox(document, editor);
    const base = document.value;
    const node = root.querySelector(
      '[data-editable-block="alpha"] [data-editable-text]',
    )?.firstChild;
    if (!(node instanceof Text)) {
      throw new Error("Missing alpha Text node.");
    }
    setDOMCaret(node, 2);
    root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    node.parentNode?.replaceChild(
      window.document.createTextNode(node.data),
      node,
    );

    expect(
      inbox.ingest({
        id: "after-recovery",
        dependsOn: [],
        intent: {
          kind: "positional",
          base,
          baseRevision: 0,
          operations: [
            { op: "replace", path: "/blocks/1/text", value: "released" },
          ],
        },
      }),
    ).toMatchObject({ ok: false, code: "host_not_ready" });
    await Promise.resolve();
    expect(document.value.blocks[1]?.text).toBe("second");

    root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    await Promise.resolve();
    expect(document.value.blocks[1]?.text).toBe("second");
    await vi.advanceTimersByTimeAsync(31);

    expect(document.value.blocks[1]?.text).toBe("released");
    expect(inbox.current()).toMatchObject({
      status: "active",
      frontier: ["after-recovery"],
      queued: [],
    });
    inbox.dispose();
  });
});

function setDOMCaret(node: Text, offset: number): void {
  const selection = window.getSelection();
  if (selection === null) {
    throw new Error("The test DOM does not expose a Selection.");
  }
  const range = window.document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}
