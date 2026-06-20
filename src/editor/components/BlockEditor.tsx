import type { SelectionSnap } from "@interactive-os/json-document";
import { useJSONDocument } from "@interactive-os/json-document/react";
import { AtSign, Image, Redo2, Undo2 } from "lucide-react";
import {
  type ClipboardEvent,
  type CompositionEvent,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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
import {
  selectionForRender,
  selectionIsCollapsed,
} from "../model/richSelection";
import {
  insertFigure,
  insertMention,
  type TextCommandResult,
} from "../model/textCommands";
import { createDOMCursorGeometry } from "./cursorGeometry";
import { DocumentRenderer } from "./DocumentRenderer";
import {
  createNativeTextBuffer,
  type NativeTextBuffer,
  setNativeSelection,
} from "./nativeTextBuffer";
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
  const nativeTextBufferRef = useRef<NativeTextBuffer | null>(null);
  const measuredLayoutKeyRef = useRef<string | null>(null);
  const mentionCountRef = useRef(0);
  const figureCountRef = useRef(1);
  const [appShellElement, setAppShellElement] = useState<HTMLElement | null>(
    null,
  );
  const [editorSurfaceElement, setEditorSurfaceElement] =
    useState<HTMLDivElement | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  if (nativeTextBufferRef.current === null) {
    nativeTextBufferRef.current = createNativeTextBuffer();
  }
  const nativeTextBuffer = nativeTextBufferRef.current;
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

  useDebugInteractionRecorder({
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
    if (nativeTextBuffer.hasActiveEdit()) {
      return;
    }

    const root = editorSurfaceRef.current;
    const point = selectionSnapshotPoint(document.selection?.snapshot());
    if (
      root !== null &&
      point !== null &&
      root.ownerDocument.activeElement === root
    ) {
      setNativeSelection(root, document.value, point);
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

  const flushNativeTextEdit = useCallback(() => {
    const result = nativeTextBuffer.flush(
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
  }, [document, nativeTextBuffer]);

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

  const nativeTextPointForInput = useCallback(
    (inputType: string) =>
      nativeTextBuffer.pointForInput(
        editorSurfaceRef.current,
        document.value,
        selectionSnapshot(),
        inputType,
      ),
    [document.value, nativeTextBuffer, selectionSnapshot],
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

      flushNativeTextEdit();
      event.preventDefault();
      const normalized = normalizeCursorPoint(document.value, point);
      document.selection?.restore(selectionFromCursorPoint(normalized));
      focusEditor();
      setNativeSelection(event.currentTarget, document.value, normalized);
    },
    [document, flushNativeTextEdit, focusEditor, geometry],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      const point = selectionSnapshotPoint(document.selection?.snapshot());
      if (point !== null) {
        setNativeSelection(event.currentTarget, document.value, point);
      }
    },
    [document.selection, document.value],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          flushNativeTextEdit();
          if (event.shiftKey) {
            document.redo();
          } else {
            document.undo();
          }
          return;
        }
        if (key === "y") {
          event.preventDefault();
          flushNativeTextEdit();
          document.redo();
          return;
        }
      }

      if (event.nativeEvent.isComposing) {
        return;
      }

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (event.key === "Backspace" || event.key === "Delete")
      ) {
        const inputType =
          event.key === "Backspace"
            ? "deleteContentBackward"
            : "deleteContentForward";
        if (nativeTextPointForInput(inputType) !== null) {
          return;
        }
      }

      if (
        isPrintableTextKey(event) &&
        !selectionIsCollapsed(selectionSnapshot())
      ) {
        flushNativeTextEdit();
        if (
          runInput({
            type: "beforeinput",
            inputType: "insertText",
            data: event.key,
            isComposing: event.nativeEvent.isComposing,
          })
        ) {
          event.preventDefault();
        }
        return;
      }

      if (!isHeadlessKeyDown(event)) {
        return;
      }

      flushNativeTextEdit();
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
      flushNativeTextEdit,
      nativeTextPointForInput,
      runInput,
      selectionSnapshot,
    ],
  );

  const handleBeforeInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => {
      const nativeEvent = event.nativeEvent as InputEvent;
      if (nativeEvent.inputType === "historyUndo") {
        event.preventDefault();
        flushNativeTextEdit();
        document.undo();
        return;
      }
      if (nativeEvent.inputType === "historyRedo") {
        event.preventDefault();
        flushNativeTextEdit();
        document.redo();
        return;
      }

      if (nativeTextBuffer.consumeCompositionCommit(nativeEvent.inputType)) {
        event.preventDefault();
        flushNativeTextEdit();
        return;
      }

      const nativePoint = nativeTextPointForInput(nativeEvent.inputType);

      if (nativePoint !== null) {
        nativeTextBuffer.begin(nativePoint);
        return;
      }

      event.preventDefault();
      flushNativeTextEdit();
      runInput({
        type: "beforeinput",
        inputType: nativeEvent.inputType,
        data: beforeInputText(nativeEvent),
        isComposing: nativeEvent.isComposing,
      });
    },
    [
      document,
      flushNativeTextEdit,
      nativeTextBuffer,
      nativeTextPointForInput,
      runInput,
    ],
  );

  const handleCompositionEnd = useCallback(
    (_event: CompositionEvent<HTMLDivElement>) => {
      nativeTextBuffer.markCompositionEnd();
      window.setTimeout(() => {
        nativeTextBuffer.clearCompositionCommit();
        flushNativeTextEdit();
      }, 0);
    },
    [flushNativeTextEdit, nativeTextBuffer],
  );

  const handleInput = useCallback(() => {
    nativeTextBuffer.trackInput(editorSurfaceRef.current);
  }, [nativeTextBuffer]);

  const handleBlur = useCallback(() => {
    flushNativeTextEdit();
  }, [flushNativeTextEdit]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      flushNativeTextEdit();
      runInput({
        type: "paste",
        text: event.clipboardData.getData("text/plain"),
      });
    },
    [flushNativeTextEdit, runInput],
  );

  const handleInsertMention = useCallback(() => {
    flushNativeTextEdit();
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
    flushNativeTextEdit,
    selectionSnapshot,
  ]);

  const handleInsertFigure = useCallback(() => {
    flushNativeTextEdit();
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
    flushNativeTextEdit,
    selectionSnapshot,
  ]);

  return (
    <main className="app-shell" ref={setAppShellElement}>
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
              flushNativeTextEdit();
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
              flushNativeTextEdit();
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
            contentEditable={true}
            onBlur={handleBlur}
            onBeforeInput={handleBeforeInput}
            onCompositionEnd={handleCompositionEnd}
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
    key === "Escape" ||
    key === "Backspace" ||
    key === "Delete" ||
    key === "Enter"
  );
}

function isPrintableTextKey(event: KeyboardEvent<HTMLDivElement>): boolean {
  return (
    event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey
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
