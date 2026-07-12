import {
  applyPatch,
  type JSONChangeMetadata,
  type JSONDocument,
  type JSONPatchOperation,
  type SelectionSnap,
} from "@interactive-os/json-document";
import {
  EditableDocumentSchema,
  accumulateNativeCompositionRange,
  diffText,
  diffTextNearRange,
  editableTextPath,
  findEditableBlockIndex,
  orderedEditableSelection,
  planEditorCommand,
  primaryEditablePoint,
  type EditableBlock,
  type EditableDocumentValue,
  type EditorDocumentCommand,
  type TextChange,
  type TextRange,
} from "../core";
import type {
  EditorAction,
  EditorFault,
  EditorPhase,
  EditorResult,
  EditorSnapshot,
  JsonEditable,
  JsonEditableDocumentHost,
  MountJsonEditableOptions,
} from "./editor";
import {
  readDOMPoint,
  readDOMSelection,
  restoreDOMSelection,
} from "./domSelection";
import {
  EDITABLE_BLOCK_ATTRIBUTE,
  EDITABLE_TEXT_ATTRIBUTE,
  editableBlockFromNode,
  editableSurfaceFromNode,
  ensureCompositionTextNode,
} from "./editableDOM";
import {
  findBlockElement,
  isCanonicalBlockElement,
  isCanonicalSurfaceElement,
  projectDocumentDOM,
} from "./documentProjection";
import {
  captureCompositionPlaceholder,
  inspectNativeParagraphEffect,
  readPinnedCompositionText,
  type NativeParagraphEffect,
} from "./nativeParagraph";
import { inspectNativeTextMutations } from "./nativeTextMutation";

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
  sourceElement: HTMLElement;
  sourceSurface: HTMLElement;
  sourcePlaceholder: HTMLBRElement | null;
  blockElements: ReadonlyArray<HTMLElement>;
  range: TextRange;
  ending: boolean;
};

type PendingNativeIntent = {
  selection: SelectionSnap;
  text: string;
  inputType: string;
};

type PendingStructuralIntent = {
  compositionId: number;
  mode: "deferred-command" | "native-fallback";
  paragraphCount: number;
  unmatchedBeforeInputCount: number;
  compositionEndEvidencePending: boolean;
  blockId: string;
  sourceElement: HTMLElement;
  sourceSurface: HTMLElement;
  sourceText: Text;
  sourcePlaceholder: HTMLBRElement | null;
  blockElements: ReadonlyArray<HTMLElement>;
  splitOffset: number;
  canonicalText: string;
  selection: SelectionSnap;
  selectionIsAuthoritative: boolean;
  normalizeTrailingLineBreak: boolean;
  nativeRecords: MutationRecord[];
};

type StructuralEvidence = "beforeinput" | "input" | "compositionend";

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

type ReadyDocumentChange = {
  id: string;
  publicationCount: number;
};

const OWNED_HOST_ATTRIBUTES = [
  "contenteditable",
  "spellcheck",
  "tabindex",
  "role",
  "aria-multiline",
] as const;

let editorSequence = 0;
const documentHosts = new WeakMap<JsonEditable, JsonEditableDocumentHost>();

export function getJsonEditableDocumentHost(
  editor: JsonEditable,
): JsonEditableDocumentHost {
  const host = documentHosts.get(editor);
  if (host === undefined) {
    throw new TypeError("The editor was not created by mountJsonEditable().");
  }
  return host;
}

export function mountJsonEditable(
  options: MountJsonEditableOptions,
): JsonEditable {
  return new JsonEditableCoordinator(options);
}

class JsonEditableCoordinator implements JsonEditable {
  private readonly documentHost: JsonEditableDocumentHost = {
    ownsPublication: () => {
      const sequence = this.activeDocumentPublicationSequence;
      return sequence === null ? false : { sequence };
    },
    runReady: (request) => this.runReadyDocumentChange(request),
  };

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
  private browserCompositionActive = false;
  private browserCompositionGeneration = 0;
  private compositionSequence = 0;
  private blockSequence = 0;
  private settleTimer: number | null = null;
  private nativeTurnTimer: number | null = null;
  private commitSource: ChangeSource | null = null;
  private commitTextChanges: ReadonlyMap<string, TextChange> | null = null;
  private documentPublicationSequence = 0;
  private activeDocumentPublicationSequence: number | null = null;
  private readyDocumentChange: ReadyDocumentChange | null = null;
  private lastNativeCompositionHistoryId: number | null = null;
  private dispatching = false;
  private destroyed = false;
  private browserEventDepth = 0;
  private domWriteDepth = 0;
  private pendingRecords: MutationRecord[] = [];
  private mutationFlushQueued = false;
  private lastBeforeInputBlockId: string | null = null;
  private nativeEvidenceUntil = 0;
  private pendingNativeIntent: PendingNativeIntent | null = null;
  private pendingStructuralIntent: PendingStructuralIntent | null = null;
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

