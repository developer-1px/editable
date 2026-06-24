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
import { historyCommandFromKey } from "./internal/keyboard";
import {
  chooseSelection,
  restoreDOMSelection,
  selectionFromDOM,
  selectionFromPoint,
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
      atomsPath,
      textElement,
      atomAttribute,
    );

    if (current.value === nextText && atomSyncPatch.length === 0) {
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
    const fragment =
      selection === null
        ? null
        : selectedFragment(document, selection, atomsPath);
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
        const atomPatch = atomReplacementPatches({
          atomsPath,
          document,
          insertedAtoms: null,
          insertedTextLength: 0,
          selection,
        });
        const commit = document.commit([...textPatch.patch, ...atomPatch], {
          label: "cut text",
          origin: "contenteditable",
          selectionAfter: textPatch.selection,
        });
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

        if (replacementText.length > 0 && document.selection !== undefined) {
          const selection = document.selection.snapshot();
          const textPatch = document.selection.textPatch(replacementText);
          if (textPatch.ok) {
            const atomPatch = atomReplacementPatches({
              atomsPath,
              document,
              insertedAtoms,
              insertedTextLength: replacementText.length,
              selection,
            });
            const commit = document.commit([...textPatch.patch, ...atomPatch], {
              label: "paste text",
              origin: "contenteditable",
              selectionAfter: textPatch.selection,
            });
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
        if (lease?.phase === "composing" || lease?.phase === "pending-commit") {
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
