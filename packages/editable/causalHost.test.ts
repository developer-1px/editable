// @vitest-environment jsdom

import {
  createCausalPatchInbox,
  type CausalPatchInbox,
} from "@interactive-os/json-document-causal-patch-inbox";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEditableDocument,
  EditableDocumentSchema,
  type EditorFault,
  getJsonEditableDocumentHost,
  type JsonEditable,
  mountJsonEditable,
} from "./index";

type Fixture = ReturnType<typeof setupEditor>;

const mountedEditors: JsonEditable[] = [];
const mountedInboxes: CausalPatchInbox[] = [];

afterEach(() => {
  for (const inbox of mountedInboxes.splice(0)) {
    inbox.dispose();
  }
  for (const editor of mountedEditors.splice(0)) {
    editor.destroy();
  }
  window.document.body.replaceChildren();
  vi.useRealTimers();
});

function setupEditor(
  onFault?: (fault: EditorFault) => void,
  root = window.document.createElement("div"),
) {
  const document = createEditableDocument({
    schema: "interactive-os.editable-document@2",
    id: "causal-host-test",
    blocks: [
      { id: "alpha", type: "paragraph", text: "abcdef" },
      { id: "beta", type: "paragraph", text: "second" },
    ],
  });
  const faults: EditorFault[] = [];
  if (!root.isConnected) {
    window.document.body.append(root);
  }
  const editor = mountJsonEditable({
    root,
    document,
    onFault: (fault) => {
      faults.push(fault);
      onFault?.(fault);
    },
  });
  mountedEditors.push(editor);
  return { document, editor, faults, root };
}

function createInbox(fixture: Fixture) {
  const inbox = createCausalPatchInbox(fixture.document, {
    host: getJsonEditableDocumentHost(fixture.editor),
    positionalSchema: EditableDocumentSchema,
  });
  mountedInboxes.push(inbox);
  return inbox;
}

function textNode(fixture: Fixture, blockId: string): Text {
  const node = fixture.root.querySelector(
    `[data-editable-block="${blockId}"] [data-editable-text]`,
  )?.firstChild;
  if (!(node instanceof Text)) {
    throw new Error(`Missing editable Text node for ${blockId}.`);
  }
  return node;
}

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

function inputEvent(
  type: "beforeinput" | "input",
  inputType: string,
  options: { data?: string | null; isComposing?: boolean } = {},
): InputEvent {
  return new InputEvent(type, {
    bubbles: true,
    cancelable: type === "beforeinput",
    data: options.data,
    inputType,
    isComposing: options.isComposing ?? false,
  });
}

