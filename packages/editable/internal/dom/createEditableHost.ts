import type {
  JSONCapabilityResult,
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import { JSON_ATOM_ATTRIBUTE, JSON_TEXT_ATTRIBUTE } from "./contract";
import {
  edit,
  type EditIntent,
  type RichVisualLineSeed,
} from "../kernel";
import {
  createRichBlock,
  createRichDocument,
  RICH_DOCUMENT_SCHEMA,
  richAtomsPathForTextPath,
  richRangesPathForTextPath,
  richTextPathForBlock,
  type RichDocument,
} from "../model";
import type {
  EditableDispatchOptions,
  EditableHost,
  EditableUpdate,
  EditableHostOptions,
  FlushOptions,
  InternalClipboardResult,
  RichTextFragment,
  InternalEditableHost,
  InternalEditableHostOptions,
  InternalEditableRelatedPath,
  InternalSelectionIntent,
  InternalTextProjection,
  InternalEditableUpdate,
  InternalVisualLayout,
  InternalVisualLayoutSnapshot,
  VisualLayoutProvider,
} from "./contract";
import {
  atomReplacementPatches,
  atomSyncPatchesFromDOM,
} from "./internal/atoms";
import {
  isRichTextFragmentPayload,
  plainTextFromFragment,
  readBrowserJSONPayload,
  readDocumentClipboard,
  selectedFragment,
  writeBrowserClipboard,
} from "./internal/clipboard";
import {
  editableTextContent,
  findElementByAttribute,
} from "./internal/domText";
import {
  domToModelUpdate,
  modelToDomUpdate,
  type SelectionIntent,
} from "./internal/editFlow";
import type { NativeTextLease } from "./internal/editorContract";
import {
  editTurnPreventsDefault,
  editTurnResetsVerticalGoal,
  resolveEditTurn,
  type EditModelInstruction,
} from "./internal/editTurn";
import { readString } from "./internal/jsonDocument";
import {
  rangeReplacementPatches,
  rangeSyncPatchesFromTextChange,
} from "./internal/ranges";
import {
  chooseSelection,
  restoreDOMSelection,
  selectionFromDOM,
  selectionFromPoint,
  type TextOffsetMapper,
  textPointFromDOMSelection,
} from "./internal/selection";
import { changedRegionEnd } from "./internal/textDiff";
import { richVisualLineSeedsFromMeasuredLayout } from "./internal/visualLayout";

export { isRichTextFragmentPayload } from "./internal/clipboard";

type CommitTextOptions = FlushOptions & {
  resetVerticalGoal?: boolean;
};

export function createInternalEditableHost({
  atomAttribute = JSON_ATOM_ATTRIBUTE,
  atomsPath = null,
  document,
  rangesPath = null,
  root,
  textAttribute = JSON_TEXT_ATTRIBUTE,
  projection = null,
  visualLayout = null,
}: InternalEditableHostOptions): InternalEditableHost {
  let lease: NativeTextLease | null = null;
  let suppressNextCompositionCommit = false;
  let verticalGoalX: number | null = null;

  const textElementForPath = (path: Pointer): HTMLElement | null =>
    findElementByAttribute(root, textAttribute, path);

  const projectionForPath = (
    path: Pointer | null,
  ): InternalTextProjection | null =>
    path === null ? null : projection?.(path) ?? null;

  const offsetMapper: TextOffsetMapper = {
    editableOffsetToDocumentOffset(path, offset) {
      return (
        projectionForPath(path)?.editableOffsetToDocumentOffset(offset) ??
        offset
      );
    },
    documentOffsetToEditableOffset(path, offset) {
      return (
        projectionForPath(path)?.documentOffsetToEditableOffset(offset) ??
        offset
      );
    },
  };

  const beginLeaseFromDOM = (composing = false): NativeTextLease | null => {
    const point = textPointFromDOMSelection(
      root,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    if (point === null) {
      return lease;
    }

    const currentText = readString(document, point.path);
    if (!currentText.ok) {
      return lease;
    }

    lease = {
      surface: point.path,
      composing,
    };
    return lease;
  };

  const syncSelectionFromDOM = (): SelectionSnap | null => {
    const selection = selectionFromDOM(
      root,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    if (selection !== null) {
      document.selection?.restore(selection);
    }
    return selection;
  };

  const readVisualLayoutSnapshot = (): InternalVisualLayoutSnapshot =>
    visualLayout?.() ?? {
      ok: false,
      code: "visual_layout_stale",
      layout: null,
      reason: "Visual layout has not been measured.",
      revision: 0,
    };

  const commitTextFromDOM = (
    selectionIntent: SelectionIntent,
    options: CommitTextOptions = {},
  ): InternalEditableUpdate => {
    if (options.resetVerticalGoal !== false) {
      verticalGoalX = null;
    }
    const path =
      lease?.surface ??
      textPointFromDOMSelection(
        root,
        textAttribute,
        atomAttribute,
        offsetMapper,
      )?.path ??
      null;
    if (path === null) {
      const selection = syncSelectionFromDOM();
      return domToModelUpdate({
        kind: selection === null ? "no-change" : "selection",
        selection,
      });
    }

    const textElement = textElementForPath(path);
    if (textElement === null) {
      return {
        ok: false,
        code: "missing_text_path",
        reason: `No text element found for ${path}.`,
      };
    }

    const current = readString(document, path);
    if (!current.ok) {
      return current;
    }

    const editableText = editableTextContent(textElement, atomAttribute);
    const textProjection = projectionForPath(path);
    const nextText =
      textProjection?.editableTextToDocumentText(editableText) ?? editableText;
    const mappedSelection = selectionFromDOM(
      root,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    const previousSelection = document.selection?.snapshot() ?? null;
    const derivedCaret = selectionFromPoint({
      path,
      offset: changedRegionEnd(current.value, nextText),
    });
    const selectionAfter = chooseSelection(
      selectionIntent,
      mappedSelection,
      derivedCaret,
      previousSelection,
    );

    const atomSyncPatch = atomSyncPatchesFromDOM(
      document,
      relatedPath(atomsPath, path),
      textElement,
      atomAttribute,
      textProjection === null
        ? null
        : (offset) => textProjection.editableOffsetToDocumentOffset(offset),
    );
    const rangeSyncPatch = rangeSyncPatchesFromTextChange({
      document,
      nextText,
      previousText: current.value,
      rangesPath: relatedPath(rangesPath, path),
    });

    if (
      current.value === nextText &&
      atomSyncPatch.length === 0 &&
      rangeSyncPatch.length === 0
    ) {
      document.selection?.restore(selectionAfter);
      lease = null;
      return domToModelUpdate({
        kind: "selection",
        selection: selectionAfter,
      });
    }

    const projectionChange =
      textProjection?.applyTextChange?.({
        document: document as JSONDocument<RichDocument>,
        editableText,
        path,
        selection: selectionAfter,
      }) ?? null;
    if (projectionChange !== null) {
      if (!projectionChange.ok) {
        return {
          ok: false,
          code:
            projectionChange.code === "commit_failed"
              ? "commit_failed"
              : "commit_failed",
          reason: projectionChange.reason,
        };
      }
      if (
        projectionChange.kind === "no-change" ||
        projectionChange.patch.length === 0
      ) {
        if (projectionChange.selection !== null) {
          document.selection?.restore(projectionChange.selection);
        }
        lease = null;
        return domToModelUpdate({
          kind: "selection",
          selection: projectionChange.selection,
        });
      }
      const commit = document.commit(projectionChange.patch, {
        label: options.label ?? "contenteditable text",
        mergeKey: options.mergeKey,
        origin: "contenteditable",
        selectionAfter: projectionChange.selection ?? undefined,
      });
      if (!commit.ok) {
        return {
          ok: false,
          code: "commit_failed",
          reason: commit.reason ?? commit.code,
        };
      }

      lease = null;
      return domToModelUpdate({
        kind: "text",
        selection: projectionChange.selection,
        patch: projectionChange.patch,
      });
    }

    const patch: JSONPatchOperation[] = [
      { op: "replace", path, value: nextText },
      ...atomSyncPatch,
      ...rangeSyncPatch,
    ];
    const commit = document.commit(patch, {
      label: options.label ?? "contenteditable text",
      mergeKey: options.mergeKey,
      origin: "contenteditable",
      selectionAfter,
    });
    if (!commit.ok) {
      return {
        ok: false,
        code: "commit_failed",
        reason: commit.reason ?? commit.code,
      };
    }

    lease = null;
    return domToModelUpdate({
      kind: "text",
      selection: selectionAfter,
      patch,
    });
  };

  const flushDOMToModel = (options: FlushOptions = {}): InternalEditableUpdate =>
    commitTextFromDOM("range-command", {
      ...options,
      resetVerticalGoal: false,
    });

  const flushNativeTextForModelInstruction = (
    instruction: EditModelInstruction,
  ): InternalEditableUpdate => {
    const mergeKey = lease === null ? undefined : `native:${lease.surface}`;
    const committed = commitTextFromDOM("composition-commit", {
      label: `flush before ${modelInstructionLabel(instruction)}`,
      mergeKey,
    });
    if (!committed.ok) {
      return committed;
    }
    suppressNextCompositionCommit = true;
    if (instruction.type === "insertText") {
      return runModelInstructionAtCurrentSelection(instruction);
    }
    return domToModelUpdate({
      command: instruction.command,
      kind: committed.kind,
      patch: committed.patch,
      render: true,
      selection: committed.selection,
    });
  };

  const runModelInstructionAfterDOMFlush = (
    instruction: EditModelInstruction,
  ): InternalEditableUpdate => {
    const flushed = flushDOMToModel({
      label: `prepare ${modelInstructionLabel(instruction)}`,
    });
    if (!flushed.ok) {
      return flushed;
    }
    if (instruction.type === "command" && flushed.kind === "text") {
      verticalGoalX = null;
      return domToModelUpdate({
        command: instruction.command,
        kind: flushed.kind,
        patch: flushed.patch,
        render: true,
        selection: flushed.selection,
      });
    }
    return runModelInstructionAtCurrentSelection(instruction);
  };

  const copy = (event?: ClipboardEvent): InternalClipboardResult => {
    flushDOMToModel({ label: "copy selection" });
    const selection = document.selection?.snapshot() ?? null;
    const selectionPath = textPathFromSelection(selection);
    const fragment =
      selection === null
        ? null
        : selectedFragment(
            document,
            selection,
            relatedPath(atomsPath, selectionPath),
            relatedPath(rangesPath, selectionPath),
          );
    if (fragment !== null) {
      writeBrowserClipboard(event, fragment.plainText, fragment.payload);
      document.clipboard.write(fragment.payload, { trustedPayload: true });
      return {
        ok: true,
        value: document.value,
      };
    }

    return {
      ok: false,
      code: "empty_selection",
      reason: "No text or atom range is selected.",
    };
  };

  const cut = (event?: ClipboardEvent): InternalClipboardResult => {
    let result: InternalClipboardResult | null = null;
    document.history.transaction({ label: "cut", origin: "contenteditable" }, () => {
      const copyResult = copy(event);
      if (!copyResult.ok) {
        result = copyResult;
        return;
      }

      const textPatch = document.selection?.textPatch("");
      if (textPatch?.ok) {
        const selection = document.selection?.snapshot() ?? null;
        const selectionPath = textPathFromSelection(selection);
        const atomPatch = atomReplacementPatches({
          atomsPath: relatedPath(atomsPath, selectionPath),
          document,
          insertedAtoms: null,
          insertedTextLength: 0,
          selection,
        });
        const rangePatch = rangeReplacementPatches({
          document,
          insertedRanges: null,
          insertedTextLength: 0,
          rangesPath: relatedPath(rangesPath, selectionPath),
          selection,
        });
        const commit = document.commit(
          [...textPatch.patch, ...atomPatch, ...rangePatch],
          {
            label: "cut text",
            origin: "contenteditable",
            selectionAfter: textPatch.selection,
          },
        );
        result = commit.ok
          ? { ok: true, value: document.value }
          : {
              ok: false,
              code: "invalid_payload",
              reason: commit.reason ?? commit.code,
            };
        return;
      }

      result = {
        ok: false,
        code: "empty_selection",
        reason: "No text or atom range was cut.",
      };
    });

    return (
      result ?? {
        ok: false,
        code: "empty_selection",
        reason: "Nothing was cut.",
      }
    );
  };

  const pastePayload = ({
    clipboardText,
    jsonPayload,
    selection,
  }: {
    clipboardText: string;
    jsonPayload: unknown | null;
    selection?: SelectionSnap | null;
  }): InternalClipboardResult => {
    let result: InternalClipboardResult | null = null;
    document.history.transaction(
      { label: "paste", origin: "contenteditable" },
      () => {
        flushDOMToModel({ label: "prepare paste" });
        if (selection !== undefined && selection !== null) {
          document.selection?.restore(selection);
        }

        if (jsonPayload !== null) {
          const write = document.clipboard.write(jsonPayload, {
            trustedPayload: true,
          });
          if (!write.ok) {
            result = {
              ok: false,
              code: "invalid_payload",
              reason: write.reason ?? write.code,
            };
            return;
          }
        } else if (clipboardText.length > 0) {
          document.clipboard.write(clipboardText, { trustedPayload: true });
        }

        const fragment = isRichTextFragmentPayload(jsonPayload)
          ? jsonPayload
          : null;
        const replacementText = fragment?.text ?? clipboardText;
        const insertedAtoms = fragment?.atoms ?? null;
        const insertedRanges = fragment?.ranges ?? null;

        if (replacementText.length > 0 && document.selection !== undefined) {
          const selection = document.selection.snapshot();
          const selectionPath = textPathFromSelection(selection);
          const textPatch = document.selection.textPatch(replacementText);
          if (textPatch.ok) {
            const atomPatch = atomReplacementPatches({
              atomsPath: relatedPath(atomsPath, selectionPath),
              document,
              insertedAtoms,
              insertedTextLength: replacementText.length,
              selection,
            });
            const rangePatch = rangeReplacementPatches({
              document,
              insertedRanges,
              insertedTextLength: replacementText.length,
              rangesPath: relatedPath(rangesPath, selectionPath),
              selection,
            });
            const commit = document.commit(
              [...textPatch.patch, ...atomPatch, ...rangePatch],
              {
                label: "paste text",
                origin: "contenteditable",
                selectionAfter: textPatch.selection,
              },
            );
            result = commit.ok
              ? { ok: true, value: document.value }
              : {
                  ok: false,
                  code: "invalid_payload",
                  reason: commit.reason ?? commit.code,
                };
            return;
          }
        }

        result = {
          ok: false,
          code:
            replacementText.length === 0
              ? "clipboard_unavailable"
              : "invalid_payload",
          reason:
            replacementText.length === 0
              ? "No paste payload was available."
              : "The current selection cannot accept text.",
        };
      },
    );

    return (
      result ?? {
        ok: false,
        code: "clipboard_unavailable",
        reason: "No paste payload was available.",
      }
    );
  };

  const paste = (
    event?: ClipboardEvent,
  ): InternalClipboardResult =>
    pastePayload({
      clipboardText: event?.clipboardData?.getData("text/plain") ?? "",
      jsonPayload:
        event === undefined ? readDocumentClipboard(document) : readBrowserJSONPayload(event),
    });

  const insertFragment = (
    fragment: RichTextFragment,
    selection = document.selection?.snapshot() ?? null,
  ): InternalClipboardResult =>
    pastePayload({
      clipboardText: plainTextFromFragment(fragment),
      jsonPayload: fragment,
      selection,
    });

  const insertText = (
    text: string,
    selection = document.selection?.snapshot() ?? null,
  ): InternalClipboardResult => {
    const payload = readDocumentClipboard(document);
    const fragment =
      isRichTextFragmentPayload(payload) && plainTextFromFragment(payload) === text
        ? payload
        : null;
    return pastePayload({ clipboardText: text, jsonPayload: fragment, selection });
  };

  const runModelInstructionAtCurrentSelection = (
    instruction: EditModelInstruction,
  ): InternalEditableUpdate => {
    if (instruction.type === "command") {
      return dispatchSelectionIntent(instruction.command);
    }
    return insertTextAtSelection(
      instruction.text,
      instruction.label,
      document.selection?.snapshot() ?? null,
    );
  };

  const insertTextAtSelection = (
    replacementText: string,
    label: string,
    selection: SelectionSnap | null,
  ): InternalEditableUpdate => {
    verticalGoalX = null;
    if (selection === null || document.selection === undefined) {
      return modelToDomUpdate({
        kind: "no-change",
        render: false,
        selection: document.selection?.snapshot() ?? null,
      });
    }

    document.selection.restore(selection);
    const selectionPath = textPathFromSelection(selection);
    const textPatch = document.selection.textPatch(replacementText);
    if (!textPatch.ok) {
      return {
        ok: false,
        code: "commit_failed",
        reason: textPatch.reason ?? textPatch.code,
      };
    }

    const patch = [
      ...textPatch.patch,
      ...atomReplacementPatches({
        atomsPath: relatedPath(atomsPath, selectionPath),
        document,
        insertedAtoms: null,
        insertedTextLength: replacementText.length,
        selection,
      }),
      ...rangeReplacementPatches({
        document,
        insertedRanges: null,
        insertedTextLength: replacementText.length,
        rangesPath: relatedPath(rangesPath, selectionPath),
        selection,
      }),
    ];
    const commit = document.commit(patch, {
      label,
      origin: "contenteditable",
      selectionAfter: textPatch.selection,
    });
    lease = null;
    if (!commit.ok) {
      return {
        ok: false,
        code: "commit_failed",
        reason: commit.reason ?? commit.code,
      };
    }
    return modelToDomUpdate({
      kind: "text",
      render: true,
      selection: textPatch.selection,
      patch,
    });
  };

  return {
    handle(event) {
      const turn = resolveEditTurn(event, {
        composing: lease?.composing === true,
        suppressNextCompositionCommit,
      });
      if (editTurnPreventsDefault(turn)) {
        event.preventDefault();
      }
      if (editTurnResetsVerticalGoal(turn)) {
        verticalGoalX = null;
      }

      if (turn.type === "suppress-beforeinput-composition-commit") {
        suppressNextCompositionCommit = false;
        return domToModelUpdate({
          kind: "no-change",
          render: true,
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "block-composing-history") {
        return domToModelUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "history") {
        return capabilityToUpdate(turn.command === "undo" ? applyHistoryUndo() : applyHistoryRedo());
      }

      if (turn.type === "run-model-instruction") {
        return runModelInstructionAfterDOMFlush(turn.instruction);
      }

      if (turn.type === "begin-native-text") {
        beginLeaseFromDOM(false);
        return domToModelUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "begin-composition") {
        suppressNextCompositionCommit = false;
        beginLeaseFromDOM(true);
        return domToModelUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "end-composition") {
        if (lease !== null) {
          lease = { ...lease, composing: false };
        }
        return domToModelUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "suppress-input-composition-commit") {
        suppressNextCompositionCommit = false;
        lease = null;
        return domToModelUpdate({
          kind: "no-change",
          render: true,
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "composing-input") {
        suppressNextCompositionCommit = false;
        beginLeaseFromDOM(true);
        return domToModelUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "commit-native-text") {
        beginLeaseFromDOM(false);
        return commitTextFromDOM(turn.selectionIntent, {
          label: "native input",
          mergeKey: lease === null ? undefined : `native:${lease.surface}`,
        });
      }

      if (turn.type === "sync-selection") {
        const selection = syncSelectionFromDOM();
        return modelToDomUpdate({
          kind: selection === null ? "no-change" : "selection",
          render: false,
          selection,
        });
      }

      if (turn.type === "copy") {
        return copy(turn.event);
      }

      if (turn.type === "cut") {
        return cut(turn.event);
      }

      if (turn.type === "paste") {
        return paste(turn.event);
      }

      if (turn.type === "flush-before-model-instruction") {
        return flushNativeTextForModelInstruction(turn.instruction);
      }

      return modelToDomUpdate({
        kind: "no-change",
        render: false,
        selection: document.selection?.snapshot() ?? null,
      });
    },
    dispatch: dispatchSelectionIntent,
    flush: flushDOMToModel,
    flushDOMToModel,
    dispatchSelectionIntent,
    verticalGoal: () => verticalGoalX,
    setVerticalGoal(goalX: number | null) {
      verticalGoalX = goalX;
    },
    syncSelectionFromDOM,
    restoreSelectionToDOM(selection = document.selection?.snapshot()) {
      return selection === undefined
        ? false
        : restoreDOMSelection(
            root,
            selection,
            textAttribute,
            atomAttribute,
            offsetMapper,
          );
    },
    copy,
    cut,
    paste,
    insertFragment,
    insertText,
    applyHistoryUndo,
    applyHistoryRedo,
    reset() {
      lease = null;
      suppressNextCompositionCommit = false;
      verticalGoalX = null;
    },
  };

  function applyHistoryUndo(): JSONCapabilityResult {
    const result = document.undo();
    restoreDOMSelection(
      root,
      document.selection?.snapshot(),
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    return result;
  }

  function applyHistoryRedo(): JSONCapabilityResult {
    const result = document.redo();
    restoreDOMSelection(
      root,
      document.selection?.snapshot(),
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    return result;
  }

  function dispatchSelectionIntent(
    intent: InternalSelectionIntent,
  ): InternalEditableUpdate {
    const layout = readVisualLayoutSnapshot();
    if (!layout.ok) {
      return visualLayoutStaleUpdate(
        intent,
        layout.reason,
        document.selection?.snapshot() ?? null,
      );
    }

    const currentSelection = document.selection?.snapshot() ?? null;
    const resolved = dispatchSelectionIntentWithKernel(
      intent,
      currentSelection,
      layout.layout,
    );
    if (resolved === null || resolved.selection === null) {
      return modelToDomUpdate({
        kind: "no-change",
        render: false,
        selection: currentSelection,
      });
    }

    verticalGoalX = resolved.goalX;
    document.selection?.restore(resolved.selection);
    restoreDOMSelection(
      root,
      resolved.selection,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    lease = null;
    return modelToDomUpdate({
      kind: "selection",
      render: true,
      selection: resolved.selection,
    });
  }

  function dispatchSelectionIntentWithKernel(
    intent: InternalSelectionIntent,
    selection: SelectionSnap | null,
    layout: InternalVisualLayout | null,
  ): { selection: SelectionSnap | null; goalX: number | null } | null {
    const state = richEditState(selection, layout);
    if (state === null) {
      return null;
    }
    const result = edit(
      {
        document: state.document,
        selection: state.selection,
        goalX: verticalGoalX,
      },
      intent,
      state.lineSeeds === null ? {} : { lineSeeds: state.lineSeeds },
    );
    if (!result.ok || result.kind === "history") {
      return null;
    }
    return {
      selection: state.selectionAfter(result.selectionAfter),
      goalX: result.goalX,
    };
  }

  function richEditState(
    selection: SelectionSnap | null,
    layout: InternalVisualLayout | null,
  ): {
    document: RichDocument;
    lineSeeds: ReadonlyArray<RichVisualLineSeed> | null;
    selection: SelectionSnap | null;
    selectionAfter(selection: SelectionSnap | null): SelectionSnap | null;
  } | null {
    if (isRichDocument(document.value)) {
      return {
        document: document.value,
        lineSeeds:
          layout === null
            ? null
            : richVisualLineSeedsFromMeasuredLayout(document.value, layout),
        selection,
        selectionAfter: (next) => next,
      };
    }

    const textPath = textPathFromSelection(selection);
    if (textPath === null) {
      return null;
    }
    const text = readString(document, textPath);
    if (!text.ok) {
      return null;
    }
    const richPath = richTextPathForBlock(0);
    const richDocument = createRichDocument({
      id: "editable-host",
      blocks: [createRichBlock({ id: "b", type: "paragraph", text: text.value })],
    });
    return {
      document: richDocument,
      lineSeeds:
        layout === null ? null : richLineSeedsFromMeasuredLayout(layout, richPath),
      selection: remapSelectionPath(selection, textPath, richPath),
      selectionAfter: (next) => remapSelectionPath(next, richPath, textPath),
    };
  }
}

export function createEditableHost({
  document,
  root,
  projection = null,
  visualLayout = null,
}: EditableHostOptions): EditableHost {
  const host = createInternalEditableHost({
    atomAttribute: JSON_ATOM_ATTRIBUTE,
    atomsPath: richAtomsPathForTextPath,
    document,
    rangesPath: richRangesPathForTextPath,
    root,
    textAttribute: JSON_TEXT_ATTRIBUTE,
    projection,
    visualLayout,
  });
  return {
    handle: (event) =>
      editableUpdateFromHostResult(
        host.handle(event),
        document,
        event.type === "cut" || event.type === "paste",
      ),
    dispatch: (intent, options) =>
      dispatchEditableIntent(host, document, visualLayout, intent, options),
    copy: (event) =>
      editableUpdateFromHostResult(host.copy(event), document, false),
    cut: (event) =>
      editableUpdateFromHostResult(host.cut(event), document, true),
    flush: host.flush,
    paste: (event) =>
      editableUpdateFromHostResult(host.paste(event), document, true),
    reset: host.reset,
    restoreSelectionToDOM: host.restoreSelectionToDOM,
    syncSelectionFromDOM: host.syncSelectionFromDOM,
  };
}

function editableUpdateFromHostResult(
  result: InternalEditableUpdate | InternalClipboardResult,
  document: JSONDocument<RichDocument>,
  renderText: boolean,
): EditableUpdate {
  if ("kind" in result) {
    return result;
  }
  if (!result.ok) {
    if (result.code === "visual_layout_stale") {
      return result;
    }
    return {
      ok: false,
      code: result.code,
      reason: result.reason,
    };
  }
  return modelToDomUpdate({
    kind: renderText ? "text" : "no-change",
    patch: [],
    render: renderText,
    selection: document.selection?.snapshot() ?? null,
  });
}

function dispatchEditableIntent(
  host: InternalEditableHost,
  document: JSONDocument<RichDocument>,
  visualLayout: VisualLayoutProvider | null,
  intent: EditIntent,
  options: EditableDispatchOptions = {},
): EditableUpdate {
  if (intent.type === "historyUndo") {
    return capabilityToUpdate(host.applyHistoryUndo());
  }
  if (intent.type === "historyRedo") {
    return capabilityToUpdate(host.applyHistoryRedo());
  }
  if (
    intent.type === "modifySelection" &&
    (intent.granularity === "line" || intent.granularity === "lineboundary")
  ) {
    return host.dispatchSelectionIntent(intent);
  }
  return dispatchKernelIntent(host, document, visualLayout, intent, options);
}

function dispatchKernelIntent(
  host: InternalEditableHost,
  document: JSONDocument<RichDocument>,
  visualLayout: VisualLayoutProvider | null,
  intent: EditIntent,
  options: EditableDispatchOptions,
): InternalEditableUpdate {
  const flushed = host.flush({
    label: `prepare ${options.label ?? intent.type}`,
  });
  if (!flushed.ok) {
    return flushed;
  }

  const selection =
    options.selection === undefined
      ? document.selection?.snapshot() ?? null
      : options.selection;
  if (options.selection !== undefined && options.selection !== null) {
    document.selection?.restore(options.selection);
  }

  const layout = visualLayout?.();
  const result = edit(
    {
      document: document.value,
      selection,
      goalX: host.verticalGoal(),
    },
    intent,
    {
      lineSeeds:
        layout?.ok === true && layout.layout !== null
          ? richVisualLineSeedsFromMeasuredLayout(document.value, layout.layout)
          : null,
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      code: result.code,
      reason: result.reason,
    };
  }
  if (result.kind === "history") {
    return capabilityToUpdate(
      result.command === "undo" ? host.applyHistoryUndo() : host.applyHistoryRedo(),
    );
  }
  host.setVerticalGoal(result.goalX);

  if (result.patch.length > 0) {
    const commit = document.commit(result.patch, {
      label: options.label ?? intent.type,
      origin: "contenteditable",
      selectionAfter: result.selectionAfter ?? undefined,
    });
    if (!commit.ok) {
      return {
        ok: false,
        code: "commit_failed",
        reason: commit.reason ?? commit.code,
      };
    }
  } else if (result.selectionAfter !== null) {
    document.selection?.restore(result.selectionAfter);
  }

  if (result.selectionAfter !== null) {
    host.restoreSelectionToDOM(result.selectionAfter);
  }

  return modelToDomUpdate({
    kind: result.kind,
    patch: result.patch,
    render: result.kind !== "no-change",
    selection: result.selectionAfter,
  });
}

function capabilityToUpdate(result: JSONCapabilityResult): InternalEditableUpdate {
  return result.ok
    ? modelToDomUpdate({
        kind: "text",
        render: true,
        selection: null,
        patch: [],
      })
    : {
        ok: false,
        code: "commit_failed",
        reason: result.reason ?? "Command failed.",
      };
}

function modelInstructionLabel(instruction: EditModelInstruction): string {
  return instruction.type === "insertText" ? instruction.label : "model command";
}

function relatedPath(
  path: InternalEditableRelatedPath | null,
  textPath: Pointer | null,
): Pointer | null {
  if (path === null || textPath === null) {
    return null;
  }
  return typeof path === "function" ? path(textPath) : path;
}

function visualLayoutStaleUpdate(
  command: InternalSelectionIntent,
  reason: string,
  selection: SelectionSnap | null,
): InternalEditableUpdate {
  return {
    ok: false,
    code: "visual_layout_stale",
    command,
    reason,
    selection,
  };
}

function textPathFromSelection(selection: SelectionSnap | null): Pointer | null {
  const range =
    selection === null
      ? undefined
      : selection.selectionRanges[selection.primaryIndex];
  if (
    range === undefined ||
    typeof range.anchor === "string" ||
    typeof range.focus === "string" ||
    range.anchor.path !== range.focus.path
  ) {
    return null;
  }
  return range.anchor.path;
}

function isRichDocument(value: unknown): value is RichDocument {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "schema" in value &&
    value.schema === RICH_DOCUMENT_SCHEMA &&
    "blocks" in value &&
    Array.isArray(value.blocks)
  );
}

function richLineSeedsFromMeasuredLayout(
  layout: InternalVisualLayout,
  path: Pointer,
): RichVisualLineSeed[] {
  return layout.lines.map((line, lineIndex) => ({
    id: line.id,
    blockId: "b",
    blockIndex: 0,
    path,
    startOffset: line.startOffset,
    endOffset: line.endOffset,
    kind: line.kind,
    lineIndex,
    caretMetrics: line.carets.map((caret) => ({
      offset: caret.offset,
      x: caret.x,
    })),
  }));
}

function remapSelectionPath(
  selection: SelectionSnap | null,
  from: Pointer,
  to: Pointer,
): SelectionSnap | null {
  if (selection === null) {
    return null;
  }
  const mapPoint = (point: SelectionSnap["anchor"]): SelectionSnap["anchor"] => {
    if (typeof point === "string") {
      return point === from ? to : point;
    }
    if (point !== null && point.path === from) {
      return { ...point, path: to };
    }
    return point;
  };
  const mapRangePoint = (
    point: SelectionSnap["selectionRanges"][number]["anchor"],
  ): SelectionSnap["selectionRanges"][number]["anchor"] =>
    mapPoint(point) as SelectionSnap["selectionRanges"][number]["anchor"];
  return {
    ...selection,
    selectionRanges: selection.selectionRanges.map((range) => ({
      anchor: mapRangePoint(range.anchor),
      focus: mapRangePoint(range.focus),
    })),
    anchor: mapPoint(selection.anchor),
    focus: mapPoint(selection.focus),
  };
}
