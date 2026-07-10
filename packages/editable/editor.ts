import {
  applyPatch,
  type JSONDocument,
  type JSONPatchOperation,
  type SelectionSnap,
} from "@interactive-os/json-document";
import {
  EditableDocumentSchema,
  editableTextPath,
  findEditableBlockIndex,
  orderedEditableSelection,
  primaryEditablePoint,
  type EditableBlock,
  type EditableBlockType,
  type EditableDocumentValue,
} from "./model";
import {
  EDITABLE_BLOCK_ATTRIBUTE,
  EDITABLE_PLACEHOLDER_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  editableBlockFromNode,
  editableSurfaceFromNode,
  ensureCompositionTextNode,
  readDOMPoint,
  readDOMSelection,
  restoreDOMSelection,
  setCanonicalSurfaceText,
  textFromSurface,
} from "./internal/domSelection";
import {
  accumulateNativeCompositionRange,
  applyTextChange,
  clampTextRange,
  diffText,
  diffTextNearRange,
  type TextChange,
  type TextRange,
} from "./internal/textChange";

export type EditorPhase =
  | "idle"
  | "native-input"
  | "composing"
  | "settling";

export type EditorSnapshot = {
  phase: EditorPhase;
  revision: number;
  queuedChanges: number;
  selection: SelectionSnap | null;
  composition: {
    blockId: string;
    from: number;
    to: number;
  } | null;
};

export type EditorFault = {
  code:
    | "out_of_band_document_write"
    | "foreign_dom_mutation"
    | "native_change_commit_failed"
    | "input_state_lost"
    | "composition_overlap"
    | "composition_conflict"
    | "queued_change_commit_failed";
  recoverable: boolean;
  reason: string;
};

export type EditorAction =
  | {
      type: "patch";
      patch: ReadonlyArray<JSONPatchOperation>;
      label?: string;
      origin?: string;
      selectionAfter?: SelectionSnap | null;
    }
  | {
      type: "replaceText";
      blockId: string;
      from: number;
      to: number;
      text: string;
      label?: string;
      origin?: string;
    }
  | {
      type: "replaceSelection";
      text: string;
      label?: string;
      origin?: string;
    }
  | {
      type: "setBlockType";
      blockType: EditableBlockType;
      blockId?: string;
    }
  | { type: "insertParagraph" }
  | { type: "deleteBackward" | "deleteForward" }
  | { type: "joinBackward" }
  | { type: "joinForward" }
  | { type: "undo" | "redo" | "reset" };

export type EditorResult =
  | {
      ok: true;
      change: "none" | "selection" | "document" | "queued";
      patch: ReadonlyArray<JSONPatchOperation>;
    }
  | {
      ok: false;
      code:
        | "destroyed"
        | "reentrant_transaction"
        | "block_not_found"
        | "selection_unavailable"
        | "composition_conflict"
        | "commit_failed";
      reason: string;
    };

export type JsonEditable = {
  dispatch(action: EditorAction): EditorResult;
  getSnapshot(): EditorSnapshot;
  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void;
  destroy(): void;
};

export type MountJsonEditableOptions = {
  root: HTMLElement;
  document: JSONDocument<EditableDocumentValue>;
  onFault?: (fault: EditorFault) => void;
};

type ChangeSource =
  | "native"
  | "app"
  | "remote"
  | "history"
  | "authoritative"
  | "external";

type CompositionSession = {
  id: number;
  blockId: string;
  node: Text;
  ancestors: Node[];
  range: TextRange;
  ending: boolean;
};

type PendingNativeIntent = {
  selection: SelectionSnap;
  text: string;
  inputType: string;
};

type QueuedRemotePatch = {
  patch: ReadonlyArray<JSONPatchOperation>;
  label: string;
};

type BlockChange = {
  blockId: string;
  after: EditableBlock | null;
  text: TextChange | null;
  typeChanged: boolean;
};

const OWNED_HOST_ATTRIBUTES = [
  "contenteditable",
  "spellcheck",
  "tabindex",
  "role",
  "aria-multiline",
] as const;

let editorSequence = 0;

export function mountJsonEditable(
  options: MountJsonEditableOptions,
): JsonEditable {
  return new JsonEditableCoordinator(options);
}

class JsonEditableCoordinator implements JsonEditable {
  private readonly root: HTMLElement;
  private readonly document: JSONDocument<EditableDocumentValue>;
  private readonly onFault: ((fault: EditorFault) => void) | undefined;
  private readonly ownerId: string;
  private readonly originalHostAttributes: ReadonlyMap<string, string | null>;
  private readonly observer: MutationObserver;
  private readonly listeners = new Set<(snapshot: EditorSnapshot) => void>();
  private readonly stopDocumentSubscription: () => void;
  private readonly stopSelectionSubscription: (() => void) | null;
  private lastValue: EditableDocumentValue;
  private phase: EditorPhase = "idle";
  private revision = 0;
  private composition: CompositionSession | null = null;
  private compositionSequence = 0;
  private blockSequence = 0;
  private settleTimer: number | null = null;
  private nativeTurnTimer: number | null = null;
  private commitSource: ChangeSource | null = null;
  private commitTextChanges: ReadonlyMap<string, TextChange> | null = null;
  private lastNativeCompositionHistoryId: number | null = null;
  private dispatching = false;
  private destroyed = false;
  private domWriteDepth = 0;
  private pendingRecords: MutationRecord[] = [];
  private mutationFlushQueued = false;
  private lastBeforeInputBlockId: string | null = null;
  private nativeEvidenceUntil = 0;
  private pendingNativeIntent: PendingNativeIntent | null = null;
  private inputTargetSelection: SelectionSnap | null = null;
  private queuedRemotePatches: QueuedRemotePatch[] = [];
  private remoteFlushQueued = false;

  constructor({ root, document, onFault }: MountJsonEditableOptions) {
    if (root.dataset.jsonEditableOwner !== undefined) {
      throw new Error("The editable root is already owned by an editor.");
    }

    this.root = root;
    this.document = document;
    this.onFault = onFault;
    this.ownerId = `json-editable-${++editorSequence}`;
    this.originalHostAttributes = new Map(
      OWNED_HOST_ATTRIBUTES.map((name) => [name, root.getAttribute(name)]),
    );
    this.lastValue = document.value;

    const MutationObserverConstructor =
      root.ownerDocument.defaultView?.MutationObserver;
    if (MutationObserverConstructor === undefined) {
      throw new Error("MutationObserver is required to mount the editor.");
    }
    this.observer = new MutationObserverConstructor((records) => {
      this.captureMutationRecords(records);
    });

    root.dataset.jsonEditableOwner = this.ownerId;
    root.contentEditable = "true";
    root.spellcheck = false;
    root.tabIndex = 0;
    root.setAttribute("role", "textbox");
    root.setAttribute("aria-multiline", "true");

    this.withDOMWrite(() => {
      while (root.firstChild !== null) {
        root.removeChild(root.firstChild);
      }
      this.renderDocument(document.value);
    });
    this.observe();
    this.attachEvents();

    this.stopDocumentSubscription = document.subscribe(() => {
      this.onDocumentChange();
    });
    this.stopSelectionSubscription =
      document.selection?.subscribe(() => {
        this.bump();
      }) ?? null;
  }

