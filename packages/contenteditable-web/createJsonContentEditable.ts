import type {
  JSONCapabilityResult,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
} from "@interactive-os/json-document";
import { JSON_ATOM_ATTRIBUTE, JSON_TEXT_ATTRIBUTE } from "./contract";
import type {
  ClipboardUpdate,
  FlushOptions,
  JsonContentEditable,
  JsonContentEditableFragment,
  JsonContentEditableModelCommand,
  JsonContentEditableOptions,
  JsonContentEditableRelatedPath,
  JsonContentEditableTextProjection,
  JsonContentEditableUpdate,
} from "./contract";
import {
  atomReplacementPatches,
  atomSyncPatchesFromDOM,
} from "./internal/atoms";
import {
  isJsonContentEditableFragment,
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
  modelCommandUpdate,
  nativeHandoffUpdate,
  nativeTextUpdate,
  type SelectionIntent,
} from "./internal/editFlow";
import { resolveEditTurn } from "./internal/editTurn";
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
  selectionFromPoints,
  type TextOffsetMapper,
  textPointFromDOMSelection,
} from "./internal/selection";
import { changedRegionEnd } from "./internal/textDiff";
import {
  moveSelectionToRenderLineBoundary,
  moveSelectionVertically,
  type VerticalMotion,
} from "./internal/visualSelection";

export { isJsonContentEditableFragment } from "./internal/clipboard";

type BrowserLease = {
  path: Pointer;
  composing: boolean;
};

type CommitTextOptions = FlushOptions & {
  resetVerticalGoal?: boolean;
  selectionIntent?: SelectionIntent;
};

