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
  JsonContentEditableOptions,
  JsonContentEditableRelatedPath,
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
import { readString } from "./internal/jsonDocument";
import {
  historyCommandFromKey,
  lineBoundaryCommandFromKey,
} from "./internal/keyboard";
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
  textPointFromDOMSelection,
} from "./internal/selection";
import { changedRegionEnd } from "./internal/textDiff";

export { isJsonContentEditableFragment } from "./internal/clipboard";

type BrowserLease = {
  path: Pointer;
  phase: "native" | "composing" | "pending-commit";
};

export function createJsonContentEditable<T>({
  atomAttribute = JSON_ATOM_ATTRIBUTE,
  atomsPath = null,
  document,
  rangesPath = null,
  root,
  textAttribute = JSON_TEXT_ATTRIBUTE,
}: JsonContentEditableOptions<T>): JsonContentEditable<T> {
  let lease: BrowserLease | null = null;

  const textElementForPath = (path: Pointer): HTMLElement | null =>
    findElementByAttribute(root, textAttribute, path);

  const beginLeaseFromDOM = (
    phase: BrowserLease["phase"] = "native",
  ): BrowserLease | null => {
    const point = textPointFromDOMSelection(root, textAttribute, atomAttribute);
    if (point === null) {
      return lease;
    }

    const currentText = readString(document, point.path);
    if (!currentText.ok) {
      return lease;
    }

    lease = {
      path: point.path,
      phase,
    };
    return lease;
  };

  const syncSelectionFromDOM = (): SelectionSnap | null => {
    const selection = selectionFromDOM(
      root,
      textAttribute,
      atomAttribute,
    );
    if (selection !== null) {
      document.selection?.restore(selection);
    }
    return selection;
  };

  const flush = (options: FlushOptions = {}): JsonContentEditableUpdate => {
    const intent = options.intent ?? "text-commit";
    const path =
      lease?.path ??
      textPointFromDOMSelection(root, textAttribute, atomAttribute)?.path ??
      null;
    if (path === null) {
      const selection = syncSelectionFromDOM();
      return {
        ok: true,
        kind: selection === null ? "no-change" : "selection",
        selection,
        patch: [],
      };
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

    const nextText = editableTextContent(textElement, atomAttribute);
    const mappedSelection = selectionFromDOM(
      root,
      textAttribute,
      atomAttribute,
    );
    const previousSelection = document.selection?.snapshot() ?? null;
    const derivedCaret = selectionFromPoint({
      path,
      offset: changedRegionEnd(current.value, nextText),
    });
    const selectionAfter = chooseSelection(
      intent,
      mappedSelection,
      derivedCaret,
      previousSelection,
    );

    const atomSyncPatch = atomSyncPatchesFromDOM(
      document,
      relatedPath(atomsPath, path),
      textElement,
      atomAttribute,
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
      return {
        ok: true,
        kind: "selection",
        selection: selectionAfter,
        patch: [],
      };
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
    return {
      ok: true,
      kind: "text",
      selection: selectionAfter,
      patch,
    };
  };

  const copy = (event?: ClipboardEvent): ClipboardUpdate<T> => {
    flush({ intent: "range-command", label: "copy selection" });
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
        flush({ intent: "range-command", label: "flush before paste" });
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

  return {
    handle(event) {
      if (event.type === "beforeinput" && event instanceof InputEvent) {
        if (
          (lease?.phase === "composing" || lease?.phase === "pending-commit") &&
          (event.inputType === "historyUndo" || event.inputType === "historyRedo")
        ) {
          event.preventDefault();
          return {
            ok: true,
            kind: "no-change",
            selection: document.selection?.snapshot() ?? null,
            patch: [],
          };
        }
        if (event.inputType === "historyUndo") {
          event.preventDefault();
          return capabilityToUpdate(undo());
        }
        if (event.inputType === "historyRedo") {
          event.preventDefault();
          return capabilityToUpdate(redo());
        }
        beginLeaseFromDOM("native");
        return {
          ok: true,
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
          patch: [],
        };
      }

      if (event.type === "compositionstart") {
        beginLeaseFromDOM("composing");
        return {
          ok: true,
          kind: "no-change",
          selection: document.selection?.snapshot() ?? null,
          patch: [],
        };
      }

      if (event.type === "compositionend") {
        if (lease !== null) {
          lease = { ...lease, phase: "pending-commit" };
        }
        return flush({ intent: "text-commit", label: "composition commit" });
      }

      if (event.type === "input") {
        if (event instanceof InputEvent && event.isComposing) {
          beginLeaseFromDOM("composing");
          return {
            ok: true,
            kind: "no-change",
            selection: document.selection?.snapshot() ?? null,
            patch: [],
          };
        }
        beginLeaseFromDOM(lease?.phase === "pending-commit" ? "pending-commit" : "native");
        return flush({
          intent: "text-commit",
          label: "native input",
          mergeKey: lease === null ? undefined : `native:${lease.path}`,
        });
      }

      if (event.type === "selectionchange" || event.type === "select") {
        const selection = syncSelectionFromDOM();
        return {
          ok: true,
          kind: selection === null ? "no-change" : "selection",
          selection,
          patch: [],
        };
      }

      if (event.type === "copy" && event instanceof ClipboardEvent) {
        event.preventDefault();
        return copy(event);
      }

      if (event.type === "cut" && event instanceof ClipboardEvent) {
        event.preventDefault();
        return cut(event);
      }

      if (event.type === "paste" && event instanceof ClipboardEvent) {
        event.preventDefault();
        return paste(event);
      }

      if (event.type === "keydown" && event instanceof KeyboardEvent) {
        const isComposing =
          lease?.phase === "composing" || lease?.phase === "pending-commit";
        if (isComposing) {
          const composingCommand = historyCommandFromKey(event);
          if (composingCommand !== null) {
            event.preventDefault();
            return {
              ok: true,
              kind: "no-change",
              selection: document.selection?.snapshot() ?? null,
              patch: [],
            };
          }
        }
        const lineBoundaryCommand = isComposing
          ? null
          : lineBoundaryCommandFromKey(event);
        if (lineBoundaryCommand !== null) {
          event.preventDefault();
          return moveSelectionToLineBoundary(lineBoundaryCommand, event.shiftKey);
        }
        const command = historyCommandFromKey(event);
        if (command === "undo") {
          event.preventDefault();
          return capabilityToUpdate(undo());
        }
        if (command === "redo") {
          event.preventDefault();
          return capabilityToUpdate(redo());
        }
      }

      return {
        ok: true,
        kind: "no-change",
        selection: document.selection?.snapshot() ?? null,
        patch: [],
      };
    },
    flush,
    syncSelectionFromDOM,
    restoreSelectionToDOM(selection = document.selection?.snapshot()) {
      return selection === undefined
        ? false
        : restoreDOMSelection(
            root,
            selection,
            textAttribute,
            atomAttribute,
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
    },
  };

  function undo(): JSONCapabilityResult {
    const result = document.undo();
    restoreDOMSelection(
      root,
      document.selection?.snapshot(),
      textAttribute,
      atomAttribute,
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
    );
    const range =
      currentSelection?.selectionRanges[currentSelection.primaryIndex] ??
      null;
    const focus = textPointFromDOMSelection(
      root,
      textAttribute,
      atomAttribute,
    );
    if (focus === null) {
      return {
        ok: true,
        kind: "no-change",
        selection: document.selection?.snapshot() ?? null,
        patch: [],
      };
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
    restoreDOMSelection(root, selection, textAttribute, atomAttribute);
    lease = null;
    return {
      ok: true,
      kind: "selection",
      selection,
      patch: [],
    };
  }
}

function capabilityToUpdate(result: JSONCapabilityResult): JsonContentEditableUpdate {
  return result.ok
    ? { ok: true, kind: "text", selection: null, patch: [] }
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