  dispatch(action: EditorAction): EditorResult {
    if (this.destroyed) {
      return failure("destroyed", "The editor has been destroyed.");
    }
    if (this.dispatching) {
      return failure(
        "reentrant_transaction",
        "Editor transactions cannot be nested.",
      );
    }

    this.dispatching = true;
    try {
      this.flushNativeMutations([], false);
      if (
        this.composition !== null &&
        this.actionConflictsWithComposition(action)
      ) {
        const reason =
          "The composing block is browser-owned until composition settles; retry this action afterward.";
        this.reportFault({
          code: "composition_conflict",
          recoverable: true,
          reason,
        });
        return failure("composition_conflict", reason);
      }
      const result = this.applyAction(action);
      if (
        result.ok &&
        this.composition === null &&
        actionOrigin(action) !== "remote"
      ) {
        restoreDOMSelection(
          this.root,
          this.document.value,
          this.document.selection?.snapshot() ?? null,
        );
      }
      return result;
    } finally {
      this.dispatching = false;
    }
  }

  getSnapshot(): EditorSnapshot {
    return {
      phase: this.phase,
      revision: this.revision,
      queuedChanges: this.queuedRemotePatches.length,
      selection: this.document.selection?.snapshot() ?? null,
      composition:
        this.composition === null
          ? null
          : {
              blockId: this.composition.blockId,
              from: this.composition.range.from,
              to: this.composition.range.to,
            },
    };
  }

