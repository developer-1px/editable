import type { SelectionSnap } from "@interactive-os/json-document";
import { useJSONDocument } from "@interactive-os/json-document/react";
import { AtSign, Image, Redo2, Undo2 } from "lucide-react";
import {
  type ClipboardEvent,
  type CompositionEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { plainTextFromSelection } from "../model/clipboard";
import { firstCursorPoint, normalizeCursorPoint } from "../model/cursor";
import { selectionFromCursorPoint } from "../model/cursorCommands";
import {
  type EditorInput,
  type EditorInputResult,
  translateEditorInput,
} from "../model/inputAdapter";
import {
  initialNoteDocument,
  type NoteDocument,
  NoteDocumentSchema,
} from "../model/noteDocument";
import { selectionForRender } from "../model/richSelection";
import {
  insertFigure,
  insertMention,
  type TextCommandResult,
} from "../model/textCommands";
import { createDOMCursorGeometry } from "./cursorGeometry";
import { DebugRecordingInspector } from "./DebugRecordingInspector";
import { DocumentRenderer } from "./DocumentRenderer";
import {
  createEditingHostInputSession,
  type EditingHostInputSession,
  setEditingHostSelection,
} from "./editingHostInputSession";
import { resolveEditorKeyBinding } from "./editorKeymap";
import { SelectionOverlay } from "./SelectionOverlay";
import { useDebugInteractionRecorder } from "./useDebugInteractionRecorder";

export function BlockEditor() {
  const document = useJSONDocument(NoteDocumentSchema, initialNoteDocument, {
    history: 100,
    selection: true,
    trustedInitial: true,
  });
  const visibleSelection = selectionForView(
    document.value,
    document.selection?.snapshot(),
  );
  const editorSurfaceRef = useRef<HTMLDivElement>(null);
  const editingHostInputRef = useRef<EditingHostInputSession | null>(null);
  const measuredLayoutKeyRef = useRef<string | null>(null);
  const mentionCountRef = useRef(0);
  const figureCountRef = useRef(1);
  const [appShellElement, setAppShellElement] = useState<HTMLElement | null>(
    null,
  );
  const [editorSurfaceElement, setEditorSurfaceElement] =
    useState<HTMLDivElement | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  if (editingHostInputRef.current === null) {
    editingHostInputRef.current = createEditingHostInputSession();
  }
  const editingHostInput = editingHostInputRef.current;
  const setEditorSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    editorSurfaceRef.current = node;
    setEditorSurfaceElement(node);
  }, []);
  const geometry =
    editorSurfaceElement === null
      ? null
      : createDOMCursorGeometry(
          editorSurfaceRef.current ?? editorSurfaceElement,
        );
  const layoutMeasureKey = JSON.stringify({
    document: document.value,
    selection: visibleSelection,
  });

  const debugRecording = useDebugInteractionRecorder({
    note: document.value,
    rootElement: appShellElement,
    selection: visibleSelection,
  });

  useEffect(() => {
    if (document.selection?.focus === null) {
      document.selection.restore(
        selectionFromCursorPoint(firstCursorPoint(document.value)),
      );
    }
  }, [document, document.value]);

  useLayoutEffect(() => {
    if (editingHostInput.hasActiveEdit()) {
      return;
    }

    const root = editorSurfaceRef.current;
    const point = selectionSnapshotPoint(document.selection?.snapshot());
    if (
      root !== null &&
      point !== null &&
      root.ownerDocument.activeElement === root
    ) {
      setEditingHostSelection(root, document.value, point);
    }
  });

  useLayoutEffect(() => {
    if (measuredLayoutKeyRef.current === layoutMeasureKey) {
      return;
    }
    measuredLayoutKeyRef.current = layoutMeasureKey;

    if (editorSurfaceRef.current !== null) {
      setLayoutVersion((version) => version + 1);
    }
  });

  const handleTitleChange = useCallback(
    (value: string) => {
      document.replace("/title", value);
    },
    [document],
  );

  const selectionSnapshot = useCallback(
    () =>
      document.selection?.snapshot() ??
      selectionFromCursorPoint(firstCursorPoint(document.value)),
    [document],
  );

  const focusEditor = useCallback(() => {
    editorSurfaceRef.current?.focus();
  }, []);

  const flushEditingHostInput = useCallback(() => {
    const result = editingHostInput.flush(
      editorSurfaceRef.current,
      document.value,
    );
    if (!result.ok) {
      return false;
    }

    if (!result.changed) {
      document.selection?.restore(result.selectionAfter);
      return false;
    }

    document.commit(result.patch, {
      selectionAfter: result.selectionAfter,
    });
    return true;
  }, [document, editingHostInput]);

  const applyInputResult = useCallback(
    (result: EditorInputResult) => {
      if (!result.ok) {
        return true;
      }

      if (!result.handled) {
        return false;
      }

      if (result.patch.length > 0) {
        document.commit(result.patch, {
          selectionAfter: result.selectionAfter,
        });
      } else {
        document.selection?.restore(result.selectionAfter);
      }

      return true;
    },
    [document],
  );

  const runInput = useCallback(
    (input: EditorInput) =>
      applyInputResult(
        translateEditorInput(document.value, selectionSnapshot(), input, {
          geometry: geometry ?? undefined,
        }),
      ),
    [applyInputResult, document.value, geometry, selectionSnapshot],
  );

  const applyTextCommand = useCallback(
    (result: TextCommandResult) => {
      if (!result.ok) {
        return;
      }

      document.commit(result.patch, {
        selectionAfter: result.selectionAfter,
      });
      focusEditor();
    },
    [document, focusEditor],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (geometry === null) {
        return;
      }

      const point = geometry.pointFromCoordinates(event.clientX, event.clientY);
      if (point === null) {
        return;
      }

      flushEditingHostInput();
      event.preventDefault();
      const normalized = normalizeCursorPoint(document.value, point);
      document.selection?.restore(selectionFromCursorPoint(normalized));
      focusEditor();
      setEditingHostSelection(event.currentTarget, document.value, normalized);
    },
    [document, flushEditingHostInput, focusEditor, geometry],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const point = selectionSnapshotPoint(document.selection?.snapshot());
      if (point !== null) {
        setEditingHostSelection(event.currentTarget, document.value, point);
      }
    },
    [document.selection, document.value],
  );

  const handleClipboardWriteShortcut = useCallback(
    (action: "copy" | "cut") => {
      flushEditingHostInput();
      const text = plainTextFromSelection(document.value, selectionSnapshot());
      if (text.length === 0) {
        return;
      }

      void writePlainTextToClipboard(text).then((written) => {
        if (!written || action !== "cut") {
          return;
        }

        runInput({
          type: "beforeinput",
          inputType: "deleteByCut",
          isComposing: false,
        });
      });
    },
    [document.value, flushEditingHostInput, runInput, selectionSnapshot],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const keyBinding = resolveEditorKeyBinding({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
      });

      if (keyBinding?.kind === "history") {
        event.preventDefault();
        flushEditingHostInput();
        if (keyBinding.direction === "undo") {
          document.undo();
        } else {
          document.redo();
        }
        return;
      }

      if (event.nativeEvent.isComposing) {
        return;
      }
      if (editingHostInput.shouldIgnoreKeyDown()) {
        event.preventDefault();
        return;
      }

      if (keyBinding?.kind === "clipboard") {
        if (keyBinding.preventDefault) {
          event.preventDefault();
        }
        if (keyBinding.action === "copy" || keyBinding.action === "cut") {
          handleClipboardWriteShortcut(keyBinding.action);
        }
        return;
      }

      if (!isHeadlessKeyDown(event)) {
        return;
      }

      flushEditingHostInput();
      if (
        runInput({
          type: "keydown",
          key: event.key,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          isComposing: event.nativeEvent.isComposing,
        })
      ) {
        event.preventDefault();
      }
    },
    [
      document,
      flushEditingHostInput,
      editingHostInput,
      handleClipboardWriteShortcut,
      runInput,
    ],
  );

  const handleBeforeInput = useCallback(
    (event: InputEvent) => {
      const decision = editingHostInput.planBeforeInput(
        editorSurfaceRef.current,
        document.value,
        selectionSnapshot(),
        {
          inputType: event.inputType,
          data: beforeInputText(event),
          isComposing: event.isComposing,
          targetRanges: beforeInputTargetRanges(event),
        },
      );

      if (decision.kind === "history") {
        event.preventDefault();
        flushEditingHostInput();
        if (decision.direction === "undo") {
          document.undo();
        } else {
          document.redo();
        }
        return;
      }

      if (decision.kind === "commitComposition") {
        event.preventDefault();
        flushEditingHostInput();
        return;
      }

      if (decision.kind === "deferToEditingHost") {
        return;
      }

      event.preventDefault();
      flushEditingHostInput();
      runInput({
        type: "beforeinput",
        inputType: event.inputType,
        data: beforeInputText(event),
        isComposing: event.isComposing,
      });
    },
    [
      document,
      flushEditingHostInput,
      editingHostInput,
      runInput,
      selectionSnapshot,
    ],
  );

  useEffect(() => {
    const root = editorSurfaceElement;
    if (root === null) {
      return;
    }

    root.addEventListener("beforeinput", handleBeforeInput);
    return () => {
      root.removeEventListener("beforeinput", handleBeforeInput);
    };
  }, [editorSurfaceElement, handleBeforeInput]);

  const handleCompositionStart = useCallback(() => {
    editingHostInput.beginComposition(
      editorSurfaceRef.current,
      document.value,
      selectionSnapshot(),
    );
  }, [document.value, editingHostInput, selectionSnapshot]);

  const handleCompositionEnd = useCallback(
    (_event: CompositionEvent<HTMLDivElement>) => {
      editingHostInput.endComposition();
      window.setTimeout(() => {
        editingHostInput.clearCompositionCommit();
        flushEditingHostInput();
      }, 0);
    },
    [flushEditingHostInput, editingHostInput],
  );

  const handleInput = useCallback(() => {
    editingHostInput.trackInput(editorSurfaceRef.current);
  }, [editingHostInput]);

  const handleBlur = useCallback(() => {
    flushEditingHostInput();
  }, [flushEditingHostInput]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      flushEditingHostInput();
      runInput({
        type: "paste",
        text: event.clipboardData.getData("text/plain"),
      });
    },
    [flushEditingHostInput, runInput],
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      flushEditingHostInput();
      const text = plainTextFromSelection(document.value, selectionSnapshot());
      if (text.length === 0) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
    },
    [document.value, flushEditingHostInput, selectionSnapshot],
  );

  const handleCut = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      flushEditingHostInput();
      const text = plainTextFromSelection(document.value, selectionSnapshot());
      if (text.length === 0) {
        return;
      }

      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
      runInput({
        type: "beforeinput",
        inputType: "deleteByCut",
        isComposing: false,
      });
    },
    [document.value, flushEditingHostInput, runInput, selectionSnapshot],
  );

  const handleInsertMention = useCallback(() => {
    flushEditingHostInput();
    mentionCountRef.current += 1;
    applyTextCommand(
      insertMention(document.value, selectionSnapshot(), {
        type: "mention",
        id: `mention-${mentionCountRef.current}`,
        label: "Ada",
      }),
    );
  }, [
    applyTextCommand,
    document.value,
    flushEditingHostInput,
    selectionSnapshot,
  ]);

  const handleInsertFigure = useCallback(() => {
    flushEditingHostInput();
    figureCountRef.current += 1;
    applyTextCommand(
      insertFigure(document.value, selectionSnapshot(), {
        type: "figure",
        id: `figure-${figureCountRef.current}`,
        src: "/logo192.png",
        alt: "Figure",
      }),
    );
  }, [
    applyTextCommand,
    document.value,
    flushEditingHostInput,
    selectionSnapshot,
  ]);

  return (
    <main className="app-shell" ref={setAppShellElement}>
      <DebugRecordingInspector state={debugRecording} />
      <section className="editor-pane" aria-label="Editor">
        <input
          aria-label="Title"
          className="title-input"
          value={document.value.title}
          onChange={(event) => handleTitleChange(event.target.value)}
        />
        <div
          className="editor-toolbar"
          aria-label="Editor tools"
          role="toolbar"
        >
          <button
            aria-label="Undo"
            className="icon-button"
            onClick={() => {
              flushEditingHostInput();
              document.undo();
              focusEditor();
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <Undo2 aria-hidden={true} size={18} />
          </button>
          <button
            aria-label="Redo"
            className="icon-button"
            onClick={() => {
              flushEditingHostInput();
              document.redo();
              focusEditor();
            }}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <Redo2 aria-hidden={true} size={18} />
          </button>
          <button
            aria-label="Insert mention"
            className="icon-button"
            onClick={handleInsertMention}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <AtSign aria-hidden={true} size={18} />
          </button>
          <button
            aria-label="Insert figure"
            className="icon-button"
            onClick={handleInsertFigure}
            onMouseDown={(event) => event.preventDefault()}
            type="button"
          >
            <Image aria-hidden={true} size={18} />
          </button>
        </div>
        <div className="document-stage">
          {/* biome-ignore lint/a11y/useSemanticElements: The editor surface hosts structured atoms that textarea cannot render. */}
          <div
            aria-label="Document body"
            aria-multiline={true}
            className="editor-surface"
            contentEditable="plaintext-only"
            onBlur={handleBlur}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onCopy={handleCopy}
            onCut={handleCut}
            onFocus={handleFocus}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onPointerDown={handlePointerDown}
            ref={setEditorSurfaceRef}
            role="textbox"
            spellCheck={false}
            suppressContentEditableWarning={true}
            tabIndex={0}
          >
            <DocumentRenderer
              note={document.value}
              selection={visibleSelection}
            />
          </div>
          {geometry === null ? null : (
            <SelectionOverlay
              geometry={geometry}
              key={layoutVersion}
              selection={visibleSelection}
            />
          )}
        </div>
      </section>
    </main>
  );
}

export function selectionForView(
  document: NoteDocument,
  selection: SelectionSnap | undefined,
): SelectionSnap | undefined {
  return selectionForRender(document, selection);
}

function isHeadlessKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
  if (event.key === "Tab") {
    return !event.metaKey && !event.ctrlKey && !event.altKey;
  }

  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();

    return (
      !event.altKey &&
      (key === "a" ||
        key === "b" ||
        key === "e" ||
        key === "i" ||
        key === "k" ||
        isHeadlessNavigationKey(event.key))
    );
  }

  return isHeadlessNavigationKey(event.key);
}

function isHeadlessNavigationKey(key: string): boolean {
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "PageUp" ||
    key === "PageDown" ||
    key === "Home" ||
    key === "End" ||
    key === "Escape"
  );
}

function beforeInputText(event: InputEvent): string | null {
  if (
    event.inputType === "insertFromPaste" ||
    event.inputType === "insertFromDrop"
  ) {
    return event.dataTransfer?.getData("text/plain") ?? event.data;
  }

  return event.data;
}

function beforeInputTargetRanges(event: InputEvent): readonly StaticRange[] {
  return typeof event.getTargetRanges === "function"
    ? event.getTargetRanges()
    : [];
}

async function writePlainTextToClipboard(text: string): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    navigator.clipboard?.writeText === undefined
  ) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function selectionSnapshotPoint(selection: SelectionSnap | undefined) {
  const point = selection?.focus;
  if (point === undefined || point === null || typeof point === "string") {
    return null;
  }

  if (point.offset !== undefined) {
    return { path: point.path, offset: point.offset };
  }
  if (point.edge !== undefined) {
    return { path: point.path, edge: point.edge };
  }

  return null;
}