describe("editable causal document host", () => {
  it("rebases a delayed positional edit after an owned local insertion", () => {
    const fixture = setupEditor();
    fixture.root.focus();
    const inbox = createInbox(fixture);
    const base = fixture.document.value;
    const baseRevision = inbox.current().journalRevision;

    expect(baseRevision).toBe(0);
    expect(
      fixture.editor.dispatch({
        type: "patch",
        patch: [
          {
            op: "add",
            path: "/blocks/0",
            value: { id: "local", type: "paragraph", text: "local" },
          },
        ],
      }),
    ).toMatchObject({ ok: true, change: "document" });
    expect(inbox.current().journalRevision).toBe(1);

    const result = inbox.ingest({
      id: "delayed-beta",
      dependsOn: [],
      intent: {
        kind: "positional",
        base,
        baseRevision,
        operations: [
          {
            op: "replace",
            path: "/blocks/1/text",
            value: "Reviewed",
          },
        ],
        selectionAfter: { path: "/blocks/1/text", offset: 4 },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      applied: ["delayed-beta"],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: "pointer_shifted",
          pointer: "/blocks/1/text",
          rebasedPointer: "/blocks/2/text",
        }),
      ]),
    });
    expect(fixture.document.value.blocks).toEqual([
      { id: "local", type: "paragraph", text: "local" },
      { id: "alpha", type: "paragraph", text: "abcdef" },
      { id: "beta", type: "paragraph", text: "Reviewed" },
    ]);
    expect(fixture.document.selection?.primaryRange).toEqual({
      anchor: { path: "/blocks/2/text", offset: 4 },
      focus: { path: "/blocks/2/text", offset: 4 },
    });
    const beta = textNode(fixture, "beta");
    expect(window.getSelection()?.focusNode).toBe(beta);
    expect(window.getSelection()?.focusOffset).toBe(4);
    expect(inbox.current()).toMatchObject({
      status: "active",
      journalRevision: 2,
      frontier: ["delayed-beta"],
    });
    expect(fixture.faults).toEqual([]);
  });

  it("lets another causal inbox journal a ready publication as host-owned", () => {
    const fixture = setupEditor();
    const applyingInbox = createInbox(fixture);
    const observingInbox = createInbox(fixture);

    expect(
      applyingInbox.ingest({
        id: "from-first-inbox",
        dependsOn: [],
        operations: [
          { op: "replace", path: "/blocks/0/text", value: "shared" },
        ],
      }),
    ).toMatchObject({ ok: true, applied: ["from-first-inbox"] });

    expect(observingInbox.current()).toMatchObject({
      status: "active",
      journalRevision: 1,
      frontier: [],
    });
    expect(fixture.faults).toEqual([]);
  });

  it("journals pending native input, defers for composition, then retries when idle", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const inbox = createInbox(fixture);
    const base = fixture.document.value;
    const composingNode = textNode(fixture, "alpha");
    setDOMCaret(composingNode, 2);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    fixture.root.dispatchEvent(
      inputEvent("beforeinput", "insertCompositionText", {
        data: "한",
        isComposing: true,
      }),
    );
    composingNode.insertData(2, "한");
    setDOMCaret(composingNode, 3);

    let retryResult: ReturnType<typeof inbox.ingest> | undefined;
    let retryScheduled = false;
    const unsubscribe = fixture.editor.subscribe((snapshot) => {
      if (
        retryResult === undefined &&
        !retryScheduled &&
        snapshot.phase === "idle" &&
        snapshot.queuedChanges === 0
      ) {
        retryScheduled = true;
        queueMicrotask(() => {
          retryResult = inbox.ingest([]);
        });
      }
    });

    const deferred = inbox.ingest({
      id: "after-composition",
      dependsOn: [],
      intent: {
        kind: "positional",
        base,
        baseRevision: 0,
        operations: [
          {
            op: "replace",
            path: "/blocks/1/text",
            value: "after IME",
          },
        ],
      },
    });

    expect(deferred).toMatchObject({
      ok: false,
      code: "host_not_ready",
      id: "after-composition",
    });
    expect(fixture.document.value.blocks[0]?.text).toBe("ab한cdef");
    expect(inbox.current()).toMatchObject({
      journalRevision: 1,
      queued: [{ id: "after-composition", missing: [] }],
    });
    expect(textNode(fixture, "alpha")).toBe(composingNode);

    fixture.root.dispatchEvent(
      inputEvent("input", "insertCompositionText", {
        data: "한",
        isComposing: true,
      }),
    );
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "한" }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(retryResult).toMatchObject({
      ok: true,
      applied: ["after-composition"],
    });
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "ab한cdef",
      "after IME",
    ]);
    expect(inbox.current()).toMatchObject({
      status: "active",
      journalRevision: 2,
      queued: [],
    });
    expect(fixture.faults).toEqual([]);
    unsubscribe();
  });

  it("defers the turn when flushing a damaged composition makes the editor idle", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const inbox = createInbox(fixture);
    const base = fixture.document.value;
    const pinnedNode = textNode(fixture, "alpha");
    setDOMCaret(pinnedNode, 2);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    const replacement = window.document.createTextNode(pinnedNode.data);
    pinnedNode.parentNode?.replaceChild(replacement, pinnedNode);

    const deferred = inbox.ingest({
      id: "after-damaged-composition",
      dependsOn: [],
      intent: {
        kind: "positional",
        base,
        baseRevision: 0,
        operations: [
          { op: "replace", path: "/blocks/1/text", value: "recovered" },
        ],
      },
    });

    expect(deferred).toMatchObject({
      ok: false,
      code: "host_not_ready",
      id: "after-damaged-composition",
    });
    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "idle",
      composition: null,
    });
    expect(fixture.document.value.blocks[1]?.text).toBe("second");

    expect(inbox.ingest([])).toMatchObject({
      ok: false,
      code: "host_not_ready",
      id: "after-damaged-composition",
    });
    let releaseRetry: ReturnType<typeof inbox.ingest> | undefined;
    let retryOnRelease = true;
    fixture.editor.subscribe((snapshot) => {
      if (
        retryOnRelease &&
        releaseRetry === undefined &&
        snapshot.phase === "idle"
      ) {
        releaseRetry = inbox.ingest([]);
      }
    });
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );
    expect(releaseRetry).toBeUndefined();
    expect(fixture.document.value.blocks[1]?.text).toBe("second");
    await Promise.resolve();
    expect(releaseRetry).toBeUndefined();
    expect(fixture.editor.getSnapshot().phase).toBe("settling");
    await vi.advanceTimersByTimeAsync(31);
    retryOnRelease = false;
    expect(releaseRetry).toMatchObject({
      ok: true,
      applied: ["after-damaged-composition"],
    });
    expect(fixture.document.value.blocks[1]?.text).toBe("recovered");
  });

  it("does not apply when the editor is destroyed during the readiness flush", () => {
    const fixture = setupEditor();
    const documentHost = getJsonEditableDocumentHost(fixture.editor);
    const pinnedNode = textNode(fixture, "alpha");
    setDOMCaret(pinnedNode, 2);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    let armed = false;
    fixture.editor.subscribe((snapshot) => {
      if (armed && snapshot.phase === "idle") {
        fixture.editor.destroy();
      }
    });
    armed = true;
    pinnedNode.parentNode?.replaceChild(
      window.document.createTextNode(pinnedNode.data),
      pinnedNode,
    );
    const apply = vi.fn();

    expect(() =>
      documentHost.runReady({ id: "destroyed-during-flush", apply }),
    ).toThrow("destroyed");
    expect(apply).not.toHaveBeenCalled();
  });

  it("does not let a damaged-session settle timer end a new composition", async () => {
    vi.useFakeTimers();
    const fixture = setupEditor();
    const inbox = createInbox(fixture);
    const node = textNode(fixture, "alpha");
    setDOMCaret(node, 2);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    node.parentNode?.replaceChild(
      window.document.createTextNode(node.data),
      node,
    );
    expect(
      inbox.ingest({
        id: "wait-for-new-composition",
        dependsOn: [],
        operations: [
          { op: "replace", path: "/blocks/1/text", value: "later" },
        ],
      }),
    ).toMatchObject({ ok: false, code: "host_not_ready" });
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "" }),
    );

    const nextNode = textNode(fixture, "alpha");
    setDOMCaret(nextNode, 2);
    fixture.root.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    await vi.advanceTimersByTimeAsync(31);

    expect(fixture.editor.getSnapshot()).toMatchObject({
      phase: "composing",
      composition: { blockId: "alpha" },
    });
    expect(textNode(fixture, "alpha")).toBe(nextNode);
    expect(fixture.document.value.blocks[1]?.text).toBe("second");
  });

  it("does not apply reentrantly from a native beforeinput subscriber", () => {
    const fixture = setupEditor();
    const inbox = createInbox(fixture);
    const base = fixture.document.value;
    let armed = false;
    let nestedResult: ReturnType<typeof inbox.ingest> | undefined;
    fixture.editor.subscribe(() => {
      if (!armed || nestedResult !== undefined) {
        return;
      }
      nestedResult = inbox.ingest({
        id: "during-beforeinput",
        dependsOn: [],
        intent: {
          kind: "positional",
          base,
          baseRevision: 0,
          operations: [
            { op: "replace", path: "/blocks/1/text", value: "delayed" },
          ],
        },
      });
    });
    setDOMCaret(textNode(fixture, "alpha"), 1);
    armed = true;

    expect(
      fixture.root.dispatchEvent(
        inputEvent("beforeinput", "insertText", { data: "X" }),
      ),
    ).toBe(false);

    expect(nestedResult).toMatchObject({
      ok: false,
      code: "host_not_ready",
      id: "during-beforeinput",
    });
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "aXbcdef",
      "second",
    ]);
    expect(inbox.ingest([])).toMatchObject({
      ok: true,
      applied: ["during-beforeinput"],
    });
    expect(fixture.document.value.blocks[1]?.text).toBe("delayed");
  });

  it("assigns owned publication sequences before commit and rejects raw writes", () => {
    const fixture = setupEditor();
    const documentHost = getJsonEditableDocumentHost(fixture.editor);
    const ownerships: Array<false | { sequence: number }> = [];
    let reentrantResult:
      | ReturnType<typeof documentHost.runReady>
      | undefined;
    const nestedApply = vi.fn();
    fixture.document.subscribe((operations, metadata) => {
      ownerships.push(
        documentHost.ownsPublication({ operations, metadata }),
      );
      reentrantResult ??= documentHost.runReady({
        id: "nested",
        apply: nestedApply,
      });
    });

    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "alpha",
        from: 0,
        to: 1,
        text: "A",
      }).ok,
    ).toBe(true);
    expect(fixture.editor.dispatch({ type: "undo" }).ok).toBe(true);
    expect(fixture.editor.dispatch({ type: "redo" }).ok).toBe(true);
    expect(fixture.editor.dispatch({ type: "reset" }).ok).toBe(true);

    const ownedSequences = ownerships.map((ownership) => {
      if (ownership === false) {
        throw new Error("Expected a coordinator-owned publication.");
      }
      return ownership.sequence;
    });
    expect(ownedSequences).toHaveLength(4);
    expect(
      ownedSequences.every(
        (sequence, index) => index === 0 || sequence > ownedSequences[index - 1]!,
      ),
    ).toBe(true);
    expect(reentrantResult).toMatchObject({
      ok: false,
      code: "host_not_ready",
    });
    expect(nestedApply).not.toHaveBeenCalled();
    expect(
      documentHost.ownsPublication({ operations: [] }),
    ).toBe(false);

    expect(
      fixture.document.commit([
        { op: "replace", path: "/blocks/0/text", value: "raw" },
      ]),
    ).toEqual({ ok: true });
    expect(ownerships.at(-1)).toBe(false);
    expect(fixture.faults).toContainEqual(
      expect.objectContaining({ code: "out_of_band_document_write" }),
    );
  });

  it("journals an owned publication even when an editor subscriber throws", () => {
    const fixture = setupEditor(() => {
      throw new Error("fault observer failed");
    });
    const inbox = createInbox(fixture);
    const base = fixture.document.value;
    const subscriberFailure = new Error("subscriber failed");
    fixture.editor.subscribe(() => {
      throw subscriberFailure;
    });

    expect(() =>
      fixture.editor.dispatch({
        type: "patch",
        patch: [
          {
            op: "add",
            path: "/blocks/0",
            value: { id: "leading", type: "paragraph", text: "leading" },
          },
        ],
      }),
    ).not.toThrow();
    expect(inbox.current().journalRevision).toBe(1);

    expect(
      inbox.ingest({
        id: "after-throwing-subscriber",
        dependsOn: [],
        intent: {
          kind: "positional",
          base,
          baseRevision: 0,
          operations: [
            { op: "replace", path: "/blocks/1/text", value: "correct" },
          ],
        },
      }),
    ).toMatchObject({ ok: true, applied: ["after-throwing-subscriber"] });
    expect(fixture.document.value.blocks.map((block) => block.text)).toEqual([
      "leading",
      "abcdef",
      "correct",
    ]);
    expect(fixture.faults).toContainEqual(
      expect.objectContaining({ code: "subscriber_failed" }),
    );
  });

  it("propagates ready apply failures without losing an already published DOM change", () => {
    const fixture = setupEditor();
    const documentHost = getJsonEditableDocumentHost(fixture.editor);
    const readyOwnerships: Array<false | { sequence: number }> = [];
    fixture.document.subscribe((operations, metadata) => {
      readyOwnerships.push(
        documentHost.ownsPublication({ operations, metadata }),
      );
    });
    fixture.document.selection?.collapse({
      path: "/blocks/0/text",
      offset: 1,
    });
    const outside = window.document.createElement("button");
    window.document.body.append(outside);
    outside.focus();
    const beforeFailure = new Error("before publication");
    expect(() =>
      documentHost.runReady({
        id: "before",
        apply() {
          throw beforeFailure;
        },
      }),
    ).toThrow(beforeFailure);
    expect(fixture.document.value.blocks[0]?.text).toBe("abcdef");
    expect(window.document.activeElement).toBe(outside);

    const afterFailure = new Error("after publication");
    expect(() =>
      documentHost.runReady({
        id: "after",
        apply() {
          expect(
            fixture.document.commit(
              [{ op: "replace", path: "/blocks/0/text", value: "published" }],
              { mergeKey: "after", origin: "causal-test" },
            ),
          ).toEqual({ ok: true });
          throw afterFailure;
        },
      }),
    ).toThrow(afterFailure);
    expect(fixture.document.value.blocks[0]?.text).toBe("published");
    expect(textNode(fixture, "alpha").data).toBe("published");
    expect(readyOwnerships).toEqual([{ sequence: 2 }]);
    expect(window.document.activeElement).toBe(outside);
    expect(fixture.faults).toEqual([]);

    expect(
      fixture.editor.dispatch({
        type: "replaceText",
        blockId: "beta",
        from: 0,
        to: 0,
        text: "still usable ",
      }).ok,
    ).toBe(true);
  });

  it("keeps ready selection headless while another element owns focus", () => {
    const fixture = setupEditor();
    const documentHost = getJsonEditableDocumentHost(fixture.editor);
    const publications = vi.fn();
    fixture.document.subscribe(publications);
    const outside = window.document.createElement("button");
    window.document.body.append(outside);
    outside.focus();

    expect(
      documentHost.runReady({
        id: "test-only",
        apply() {
          expect(
            fixture.document.commit(
              [{ op: "test", path: "/blocks/1/id", value: "beta" }],
              { mergeKey: "test-only", origin: "causal-test" },
            ),
          ).toEqual({ ok: true });
        },
      }),
    ).toEqual({ ok: true });
    expect(window.document.activeElement).toBe(outside);

    expect(
      documentHost.runReady({
        id: "selection-only",
        apply() {
          expect(
            fixture.document.commit(
              [{ op: "test", path: "/blocks/1/id", value: "beta" }],
              {
                mergeKey: "selection-only",
                origin: "causal-test",
                selectionAfter: { path: "/blocks/1/text", offset: 3 },
              },
            ),
          ).toEqual({ ok: true });
        },
      }),
    ).toEqual({ ok: true });

    expect(publications).not.toHaveBeenCalled();
    expect(fixture.document.selection?.primaryRange).toEqual({
      anchor: { path: "/blocks/1/text", offset: 3 },
      focus: { path: "/blocks/1/text", offset: 3 },
    });
    expect(window.document.activeElement).toBe(outside);
  });

  it("restores ready selection while a shadow-root editor owns focus", () => {
    const shadowHost = window.document.createElement("div");
    window.document.body.append(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const root = window.document.createElement("div");
    shadowRoot.append(root);
    const fixture = setupEditor(undefined, root);
    const documentHost = getJsonEditableDocumentHost(fixture.editor);
    fixture.root.focus();
    expect(window.document.activeElement).toBe(shadowHost);
    expect(shadowRoot.activeElement).toBe(fixture.root);
    const focus = vi.spyOn(fixture.root, "focus");

    expect(
      documentHost.runReady({
        id: "shadow-selection",
        apply() {
          fixture.document.commit(
            [{ op: "test", path: "/blocks/1/id", value: "beta" }],
            {
              mergeKey: "shadow-selection",
              origin: "causal-test",
              selectionAfter: { path: "/blocks/1/text", offset: 2 },
            },
          );
        },
      }),
    ).toEqual({ ok: true });

    expect(fixture.document.selection?.primaryRange).toEqual({
      anchor: { path: "/blocks/1/text", offset: 2 },
      focus: { path: "/blocks/1/text", offset: 2 },
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("isolates an earlier editor observer and restores selection", () => {
    const fixture = setupEditor();
    const documentHost = getJsonEditableDocumentHost(fixture.editor);
    const alpha = textNode(fixture, "alpha");
    fixture.root.focus();
    setDOMCaret(alpha, 1);
    fixture.document.selection?.collapse({
      path: "/blocks/0/text",
      offset: 1,
    });
    const observerFailure = new Error("observer failed");
    fixture.editor.subscribe(() => {
      throw observerFailure;
    });

    expect(
      documentHost.runReady({
        id: "selection-observer-failure",
        apply() {
          fixture.document.commit(
            [{ op: "test", path: "/blocks/1/id", value: "beta" }],
            {
              mergeKey: "selection-observer-failure",
              origin: "causal-test",
              selectionAfter: { path: "/blocks/1/text", offset: 2 },
            },
          );
        },
      }),
    ).toEqual({ ok: true });

    expect(fixture.document.selection?.primaryRange).toEqual({
      anchor: { path: "/blocks/1/text", offset: 2 },
      focus: { path: "/blocks/1/text", offset: 2 },
    });
    expect(window.getSelection()?.focusNode).toBe(textNode(fixture, "beta"));
    expect(window.getSelection()?.focusOffset).toBe(2);
    expect(fixture.faults).toContainEqual(
      expect.objectContaining({ code: "subscriber_failed" }),
    );
  });
});