  subscribe(listener: (snapshot: EditorSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    if (this.pendingNativeIntent === null) {
      this.flushNativeMutations([], this.phase !== "idle");
    } else {
      this.commitPendingNativeIntent();
    }
    this.composition = null;
    this.withDOMWrite(() => {
      this.renderDocument(this.document.value);
    });
    this.flushQueuedRemotePatches();
    this.destroyed = true;
    this.clearSettleTimer();
    this.clearNativeTurnTimer();
    this.observer.disconnect();
    this.detachEvents();
    this.stopDocumentSubscription();
    this.stopSelectionSubscription?.();
    this.listeners.clear();
    this.pendingNativeIntent = null;
    this.inputTargetSelection = null;
    this.pendingRecords = [];
    this.observer.takeRecords();
    this.lastNativeCompositionHistoryId = null;
    if (this.root.dataset.jsonEditableOwner === this.ownerId) {
      delete this.root.dataset.jsonEditableOwner;
    }
    for (const [name, value] of this.originalHostAttributes) {
      if (value === null) {
        this.root.removeAttribute(name);
      } else {
        this.root.setAttribute(name, value);
      }
    }
  }

  private applyAction(action: EditorAction): EditorResult {
    switch (action.type) {
      case "patch":
        return this.commitPatch(
          action.patch,
          action.label ?? "document patch",
          sourceFromOrigin(action.origin),
          action.selectionAfter,
        );
      case "replaceText":
        return this.replaceText(action);
      case "replaceSelection":
        return this.replaceSelection(
          action.text,
          action.label ?? "replace selection",
          sourceFromOrigin(action.origin),
        );
      case "setBlockType":
        return this.setBlockType(action.blockType, action.blockId);
      case "insertParagraph":
        return this.insertParagraph();
      case "deleteBackward":
        return this.deleteByDirection("backward");
      case "deleteForward":
        return this.deleteByDirection("forward");
      case "joinBackward":
        return this.joinBackward();
      case "joinForward":
        return this.joinForward();
      case "undo":
        return this.applyHistory("undo");
      case "redo":
        return this.applyHistory("redo");
      case "reset":
        return this.reset();
    }
  }

  private actionConflictsWithComposition(action: EditorAction): boolean {
    const blockId = this.composition?.blockId;
    if (blockId === undefined) {
      return false;
    }
    if (actionOrigin(action) !== "remote") {
      return true;
    }
    if (action.type === "replaceText") {
      return action.blockId === blockId;
    }
    if (action.type === "patch") {
      const composingIndex = findEditableBlockIndex(this.document.value, blockId);
      return action.patch.some((operation) => {
        if (operation.op !== "replace" && operation.op !== "test") {
          return true;
        }
        const match = /^\/blocks\/(0|[1-9]\d*)\/(text|type)$/u.exec(
          operation.path,
        );
        return match === null || Number(match[1]) === composingIndex;
      });
    }
    return true;
  }

  private replaceText(
    action: Extract<EditorAction, { type: "replaceText" }>,
  ): EditorResult {
    const index = findEditableBlockIndex(this.document.value, action.blockId);
    const block = this.document.value.blocks[index];
    if (block === undefined) {
      return failure("block_not_found", `Unknown block: ${action.blockId}`);
    }
    const range = clampTextRange(
      { from: Math.min(action.from, action.to), to: Math.max(action.from, action.to) },
      block.text.length,
    );
    const next =
      block.text.slice(0, range.from) + action.text + block.text.slice(range.to);
    if (next === block.text) {
      return success("none", []);
    }
    return this.commitPatch(
      [{ op: "replace", path: editableTextPath(index), value: next }],
      action.label ?? "replace text",
      sourceFromOrigin(action.origin),
    );
  }

  private replaceSelection(
    text: string,
    label: string,
    source: ChangeSource,
  ): EditorResult {
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    if (selection === null) {
      return failure("selection_unavailable", "No editable selection is active.");
    }

    const { start, end } = selection;
    const startBlock = this.document.value.blocks[start.blockIndex];
    const endBlock = this.document.value.blocks[end.blockIndex];
    if (startBlock === undefined || endBlock === undefined) {
      return failure("selection_unavailable", "The selection is stale.");
    }

    const nextText =
      startBlock.text.slice(0, start.offset) +
      text +
      endBlock.text.slice(end.offset);
    const patch: JSONPatchOperation[] = [
      {
        op: "replace",
        path: editableTextPath(start.blockIndex),
        value: nextText,
      },
    ];
    for (let index = end.blockIndex; index > start.blockIndex; index -= 1) {
      patch.push({ op: "remove", path: `/blocks/${index}` });
    }

    return this.commitPatch(patch, label, source, selectionAt(
      editableTextPath(start.blockIndex),
      start.offset + text.length,
    ));
  }

  private deleteByDirection(direction: "backward" | "forward"): EditorResult {
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    if (selection === null) {
      return failure("selection_unavailable", "No editable selection is active.");
    }
    if (
      selection.start.blockIndex !== selection.end.blockIndex ||
      selection.start.offset !== selection.end.offset
    ) {
      return this.replaceSelection("", `delete ${direction}`, "app");
    }

    const index = selection.start.blockIndex;
    const block = this.document.value.blocks[index];
    if (block === undefined) {
      return failure("selection_unavailable", "The selection is stale.");
    }
    const offset = selection.start.offset;
    if (direction === "backward" && offset === 0) {
      return this.joinBackward();
    }
    if (direction === "forward" && offset === block.text.length) {
      return this.joinForward();
    }

    const from =
      direction === "backward"
        ? previousGraphemeBoundary(block.text, offset)
        : offset;
    const to =
      direction === "forward"
        ? nextGraphemeBoundary(block.text, offset)
        : offset;
    const next = block.text.slice(0, from) + block.text.slice(to);
    return this.commitPatch(
      [{ op: "replace", path: editableTextPath(index), value: next }],
      `delete ${direction}`,
      "app",
      selectionAt(editableTextPath(index), from),
    );
  }

  private setBlockType(
    blockType: EditableBlockType,
    requestedBlockId?: string,
  ): EditorResult {
    const point = primaryEditablePoint(
      this.document.value,
      this.document.selection,
    );
    const blockId = requestedBlockId ?? point?.blockId;
    const index =
      blockId === undefined
        ? -1
        : findEditableBlockIndex(this.document.value, blockId);
    const block = this.document.value.blocks[index];
    if (block === undefined) {
      return failure("selection_unavailable", "Select an editable block first.");
    }
    if (block.type === blockType) {
      return success("none", []);
    }
    return this.commitPatch(
      [{ op: "replace", path: `/blocks/${index}/type`, value: blockType }],
      `set block type: ${blockType}`,
      "app",
      this.document.selection?.snapshot() ?? null,
    );
  }

  private insertParagraph(): EditorResult {
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    if (selection === null) {
      return failure("selection_unavailable", "No editable selection is active.");
    }
    const { start, end } = selection;
    const startBlock = this.document.value.blocks[start.blockIndex];
    const endBlock = this.document.value.blocks[end.blockIndex];
    if (startBlock === undefined || endBlock === undefined) {
      return failure("selection_unavailable", "The selection is stale.");
    }

    const left = startBlock.text.slice(0, start.offset);
    const right = endBlock.text.slice(end.offset);
    const newBlock: EditableBlock = {
      id: this.createBlockId(),
      type: "paragraph",
      text: right,
    };
    const patch: JSONPatchOperation[] = [
      {
        op: "replace",
        path: editableTextPath(start.blockIndex),
        value: left,
      },
    ];
    for (let index = end.blockIndex; index > start.blockIndex; index -= 1) {
      patch.push({ op: "remove", path: `/blocks/${index}` });
    }
    patch.push({
      op: "add",
      path: `/blocks/${start.blockIndex + 1}`,
      value: newBlock,
    });

    return this.commitPatch(
      patch,
      "insert paragraph",
      "app",
      selectionAt(editableTextPath(start.blockIndex + 1), 0),
    );
  }

  private joinBackward(): EditorResult {
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    if (selection === null) {
      return failure("selection_unavailable", "No editable selection is active.");
    }
    if (
      selection.start.blockIndex !== selection.end.blockIndex ||
      selection.start.offset !== selection.end.offset
    ) {
      return this.replaceSelection("", "delete selection", "app");
    }
    if (selection.start.offset !== 0 || selection.start.blockIndex === 0) {
      return success("none", []);
    }

    const currentIndex = selection.start.blockIndex;
    const previous = this.document.value.blocks[currentIndex - 1];
    const current = this.document.value.blocks[currentIndex];
    if (previous === undefined || current === undefined) {
      return failure("selection_unavailable", "The selection is stale.");
    }
    const offset = previous.text.length;
    const patch: JSONPatchOperation[] = [
      {
        op: "replace",
        path: editableTextPath(currentIndex - 1),
        value: previous.text + current.text,
      },
      { op: "remove", path: `/blocks/${currentIndex}` },
    ];
    return this.commitPatch(
      patch,
      "join backward",
      "app",
      selectionAt(editableTextPath(currentIndex - 1), offset),
    );
  }

  private joinForward(): EditorResult {
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    if (selection === null) {
      return failure("selection_unavailable", "No editable selection is active.");
    }
    if (
      selection.start.blockIndex !== selection.end.blockIndex ||
      selection.start.offset !== selection.end.offset
    ) {
      return this.replaceSelection("", "delete selection", "app");
    }
    const currentIndex = selection.start.blockIndex;
    const current = this.document.value.blocks[currentIndex];
    const next = this.document.value.blocks[currentIndex + 1];
    if (
      current === undefined ||
      next === undefined ||
      selection.start.offset !== current.text.length
    ) {
      return success("none", []);
    }
    const patch: JSONPatchOperation[] = [
      {
        op: "replace",
        path: editableTextPath(currentIndex),
        value: current.text + next.text,
      },
      { op: "remove", path: `/blocks/${currentIndex + 1}` },
    ];
    return this.commitPatch(
      patch,
      "join forward",
      "app",
      selectionAt(editableTextPath(currentIndex), current.text.length),
    );
  }

  private applyHistory(command: "undo" | "redo"): EditorResult {
    this.cancelComposition(false);
    const result = this.runDocumentChange("history", () =>
      command === "undo" ? this.document.undo() : this.document.redo(),
    );
    if (!result.ok) {
      return failure("commit_failed", result.reason ?? result.code);
    }
    return success("document", this.document.lastPatch);
  }

  private reset(): EditorResult {
    this.cancelComposition(false);
    const result = this.runDocumentChange("authoritative", () =>
      this.document.reset(),
    );
    if (!result.ok) {
      return failure("commit_failed", result.reason ?? result.code);
    }
    return success("document", this.document.lastPatch);
  }

  private commitPatch(
    patch: ReadonlyArray<JSONPatchOperation>,
    label: string,
    source: ChangeSource,
    selectionAfter?: SelectionSnap | null,
  ): EditorResult {
    if (patch.length === 0) {
      return success("none", []);
    }
    if (source === "remote" && this.composition !== null) {
      const preview = applyPatch(
        EditableDocumentSchema,
        this.document.value,
        patch,
      );
      if (!preview.result.ok) {
        return failure(
          "commit_failed",
          preview.result.reason ?? preview.result.code,
        );
      }
      this.queuedRemotePatches.push({
        patch: patch.map((operation) => ({ ...operation })),
        label,
      });
      this.bump();
      return success("queued", patch);
    }
    const result = this.runDocumentChange(source, () =>
      this.document.commit(patch, {
        label,
        origin: source,
        ...(selectionAfter === undefined || selectionAfter === null
          ? {}
          : { selectionAfter }),
      }),
    );
    if (!result.ok) {
      return failure("commit_failed", result.reason ?? result.code);
    }
    return success("document", patch);
  }

  private runDocumentChange<T>(
    source: ChangeSource,
    change: () => T,
    textChanges: ReadonlyMap<string, TextChange> | null = null,
  ): T {
    const previousSource = this.commitSource;
    const previousTextChanges = this.commitTextChanges;
    this.commitSource = source;
    this.commitTextChanges = textChanges;
    try {
      return change();
    } finally {
      this.commitSource = previousSource;
      this.commitTextChanges = previousTextChanges;
    }
  }

  private onDocumentChange(): void {
    const before = this.lastValue;
    const after = this.document.value;
    const source = this.commitSource ?? "external";
    if (source !== "native") {
      this.lastNativeCompositionHistoryId = null;
    }
    if (source === "external") {
      this.reportFault({
        code: "out_of_band_document_write",
        recoverable: true,
        reason:
          "The JSON document changed outside editor.dispatch(); the editor recovered conservatively.",
      });
    }
    const changes = describeBlockChanges(
      before,
      after,
      this.commitTextChanges,
    );
    this.reconcileComposition(after, changes, source);
    this.withDOMWrite(() => {
      this.renderDocument(after);
    });
    this.lastValue = after;
    this.bump();
  }

  private reconcileComposition(
    after: EditableDocumentValue,
    changes: ReadonlyArray<BlockChange>,
    source: ChangeSource,
  ): void {
    const session = this.composition;
    if (session === null) {
      return;
    }
    const change = changes.find((candidate) => candidate.blockId === session.blockId);
    if (change === undefined) {
      return;
    }
    if (change.after === null || change.typeChanged) {
      this.cancelComposition(true, "The composing block was structurally changed.");
      return;
    }
    if (change.text === null) {
      return;
    }

    if (source === "external") {
      this.cancelComposition(
        true,
        "An out-of-band write touched the browser-owned composing block.",
      );
      return;
    }

    if (source === "native") {
      session.range = accumulateNativeCompositionRange(
        session.range,
        change.text,
        change.after.text.length,
      );
      this.refreshCompositionPin(after);
      return;
    }

    this.cancelComposition(
      true,
      `An unexpected ${source} write touched the browser-owned composing block.`,
    );
  }

  private renderDocument(
    value: EditableDocumentValue,
    forceCanonicalBlockId?: string,
  ): void {
    const current = new Map<string, HTMLElement>();
    for (const node of Array.from(this.root.childNodes)) {
      if (node.nodeType !== 1) {
        node.remove();
        continue;
      }
      const element = node as HTMLElement;
      const id = element.getAttribute(EDITABLE_BLOCK_ATTRIBUTE);
      if (id === null || current.has(id)) {
        if (this.composition !== null && element.contains(this.composition.node)) {
          this.cancelComposition(
            true,
            "The composing block lost its keyed DOM identity.",
          );
        }
        element.remove();
        continue;
      }
      current.set(id, element);
    }
    const desiredIds = new Set(value.blocks.map((block) => block.id));
    for (const [id, element] of current) {
      if (!desiredIds.has(id)) {
        element.remove();
        current.delete(id);
      }
    }

    value.blocks.forEach((block, blockIndex) => {
      const tagName = blockTagName(block.type);
      let element = current.get(block.id) ?? null;
      if (element === null || element.tagName.toLowerCase() !== tagName) {
        if (this.composition !== null && element?.contains(this.composition.node)) {
          this.cancelComposition(
            true,
            "The composing block changed its structural element.",
          );
        }
        const replacement = this.createBlockElement(block, blockIndex);
        if (element === null) {
          element = replacement;
        } else {
          element.replaceWith(replacement);
          element = replacement;
        }
        current.set(block.id, element);
      }

      this.configureBlockElement(element, block, blockIndex);
      let surface = Array.from(element.children).find((child) =>
        child.hasAttribute(EDITABLE_TEXT_ATTRIBUTE),
      ) as HTMLElement | undefined;
      if (surface === null) {
        surface = undefined;
      }
      if (surface === undefined) {
        surface = this.root.ownerDocument.createElement("span");
        surface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, editableTextPath(blockIndex));
        element.append(surface);
      }
      for (const child of Array.from(element.childNodes)) {
        if (child === surface) {
          continue;
        }
        if (this.composition !== null && child.contains(this.composition.node)) {
          this.cancelComposition(
            true,
            "The composing text was moved outside its owned surface.",
          );
        }
        child.remove();
      }
      surface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, editableTextPath(blockIndex));

      const protectedSurface =
        this.composition?.blockId === block.id &&
        this.isCompositionPinIntact(surface) &&
        forceCanonicalBlockId !== block.id;
      if (!protectedSurface) {
        setCanonicalSurfaceText(surface, block.text);
      }

      const reference = this.root.children[blockIndex] ?? null;
      if (reference !== element) {
        if (this.composition !== null && element.contains(this.composition.node)) {
          this.cancelComposition(
            true,
            "The composing block moved and could not keep its ancestor identity.",
          );
        }
        this.root.insertBefore(element, reference);
      }
    });
  }

  private createBlockElement(
    block: EditableBlock,
    blockIndex: number,
  ): HTMLElement {
    const element = this.root.ownerDocument.createElement(blockTagName(block.type));
    this.configureBlockElement(element, block, blockIndex);
    const surface = this.root.ownerDocument.createElement("span");
    surface.setAttribute(EDITABLE_TEXT_ATTRIBUTE, editableTextPath(blockIndex));
    element.append(surface);
    setCanonicalSurfaceText(surface, block.text);
    return element;
  }

  private configureBlockElement(
    element: HTMLElement,
    block: EditableBlock,
    blockIndex: number,
  ): void {
    element.className = `contenteditable-block contenteditable-block-${block.type}`;
    element.setAttribute(EDITABLE_BLOCK_ATTRIBUTE, block.id);
    element.setAttribute("data-block-type", block.type);
    element.setAttribute("data-block-index", String(blockIndex));
  }

  private captureMutationRecords(records: ReadonlyArray<MutationRecord>): void {
    if (this.destroyed || records.length === 0) {
      return;
    }
    this.pendingRecords.push(...records);
    this.queueMutationFlush();
  }

  private queueMutationFlush(): void {
    if (this.mutationFlushQueued) {
      return;
    }
    this.mutationFlushQueued = true;
    queueMicrotask(() => {
      this.mutationFlushQueued = false;
      if (!this.destroyed) {
        this.flushNativeMutations([], false);
      }
    });
  }

  private flushNativeMutations(
    additional: ReadonlyArray<MutationRecord>,
    nativeEvidence: boolean,
  ): void {
    if (this.destroyed || this.domWriteDepth > 0) {
      return;
    }
    const records = [
      ...this.pendingRecords,
      ...additional,
      ...this.observer.takeRecords(),
    ];
    this.pendingRecords = [];

    const dirtyIds = new Set<string>();
    const rejectedIds = new Set<string>();
    const nativeEmptyCandidateIds = new Set<string>();
    let rejectedMutation = false;
    for (const record of records) {
      const block = editableBlockFromNode(this.root, record.target);
      const surface = editableSurfaceFromNode(this.root, record.target);
      const id = block?.getAttribute(EDITABLE_BLOCK_ATTRIBUTE);
      if (id === null || id === undefined) {
        rejectedMutation = true;
        continue;
      }
      dirtyIds.add(id);
      if (surface === null) {
        nativeEmptyCandidateIds.add(id);
        continue;
      }
      if (!isAdmittedTextMutation(record, surface)) {
        rejectedIds.add(id);
        rejectedMutation = true;
      }
    }

    const hasNativeEvidence =
      nativeEvidence ||
      this.phase !== "idle" ||
      performance.now() <= this.nativeEvidenceUntil;
    const expectedBlockId =
      this.composition?.blockId ??
      this.lastBeforeInputBlockId ??
      (nativeEvidence && dirtyIds.size === 1
        ? dirtyIds.values().next().value
        : undefined);
    if (
      dirtyIds.size === 0 &&
      expectedBlockId !== null &&
      expectedBlockId !== undefined
    ) {
      dirtyIds.add(expectedBlockId);
    }

    const patch: JSONPatchOperation[] = [];
    const textChanges = new Map<string, TextChange>();
    for (const blockId of dirtyIds) {
      if (
        rejectedIds.has(blockId) ||
        !hasNativeEvidence ||
        expectedBlockId === null ||
        expectedBlockId === undefined ||
        blockId !== expectedBlockId
      ) {
        rejectedMutation = rejectedMutation || records.length > 0;
        continue;
      }
      const index = findEditableBlockIndex(this.document.value, blockId);
      const block = this.document.value.blocks[index];
      const element = this.findBlockElement(blockId);
      const surface = element?.querySelector<HTMLElement>(
        `[${EDITABLE_TEXT_ATTRIBUTE}]`,
      );
      const nativeEmpty =
        element !== null &&
        element !== undefined &&
        nativeEmptyCandidateIds.has(blockId) &&
        isNativeEmptyBlock(element);
      if (
        block === undefined ||
        ((surface === null || surface === undefined) && !nativeEmpty)
      ) {
        rejectedMutation = true;
        continue;
      }
      const text = nativeEmpty ? "" : textFromSurface(surface as HTMLElement);
      if (text !== block.text) {
        const change =
          this.composition?.blockId === blockId
            ? diffTextNearRange(block.text, text, this.composition.range)
            : diffText(block.text, text);
        if (change === null || applyTextChange(block.text, change) !== text) {
          rejectedMutation = true;
          continue;
        }
        textChanges.set(blockId, change);
        patch.push({ op: "replace", path: editableTextPath(index), value: text });
      }
    }

    const selection =
      this.inputTargetSelection ??
      readDOMSelection(this.root, this.document.value);
    if (patch.length > 0) {
      const compositionId = this.composition?.id ?? null;
      const mergeWithPrevious =
        compositionId !== null &&
        this.lastNativeCompositionHistoryId === compositionId;
      const result = this.runDocumentChange(
        "native",
        () =>
          this.document.commit(patch, {
            label:
              this.composition === null ? "native input" : "IME composition",
            origin: "native",
            mergeKey:
              compositionId === null
                ? `native:${dirtyIds.values().next().value ?? "text"}`
                : `composition:${compositionId}`,
            ...(selection === null ? {} : { selectionAfter: selection }),
          }),
        textChanges,
      );
      if (!result.ok) {
        this.lastNativeCompositionHistoryId = null;
        rejectedMutation = true;
        this.cancelComposition(false);
        this.reportFault({
          code: "native_change_commit_failed",
          recoverable: false,
          reason: result.reason ?? result.code,
        });
      } else if (
        compositionId !== null &&
        this.composition?.id === compositionId
      ) {
        if (mergeWithPrevious) {
          this.document.history.mergeLast({
            mergeKey: `composition:${compositionId}`,
          });
        }
        this.lastNativeCompositionHistoryId = compositionId;
      } else {
        this.lastNativeCompositionHistoryId = null;
      }
    } else if (selection !== null) {
      this.restoreModelSelection(selection);
    }

    if (rejectedMutation) {
      if (
        this.composition !== null &&
        rejectedIds.has(this.composition.blockId)
      ) {
        this.reportFault({
          code: "input_state_lost",
          recoverable: true,
          reason: "The composing surface received an unowned structural change.",
        });
        this.cancelComposition(false);
      } else {
        this.refreshCompositionPin(this.document.value);
      }
      this.reportFault({
        code: "foreign_dom_mutation",
        recoverable: true,
        reason:
          "A DOM change outside the evidenced text surface was rejected and re-rendered.",
      });
      this.withDOMWrite(() => {
        this.renderDocument(this.document.value);
      });
      if (this.composition === null) {
        restoreDOMSelection(
          this.root,
          this.document.value,
          this.document.selection?.snapshot() ?? null,
        );
      }
    }
    this.refreshCompositionPin(this.document.value);
  }

  private restoreModelSelection(selection: SelectionSnap): void {
    const current = this.document.selection?.snapshot();
    if (
      current !== undefined &&
      JSON.stringify(current) !== JSON.stringify(selection)
    ) {
      this.document.selection?.restore(selection);
    }
  }

  private beginComposition(): void {
    this.clearNativeTurnTimer();
    if (this.composition !== null) {
      if (this.composition.ending) {
        this.settleComposition();
      } else if (this.inputTargetSelection !== null) {
        const targeted = orderedEditableSelection(
          this.document.value,
          this.document.selection,
        );
        if (
          targeted !== null &&
          targeted.start.blockId === targeted.end.blockId &&
          targeted.start.blockId === this.composition.blockId
        ) {
          this.composition.range = {
            from: targeted.start.offset,
            to: targeted.end.offset,
          };
          restoreDOMSelection(
            this.root,
            this.document.value,
            this.inputTargetSelection,
          );
          this.bump();
          return;
        }
        if (
          targeted !== null &&
          targeted.start.blockId === targeted.end.blockId
        ) {
          this.composition = null;
          this.phase = "idle";
        } else {
          this.setPhase("composing");
          return;
        }
      } else {
        this.setPhase("composing");
        return;
      }
    }
    this.flushNativeMutations([], true);
    const domSelection = this.root.ownerDocument.getSelection();
    const selection =
      this.inputTargetSelection ??
      readDOMSelection(this.root, this.document.value);
    if (selection !== null) {
      this.restoreModelSelection(selection);
    }
    const ordered = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    if (ordered !== null && ordered.start.blockId !== ordered.end.blockId) {
      this.openNativeTurn();
      return;
    }
    const focusPoint = primaryEditablePoint(
      this.document.value,
      this.document.selection,
    );
    const directSurface = editableSurfaceFromNode(
      this.root,
      domSelection?.focusNode ?? null,
    );
    const directBlockId = editableBlockFromNode(
      this.root,
      directSurface,
    )?.getAttribute(EDITABLE_BLOCK_ATTRIBUTE);
    const surface =
      directSurface !== null && directBlockId === focusPoint?.blockId
        ? directSurface
        : focusPoint === null
          ? null
          : this.findBlockElement(
              focusPoint.blockId,
            )?.querySelector<HTMLElement>(`[${EDITABLE_TEXT_ATTRIBUTE}]`) ?? null;
    if (ordered === null || surface === null) {
      this.reportFault({
        code: "input_state_lost",
        recoverable: true,
        reason: "Composition started without a mappable text selection.",
      });
      return;
    }

    let textNode: Text | null = null;
    this.withDOMWrite(() => {
      textNode = ensureCompositionTextNode(surface, domSelection?.focusNode ?? null);
    });
    if (textNode === null) {
      return;
    }
    const node = textNode as Text;
    this.composition = {
      id: ++this.compositionSequence,
      blockId: ordered.start.blockId,
      node,
      ancestors: ancestorsToRoot(node, this.root),
      range: { from: ordered.start.offset, to: ordered.end.offset },
      ending: false,
    };
    this.lastBeforeInputBlockId = ordered.start.blockId;
    if (domSelection?.focusNode !== node) {
      restoreDOMSelection(
        this.root,
        this.document.value,
        this.document.selection?.snapshot() ?? null,
      );
    }
    this.setPhase("composing");
  }

  private refreshCompositionPin(value: EditableDocumentValue): void {
    const session = this.composition;
    if (session === null) {
      return;
    }
    const index = findEditableBlockIndex(value, session.blockId);
    const block = value.blocks[index];
    const element = this.findBlockElement(session.blockId);
    const surface = element?.querySelector<HTMLElement>(
      `[${EDITABLE_TEXT_ATTRIBUTE}]`,
    );
    if (
      block !== undefined &&
      surface !== null &&
      surface !== undefined &&
      this.isCompositionPinIntact(surface)
    ) {
      return;
    }
    this.reportFault({
      code: "input_state_lost",
      recoverable: true,
      reason: "The pinned composition island lost its DOM identity.",
    });
    this.cancelComposition(false);
  }

  private isCompositionPinIntact(surface: HTMLElement): boolean {
    const session = this.composition;
    if (
      session === null ||
      !session.node.isConnected ||
      !this.root.contains(session.node) ||
      !surface.contains(session.node)
    ) {
      return false;
    }
    const currentAncestors = ancestorsToRoot(session.node, this.root);
    return (
      currentAncestors.length === session.ancestors.length &&
      currentAncestors.every(
        (ancestor, index) => ancestor === session.ancestors[index],
      ) &&
      currentAncestors[currentAncestors.length - 1] === this.root
    );
  }

  private endComposition(): void {
    if (this.composition === null) {
      this.setPhase("idle");
      return;
    }
    this.flushNativeMutations([], true);
    if (this.composition === null) {
      this.reportFault({
        code: "input_state_lost",
        recoverable: true,
        reason: "Composition ended after its pinned DOM identity was lost.",
      });
      this.setPhase("idle");
      return;
    }
    this.composition.ending = true;
    this.setPhase("settling");
    this.scheduleSettle();
  }

  private scheduleSettle(): void {
    this.clearSettleTimer();
    const view = this.root.ownerDocument.defaultView;
    if (view === null) {
      this.settleComposition();
      return;
    }
    this.settleTimer = view.setTimeout(() => {
      this.settleTimer = null;
      this.settleComposition();
    }, 30);
  }

  private settleComposition(): void {
    this.clearSettleTimer();
    const session = this.composition;
    if (session === null) {
      this.setPhase("idle");
      return;
    }
    this.flushNativeMutations([], true);
    const selection = readDOMSelection(this.root, this.document.value);
    if (selection !== null) {
      this.restoreModelSelection(selection);
    }
    const blockId = session.blockId;
    this.composition = null;
    this.lastBeforeInputBlockId = null;
    this.nativeEvidenceUntil = 0;
    this.setPhase("idle");
    this.withDOMWrite(() => {
      this.renderDocument(this.document.value, blockId);
    });
    this.flushQueuedRemotePatches();
    restoreDOMSelection(
      this.root,
      this.document.value,
      this.document.selection?.snapshot() ?? null,
    );
  }

  private cancelComposition(report: boolean, reason?: string): void {
    if (this.composition === null) {
      return;
    }
    this.clearSettleTimer();
    this.composition = null;
    this.lastBeforeInputBlockId = null;
    this.nativeEvidenceUntil = 0;
    this.phase = "idle";
    this.bump();
    if (report) {
      this.reportFault({
        code: "composition_overlap",
        recoverable: true,
        reason: reason ?? "The active composition was canceled.",
      });
    }
    this.scheduleRemoteFlush();
  }

  private flushQueuedRemotePatches(): void {
    if (
      this.composition !== null ||
      this.destroyed ||
      this.queuedRemotePatches.length === 0
    ) {
      return;
    }
    const queued = this.queuedRemotePatches.splice(0);
    for (const entry of queued) {
      const result = this.runDocumentChange("remote", () =>
        this.document.commit(entry.patch, {
          label: entry.label,
          origin: "remote",
        }),
      );
      if (!result.ok) {
        this.reportFault({
          code: "queued_change_commit_failed",
          recoverable: true,
          reason: result.reason ?? result.code,
        });
      }
    }
    this.bump();
  }

  private scheduleRemoteFlush(): void {
    if (this.remoteFlushQueued || this.queuedRemotePatches.length === 0) {
      return;
    }
    this.remoteFlushQueued = true;
    queueMicrotask(() => {
      this.remoteFlushQueued = false;
      this.flushQueuedRemotePatches();
    });
  }

  private clearSettleTimer(): void {
    if (this.settleTimer === null) {
      return;
    }
    this.root.ownerDocument.defaultView?.clearTimeout(this.settleTimer);
    this.settleTimer = null;
  }

  private openNativeTurn(): void {
    this.clearNativeTurnTimer();
    this.nativeEvidenceUntil = performance.now() + 100;
    this.setPhase("native-input");
    const view = this.root.ownerDocument.defaultView;
    if (view === null) {
      return;
    }
    this.nativeTurnTimer = view.setTimeout(() => {
      this.nativeTurnTimer = null;
      if (this.composition === null) {
        const shouldRecoverDOM = this.pendingNativeIntent !== null;
        this.pendingNativeIntent = null;
        this.lastBeforeInputBlockId = null;
        this.nativeEvidenceUntil = 0;
        this.setPhase("idle");
        if (shouldRecoverDOM) {
          this.withDOMWrite(() => {
            this.renderDocument(this.document.value);
          });
        }
      }
    }, 120);
  }

  private commitPendingNativeIntent(): void {
    const intent = this.pendingNativeIntent;
    if (intent === null) {
      return;
    }
    this.pendingNativeIntent = null;
    this.pendingRecords = [];
    this.observer.takeRecords();
    this.restoreModelSelection(intent.selection);
    const result = this.replaceSelection(intent.text, intent.inputType, "native");
    if (!result.ok) {
      this.reportFault({
        code: "native_change_commit_failed",
        recoverable: false,
        reason: result.reason,
      });
      this.withDOMWrite(() => {
        this.renderDocument(this.document.value);
      });
    }
    this.closeNativeTurn();
    restoreDOMSelection(
      this.root,
      this.document.value,
      this.document.selection?.snapshot() ?? null,
    );
  }

  private closeNativeTurn(): void {
    this.clearNativeTurnTimer();
    this.lastBeforeInputBlockId = null;
    this.nativeEvidenceUntil = 0;
    this.pendingNativeIntent = null;
    this.inputTargetSelection = null;
    if (this.composition === null) {
      this.setPhase("idle");
    }
  }

  private clearNativeTurnTimer(): void {
    if (this.nativeTurnTimer === null) {
      return;
    }
    this.root.ownerDocument.defaultView?.clearTimeout(this.nativeTurnTimer);
    this.nativeTurnTimer = null;
  }

  private syncSelectionFromDOM(): void {
    const selection = readDOMSelection(this.root, this.document.value);
    if (selection !== null) {
      this.restoreModelSelection(selection);
    }
  }

  private selectionFromInputTarget(event: InputEvent): SelectionSnap | null {
    if (typeof event.getTargetRanges !== "function") {
      return null;
    }
    let target: StaticRange | undefined;
    try {
      target = event.getTargetRanges()[0];
    } catch {
      return null;
    }
    if (target === undefined) {
      return null;
    }
    const start = readDOMPoint(
      this.root,
      this.document.value,
      target.startContainer,
      target.startOffset,
    );
    const end = readDOMPoint(
      this.root,
      this.document.value,
      target.endContainer,
      target.endOffset,
    );
    if (start === null || end === null) {
      return null;
    }
    return selectionBetween(
      editableTextPath(start.blockIndex),
      start.offset,
      editableTextPath(end.blockIndex),
      end.offset,
    );
  }

  private attachEvents(): void {
    this.root.addEventListener("beforeinput", this.onBeforeInput);
    this.root.addEventListener("input", this.onInput);
    this.root.addEventListener("compositionstart", this.onCompositionStart);
    this.root.addEventListener("compositionupdate", this.onCompositionUpdate);
    this.root.addEventListener("compositionend", this.onCompositionEnd);
    this.root.addEventListener("paste", this.onPaste);
    this.root.addEventListener("cut", this.onCut);
    this.root.addEventListener("keydown", this.onKeyDown);
    this.root.addEventListener("blur", this.onBlur);
    this.root.ownerDocument.addEventListener(
      "selectionchange",
      this.onSelectionChange,
    );
  }

  private detachEvents(): void {
    this.root.removeEventListener("beforeinput", this.onBeforeInput);
    this.root.removeEventListener("input", this.onInput);
    this.root.removeEventListener("compositionstart", this.onCompositionStart);
    this.root.removeEventListener("compositionupdate", this.onCompositionUpdate);
    this.root.removeEventListener("compositionend", this.onCompositionEnd);
    this.root.removeEventListener("paste", this.onPaste);
    this.root.removeEventListener("cut", this.onCut);
    this.root.removeEventListener("keydown", this.onKeyDown);
    this.root.removeEventListener("blur", this.onBlur);
    this.root.ownerDocument.removeEventListener(
      "selectionchange",
      this.onSelectionChange,
    );
  }

  private readonly onBeforeInput = (rawEvent: Event): void => {
    const event = rawEvent as InputEvent;
    const targetSelection = isTextMutationInputType(event.inputType)
      ? this.selectionFromInputTarget(event)
      : null;
    if (targetSelection === null) {
      this.syncSelectionFromDOM();
    } else {
      this.inputTargetSelection = targetSelection;
      this.restoreModelSelection(targetSelection);
      queueMicrotask(() => {
        if (this.inputTargetSelection === targetSelection) {
          this.inputTargetSelection = null;
        }
      });
    }
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    this.lastBeforeInputBlockId = selection?.end.blockId ?? null;

    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      if (event.cancelable) {
        event.preventDefault();
        this.dispatch({
          type: event.inputType === "historyUndo" ? "undo" : "redo",
        });
        this.closeNativeTurn();
      } else {
        this.openNativeTurn();
      }
      return;
    }

    if (
      selection !== null &&
      selection.start.blockId !== selection.end.blockId &&
      isTextMutationInputType(event.inputType) &&
      (!event.cancelable || isCompositionInputType(event.inputType)) &&
      (!event.inputType.startsWith("insert") || event.data !== null)
    ) {
      const snapshot = this.document.selection?.snapshot();
      if (snapshot !== undefined) {
        this.cancelComposition(false);
        this.pendingNativeIntent = {
          selection: snapshot,
          text: event.inputType.startsWith("insert") ? (event.data ?? "") : "",
          inputType: event.inputType,
        };
        this.openNativeTurn();
        return;
      }
    }

    if (event.inputType === "insertFromComposition") {
      this.nativeEvidenceUntil = performance.now() + 100;
      if (this.composition === null) {
        this.openNativeTurn();
      }
      return;
    }

    if (event.isComposing || isCompositionInputType(event.inputType)) {
      this.nativeEvidenceUntil = performance.now() + 100;
      this.beginComposition();
      return;
    }

    if (
      (event.inputType === "insertParagraph" ||
        event.inputType === "insertLineBreak")
    ) {
      if (event.cancelable) {
        event.preventDefault();
        this.dispatch({ type: "insertParagraph" });
        this.closeNativeTurn();
      } else {
        this.openNativeTurn();
      }
      return;
    }

    if (!event.cancelable) {
      this.openNativeTurn();
      return;
    }

    if (
      (event.inputType === "insertText" ||
        event.inputType === "insertReplacementText") &&
      event.data !== null &&
      selection !== null
    ) {
      event.preventDefault();
      this.dispatch({
        type: "replaceSelection",
        text: event.data,
        label: event.inputType,
      });
      this.closeNativeTurn();
      return;
    }

    if (event.inputType === "deleteContentBackward" && selection !== null) {
      event.preventDefault();
      this.dispatch({ type: "deleteBackward" });
      this.closeNativeTurn();
      return;
    }

    if (event.inputType === "deleteContentForward" && selection !== null) {
      event.preventDefault();
      this.dispatch({ type: "deleteForward" });
      this.closeNativeTurn();
      return;
    }

    if (
      selection !== null &&
      selection.start.blockId !== selection.end.blockId &&
      isTextMutationInputType(event.inputType)
    ) {
      event.preventDefault();
      this.dispatch({
        type: "replaceSelection",
        text: event.inputType.startsWith("insert") ? (event.data ?? "") : "",
        label: event.inputType,
      });
      this.closeNativeTurn();
      return;
    }

    this.openNativeTurn();
  };

  private readonly onInput = (rawEvent: Event): void => {
    const event = rawEvent as InputEvent;
    this.inputTargetSelection = null;
    if (this.pendingNativeIntent !== null) {
      this.commitPendingNativeIntent();
      return;
    }
    this.nativeEvidenceUntil = performance.now() + 100;
    if (event.isComposing && this.composition === null) {
      this.beginComposition();
    }
    this.flushNativeMutations([], true);
    if (this.composition === null) {
      this.closeNativeTurn();
    } else if (
      !event.isComposing &&
      (this.composition.ending || event.inputType === "insertFromComposition")
    ) {
      this.composition.ending = true;
      this.setPhase("settling");
      this.scheduleSettle();
    } else {
      this.setPhase("composing");
    }
  };

  private readonly onCompositionStart = (): void => {
    this.nativeEvidenceUntil = performance.now() + 100;
    if (this.pendingNativeIntent !== null) {
      return;
    }
    this.beginComposition();
  };

  private readonly onCompositionUpdate = (): void => {
    this.nativeEvidenceUntil = performance.now() + 100;
    if (this.pendingNativeIntent !== null) {
      return;
    }
    this.beginComposition();
  };

  private readonly onCompositionEnd = (): void => {
    this.nativeEvidenceUntil = performance.now() + 100;
    this.endComposition();
  };

  private readonly onPaste = (event: ClipboardEvent): void => {
    const text = event.clipboardData?.getData("text/plain");
    if (text === undefined) {
      return;
    }
    event.preventDefault();
    this.syncSelectionFromDOM();
    this.dispatch({ type: "replaceSelection", text, label: "paste" });
  };

  private readonly onCut = (event: ClipboardEvent): void => {
    this.syncSelectionFromDOM();
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    if (selection === null) {
      return;
    }
    const selectedText = textForSelection(this.document.value, selection);
    if (event.clipboardData !== null) {
      event.clipboardData.setData("text/plain", selectedText);
    }
    event.preventDefault();
    this.dispatch({ type: "replaceSelection", text: "", label: "cut" });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key !== "z" && key !== "y") {
      return;
    }
    event.preventDefault();
    this.dispatch({
      type: key === "y" || (key === "z" && event.shiftKey) ? "redo" : "undo",
    });
  };

  private readonly onSelectionChange = (): void => {
    if (this.destroyed) {
      return;
    }
    this.syncSelectionFromDOM();
  };

  private readonly onBlur = (): void => {
    if (this.composition === null) {
      this.closeNativeTurn();
    } else {
      this.endComposition();
    }
  };

  private findBlockElement(blockId: string): HTMLElement | null {
    return (
      Array.from(
        this.root.querySelectorAll<HTMLElement>(`[${EDITABLE_BLOCK_ATTRIBUTE}]`),
      ).find(
        (element) => element.getAttribute(EDITABLE_BLOCK_ATTRIBUTE) === blockId,
      ) ?? null
    );
  }

  private createBlockId(): string {
    let id: string;
    do {
      id = `${this.ownerId}-block-${++this.blockSequence}`;
    } while (findEditableBlockIndex(this.document.value, id) >= 0);
    return id;
  }

  private observe(): void {
    this.observer.observe(this.root, {
      attributes: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
      subtree: true,
    });
  }

  private withDOMWrite(write: () => void): void {
    const outermost = this.domWriteDepth === 0;
    this.domWriteDepth += 1;
    if (outermost) {
      const pending = this.observer.takeRecords();
      if (pending.length > 0) {
        this.pendingRecords.push(...pending);
      }
      this.observer.disconnect();
    }
    try {
      write();
    } finally {
      this.domWriteDepth -= 1;
      if (outermost && !this.destroyed) {
        this.observer.takeRecords();
        this.observe();
        if (this.pendingRecords.length > 0) {
          this.queueMutationFlush();
        }
      }
    }
  }

  private setPhase(phase: EditorPhase): void {
    if (this.phase === phase) {
      return;
    }
    this.phase = phase;
    this.bump();
  }

  private bump(): void {
    this.revision += 1;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) {
      listener(snapshot);
    }
  }

  private reportFault(fault: EditorFault): void {
    this.onFault?.(fault);
  }
}

