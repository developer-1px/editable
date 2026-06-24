import type {
  JSONDocument,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { flushSync } from "react-dom";
import type { CursorPoint } from "../../model/cursor";
import type { EditorCommand } from "../../model/editorCore";
import {
  type EditorInput,
  type EditorInputResult,
  translateEditorInput,
} from "../../model/inputAdapter";
import type { NoteDocument } from "../../model/noteDocument";
import type { EditorPlatform } from "../../model/platformModifier";
import { selectionIsCollapsed } from "../../model/richSelection";
import { selectionSnapshotPoint } from "../../view/blockEditorSelection";
import {
  type createContentEditableViewEngine,
  readContentEditableSelection,
  setContentEditableSelection,
} from "../../view/contentEditableViewEngine";
import type { CursorGeometry } from "../../view/cursorGeometry";
import {
  documentAfterPatch,
  selectionWithTransientContext,
} from "./blockEditorSelectionState";
import { dispatchEditorCommandToDocument } from "./editorCommandBridge";
import { textCommandFromMarkedNativeInsertion } from "./nativeMarkedInsertion";

type UseBlockEditorContentEditableTransactionsInput = {
  compositionEnterKeyRef: { current: boolean };
  compositionSelectionRef: { current: SelectionSnap | null };
  contentEditableEngine: ReturnType<typeof createContentEditableViewEngine>;
  document: JSONDocument<NoteDocument>;
  editorPlatform: EditorPlatform;
  editorSurfaceRef: RefObject<HTMLDivElement | null>;
  geometry: CursorGeometry | null;
  lastFlushedDocumentRef: { current: NoteDocument | null };
  readOnly: boolean;
  selectionForInput: () => SelectionSnap;
  selectionSnapshot: () => SelectionSnap;
  setComposing: Dispatch<SetStateAction<boolean>>;
  setHasNativeRangeSelection: Dispatch<SetStateAction<boolean>>;
  setNativeCursorPreview: Dispatch<SetStateAction<CursorPoint | null>>;
};

export function useBlockEditorContentEditableTransactions({
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
}: UseBlockEditorContentEditableTransactionsInput) {
  const previousReadOnlyRef = useRef(readOnly);

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
    [
      compositionEnterKeyRef,
      compositionSelectionRef,
      contentEditableEngine,
      document,
      document.value,
      editorSurfaceRef,
      lastFlushedDocumentRef,
      selectionSnapshot,
      setComposing,
      setHasNativeRangeSelection,
      setNativeCursorPreview,
    ],
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
    compositionSelectionRef,
    contentEditableEngine,
    document,
    document.value,
    editorSurfaceRef,
    lastFlushedDocumentRef,
    readOnly,
    resetContentEditableView,
    selectionSnapshot,
    setComposing,
    setHasNativeRangeSelection,
    setNativeCursorPreview,
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
    [document, setHasNativeRangeSelection, setNativeCursorPreview],
  );

  const runInput = useCallback(
    (input: EditorInput, selection = selectionSnapshot()) =>
      applyInputResult(
        translateEditorInput(document.value, selection, input, {
          geometry: geometry ?? undefined,
          platform: editorPlatform,
          readOnly,
        }),
      ),
    [
      applyInputResult,
      document.value,
      editorPlatform,
      geometry,
      readOnly,
      selectionSnapshot,
    ],
  );

  const dispatchCommand = useCallback(
    (command: EditorCommand, selection = selectionForInput()) => {
      if (readOnly) {
        return null;
      }

      const result = dispatchEditorCommandToDocument(document, command, {
        selection,
        ...(geometry === null ? {} : { view: { geometry: () => geometry } }),
      });
      if (!result.ok) {
        return null;
      }

      setHasNativeRangeSelection(false);
      setNativeCursorPreview(selectionSnapshotPoint(result.selectionAfter));
      return result.selectionAfter;
    },
    [
      document,
      geometry,
      readOnly,
      selectionForInput,
      setHasNativeRangeSelection,
      setNativeCursorPreview,
    ],
  );

  return {
    applyInputResult,
    dispatchCommand,
    flushContentEditableView,
    flushContentEditableViewBeforeCommand,
    resetContentEditableView,
    runInput,
  };
}
