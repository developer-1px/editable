import type { SelectionSnap } from "@interactive-os/json-document";
import { useJSONDocument } from "@interactive-os/json-document/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useDebugInteractionRecorder } from "../../debug/useDebugInteractionRecorder";
import { firstCursorPoint } from "../../model/cursor";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import { initialNoteDocument } from "../../model/initialNoteDocument";
import {
  type NoteDocument,
  NoteDocumentSchema,
} from "../../model/noteDocument";
import {
  collapsedSelectionPointWithSelectedPointers,
  selectionIsCollapsed,
} from "../../model/richSelection";
import {
  selectionForView,
  selectionSnapshotPoint,
} from "../../view/blockEditorSelection";
import {
  createContentEditableViewEngine,
  readContentEditableCursorPoint,
  readContentEditableSelection,
} from "../../view/contentEditableViewEngine";
import { createDOMCursorGeometry } from "../../view/cursorGeometry";
import { detectEditorPlatform } from "../../view/editorPlatform";
import { focusElementPreservingScroll } from "../../view/focusScroll";
import {
  selectionWithoutCollapsedSelectedPointers,
  selectionWithTransientContext,
} from "./blockEditorSelectionState";
import { useBlockEditorBeforeInputHandler } from "./useBlockEditorBeforeInputHandler";
import { useBlockEditorClipboardHandlers } from "./useBlockEditorClipboardHandlers";
import { useBlockEditorCompositionHandlers } from "./useBlockEditorCompositionHandlers";
import { useBlockEditorContentEditableTransactions } from "./useBlockEditorContentEditableTransactions";
import { useBlockEditorKeyDownHandler } from "./useBlockEditorKeyDownHandler";
import { useBlockEditorLayoutState } from "./useBlockEditorLayoutState";
import { useBlockEditorNativeSelectionHandlers } from "./useBlockEditorNativeSelectionHandlers";
import { useBlockEditorPointerHandlers } from "./useBlockEditorPointerHandlers";
import { useBlockEditorToolbarCommandHandlers } from "./useBlockEditorToolbarCommandHandlers";

export type BlockEditorProps = {
  readOnly?: boolean;
};