function describeBlockChanges(
  before: EditableDocumentValue,
  after: EditableDocumentValue,
  exactTextChanges: ReadonlyMap<string, TextChange> | null,
): BlockChange[] {
  const beforeById = new Map(before.blocks.map((block) => [block.id, block]));
  const afterById = new Map(after.blocks.map((block) => [block.id, block]));
  const ids = new Set([...beforeById.keys(), ...afterById.keys()]);
  const changes: BlockChange[] = [];
  for (const blockId of ids) {
    const beforeBlock = beforeById.get(blockId) ?? null;
    const afterBlock = afterById.get(blockId) ?? null;
    const text =
      beforeBlock === null || afterBlock === null
        ? null
        : exactTextChanges?.get(blockId) ??
          diffText(beforeBlock.text, afterBlock.text);
    const typeChanged =
      beforeBlock !== null &&
      afterBlock !== null &&
      beforeBlock.type !== afterBlock.type;
    if (beforeBlock === null || afterBlock === null || text !== null || typeChanged) {
      changes.push({ blockId, after: afterBlock, text, typeChanged });
    }
  }
  return changes;
}

function blockTagName(type: EditableBlockType): "p" | "h1" | "blockquote" | "pre" {
  switch (type) {
    case "heading":
      return "h1";
    case "quote":
      return "blockquote";
    case "code":
      return "pre";
    case "paragraph":
      return "p";
  }
}

