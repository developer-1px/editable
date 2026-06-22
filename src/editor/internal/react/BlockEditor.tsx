import {
  applyPatchToTrustedState,
  type JSONPatchOperation,
  type SelectionSnap,
} from "@interactive-os/json-document";
import { useJSONDocument } from "@interactive-os/json-document/react";
import {
  type ClipboardEvent,
  type CompositionEvent,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { useDebugInteractionRecorder } from "../debug/useDebugInteractionRecorder";
import {
  readClipboardTextFromTransfer,
  serializeSelectionForClipboard,
} from "../model/clipboard";
import {
  type CursorPoint,
  firstCursorPoint,
  normalizeCursorPoint,
} from "../model/cursor";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../model/cursorCommands";
import {
  type EditorInput,
  type EditorInputResult,
  isReadOnlyEditingKeyDown,
  translateEditorInput,
} from "../model/inputAdapter";
import { selectionHasActiveTextMarks } from "../model/markCommands";
import {
  initialNoteDocument,
  type NoteDocument,
  NoteDocumentSchema,
} from "../model/noteDocument";
import {
  collapsedSelectionPointWithSelectedPointers,
  selectionFromNodeTarget,
  selectionIsCollapsed,
} from "../model/richSelection";
import {
  insertFigure,
  insertMention,
  insertText,
  type TextCommandResult,
} from "../model/textCommands";
import {
  selectableAtomPathFromEventTarget,
  selectionAnchorForPointer,
  selectionForCurrentBlock,
  selectionForView,
  selectionForWordAtPoint,
  selectionRevealKey,
  selectionSnapshotPoint,
} from "../view/blockEditorSelection";
import { writeClipboardData } from "../view/clipboardTransfer";
import {
  contentEditableBeforeInputFromEvent,
  createContentEditableViewEngine,
  readContentEditableCursorPoint,
  readContentEditableSelection,
  scrollContentEditableSelectionIntoView,
  setContentEditableSelection,
} from "../view/contentEditableViewEngine";
import { createDOMCursorGeometry } from "../view/cursorGeometry";
import { isHeadlessKeyDown } from "../view/editorKeyboardPolicy";
import { CursorOverlay } from "./CursorOverlay";
import { DebugRecordingInspector } from "./DebugRecordingInspector";
import { DocumentRenderer } from "./DocumentRenderer";
import { EditorToolbar } from "./EditorToolbar";
import { SelectionOverlay } from "./SelectionOverlay";

export type BlockEditorProps = {
  readOnly?: boolean;
};

export function BlockEditor({ readOnly = false }: BlockEditorProps = {}) {
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
  const didAutofocusRef = useRef(false);
  const previousReadOnlyRef = useRef(readOnly);
  const contentEditableEngineRef = useRef<ReturnType<
    typeof createContentEditableViewEngine
  > | null>(null);
  const compositionSelectionRef = useRef<SelectionSnap | null>(null);
  const compositionEnterKeyRef = useRef(false);
  const lastFlushedDocumentRef = useRef<NoteDocument | null>(null);
  const pointerDragRef = useRef<{
    pointerId: number;
    anchor: CursorPoint;
  } | null>(null);
  const revealedSelectionKeyRef = useRef<string | null>(null);
  const measuredLayoutKeyRef = useRef<string | null>(null);
  const mentionCountRef = useRef(0);
  const figureCountRef = useRef(1);
  const [editorSurfaceElement, setEditorSurfaceElement] =
    useState<HTMLDivElement | null>(null);
  const [isEditorFocused, setEditorFocused] = useState(false);
  const [isComposing, setComposing] = useState(false);
  const [hasNativeRangeSelection, setHasNativeRangeSelection] = useState(false);
  const [nativeCursorPreview, setNativeCursorPreview] =
    useState<ReturnType<typeof readContentEditableCursorPoint>>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  if (contentEditableEngineRef.current === null) {
    contentEditableEngineRef.current = createContentEditableViewEngine();
  }
  const contentEditableEngine = contentEditableEngineRef.current;
  const setEditorSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    editorSurfaceRef.current = node;
    setEditorSurfaceElement(node);
  }, []);
  const layoutMeasureKey = JSON.stringify(document.value);
  const layoutMeasured = measuredLayoutKeyRef.current === layoutMeasureKey;
  const geometry =
    editorSurfaceElement === null
      ? null
      : createDOMCursorGeometry(
          editorSurfaceRef.current ?? editorSurfaceElement,
          document.value,
        );
  const selectionOverlay =
    isEditorFocused && !hasNativeRangeSelection ? visibleSelection : undefined;
  const cursorOverlayPoint =
    isEditorFocused &&
    !isComposing &&
    !hasNativeRangeSelection &&
    visibleSelection !== undefined &&
    selectionIsCollapsed(visibleSelection)
      ? (nativeCursorPreview ?? selectionSnapshotPoint(visibleSelection))
      : null;
  const revealSelectionKey = selectionRevealKey(visibleSelection);

  const debugRecording = useDebugInteractionRecorder({
    note: document.value,
    rootElement: editorSurfaceElement,
    selection: visibleSelection,
  });

  useEffect(() => {
    const selection = document.selection?.snapshot();
    if (selection?.focus === null) {
      document.selection?.restore(
        selectionFromCursorPoint(firstCursorPoint(document.value)),
      );
      return;
    }

    const collapsedPoint =
      selection === undefined
        ? null
        : collapsedSelectionPointWithSelectedPointers(selection);
    if (collapsedPoint !== null) {
      document.selection?.restore(
        selectionFromCursorPoint(collapsedPoint, selection?.context),
      );
    }
  }, [document, document.value]);

  useEffect(() => {
    if (didAutofocusRef.current) {
      return;
    }

    const root = editorSurfaceRef.current;
    if (root === null) {
      return;
    }

    didAutofocusRef.current = true;
    root.focus({ preventScroll: true });
    setEditorFocused(root.ownerDocument.activeElement === root);

    const point =
      selectionSnapshotPoint(document.selection?.snapshot()) ??
      firstCursorPoint(document.value);
    setContentEditableSelection(root, document.value, point);
    setNativeCursorPreview(readContentEditableCursorPoint(root) ?? point);
  }, [document.selection, document.value]);

  useLayoutEffect(() => {
    if (hasNativeRangeSelection) {
      return;
    }
    if (contentEditableEngine.hasActiveEdit()) {
      return;
    }

    const root = editorSurfaceRef.current;
    const point = selectionSnapshotPoint(document.selection?.snapshot());
    if (
      nativeCursorPreview !== null &&
      point !== null &&
      !cursorPointsEqual(nativeCursorPreview, point)
    ) {
      return;
    }
    if (
      root !== null &&
      point !== null &&
      root.ownerDocument.activeElement === root
    ) {
      setContentEditableSelection(root, document.value, point);
      setNativeCursorPreview((previous) =>
        cursorPointsEqual(previous, point) ? previous : point,
      );
    }
  });

  useLayoutEffect(() => {
    if (!isEditorFocused || revealSelectionKey === null) {
      return;
    }
    if (revealedSelectionKeyRef.current === revealSelectionKey) {
      return;
    }

    scrollContentEditableSelectionIntoView(
      editorSurfaceRef.current,
      document.value,
      visibleSelection,
    );
    revealedSelectionKeyRef.current = revealSelectionKey;
  }, [document.value, isEditorFocused, revealSelectionKey, visibleSelection]);

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
      if (readOnly) {
        return;
      }

      document.replace("/title", value);
    },
    [document, readOnly],
  );

  const selectionSnapshot = useCallback(
    () =>
      document.selection?.snapshot() ??
      selectionFromCursorPoint(firstCursorPoint(document.value)),
    [document],
  );

  const selectionForInput = useCallback(() => {
    const nativeSelection = readContentEditableSelection(
      editorSurfaceRef.current,
      document.value,
    );

    return nativeSelection !== null && !selectionIsCollapsed(nativeSelection)
      ? nativeSelection
      : selectionSnapshot();
  }, [document.value, selectionSnapshot]);

  const selectionForObservedCommand = useCallback(() => {
    const canonicalSelection = selectionWithoutCollapsedSelectedPointers(
      selectionSnapshot(),
    );
    const nativeSelection = readContentEditableSelection(
      editorSurfaceRef.current,
      document.value,
    );

    if (nativeSelection === null) {
      return canonicalSelection;
    }

    if (
      !selectionIsCollapsed(canonicalSelection) &&
      selectionIsCollapsed(nativeSelection)
    ) {
      return canonicalSelection;
    }

    return selectionWithTransientContext(nativeSelection, canonicalSelection);
  }, [document.value, selectionSnapshot]);

  const focusEditor = useCallback(() => {
    const root = editorSurfaceRef.current;
    root?.focus();
    setEditorFocused(
      root !== null && root.ownerDocument.activeElement === root,
    );
    setNativeCursorPreview(readContentEditableCursorPoint(root));
  }, []);

  const resetContentEditableView = useCallback(
    (selection?: SelectionSnap) => {
      const root = editorSurfaceRef.current;
      const selectionAfter = selection ?? selectionSnapshot();
      const point = selectionSnapshotPoint(selectionAfter);
      const collapsed = selectionIsCollapsed(selectionAfter);
      contentEditableEngine.reset(root, document.value);
      compositionSelectionRef.current = null;
      compositionEnterKeyRef.current = false;
      lastFlushedDocumentRef.current = null;
      setComposing(false);
      setHasNativeRangeSelection(false);
      document.selection?.restore(selectionAfter);

      if (root !== null && point !== null && collapsed) {
        setContentEditableSelection(root, document.value, point);
      }
      setNativeCursorPreview(collapsed ? point : null);
    },
    [contentEditableEngine, document, document.value, selectionSnapshot],
  );

  useLayoutEffect(() => {
    const wasReadOnly = previousReadOnlyRef.current;
    previousReadOnlyRef.current = readOnly;
    if (readOnly && !wasReadOnly) {
      resetContentEditableView(selectionForInput());
    }
  }, [readOnly, resetContentEditableView, selectionForInput]);

  const flushContentEditableView = useCallback((): SelectionSnap | null => {
    if (readOnly) {
      resetContentEditableView();
      return null;
    }

    const root = editorSurfaceRef.current;
    const selectionBeforeFlush =
      compositionSelectionRef.current ?? selectionSnapshot();
    const result = contentEditableEngine.flush(root, document.value);
    compositionSelectionRef.current = null;
    setComposing(false);
    if (!result.ok) {
      lastFlushedDocumentRef.current = null;
      return null;
    }

    setHasNativeRangeSelection(false);
    const documentAfter = result.changed
      ? documentAfterPatch(document.value, result.patch)
      : document.value;
    const selectionAfter = selectionWithTransientContext(
      readContentEditableSelection(root, documentAfter) ??
        result.selectionAfter,
      selectionBeforeFlush,
    );

    if (result.changed) {
      const markedInsertion = textCommandFromMarkedNativeInsertion(
        document.value,
        selectionBeforeFlush,
        result.path,
        result.previousText,
        result.nextText,
      );
      if (markedInsertion?.ok) {
        lastFlushedDocumentRef.current = documentAfterPatch(
          document.value,
          markedInsertion.patch,
        );
        setNativeCursorPreview(
          selectionSnapshotPoint(markedInsertion.selectionAfter),
        );
        document.commit(markedInsertion.patch, {
          selectionAfter: markedInsertion.selectionAfter,
        });
        return markedInsertion.selectionAfter;
      }
    }

    setNativeCursorPreview(selectionSnapshotPoint(selectionAfter));
    if (!result.changed) {
      lastFlushedDocumentRef.current = document.value;
      document.selection?.restore(selectionAfter);
      return selectionAfter;
    }

    lastFlushedDocumentRef.current = documentAfter;
    document.commit(result.patch, {
      selectionAfter,
    });
    return selectionAfter;
  }, [
    document,
    contentEditableEngine,
    readOnly,
    resetContentEditableView,
    selectionSnapshot,
  ]);

  const flushContentEditableViewBeforeCommand =
    useCallback((): SelectionSnap | null => {
      let selectionAfterFlush: SelectionSnap | null = null;
      flushSync(() => {
        selectionAfterFlush = flushContentEditableView();
      });

      return selectionAfterFlush;
    }, [flushContentEditableView]);

  const applyInputResult = useCallback(
    (result: EditorInputResult) => {
      if (!result.ok) {
        return true;
      }

      if (!result.handled) {
        return false;
      }

      setHasNativeRangeSelection(false);
      setNativeCursorPreview(selectionSnapshotPoint(result.selectionAfter));
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
    (input: EditorInput, selection = selectionSnapshot()) =>
      applyInputResult(
        translateEditorInput(document.value, selection, input, {
          geometry: geometry ?? undefined,
          readOnly,
        }),
      ),
    [applyInputResult, document.value, geometry, readOnly, selectionSnapshot],
  );

  const applyTextCommand = useCallback(
    (result: TextCommandResult) => {
      if (readOnly) {
        return;
      }

      if (!result.ok) {
        return;
      }

      document.commit(result.patch, {
        selectionAfter: result.selectionAfter,
      });
      focusEditor();
      setNativeCursorPreview(selectionSnapshotPoint(result.selectionAfter));
    },
    [document, focusEditor, readOnly],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const selectedAtomPath = selectableAtomPathFromEventTarget(event.target);
      if (selectedAtomPath !== null) {
        flushContentEditableView();
        event.preventDefault();
        const selection = selectionSnapshot();
        if (event.shiftKey) {
          document.selection?.restore(
            selectionFromCursorRange(
              document.value,
              selectionAnchorForPointer(document.value, selection),
              { path: selectedAtomPath, edge: "after" },
            ),
          );
        } else if (event.detail >= 3) {
          document.selection?.restore(
            selectionForCurrentBlock(document.value, {
              path: selectedAtomPath,
              edge: "before",
            }),
          );
        } else {
          document.selection?.restore(
            selectionFromNodeTarget(selectedAtomPath),
          );
        }
        event.currentTarget.ownerDocument.getSelection()?.removeAllRanges();
        event.currentTarget.focus();
        setEditorFocused(
          event.currentTarget.ownerDocument.activeElement ===
            event.currentTarget,
        );
        setNativeCursorPreview(null);
        return;
      }

      if (geometry === null) {
        return;
      }

      const point = geometry.pointFromCoordinates(event.clientX, event.clientY);
      if (point === null) {
        return;
      }

      flushContentEditableView();
      event.preventDefault();
      const normalized = normalizeCursorPoint(document.value, point);
      const selection = selectionSnapshot();
      const selectionAfter =
        event.detail >= 3
          ? selectionForCurrentBlock(document.value, normalized)
          : event.detail === 2
            ? selectionForWordAtPoint(document.value, normalized)
            : event.shiftKey
              ? selectionFromCursorRange(
                  document.value,
                  selectionAnchorForPointer(document.value, selection),
                  normalized,
                )
              : selectionFromCursorPoint(normalized);
      document.selection?.restore(selectionAfter);
      pointerDragRef.current =
        event.shiftKey || event.detail >= 2
          ? null
          : { pointerId: event.pointerId, anchor: normalized };
      capturePointer(event.currentTarget, event.pointerId);
      focusEditor();
      setContentEditableSelection(
        event.currentTarget,
        document.value,
        normalized,
      );
      setNativeCursorPreview(
        readContentEditableCursorPoint(event.currentTarget) ?? normalized,
      );
    },
    [
      document,
      flushContentEditableView,
      focusEditor,
      geometry,
      selectionSnapshot,
    ],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = pointerDragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }
      if (geometry === null) {
        return;
      }

      const point = geometry.pointFromCoordinates(event.clientX, event.clientY);
      if (point === null) {
        return;
      }

      event.preventDefault();
      const focus = normalizeCursorPoint(document.value, point);
      document.selection?.restore(
        selectionFromCursorRange(document.value, drag.anchor, focus),
      );
      setNativeCursorPreview(null);
    },
    [document, geometry],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (pointerDragRef.current?.pointerId === event.pointerId) {
      pointerDragRef.current = null;
    }
    releasePointer(event.currentTarget, event.pointerId);
  }, []);

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (pointerDragRef.current?.pointerId === event.pointerId) {
        pointerDragRef.current = null;
      }
      releasePointer(event.currentTarget, event.pointerId);
    },
    [],
  );

  const handleFocus = useCallback(
    (event: FocusEvent<HTMLDivElement>) => {
      setEditorFocused(true);
      setHasNativeRangeSelection(false);
      const point = selectionSnapshotPoint(document.selection?.snapshot());
      if (point !== null) {
        setContentEditableSelection(event.currentTarget, document.value, point);
      }
      setNativeCursorPreview(
        readContentEditableCursorPoint(event.currentTarget) ?? point,
      );
    },
    [document.selection, document.value],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!readOnly && contentEditableEngine.shouldIgnoreKeyDown()) {
        if (isPlainEnterKeyDown(event)) {
          compositionEnterKeyRef.current = true;
        }
        event.preventDefault();
        return;
      }

      if (event.metaKey || event.ctrlKey) {
        const key = event.key.toLowerCase();
        if (key === "z") {
          event.preventDefault();
          if (readOnly) {
            return;
          }

          flushContentEditableViewBeforeCommand();
          if (event.shiftKey) {
            document.redo();
          } else {
            document.undo();
          }
          return;
        }
        if (key === "y") {
          event.preventDefault();
          if (readOnly) {
            return;
          }

          flushContentEditableViewBeforeCommand();
          document.redo();
          return;
        }
      }

      if (
        readOnly &&
        isReadOnlyEditingKeyDown({
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
        runInput(
          {
            type: "keydown",
            key: event.key,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            isComposing: event.nativeEvent.isComposing,
          },
          selectionForInput(),
        );
        return;
      }
      if (event.nativeEvent.isComposing) {
        return;
      }

      if (!isHeadlessKeyDown(event)) {
        return;
      }

      const selectionAfterFlush = flushContentEditableViewBeforeCommand();
      const selectionForCommand = selectionWithoutCollapsedSelectedPointers(
        selectionAfterFlush ?? selectionForInput(),
      );
      if (
        runInput(
          {
            type: "keydown",
            key: event.key,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            isComposing: event.nativeEvent.isComposing,
          },
          selectionForCommand,
        )
      ) {
        event.preventDefault();
      }
    },
    [
      document,
      flushContentEditableViewBeforeCommand,
      contentEditableEngine,
      readOnly,
      runInput,
      selectionForInput,
    ],
  );

  const handleBeforeInput = useCallback(
    (event: InputEvent) => {
      const input = contentEditableBeforeInputFromEvent(event);
      const selectionBeforeInput = selectionForInput();
      if (readOnly) {
        event.preventDefault();
        runInput(
          {
            type: "beforeinput",
            inputType: input.inputType,
            data: input.data,
            format: input.format,
            isComposing: input.isComposing,
          },
          selectionBeforeInput,
        );
        return;
      }

      const decision = contentEditableEngine.planBeforeInput(
        editorSurfaceRef.current,
        document.value,
        selectionBeforeInput,
        input,
      );

      if (decision.kind === "history") {
        event.preventDefault();
        flushContentEditableViewBeforeCommand();
        if (decision.direction === "undo") {
          document.undo();
        } else {
          document.redo();
        }
        return;
      }

      if (decision.kind === "commitComposition") {
        event.preventDefault();
        const splitAfterCommit = compositionEnterKeyRef.current;
        compositionEnterKeyRef.current = false;
        const compositionSelection =
          compositionSelectionRef.current ?? selectionBeforeInput;
        if (
          input.data !== null &&
          input.data !== undefined &&
          selectionHasActiveTextMarks(compositionSelection)
        ) {
          contentEditableEngine.reset(null, document.value);
          compositionSelectionRef.current = null;
          setComposing(false);
          setHasNativeRangeSelection(false);
          const insertResult = translateEditorInput(
            document.value,
            compositionSelection,
            {
              type: "beforeinput",
              inputType: "insertText",
              data: input.data,
            },
            {
              geometry: geometry ?? undefined,
              readOnly,
            },
          );
          if (splitAfterCommit && insertResult.ok && insertResult.handled) {
            const documentAfterInsert =
              insertResult.patch.length === 0
                ? document.value
                : documentAfterPatch(document.value, insertResult.patch);
            const splitResult = translateEditorInput(
              documentAfterInsert,
              insertResult.selectionAfter,
              { type: "keydown", key: "Enter" },
              {
                geometry: geometry ?? undefined,
                readOnly,
              },
            );
            if (splitResult.ok && splitResult.handled) {
              const selectionAfter = splitResult.selectionAfter;
              setHasNativeRangeSelection(false);
              setNativeCursorPreview(selectionSnapshotPoint(selectionAfter));
              document.commit([...insertResult.patch, ...splitResult.patch], {
                selectionAfter,
              });
              return;
            }
          }

          applyInputResult(insertResult);
          return;
        }

        const selectionAfterFlush = flushContentEditableViewBeforeCommand();
        if (splitAfterCommit && selectionAfterFlush !== null) {
          applyInputResult(
            translateEditorInput(
              lastFlushedDocumentRef.current ?? document.value,
              selectionAfterFlush,
              { type: "keydown", key: "Enter" },
              {
                geometry: geometry ?? undefined,
                readOnly,
              },
            ),
          );
        }
        setComposing(false);
        return;
      }

      if (decision.kind === "ignore") {
        event.preventDefault();
        return;
      }

      if (decision.kind === "deferToContentEditable") {
        return;
      }

      event.preventDefault();
      const selectionAfterFlush = flushContentEditableViewBeforeCommand();
      runInput(
        {
          type: "beforeinput",
          inputType: input.inputType,
          data: input.data,
          format: input.format,
          isComposing: input.isComposing,
        },
        selectionAfterFlush ?? selectionBeforeInput,
      );
    },
    [
      document,
      applyInputResult,
      flushContentEditableViewBeforeCommand,
      contentEditableEngine,
      geometry,
      readOnly,
      runInput,
      selectionForInput,
    ],
  );

  useLayoutEffect(() => {
    const root = editorSurfaceElement;
    if (root === null) {
      return;
    }

    root.addEventListener("beforeinput", handleBeforeInput);
    return () => {
      root.removeEventListener("beforeinput", handleBeforeInput);
    };
  }, [editorSurfaceElement, handleBeforeInput]);

  const handleCompositionStart = useCallback(
    (event: CompositionEvent<HTMLDivElement>) => {
      if (readOnly) {
        event.preventDefault();
        resetContentEditableView();
        return;
      }

      setComposing(true);
      compositionEnterKeyRef.current = false;
      const selection = selectionSnapshot();
      compositionSelectionRef.current = selection;
      contentEditableEngine.beginComposition(
        editorSurfaceRef.current,
        document.value,
        selection,
      );
    },
    [
      document.value,
      contentEditableEngine,
      readOnly,
      resetContentEditableView,
      selectionSnapshot,
    ],
  );

  const handleCompositionEnd = useCallback(
    (_event: CompositionEvent<HTMLDivElement>) => {
      if (readOnly) {
        resetContentEditableView();
        return;
      }

      contentEditableEngine.endComposition();
      window.setTimeout(() => {
        if (contentEditableEngine.clearCompositionCommit()) {
          flushContentEditableView();
        }
        setComposing(false);
      }, 0);
    },
    [
      flushContentEditableView,
      contentEditableEngine,
      readOnly,
      resetContentEditableView,
    ],
  );

  const handleInput = useCallback(() => {
    if (readOnly) {
      resetContentEditableView();
      return;
    }

    const point = contentEditableEngine.trackInput(
      editorSurfaceRef.current,
      document.value,
    );
    setHasNativeRangeSelection(false);
    if (point !== null) {
      setNativeCursorPreview(point);
    }
  }, [
    document.value,
    contentEditableEngine,
    readOnly,
    resetContentEditableView,
  ]);

  const handleBlur = useCallback(() => {
    flushContentEditableView();
    setNativeCursorPreview(null);
    setComposing(false);
    setHasNativeRangeSelection(false);
    setEditorFocused(false);
  }, [flushContentEditableView]);

  const updateNativeSelectionState = useCallback(
    (root = editorSurfaceRef.current) => {
      const nativeSelection = readContentEditableSelection(
        root,
        document.value,
      );
      const hasRange =
        nativeSelection !== null && !selectionIsCollapsed(nativeSelection);
      setHasNativeRangeSelection((previous) =>
        previous === hasRange ? previous : hasRange,
      );
      if (!hasRange) {
        const canonicalSelection = selectionSnapshot();
        const collapsedSelection =
          nativeSelection === null
            ? null
            : selectionWithTransientContext(
                nativeSelection,
                canonicalSelection,
              );
        const point =
          selectionSnapshotPoint(collapsedSelection ?? undefined) ??
          readContentEditableCursorPoint(root);
        if (
          collapsedSelection !== null &&
          selectionIsCollapsed(canonicalSelection) &&
          !contentEditableEngine.hasActiveEdit()
        ) {
          document.selection?.restore(collapsedSelection);
        }
        setNativeCursorPreview((previous) =>
          cursorPointsEqual(previous, point) ? previous : point,
        );
      }
    },
    [
      contentEditableEngine,
      document.selection,
      document.value,
      selectionSnapshot,
    ],
  );

  const handleSelect = useCallback(() => {
    updateNativeSelectionState();
  }, [updateNativeSelectionState]);

  useEffect(() => {
    const root = editorSurfaceElement;
    if (root === null) {
      return;
    }

    const ownerDocument = root.ownerDocument;
    const handleSelectionChange = () => {
      const nativeSelection = ownerDocument.getSelection();
      const selectionTouchesEditor =
        nativeSelection?.anchorNode !== null &&
        nativeSelection?.anchorNode !== undefined &&
        root.contains(nativeSelection.anchorNode);
      if (ownerDocument.activeElement !== root && !selectionTouchesEditor) {
        return;
      }

      updateNativeSelectionState(root);
    };

    ownerDocument.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      ownerDocument.removeEventListener(
        "selectionchange",
        handleSelectionChange,
      );
    };
  }, [editorSurfaceElement, updateNativeSelectionState]);

  useEffect(() => {
    const root = editorSurfaceElement;
    if (root === null) {
      return;
    }

    root.addEventListener("select", handleSelect);
    root.ownerDocument.addEventListener("selectionchange", handleSelect);
    return () => {
      root.removeEventListener("select", handleSelect);
      root.ownerDocument.removeEventListener("selectionchange", handleSelect);
    };
  }, [editorSurfaceElement, handleSelect]);

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const clipboardText = readClipboardTextFromTransfer(event.clipboardData);
      if (clipboardText === null) {
        return;
      }

      const selection = selectionForObservedCommand();
      if (readOnly) {
        resetContentEditableView(selection);
        return;
      }

      const selectionAfterFlush = flushContentEditableViewBeforeCommand();
      runInput(
        {
          type: "paste",
          text: clipboardText.text,
          format: clipboardText.format,
        },
        selectionAfterFlush ?? selection,
      );
    },
    [
      flushContentEditableViewBeforeCommand,
      readOnly,
      resetContentEditableView,
      runInput,
      selectionForObservedCommand,
    ],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (readOnly) {
        return;
      }

      const clipboardText = readClipboardTextFromTransfer(event.dataTransfer);
      if (clipboardText === null) {
        return;
      }

      const selectionAfterFlush = flushContentEditableViewBeforeCommand();
      const dropPoint = geometry?.pointFromCoordinates(
        event.clientX,
        event.clientY,
      );
      const selection =
        dropPoint === undefined || dropPoint === null
          ? (selectionAfterFlush ?? selectionForInput())
          : selectionFromCursorPoint(
              normalizeCursorPoint(document.value, dropPoint),
            );

      runInput(
        {
          type: "paste",
          text: clipboardText.text,
          format: clipboardText.format,
        },
        selection,
      );
    },
    [
      document.value,
      flushContentEditableViewBeforeCommand,
      geometry,
      readOnly,
      runInput,
      selectionForInput,
    ],
  );

  const handleCopy = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const selectionBeforeFlush = selectionForInput();
      const selection = readOnly
        ? selectionBeforeFlush
        : (flushContentEditableViewBeforeCommand() ?? selectionBeforeFlush);
      const data = serializeSelectionForClipboard(document.value, selection);
      if (data === null || event.clipboardData === null) {
        return;
      }

      event.preventDefault();
      writeClipboardData(event.clipboardData, data);
    },
    [
      document.value,
      flushContentEditableViewBeforeCommand,
      readOnly,
      selectionForInput,
    ],
  );

  const handleCut = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const selectionBeforeFlush = selectionForInput();
      const selection = readOnly
        ? selectionBeforeFlush
        : (flushContentEditableViewBeforeCommand() ?? selectionBeforeFlush);
      const data = serializeSelectionForClipboard(document.value, selection);
      event.preventDefault();
      if (data !== null && event.clipboardData !== null) {
        writeClipboardData(event.clipboardData, data);
      }

      if (readOnly) {
        resetContentEditableView(selection);
        return;
      }

      if (data !== null) {
        runInput(
          {
            type: "beforeinput",
            inputType: "deleteByCut",
          },
          selection,
        );
      }
    },
    [
      document.value,
      flushContentEditableViewBeforeCommand,
      readOnly,
      resetContentEditableView,
      runInput,
      selectionForInput,
    ],
  );

  const handleInsertMention = useCallback(() => {
    if (readOnly) {
      return;
    }

    flushContentEditableViewBeforeCommand();
    mentionCountRef.current += 1;
    applyTextCommand(
      insertMention(document.value, selectionForInput(), {
        type: "mention",
        id: `mention-${mentionCountRef.current}`,
        label: "Ada",
      }),
    );
  }, [
    applyTextCommand,
    document.value,
    flushContentEditableViewBeforeCommand,
    readOnly,
    selectionForInput,
  ]);

  const handleInsertFigure = useCallback(() => {
    if (readOnly) {
      return;
    }

    flushContentEditableViewBeforeCommand();
    figureCountRef.current += 1;
    applyTextCommand(
      insertFigure(document.value, selectionForInput(), {
        type: "figure",
        id: `figure-${figureCountRef.current}`,
        src: "/sample-figure.svg",
        alt: "Figure",
      }),
    );
  }, [
    applyTextCommand,
    document.value,
    flushContentEditableViewBeforeCommand,
    readOnly,
    selectionForInput,
  ]);

  const handleUndo = useCallback(() => {
    if (readOnly) {
      focusEditor();
      return;
    }

    flushContentEditableViewBeforeCommand();
    document.undo();
    focusEditor();
  }, [document, flushContentEditableViewBeforeCommand, focusEditor, readOnly]);

  const handleRedo = useCallback(() => {
    if (readOnly) {
      focusEditor();
      return;
    }

    flushContentEditableViewBeforeCommand();
    document.redo();
    focusEditor();
  }, [document, flushContentEditableViewBeforeCommand, focusEditor, readOnly]);

  return (
    <main className="app-shell">
      <DebugRecordingInspector state={debugRecording} />
      <section className="editor-pane" aria-label="Editor">
        <input
          aria-label="Title"
          className="title-input"
          readOnly={readOnly}
          value={document.value.title}
          onChange={(event) => handleTitleChange(event.target.value)}
        />
        <EditorToolbar
          onInsertFigure={handleInsertFigure}
          onInsertMention={handleInsertMention}
          onRedo={handleRedo}
          onUndo={handleUndo}
        />
        <div className="document-stage">
          {/* biome-ignore lint/a11y/useSemanticElements: The editor surface hosts structured atoms that textarea cannot render. */}
          <div
            aria-label="Document body"
            aria-multiline={true}
            aria-readonly={readOnly}
            className="editor-surface"
            contentEditable="plaintext-only"
            data-focused={isEditorFocused ? "true" : undefined}
            data-ime-composing={isComposing ? "true" : undefined}
            onBlur={handleBlur}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onCopy={handleCopy}
            onCut={handleCut}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onFocus={handleFocus}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onPointerCancel={handlePointerCancel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onSelect={handleSelect}
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
          {geometry === null || !layoutMeasured ? null : (
            <>
              <SelectionOverlay
                geometry={geometry}
                key={layoutVersion}
                selection={selectionOverlay}
              />
              <CursorOverlay geometry={geometry} point={cursorOverlayPoint} />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function capturePointer(element: HTMLElement, pointerId: number) {
  if (typeof element.setPointerCapture !== "function") {
    return;
  }

  element.setPointerCapture(pointerId);
}

function releasePointer(element: HTMLElement, pointerId: number) {
  if (typeof element.releasePointerCapture !== "function") {
    return;
  }

  element.releasePointerCapture(pointerId);
}

function isPlainEnterKeyDown(event: KeyboardEvent<HTMLDivElement>): boolean {
  return (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  );
}

function textCommandFromMarkedNativeInsertion(
  document: NoteDocument,
  selection: SelectionSnap,
  path: string,
  previousText: string,
  nextText: string,
): TextCommandResult | null {
  if (
    !selectionIsCollapsed(selection) ||
    !selectionHasActiveTextMarks(selection)
  ) {
    return null;
  }

  const point = selectionSnapshotPoint(selection);
  if (point === null || !("offset" in point) || point.path !== path) {
    return null;
  }

  const insertion = pureInsertionBetween(previousText, nextText);
  if (insertion === null || insertion.text.length === 0) {
    return null;
  }
  if (point.offset !== insertion.offset) {
    return null;
  }

  return insertText(document, selection, insertion.text);
}

function pureInsertionBetween(
  previousText: string,
  nextText: string,
): { offset: number; text: string } | null {
  const prefixLength = commonPrefixLength(previousText, nextText);
  const suffixLength = commonSuffixLength(previousText, nextText, prefixLength);
  if (previousText.length !== prefixLength + suffixLength) {
    return null;
  }

  return {
    offset: prefixLength,
    text: nextText.slice(prefixLength, nextText.length - suffixLength),
  };
}

function commonPrefixLength(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  let index = 0;
  while (index < length && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

function commonSuffixLength(
  left: string,
  right: string,
  prefixLength: number,
): number {
  let length = 0;
  const maxLength = Math.min(left.length, right.length) - prefixLength;
  while (
    length < maxLength &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }

  return length;
}

function documentAfterPatch(
  document: NoteDocument,
  patch: JSONPatchOperation[],
): NoteDocument {
  const result = applyPatchToTrustedState(NoteDocumentSchema, document, patch);

  return result.result.ok ? result.state : document;
}

function selectionWithoutCollapsedSelectedPointers(
  selection: SelectionSnap,
): SelectionSnap {
  const collapsedPoint = collapsedSelectionPointWithSelectedPointers(selection);

  return collapsedPoint === null
    ? selection
    : selectionFromCursorPoint(collapsedPoint, selection.context);
}

function selectionWithTransientContext(
  selection: SelectionSnap,
  source: SelectionSnap,
): SelectionSnap {
  if (
    selection.context !== undefined ||
    source.context === undefined ||
    !selectionIsCollapsed(selection) ||
    !selectionIsCollapsed(source)
  ) {
    return selection;
  }

  return { ...selection, context: source.context };
}

function cursorPointsEqual(
  left: CursorPoint | null,
  right: CursorPoint | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (left === null || right === null) {
    return false;
  }

  return (
    left.path === right.path &&
    left.offset === right.offset &&
    left.edge === right.edge &&
    left.affinity === right.affinity
  );
}