    this.stopDocumentSubscription = document.subscribe((_operations, metadata) => {
      this.onDocumentChange(metadata);
    });
    this.stopSelectionSubscription =
      document.selection?.subscribe(() => {
        this.bump();
      }) ?? null;
    documentHosts.set(this, this.documentHost);
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
    if (this.pendingNativeIntent !== null) {
      this.commitPendingNativeIntent();
    }
    if (this.composition === null) {
      this.flushNativeMutations([], this.phase !== "idle");
    } else {
      this.settleComposition();
    }
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
    this.pendingStructuralIntent = null;
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
        return this.applyDocumentCommand(action);
      case "replaceSelection":
        return this.applyDocumentCommand(action);
      case "setBlockType":
        return this.applyDocumentCommand(action);
      case "insertParagraph":
        return this.applyDocumentCommand(action);
      case "deleteBackward":
        return this.applyDocumentCommand(action);
      case "deleteForward":
        return this.applyDocumentCommand(action);
      case "joinBackward":
        return this.applyDocumentCommand(action);
      case "joinForward":
        return this.applyDocumentCommand(action);
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

  private applyDocumentCommand(
    action: EditorDocumentCommand,
    sourceOverride?: ChangeSource,
  ): EditorResult {
    const plan = planEditorCommand(
      this.document.value,
      this.document.selection?.snapshot() ?? null,
      action,
      () => this.createBlockId(),
    );
    switch (plan.kind) {
      case "none":
        return success("none", []);
      case "failure":
        return failure(plan.code, plan.reason);
      case "commit":
        return this.commitPatch(
          plan.patch,
          plan.label,
          sourceOverride ?? plan.source,
          plan.selectionAfter,
        );
    }
  }

  private replaceSelection(
    text: string,
    label: string,
    source: ChangeSource,
  ): EditorResult {
    return this.applyDocumentCommand(
      { type: "replaceSelection", text, label },
      source,
    );
  }

  private insertParagraph(): EditorResult {
    return this.applyDocumentCommand({ type: "insertParagraph" });
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
    const previousPublicationSequence =
      this.activeDocumentPublicationSequence;
    const publicationSequence = this.reserveDocumentPublicationSequence();
    this.activeDocumentPublicationSequence = publicationSequence;
    this.commitSource = source;
    this.commitTextChanges = textChanges;
    try {
      return change();
    } finally {
      this.commitSource = previousSource;
      this.commitTextChanges = previousTextChanges;
      this.activeDocumentPublicationSequence = previousPublicationSequence;
    }
  }

  private runReadyDocumentChange(
    request: Parameters<JsonEditableDocumentHost["runReady"]>[0],
  ): ReturnType<JsonEditableDocumentHost["runReady"]> {
    if (this.destroyed) {
      throw new Error("The editor has been destroyed.");
    }
    if (this.dispatching) {
      return {
        ok: false,
        code: "host_not_ready",
        reason: "The editor is already dispatching a document transaction.",
      };
    }
    if (
      this.browserEventDepth > 0 ||
      this.activeDocumentPublicationSequence !== null
    ) {
      return {
        ok: false,
        code: "host_not_ready",
        reason:
          "The editor is still handling a browser event or publishing a document change.",
      };
    }

    this.dispatching = true;
    try {
      const enteredReady = this.canApplyReadyDocumentChange();
      this.flushNativeMutations([], false);
      if (this.destroyed) {
        throw new Error(
          "The editor was destroyed while preparing a ready document change.",
        );
      }
      if (!enteredReady || !this.canApplyReadyDocumentChange()) {
        return {
          ok: false,
          code: "host_not_ready",
          reason:
            "The editor must settle native input and composition before applying this document change.",
        };
      }

      const readyChange: ReadyDocumentChange = {
        id: request.id,
        publicationCount: 0,
      };
      const previousPublicationSequence =
        this.activeDocumentPublicationSequence;
      this.activeDocumentPublicationSequence =
        this.reserveDocumentPublicationSequence();
      this.readyDocumentChange = readyChange;
      const selectionBefore = selectionSnapshotSignature(
        this.document.selection?.snapshot() ?? null,
      );
      let didThrow = false;
      let thrown: unknown;
      try {
        request.apply();
      } catch (error) {
        didThrow = true;
        thrown = error;
      } finally {
        this.readyDocumentChange = null;
        this.activeDocumentPublicationSequence = previousPublicationSequence;
      }
      const selectionChanged =
        selectionSnapshotSignature(
          this.document.selection?.snapshot() ?? null,
        ) !== selectionBefore;

      if (
        !this.destroyed &&
        this.composition === null &&
        (readyChange.publicationCount > 0 || selectionChanged)
      ) {
        try {
          restoreDOMSelection(
            this.root,
            this.document.value,
            this.document.selection?.snapshot() ?? null,
          );
        } catch (error) {
          if (!didThrow) {
            throw error;
          }
        }
      }
      if (didThrow) {
        throw thrown;
      }
      return { ok: true };
    } finally {
      this.dispatching = false;
    }
  }