function sourceFromOrigin(origin: string | undefined): ChangeSource {
  return origin === "remote" ? "remote" : "app";
}

function actionOrigin(action: EditorAction): string | undefined {
  return "origin" in action ? action.origin : undefined;
}

function selectionAt(path: string, offset: number): SelectionSnap {
  return selectionBetween(path, offset, path, offset);
}

function selectionBetween(
  anchorPath: string,
  anchorOffset: number,
  focusPath: string,
  focusOffset: number,
): SelectionSnap {
  const anchor = { path: anchorPath, offset: anchorOffset };
  const focus = { path: focusPath, offset: focusOffset };
  return {
    selectedPointers: [],
    selectionRanges: [{ anchor, focus }],
    primaryIndex: 0,
    anchor,
    focus,
  };
}

function textForSelection(
  value: EditableDocumentValue,
  selection: NonNullable<ReturnType<typeof orderedEditableSelection>>,
): string {
  if (selection.start.blockIndex === selection.end.blockIndex) {
    const block = value.blocks[selection.start.blockIndex];
    return block?.text.slice(selection.start.offset, selection.end.offset) ?? "";
  }
  const parts: string[] = [];
  for (
    let index = selection.start.blockIndex;
    index <= selection.end.blockIndex;
    index += 1
  ) {
    const block = value.blocks[index];
    if (block === undefined) {
      continue;
    }
    if (index === selection.start.blockIndex) {
      parts.push(block.text.slice(selection.start.offset));
    } else if (index === selection.end.blockIndex) {
      parts.push(block.text.slice(0, selection.end.offset));
    } else {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}

function isTextMutationInputType(inputType: string): boolean {
  return inputType.startsWith("insert") || inputType.startsWith("delete");
}

function isCompositionInputType(inputType: string): boolean {
  return (
    inputType === "insertCompositionText" ||
    inputType === "deleteCompositionText"
  );
}

function previousGraphemeBoundary(value: string, offset: number): number {
  let previous = 0;
  for (const segment of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(value)) {
    if (segment.index >= offset) {
      break;
    }
    previous = segment.index;
  }
  return previous;
}

function nextGraphemeBoundary(value: string, offset: number): number {
  for (const segment of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(value)) {
    if (segment.index > offset) {
      return segment.index;
    }
  }
  return value.length;
}

function isAdmittedTextMutation(
  record: MutationRecord,
  surface: HTMLElement,
): boolean {
  if (record.type === "characterData") {
    return record.target.nodeType === 3 && surface.contains(record.target);
  }
  if (record.type !== "childList" || record.target !== surface) {
    return false;
  }
  return [...record.addedNodes, ...record.removedNodes].every(
    (node) =>
      node.nodeType === 3 ||
      (node.nodeType === 1 &&
        (node as HTMLElement).tagName === "BR" &&
        (node as HTMLElement).hasAttribute(EDITABLE_PLACEHOLDER_ATTRIBUTE)),
  );
}

function isNativeEmptyBlock(element: HTMLElement): boolean {
  return Array.from(element.childNodes).every(
    (node) =>
      (node.nodeType === 3 && (node.textContent ?? "") === "") ||
      (node.nodeType === 1 && (node as HTMLElement).tagName === "BR"),
  );
}

function ancestorsToRoot(node: Node, root: HTMLElement): Node[] {
  const ancestors: Node[] = [];
  for (let current: Node | null = node; current !== null; current = current.parentNode) {
    ancestors.push(current);
    if (current === root) {
      break;
    }
  }
  return ancestors;
}

function success(
  change: Extract<EditorResult, { ok: true }>["change"],
  patch: ReadonlyArray<JSONPatchOperation>,
): EditorResult {
  return { ok: true, change, patch };
}

function failure(
  code: Extract<EditorResult, { ok: false }>["code"],
  reason: string,
): EditorResult {
  return { ok: false, code, reason };
}
