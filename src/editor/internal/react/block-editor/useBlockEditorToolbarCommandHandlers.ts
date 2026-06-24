import type { SelectionSnap } from "@interactive-os/json-document";
import { useCallback, useRef } from "react";
import type { CursorPoint } from "../../model/cursor";
import type { EditorCommand } from "../../model/editorCore";
import { selectionSnapshotPoint } from "../../view/blockEditorSelection";

type UseBlockEditorToolbarCommandHandlersInput = {
  currentSelectionSnapshot: () => SelectionSnap | undefined;
  dispatchCommand: (
    command: EditorCommand,
    selection?: SelectionSnap,
  ) => SelectionSnap | null;
  flushContentEditableViewBeforeCommand: () => SelectionSnap | null;
  focusEditor: () => void;
  readOnly: boolean;
  selectionForInput: () => SelectionSnap;
  setNativeCursorPreview: (point: CursorPoint | null) => void;
};

export function useBlockEditorToolbarCommandHandlers({
  currentSelectionSnapshot,
  dispatchCommand,
  flushContentEditableViewBeforeCommand,
  focusEditor,
  readOnly,
  selectionForInput,
  setNativeCursorPreview,
}: UseBlockEditorToolbarCommandHandlersInput) {
  const mentionCountRef = useRef(0);
  const figureCountRef = useRef(1);

  const insertMention = useCallback(() => {
    if (readOnly) {
      return;
    }

    mentionCountRef.current += 1;
    const selectionAfterFlush = flushContentEditableViewBeforeCommand();
    const selectionAfter = dispatchCommand(
      {
        type: "insertNode",
        node: {
          type: "mention",
          id: `mention-${mentionCountRef.current}`,
          label: "Ada",
        },
      },
      selectionAfterFlush ?? selectionForInput(),
    );
    if (selectionAfter !== null) {
      focusEditor();
      setNativeCursorPreview(selectionSnapshotPoint(selectionAfter));
    }
  }, [
    dispatchCommand,
    focusEditor,
    flushContentEditableViewBeforeCommand,
    readOnly,
    selectionForInput,
    setNativeCursorPreview,
  ]);

  const insertFigure = useCallback(() => {
    if (readOnly) {
      return;
    }

    const selectionAfterFlush = flushContentEditableViewBeforeCommand();
    figureCountRef.current += 1;
    const selectionAfter = dispatchCommand(
      {
        type: "insertNode",
        node: {
          type: "figure",
          id: `figure-${figureCountRef.current}`,
          src: "/sample-figure.svg",
          alt: "Figure",
        },
      },
      selectionAfterFlush ?? selectionForInput(),
    );
    if (selectionAfter !== null) {
      focusEditor();
      setNativeCursorPreview(selectionSnapshotPoint(selectionAfter));
    }
  }, [
    dispatchCommand,
    focusEditor,
    flushContentEditableViewBeforeCommand,
    readOnly,
    selectionForInput,
    setNativeCursorPreview,
  ]);

  const handleUndo = useCallback(() => {
    if (readOnly) {
      focusEditor();
      return;
    }

    const selectionAfterFlush = flushContentEditableViewBeforeCommand();
    dispatchCommand(
      { type: "undo" },
      selectionAfterFlush ?? selectionForInput(),
    );
    focusEditor();
    setNativeCursorPreview(selectionSnapshotPoint(currentSelectionSnapshot()));
  }, [
    currentSelectionSnapshot,
    dispatchCommand,
    flushContentEditableViewBeforeCommand,
    focusEditor,
    readOnly,
    selectionForInput,
    setNativeCursorPreview,
  ]);

  const handleRedo = useCallback(() => {
    if (readOnly) {
      focusEditor();
      return;
    }

    const selectionAfterFlush = flushContentEditableViewBeforeCommand();
    dispatchCommand(
      { type: "redo" },
      selectionAfterFlush ?? selectionForInput(),
    );
    focusEditor();
    setNativeCursorPreview(selectionSnapshotPoint(currentSelectionSnapshot()));
  }, [
    currentSelectionSnapshot,
    dispatchCommand,
    flushContentEditableViewBeforeCommand,
    focusEditor,
    readOnly,
    selectionForInput,
    setNativeCursorPreview,
  ]);

  return {
    handleRedo,
    handleUndo,
    insertFigure,
    insertMention,
  };
}