  private canApplyReadyDocumentChange(): boolean {
    return (
      this.phase === "idle" &&
      !this.destroyed &&
      this.browserEventDepth === 0 &&
      this.activeDocumentPublicationSequence === null &&
      !this.browserCompositionActive &&
      this.composition === null &&
      this.pendingNativeIntent === null &&
      this.pendingStructuralIntent === null &&
      this.queuedRemotePatches.length === 0
    );
  }

  private onDocumentChange(metadata?: JSONChangeMetadata): void {
    const before = this.lastValue;
    const after = this.document.value;
    const source = this.documentChangeSource(metadata);
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

  private documentChangeSource(metadata?: JSONChangeMetadata): ChangeSource {
    if (this.commitSource !== null) {
      return this.commitSource;
    }
    const readyChange = this.readyDocumentChange;
    if (readyChange === null) {
      return "external";
    }
    readyChange.publicationCount += 1;
    return readyChange.publicationCount === 1 &&
      metadata?.mergeKey === readyChange.id
      ? "remote"
      : "external";
  }

  private reserveDocumentPublicationSequence(): number {
    const sequence = this.documentPublicationSequence + 1;
    if (!Number.isSafeInteger(sequence)) {
      throw new Error("The editor document publication sequence is exhausted.");
    }
    this.documentPublicationSequence = sequence;
    return sequence;
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
    const composition = this.composition;
    projectDocumentDOM({
      root: this.root,
      value,
      composition:
        composition === null
          ? null
          : {
              blockId: composition.blockId,
              node: composition.node,
              isPinIntact: (surface) => this.isCompositionPinIntact(surface),
              invalidate: (reason) => this.cancelComposition(true, reason),
            },
      ...(forceCanonicalBlockId === undefined ? {} : { forceCanonicalBlockId }),
    });
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

  private handlePendingNativeParagraphMutations(
    records: ReadonlyArray<MutationRecord>,
    _nativeEvidence: boolean,
  ): boolean {
    const intent = this.pendingStructuralIntent;
    if (intent === null || intent.mode !== "native-fallback") {
      return false;
    }
    if (records.length > 0) {
      intent.nativeRecords.push(...records);
    }
    return true;
  }

  private expectedNativeParagraphEffect(
    intent: PendingStructuralIntent,
    session: CompositionSession,
  ): NativeParagraphEffect | null {
    if (this.composition !== session) {
      return null;
    }
    return inspectNativeParagraphEffect({
      root: this.root,
      value: this.document.value,
      intent,
      session,
      isCompositionPinIntact: (surface) =>
        this.isCompositionPinIntact(surface),
    });
  }

  private finalizePendingNativeParagraphEffect(
    session: CompositionSession,
  ): boolean {
    const intent = this.pendingStructuralIntent;
    if (
      intent === null ||
      intent.compositionId !== session.id ||
      intent.mode !== "native-fallback"
    ) {
      return true;
    }
    const effect = this.expectedNativeParagraphEffect(intent, session);
    if (effect !== null) {
      return this.commitNativeParagraphEffect(session, intent, effect);
    }
    if (
      intent.nativeRecords.length === 0 &&
      this.isCanonicalParagraphDOM(intent)
    ) {
      return true;
    }
    this.rejectPendingNativeParagraphMutation(
      "The native paragraph effect exceeded its one-shot structural intent.",
    );
    return false;
  }

  private commitNativeParagraphEffect(
    session: CompositionSession,
    intent: PendingStructuralIntent,
    effect: NativeParagraphEffect,
  ): boolean {
    const index = findEditableBlockIndex(this.document.value, intent.blockId);
    const block = this.document.value.blocks[index];
    if (block === undefined || block.text !== intent.canonicalText) {
      this.rejectPendingNativeParagraphMutation(
        "The canonical paragraph changed before its native effect was settled.",
      );
      return false;
    }
    const selection = selectionAt(
      editableTextPath(index),
      effect.splitOffset,
    );
    if (effect.change !== null) {
      const mergeWithPrevious =
        this.lastNativeCompositionHistoryId === session.id;
      const result = this.runDocumentChange(
        "native",
        () =>
          this.document.commit(
            [
              {
                op: "replace",
                path: editableTextPath(index),
                value: effect.text,
              },
            ],
            {
              label: "IME composition",
              origin: "native",
              mergeKey: `composition:${session.id}`,
              selectionAfter: selection,
            },
          ),
        new Map([[intent.blockId, effect.change]]),
      );
      if (!result.ok) {
        this.reportFault({
          code: "native_change_commit_failed",
          recoverable: false,
          reason: result.reason ?? result.code,
        });
        this.cancelComposition(false);
        return false;
      }
      if (mergeWithPrevious) {
        this.document.history.mergeLast({
          mergeKey: `composition:${session.id}`,
        });
      }
      this.lastNativeCompositionHistoryId = session.id;
    }
    intent.canonicalText = effect.text;
    intent.splitOffset = effect.splitOffset;
    intent.selection = selection;
    intent.selectionIsAuthoritative = true;
    return true;
  }

  private isCanonicalParagraphDOM(intent: PendingStructuralIntent): boolean {
    const children = Array.from(this.root.children);
    return (
      children.length === intent.blockElements.length &&
      children.every((element, index) => element === intent.blockElements[index]) &&
      intent.sourceElement.childNodes.length === 1 &&
      intent.sourceElement.firstChild === intent.sourceSurface &&
      readPinnedCompositionText(intent) === intent.canonicalText &&
      isCanonicalBlockElement(
        intent.sourceElement,
        this.document.value,
        intent.blockId,
      ) &&
      isCanonicalSurfaceElement(
        intent.sourceSurface,
        this.document.value,
        intent.blockId,
      )
    );
  }

  private rejectPendingNativeParagraphMutation(reason: string): void {
    const intent = this.pendingStructuralIntent;
    this.pendingStructuralIntent = null;
    if (this.composition !== null) {
      this.reportFault({
        code: "input_state_lost",
        recoverable: true,
        reason,
      });
      this.cancelComposition(false);
    }
    this.reportFault({
      code: "foreign_dom_mutation",
      recoverable: true,
      reason,
    });
    this.withDOMWrite(() => {
      if (intent !== null) {
        this.restoreStructuralIntentBaseline(intent);
      }
      this.renderDocument(this.document.value);
    });
    restoreDOMSelection(
      this.root,
      this.document.value,
      this.document.selection?.snapshot() ?? null,
    );
  }

  private restoreStructuralIntentBaseline(
    intent: PendingStructuralIntent,
  ): void {
    this.restoreBlockIdentityBaseline(intent.blockElements);
    this.restoreCompositionSourceBaseline(
      intent.sourceElement,
      intent.sourceSurface,
      intent.sourceText,
    );
  }

  private restoreCompositionSessionBaseline(
    session: CompositionSession,
  ): void {
    this.restoreBlockIdentityBaseline(session.blockElements);
    this.restoreCompositionSourceBaseline(
      session.sourceElement,
      session.sourceSurface,
      session.node,
    );
  }

  private restoreCompositionSourceBaseline(
    sourceElement: HTMLElement,
    sourceSurface: HTMLElement,
    sourceText: Text,
  ): void {
    if (
      sourceElement.childNodes.length !== 1 ||
      sourceElement.firstChild !== sourceSurface
    ) {
      sourceElement.replaceChildren(sourceSurface);
    }
    if (
      sourceSurface.childNodes.length !== 1 ||
      sourceSurface.firstChild !== sourceText
    ) {
      sourceSurface.replaceChildren(sourceText);
    }
  }

  private restoreBlockIdentityBaseline(
    blockElements: ReadonlyArray<HTMLElement>,
  ): void {
    this.document.value.blocks.forEach((block, index) => {
      const expected = blockElements[index];
      if (expected === undefined) {
        return;
      }
      const current = findBlockElement(this.root, block.id);
      if (current !== expected) {
        current?.remove();
        this.root.insertBefore(expected, this.root.children[index] ?? null);
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

    if (this.pendingNativeIntent !== null) {
      return;
    }

    if (this.handlePendingNativeParagraphMutations(records, nativeEvidence)) {
      return;
    }

    const inspection = inspectNativeTextMutations({
      root: this.root,
      value: this.document.value,
      records,
      nativeEvidence,
      phase: this.phase,
      nativeEvidenceUntil: this.nativeEvidenceUntil,
      now: performance.now(),
      lastBeforeInputBlockId: this.lastBeforeInputBlockId,
      composition:
        this.composition === null
          ? null
          : {
              blockId: this.composition.blockId,
              range: this.composition.range,
            },
    });
    const {
      patch,
      textChanges,
      dirtyBlockIds: dirtyIds,
      rejectedBlockIds: rejectedIds,
    } = inspection;
    let rejectedMutation = inspection.rejected;

    const selection =
      this.inputTargetSelection ??
      readDOMSelection(this.root, this.document.value);
    if (!rejectedMutation && patch.length > 0) {
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
    } else if (!rejectedMutation && selection !== null) {
      this.restoreModelSelection(selection);
    }

    if (rejectedMutation) {
      const compositionBaseline = this.composition;
      if (
        this.composition !== null &&
        (rejectedIds.has(this.composition.blockId) ||
          dirtyIds.has(this.composition.blockId))
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
        if (compositionBaseline !== null) {
          this.restoreCompositionSessionBaseline(compositionBaseline);
        }
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
          : findBlockElement(
              this.root,
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
    const sourceElement = editableBlockFromNode(this.root, node);
    const blockElements = this.document.value.blocks.map((block) =>
      findBlockElement(this.root, block.id),
    );
    if (
      sourceElement === null ||
      blockElements.some((element) => element === null)
    ) {
      this.reportFault({
        code: "input_state_lost",
        recoverable: true,
        reason: "Composition started without a stable block identity baseline.",
      });
      return;
    }
    this.composition = {
      id: ++this.compositionSequence,
      blockId: ordered.start.blockId,
      node,
      ancestors: ancestorsToRoot(node, this.root),
      sourceElement,
      sourceSurface: surface,
      sourcePlaceholder: captureCompositionPlaceholder(surface, node),
      blockElements: blockElements as HTMLElement[],
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
    const element = findBlockElement(this.root, session.blockId);
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
      if (this.browserCompositionActive) {
        this.setPhase("settling");
        this.scheduleSettle();
      } else {
        this.setPhase("idle");
      }
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
    if (this.composition !== session) {
      this.flushQueuedRemotePatches();
      return;
    }
    if (!this.finalizePendingNativeParagraphEffect(session)) {
      this.flushQueuedRemotePatches();
      return;
    }
    this.normalizePendingCompositionLineBreak(session);
    if (this.composition !== session) {
      this.flushQueuedRemotePatches();
      return;
    }
    const pendingIntent = this.pendingStructuralIntent;
    const selection =
      pendingIntent?.compositionId === session.id &&
      pendingIntent.selectionIsAuthoritative
        ? pendingIntent.selection
        : readDOMSelection(this.root, this.document.value);
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
    this.flushPendingStructuralIntent(session.id, selection);
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
    this.pendingStructuralIntent = null;
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

  private rememberParagraphIntent(
    selection: SelectionSnap,
    splitOffset: number,
    mode: PendingStructuralIntent["mode"],
    evidence: StructuralEvidence,
    selectionIsAuthoritative = false,
  ): boolean {
    const session = this.composition;
    if (session === null) {
      return false;
    }
    const compositionId = session.id;
    const pending = this.pendingStructuralIntent;
    if (pending?.compositionId === compositionId) {
      if (evidence === "beforeinput") {
        pending.paragraphCount += 1;
        if (mode === "native-fallback") {
          pending.unmatchedBeforeInputCount += 1;
        }
      } else if (evidence === "input") {
        if (pending.unmatchedBeforeInputCount > 0) {
          pending.unmatchedBeforeInputCount -= 1;
          pending.compositionEndEvidencePending = false;
        } else if (pending.compositionEndEvidencePending) {
          pending.compositionEndEvidencePending = false;
        } else {
          pending.paragraphCount += 1;
        }
      } else {
        pending.compositionEndEvidencePending = true;
        pending.normalizeTrailingLineBreak = true;
      }
      if (selectionIsAuthoritative || !pending.selectionIsAuthoritative) {
        pending.selection = selection;
        pending.splitOffset = splitOffset;
        pending.selectionIsAuthoritative = selectionIsAuthoritative;
      }
      if (mode === "native-fallback") {
        pending.mode = mode;
      }
      return true;
    }
    const index = findEditableBlockIndex(this.document.value, session.blockId);
    const block = this.document.value.blocks[index];
    const sourceSurface = editableSurfaceFromNode(this.root, session.node);
    const sourceElement = editableBlockFromNode(this.root, session.node);
    if (
      block === undefined ||
      sourceSurface === null ||
      sourceElement === null ||
      sourceSurface !== session.sourceSurface ||
      sourceElement !== session.sourceElement ||
      !this.isCompositionPinIntact(sourceSurface) ||
      session.blockElements.length !== this.document.value.blocks.length
    ) {
      return false;
    }
    this.pendingStructuralIntent = {
      compositionId,
      mode,
      paragraphCount: 1,
      unmatchedBeforeInputCount:
        evidence === "beforeinput" && mode === "native-fallback" ? 1 : 0,
      compositionEndEvidencePending: evidence === "compositionend",
      blockId: session.blockId,
      sourceElement,
      sourceSurface,
      sourceText: session.node,
      sourcePlaceholder: session.sourcePlaceholder,
      blockElements: session.blockElements,
      splitOffset,
      canonicalText: block.text,
      selection,
      selectionIsAuthoritative,
      normalizeTrailingLineBreak: evidence === "compositionend",
      nativeRecords: [],
    };
    return true;
  }

  private normalizePendingCompositionLineBreak(
    session: CompositionSession,
  ): void {
    const intent = this.pendingStructuralIntent;
    if (
      intent === null ||
      intent.compositionId !== session.id ||
      !intent.normalizeTrailingLineBreak
    ) {
      return;
    }
    const index = findEditableBlockIndex(this.document.value, intent.blockId);
    const block = this.document.value.blocks[index];
    if (block === undefined) {
      return;
    }
    const rangeEnd = Math.min(session.range.to, block.text.length);
    const width = trailingLineBreakWidth(block.text, rangeEnd);
    const offset = rangeEnd - width;
    const selection = selectionAt(editableTextPath(index), offset);
    intent.splitOffset = offset;
    intent.selection = selection;
    intent.selectionIsAuthoritative = true;
    intent.normalizeTrailingLineBreak = false;
    if (width === 0) {
      return;
    }
    const text = block.text.slice(0, offset) + block.text.slice(offset + width);
    const change = diffTextNearRange(block.text, text, {
      from: offset,
      to: offset + width,
    });
    if (change === null) {
      return;
    }
    const mergeWithPrevious =
      this.lastNativeCompositionHistoryId === session.id;
    const result = this.runDocumentChange(
      "native",
      () =>
        this.document.commit(
          [{ op: "replace", path: editableTextPath(index), value: text }],
          {
            label: "IME composition",
            origin: "native",
            mergeKey: `composition:${session.id}`,
            selectionAfter: selection,
          },
        ),
      new Map([[intent.blockId, change]]),
    );
    if (!result.ok) {
      this.reportFault({
        code: "native_change_commit_failed",
        recoverable: false,
        reason: result.reason ?? result.code,
      });
      this.cancelComposition(false);
      return;
    }
    if (mergeWithPrevious) {
      this.document.history.mergeLast({
        mergeKey: `composition:${session.id}`,
      });
    }
    this.lastNativeCompositionHistoryId = session.id;
    intent.canonicalText = text;
  }

  private flushPendingStructuralIntent(
    compositionId: number,
    finalSelection: SelectionSnap | null,
  ): void {
    const intent = this.pendingStructuralIntent;
    this.pendingStructuralIntent = null;
    if (
      intent === null ||
      intent.compositionId !== compositionId ||
      this.destroyed
    ) {
      return;
    }
    this.restoreModelSelection(
      intent.selectionIsAuthoritative || intent.mode === "native-fallback"
        ? intent.selection
        : (finalSelection ?? intent.selection),
    );
    for (let index = 0; index < intent.paragraphCount; index += 1) {
      const result = this.insertParagraph();
      if (!result.ok) {
        this.reportFault({
          code: "native_change_commit_failed",
          recoverable: true,
          reason: result.reason,
        });
        return;
      }
    }
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
    this.root.addEventListener("beforeinput", this.guardedOnBeforeInput);
    this.root.addEventListener("input", this.guardedOnInput);
    this.root.addEventListener(
      "compositionstart",
      this.guardedOnCompositionStart,
    );
    this.root.addEventListener(
      "compositionupdate",
      this.guardedOnCompositionUpdate,
    );
    this.root.addEventListener("compositionend", this.guardedOnCompositionEnd);
    this.root.addEventListener("paste", this.guardedOnPaste);
    this.root.addEventListener("cut", this.guardedOnCut);
    this.root.addEventListener("keydown", this.guardedOnKeyDown);
    this.root.addEventListener("blur", this.guardedOnBlur);
    this.root.ownerDocument.addEventListener(
      "selectionchange",
      this.guardedOnSelectionChange,
    );
  }

  private detachEvents(): void {
    this.root.removeEventListener("beforeinput", this.guardedOnBeforeInput);
    this.root.removeEventListener("input", this.guardedOnInput);
    this.root.removeEventListener(
      "compositionstart",
      this.guardedOnCompositionStart,
    );
    this.root.removeEventListener(
      "compositionupdate",
      this.guardedOnCompositionUpdate,
    );
    this.root.removeEventListener("compositionend", this.guardedOnCompositionEnd);
    this.root.removeEventListener("paste", this.guardedOnPaste);
    this.root.removeEventListener("cut", this.guardedOnCut);
    this.root.removeEventListener("keydown", this.guardedOnKeyDown);
    this.root.removeEventListener("blur", this.guardedOnBlur);
    this.root.ownerDocument.removeEventListener(
      "selectionchange",
      this.guardedOnSelectionChange,
    );
  }

  private readonly guardedOnBeforeInput = (event: Event): void => {
    this.runBrowserEvent(() => this.onBeforeInput(event));
  };

  private readonly guardedOnInput = (event: Event): void => {
    this.runBrowserEvent(() => this.onInput(event));
  };

  private readonly guardedOnCompositionStart = (): void => {
    this.runBrowserEvent(this.onCompositionStart);
  };

  private readonly guardedOnCompositionUpdate = (): void => {
    this.runBrowserEvent(this.onCompositionUpdate);
  };

  private readonly guardedOnCompositionEnd = (event: Event): void => {
    this.runBrowserEvent(() => this.onCompositionEnd(event));
  };

  private readonly guardedOnPaste = (event: ClipboardEvent): void => {
    this.runBrowserEvent(() => this.onPaste(event));
  };

  private readonly guardedOnCut = (event: ClipboardEvent): void => {
    this.runBrowserEvent(() => this.onCut(event));
  };

  private readonly guardedOnKeyDown = (event: KeyboardEvent): void => {
    this.runBrowserEvent(() => this.onKeyDown(event));
  };

  private readonly guardedOnBlur = (): void => {
    this.runBrowserEvent(this.onBlur);
  };

  private readonly guardedOnSelectionChange = (): void => {
    this.runBrowserEvent(this.onSelectionChange);
  };

  private runBrowserEvent(run: () => void): void {
    this.browserEventDepth += 1;
    try {
      run();
    } finally {
      this.browserEventDepth -= 1;
    }
  }

  private readonly onBeforeInput = (rawEvent: Event): void => {
    const event = rawEvent as InputEvent;
    if (event.isComposing || isCompositionInputType(event.inputType)) {
      this.markBrowserCompositionActive();
    }
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

    if (
      event.inputType === "insertParagraph" ||
      event.inputType === "insertLineBreak"
    ) {
      if (event.isComposing && this.composition === null) {
        this.nativeEvidenceUntil = performance.now() + 100;
        this.beginComposition();
      }
      if (this.composition !== null) {
        this.flushNativeMutations([], true);
        if (this.captureParagraphIntent(
          event.cancelable ? "deferred-command" : "native-fallback",
          "beforeinput",
        )) {
          if (event.cancelable) {
            event.preventDefault();
          }
          this.endComposition();
          return;
        }
      }
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
    if (event.isComposing) {
      this.markBrowserCompositionActive();
    } else if (event.inputType === "insertFromComposition") {
      this.scheduleBrowserCompositionRelease();
    }
    this.inputTargetSelection = null;
    if (this.pendingNativeIntent !== null) {
      this.commitPendingNativeIntent();
      return;
    }
    this.nativeEvidenceUntil = performance.now() + 100;
    if (event.isComposing && this.composition === null) {
      this.beginComposition();
    }
    if (
      (event.inputType === "insertParagraph" ||
        event.inputType === "insertLineBreak") &&
      this.composition !== null
    ) {
      if (this.captureParagraphIntent("native-fallback", "input")) {
        this.endComposition();
      }
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

  private captureParagraphIntent(
    mode: PendingStructuralIntent["mode"],
    evidence: StructuralEvidence,
  ): boolean {
    const composition = this.composition;
    const selection = orderedEditableSelection(
      this.document.value,
      this.document.selection,
    );
    const snapshot = this.document.selection?.snapshot();
    return (
      composition !== null &&
      selection !== null &&
      selection.start.blockId === composition.blockId &&
      selection.end.blockId === composition.blockId &&
      selection.start.offset === selection.end.offset &&
      snapshot !== undefined &&
      this.rememberParagraphIntent(
        snapshot,
        selection.start.offset,
        mode,
        evidence,
      )
    );
  }

  private readonly onCompositionStart = (): void => {
    this.markBrowserCompositionActive();
    this.nativeEvidenceUntil = performance.now() + 100;
    if (this.pendingNativeIntent !== null) {
      return;
    }
    this.beginComposition();
  };

  private readonly onCompositionUpdate = (): void => {
    this.markBrowserCompositionActive();
    this.nativeEvidenceUntil = performance.now() + 100;
    if (this.pendingNativeIntent !== null) {
      return;
    }
    this.beginComposition();
  };

  private readonly onCompositionEnd = (rawEvent: Event): void => {
    const event = rawEvent as CompositionEvent;
    this.scheduleBrowserCompositionRelease();
    this.nativeEvidenceUntil = performance.now() + 100;
    const hasParagraphEvidence = hasTrailingLineBreak(event.data);
    let session = this.composition;
    if (hasParagraphEvidence && session !== null) {
      const index = findEditableBlockIndex(
        this.document.value,
        session.blockId,
      );
      const block = this.document.value.blocks[index];
      if (block !== undefined) {
        const offset = Math.min(session.range.to, block.text.length);
        this.rememberParagraphIntent(
          selectionAt(editableTextPath(index), offset),
          offset,
          this.root.children.length === this.document.value.blocks.length
            ? "deferred-command"
            : "native-fallback",
          "compositionend",
          true,
        );
      }
    }
    this.flushNativeMutations([], true);
    session = this.composition;
    if (hasParagraphEvidence && session !== null) {
      const index = findEditableBlockIndex(
        this.document.value,
        session.blockId,
      );
      const block = this.document.value.blocks[index];
      if (block !== undefined) {
        const rangeEnd = Math.min(session.range.to, block.text.length);
        const lineBreakWidth = trailingLineBreakWidth(block.text, rangeEnd);
        const offset = rangeEnd - lineBreakWidth;
        this.rememberParagraphIntent(
          selectionAt(editableTextPath(index), offset),
          offset,
          this.pendingStructuralIntent?.mode ?? "deferred-command",
          "compositionend",
          true,
        );
      }
    }
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
    this.scheduleBrowserCompositionRelease();
    if (this.composition === null) {
      this.closeNativeTurn();
    } else {
      this.endComposition();
    }
  };

  private markBrowserCompositionActive(): void {
    this.clearSettleTimer();
    this.browserCompositionGeneration += 1;
    this.browserCompositionActive = true;
  }

  private scheduleBrowserCompositionRelease(): void {
    if (!this.browserCompositionActive) {
      return;
    }
    const generation = this.browserCompositionGeneration;
    queueMicrotask(() => {
      if (
        !this.browserCompositionActive ||
        this.browserCompositionGeneration !== generation
      ) {
        return;
      }
      this.browserCompositionActive = false;
      if (!this.destroyed) {
        this.bump();
      }
    });
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
      try {
        listener(snapshot);
      } catch (error) {
        this.reportFault({
          code: "subscriber_failed",
          recoverable: true,
          reason: callbackFailureReason("Editor subscriber", error),
        });
      }
    }
  }

  private reportFault(fault: EditorFault): void {
    try {
      this.onFault?.(fault);
    } catch {
      // Fault observers cannot be allowed to interrupt document publication.
    }
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

function sourceFromOrigin(origin: string | undefined): ChangeSource {
  return origin === "remote" ? "remote" : "app";
}

function actionOrigin(action: EditorAction): string | undefined {
  return "origin" in action ? action.origin : undefined;
}

function selectionAt(path: string, offset: number): SelectionSnap {
  return selectionBetween(path, offset, path, offset);
}

function selectionSnapshotSignature(selection: SelectionSnap | null): string {
  return JSON.stringify(selection);
}

function callbackFailureReason(label: string, error: unknown): string {
  return error instanceof Error
    ? `${label} failed: ${error.message}`
    : `${label} failed with an unknown value.`;
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

function hasTrailingLineBreak(value: string): boolean {
  if (value.endsWith("\r\n")) {
    return true;
  }
  return value.endsWith("\n") || value.endsWith("\r");
}

function trailingLineBreakWidth(value: string, offset: number): number {
  const end = Math.max(0, Math.min(offset, value.length));
  if (end >= 2 && value.slice(end - 2, end) === "\r\n") {
    return 2;
  }
  return end >= 1 && (value[end - 1] === "\n" || value[end - 1] === "\r")
    ? 1
    : 0;
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