export function createJsonContentEditable<T>({
  atomAttribute = JSON_ATOM_ATTRIBUTE,
  atomsPath = null,
  document,
  rangesPath = null,
  root,
  textAttribute = JSON_TEXT_ATTRIBUTE,
  projection = null,
  visualLayout = null,
}: JsonContentEditableOptions<T>): JsonContentEditable<T> {
  let lease: BrowserLease | null = null;
  let suppressNextCompositionCommit = false;
  let verticalGoalX: number | null = null;

  const textElementForPath = (path: Pointer): HTMLElement | null =>
    findElementByAttribute(root, textAttribute, path);

  const projectionForPath = (
    path: Pointer | null,
  ): JsonContentEditableTextProjection<T> | null =>
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

  const beginLeaseFromDOM = (composing = false): BrowserLease | null => {
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
      path: point.path,
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

  const readVisualLayout = () => visualLayout?.() ?? null;

  const commitTextFromDOM = (
    selectionIntent: SelectionIntent,
    options: CommitTextOptions = {},
  ): JsonContentEditableUpdate => {
    if (options.resetVerticalGoal !== false) {
      verticalGoalX = null;
    }
    const path =
      lease?.path ??
      textPointFromDOMSelection(
        root,
        textAttribute,
        atomAttribute,
        offsetMapper,
      )?.path ??
      null;
    if (path === null) {
      const selection = syncSelectionFromDOM();
      return nativeTextUpdate({
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
      return nativeTextUpdate({
        kind: "selection",
        selection: selectionAfter,
      });
    }

    const projectionChange =
      textProjection?.applyTextChange?.({
        document,
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
        return nativeTextUpdate({
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
      return nativeTextUpdate({
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
    return nativeTextUpdate({
      kind: "text",
      selection: selectionAfter,
      patch,
    });
  };

  const commitNativeText = (options: CommitTextOptions = {}): JsonContentEditableUpdate =>
    commitTextFromDOM(options.selectionIntent ?? "text-commit", options);

  const prepareModelCommand = (options: FlushOptions = {}): JsonContentEditableUpdate =>
    commitTextFromDOM("range-command", {
      ...options,
      resetVerticalGoal: false,
    });

  const handoffNativeText = (
    command: JsonContentEditableModelCommand,
  ): JsonContentEditableUpdate => {
    const mergeKey = lease === null ? undefined : `native:${lease.path}`;
    const committed = commitTextFromDOM("text-commit", {
      label: "native handoff",
      mergeKey,
    });
    if (!committed.ok) {
      return committed;
    }
    suppressNextCompositionCommit = true;
    return nativeHandoffUpdate({
      command,
      kind: committed.kind,
      patch: committed.patch,
      selection: committed.selection,
    });
  };

  const flushNativeForModelTurn = (
    label: string,
  ): JsonContentEditableUpdate | null => {
    const flushed = prepareModelCommand({ label });
    return flushed.ok ? null : flushed;
  };

  const runModelCommandAfterNativeFlush = (
    command: JsonContentEditableModelCommand,
  ): JsonContentEditableUpdate => {
    const flushed = prepareModelCommand({ label: "prepare model command" });
    if (!flushed.ok) {
      return flushed;
    }
    if (flushed.kind === "text") {
      verticalGoalX = null;
      return nativeHandoffUpdate({
        command,
        kind: flushed.kind,
        patch: flushed.patch,
        selection: flushed.selection,
      });
    }
    return runCommand(command);
  };

  const copy = (event?: ClipboardEvent): ClipboardUpdate<T> => {
    prepareModelCommand({ label: "copy selection" });
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

  const cut = (event?: ClipboardEvent): ClipboardUpdate<T> => {
    let result: ClipboardUpdate<T> | null = null;
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
  }): ClipboardUpdate<T> => {
    let result: ClipboardUpdate<T> | null = null;
    document.history.transaction(
      { label: "paste", origin: "contenteditable" },
      () => {
        prepareModelCommand({ label: "prepare paste" });
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

        const fragment = isJsonContentEditableFragment(jsonPayload)
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

  const paste = (event?: ClipboardEvent): ClipboardUpdate<T> =>
    pastePayload({
      clipboardText: event?.clipboardData?.getData("text/plain") ?? "",
      jsonPayload:
        event === undefined ? readDocumentClipboard(document) : readBrowserJSONPayload(event),
    });

  const pasteFragment = (
    fragment: JsonContentEditableFragment,
    selection = document.selection?.snapshot() ?? null,
  ): ClipboardUpdate<T> =>
    pastePayload({
      clipboardText: plainTextFromFragment(fragment),
      jsonPayload: fragment,
      selection,
    });

  const pasteText = (
    text: string,
    selection = document.selection?.snapshot() ?? null,
  ): ClipboardUpdate<T> => {
    const payload = readDocumentClipboard(document);
    const fragment =
      isJsonContentEditableFragment(payload) && plainTextFromFragment(payload) === text
        ? payload
        : null;
    return pastePayload({ clipboardText: text, jsonPayload: fragment, selection });
  };

  const insertTextCommand = (
    replacementText: string,
    label: string,
  ): JsonContentEditableUpdate => {
    verticalGoalX = null;
    const selection = syncSelectionFromDOM();
    if (selection === null || document.selection === undefined) {
      return modelCommandUpdate({
        kind: "no-change",
        render: false,
        selection: document.selection?.snapshot() ?? null,
      });
    }

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
    return modelCommandUpdate({
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
      if (turn.preventDefault) {
        event.preventDefault();
      }
      if (turn.resetVerticalGoal) {
        verticalGoalX = null;
      }

      if (turn.type === "suppress-beforeinput-composition-commit") {
        suppressNextCompositionCommit = false;
        return nativeTextUpdate({
          kind: "no-change",
          render: true,
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "block-composing-history") {
        return nativeTextUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "history") {
        return capabilityToUpdate(turn.command === "undo" ? undo() : redo());
      }

      if (turn.type === "insert-line-break") {
        const flushed = flushNativeForModelTurn("prepare line break");
        if (flushed !== null) {
          return flushed;
        }
        return insertTextCommand("\n", "insert line break");
      }

      if (turn.type === "begin-native-text") {
        beginLeaseFromDOM(false);
        return nativeTextUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "begin-composition") {
        suppressNextCompositionCommit = false;
        beginLeaseFromDOM(true);
        return nativeTextUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "end-composition") {
        if (lease !== null) {
          lease = { ...lease, composing: false };
        }
        return nativeTextUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "suppress-input-composition-commit") {
        suppressNextCompositionCommit = false;
        lease = null;
        return nativeTextUpdate({
          kind: "no-change",
          render: true,
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "composing-input") {
        suppressNextCompositionCommit = false;
        beginLeaseFromDOM(true);
        return nativeTextUpdate({
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
        });
      }

      if (turn.type === "commit-native-text") {
        beginLeaseFromDOM(false);
        return commitNativeText({
          label: "native input",
          mergeKey: lease === null ? undefined : `native:${lease.path}`,
          selectionIntent: turn.selectionIntent,
        });
      }

      if (turn.type === "sync-selection") {
        const selection = syncSelectionFromDOM();
        return modelCommandUpdate({
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

      if (turn.type === "handoff-command") {
        return handoffNativeText(turn.command);
      }

      if (turn.type === "run-command") {
        return runModelCommandAfterNativeFlush(turn.command);
      }

      return modelCommandUpdate({
        kind: "no-change",
        render: false,
        selection: document.selection?.snapshot() ?? null,
      });
    },
    commitNativeText,
    prepareModelCommand,
    runCommand,
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
    pasteFragment,
    pasteText,
    undo,
    redo,
    reset() {
      lease = null;
      suppressNextCompositionCommit = false;
      verticalGoalX = null;
    },
  };

  function undo(): JSONCapabilityResult {
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

  function redo(): JSONCapabilityResult {
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

  function moveSelectionToLineBoundary(
    command: "line-start" | "line-end",
    extend: boolean,
  ): JsonContentEditableUpdate {
    const currentSelection = selectionFromDOM(
      root,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    const renderMoved = moveSelectionToRenderLineBoundary({
      boundary: command,
      extend,
      layout: readVisualLayout(),
      selection: currentSelection ?? document.selection?.snapshot() ?? null,
    });
    if (renderMoved !== null) {
      document.selection?.restore(renderMoved.selection);
      restoreDOMSelection(
        root,
        renderMoved.selection,
        textAttribute,
        atomAttribute,
        offsetMapper,
      );
      lease = null;
      return modelCommandUpdate({
        kind: "selection",
        render: true,
        selection: renderMoved.selection,
      });
    }

    const range =
      currentSelection?.selectionRanges[currentSelection.primaryIndex] ??
      null;
    const focus = textPointFromDOMSelection(
      root,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    if (focus === null) {
      return modelCommandUpdate({
        kind: "no-change",
        render: false,
        selection: document.selection?.snapshot() ?? null,
      });
    }

    const currentText = readString(document, focus.path);
    if (!currentText.ok) {
      return {
        ok: false,
        code: "missing_text_path",
        reason: `No text value found for ${focus.path}.`,
      };
    }

    const boundary = {
      path: focus.path,
      offset: lineBoundaryOffset(currentText.value, focus.offset, command),
    };
    const anchor = extend && range !== null ? range.anchor : boundary;
    const selection = selectionFromPoints(anchor, boundary);
    document.selection?.restore(selection);
    restoreDOMSelection(
      root,
      selection,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    lease = null;
    return modelCommandUpdate({
      kind: "selection",
      render: true,
      selection,
    });
  }

  function moveSelectionToVisualLine(
    direction: VerticalMotion,
    extend: boolean,
  ): JsonContentEditableUpdate {
    const currentSelection =
      selectionFromDOM(root, textAttribute, atomAttribute, offsetMapper) ??
      document.selection?.snapshot() ??
      null;
    const moved = moveSelectionVertically({
      direction,
      extend,
      goalX: verticalGoalX,
      layout: readVisualLayout(),
      selection: currentSelection,
    });
    if (moved === null) {
      return modelCommandUpdate({
        kind: "no-change",
        render: false,
        selection: currentSelection,
      });
    }

    verticalGoalX = moved.goalX;
    document.selection?.restore(moved.selection);
    restoreDOMSelection(
      root,
      moved.selection,
      textAttribute,
      atomAttribute,
      offsetMapper,
    );
    lease = null;
    return modelCommandUpdate({
      kind: "selection",
      render: true,
      selection: moved.selection,
    });
  }

  function runCommand(
    command: JsonContentEditableModelCommand,
  ): JsonContentEditableUpdate {
    if (command.type === "moveVertical") {
      return moveSelectionToVisualLine(command.direction, command.extend);
    }
    return moveSelectionToLineBoundary(command.boundary, command.extend);
  }
}

function capabilityToUpdate(result: JSONCapabilityResult): JsonContentEditableUpdate {
  return result.ok
    ? modelCommandUpdate({
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

function lineBoundaryOffset(
  text: string,
  offset: number,
  command: "line-start" | "line-end",
): number {
  const current = Math.max(0, Math.min(offset, text.length));
  if (command === "line-start") {
    const previousBreak = text.lastIndexOf("\n", Math.max(0, current - 1));
    return previousBreak === -1 ? 0 : previousBreak + 1;
  }
  const nextBreak = text.indexOf("\n", current);
  return nextBreak === -1 ? text.length : nextBreak;
}

function relatedPath(
  path: JsonContentEditableRelatedPath | null,
  textPath: Pointer | null,
): Pointer | null {
  if (path === null || textPath === null) {
    return null;
  }
  return typeof path === "function" ? path(textPath) : path;
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