export function useBlockEditorController({
  readOnly = false,
}: BlockEditorProps = {}) {
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
  const contentEditableEngineRef = useRef<ReturnType<
    typeof createContentEditableViewEngine
  > | null>(null);
  const compositionSelectionRef = useRef<SelectionSnap | null>(null);
  const compositionEnterKeyRef = useRef(false);
  const lastFlushedDocumentRef = useRef<NoteDocument | null>(null);
  const [editorSurfaceElement, setEditorSurfaceElement] =
    useState<HTMLDivElement | null>(null);
  const [isEditorFocused, setEditorFocused] = useState(false);
  const [isComposing, setComposing] = useState(false);
  const [hasNativeRangeSelection, setHasNativeRangeSelection] = useState(false);
  const [nativeCursorPreview, setNativeCursorPreview] =
    useState<ReturnType<typeof readContentEditableCursorPoint>>(null);
  const editorPlatform = detectEditorPlatform();
  if (contentEditableEngineRef.current === null) {
    contentEditableEngineRef.current = createContentEditableViewEngine();
  }
  const contentEditableEngine = contentEditableEngineRef.current;
  const setEditorSurfaceRef = useCallback((node: HTMLDivElement | null) => {
    editorSurfaceRef.current = node;
    setEditorSurfaceElement(node);
  }, []);
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
  const { layoutMeasured, layoutVersion } = useBlockEditorLayoutState({
    document: document.value,
    editorSurfaceRef,
    isEditorFocused,
    visibleSelection,
  });

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

  const { handleFocus, handleSelect } = useBlockEditorNativeSelectionHandlers({
    contentEditableEngine,
    document,
    editorSurfaceElement,
    editorSurfaceRef,
    hasNativeRangeSelection,
    nativeCursorPreview,
    selectionSnapshot,
    setEditorFocused,
    setHasNativeRangeSelection,
    setNativeCursorPreview,
  });

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
    setEditorFocused(focusElementPreservingScroll(root));
    setNativeCursorPreview(readContentEditableCursorPoint(root));
  }, []);

  const {
    applyInputResult,
    dispatchCommand,
    flushContentEditableView,
    flushContentEditableViewBeforeCommand,
    resetContentEditableView,
    runInput,
  } = useBlockEditorContentEditableTransactions({
    compositionEnterKeyRef,
    compositionSelectionRef,
    contentEditableEngine,
    document,
    editorPlatform,
    editorSurfaceRef,
    geometry,
    lastFlushedDocumentRef,
    readOnly,
    selectionForInput,
    selectionSnapshot,
    setComposing,
    setHasNativeRangeSelection,
    setNativeCursorPreview,
  });

  const {
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  } = useBlockEditorPointerHandlers({
    document,
    flushContentEditableView,
    focusEditor,
    geometry,
    selectionSnapshot,
    setEditorFocused,
    setNativeCursorPreview,
  });

  const {
    handleClipboardKeymapCommand,
    handleCopy,
    handleCut,
    handleDragOver,
    handleDrop,
    handlePaste,
  } = useBlockEditorClipboardHandlers({
    document,
    editorSurfaceRef,
    flushContentEditableViewBeforeCommand,
    geometry,
    readOnly,
    resetContentEditableView,
    runInput,
    selectionForInput,
    selectionForObservedCommand,
  });

  const currentSelectionSnapshot = useCallback(
    () => document.selection?.snapshot(),
    [document.selection],
  );
  const { handleRedo, handleUndo, insertFigure, insertMention } =
    useBlockEditorToolbarCommandHandlers({
      currentSelectionSnapshot,
      dispatchCommand,
      flushContentEditableViewBeforeCommand,
      focusEditor,
      readOnly,
      selectionForInput,
      setNativeCursorPreview,
    });

  const handleKeyDown = useBlockEditorKeyDownHandler({
    compositionEnterKeyRef,
    contentEditableEngine,
    dispatchCommand,
    editorPlatform,
    flushContentEditableViewBeforeCommand,
    handleClipboardKeymapCommand,
    readOnly,
    runInput,
    selectionForInput,
  });

  useBlockEditorBeforeInputHandler({
    applyInputResult,
    compositionEnterKeyRef,
    compositionSelectionRef,
    contentEditableEngine,
    dispatchCommand,
    document,
    editorSurfaceElement,
    editorSurfaceRef,
    flushContentEditableViewBeforeCommand,
    geometry,
    lastFlushedDocumentRef,
    readOnly,
    runInput,
    selectionForInput,
    setComposing,
    setHasNativeRangeSelection,
    setNativeCursorPreview,
  });

  const { handleCompositionEnd, handleCompositionStart, handleInput } =
    useBlockEditorCompositionHandlers({
      compositionEnterKeyRef,
      compositionSelectionRef,
      contentEditableEngine,
      document,
      editorSurfaceRef,
      flushContentEditableView,
      geometry,
      readOnly,
      resetContentEditableView,
      selectionForInput,
      setComposing,
      setHasNativeRangeSelection,
      setNativeCursorPreview,
    });

  const handleBlur = useCallback(() => {
    flushContentEditableView();
    setNativeCursorPreview(null);
    setComposing(false);
    setHasNativeRangeSelection(false);
    setEditorFocused(false);
  }, [flushContentEditableView]);

  return {
    cursorOverlayPoint,
    debugRecording,
    geometry,
    handleBlur,
    handleCompositionEnd,
    handleCompositionStart,
    handleCopy,
    handleCut,
    handleDragOver,
    handleDrop,
    handleFocus,
    handleInput,
    handleKeyDown,
    handlePaste,
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleRedo,
    handleSelect,
    handleTitleChange,
    handleUndo,
    insertFigure,
    insertMention,
    isComposing,
    isEditorFocused,
    layoutMeasured,
    layoutVersion,
    note: document.value,
    overlayOwnerDocument: editorSurfaceElement?.ownerDocument ?? null,
    readOnly,
    selectionOverlay,
    setEditorSurfaceRef,
    title: document.value.title,
    visibleSelection,
  };
}
