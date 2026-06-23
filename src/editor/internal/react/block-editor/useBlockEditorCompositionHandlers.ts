import type {
  JSONDocument,
  SelectionSnap,
} from "@interactive-os/json-document";
import {
  type CompositionEvent,
  type Dispatch,
  type RefObject,
  type SetStateAction,
  useCallback,
} from "react";
import type { CursorPoint } from "../../model/cursor";
import { translateEditorInput } from "../../model/inputAdapter";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionSnapshotPoint } from "../../view/blockEditorSelection";
import {
  type createContentEditableViewEngine,
  setContentEditableSelection,
} from "../../view/contentEditableViewEngine";
import type { CursorGeometry } from "../../view/cursorGeometry";
import {
  documentAfterPatch,
  shouldDeleteSelectionBeforeNativeComposition,
} from "./blockEditorSelectionState";

type UseBlockEditorCompositionHandlersInput = {
  compositionEnterKeyRef: { current: boolean };
  compositionSelectionRef: { current: SelectionSnap | null };
  contentEditableEngine: ReturnType<typeof createContentEditableViewEngine>;
  document: JSONDocument<NoteDocument>;
  editorSurfaceRef: RefObject<HTMLDivElement | null>;
  flushContentEditableView: () => SelectionSnap | null;
  geometry: CursorGeometry | null;
  readOnly: boolean;
  resetContentEditableView: (selection?: SelectionSnap) => void;
  selectionForInput: () => SelectionSnap;
  setComposing: Dispatch<SetStateAction<boolean>>;
  setHasNativeRangeSelection: Dispatch<SetStateAction<boolean>>;
  setNativeCursorPreview: Dispatch<SetStateAction<CursorPoint | null>>;
};

export function useBlockEditorCompositionHandlers({
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
}: UseBlockEditorCompositionHandlersInput) {
  const handleCompositionStart = useCallback(
    (event: CompositionEvent<HTMLDivElement>) => {
      if (readOnly) {
        event.preventDefault();
        resetContentEditableView();
        return;
      }

      const root = editorSurfaceRef.current;
      let documentForComposition = document.value;
      let selection = selectionForInput();
      if (shouldDeleteSelectionBeforeNativeComposition(selection)) {
        event.preventDefault();
        const deleteResult = translateEditorInput(
          document.value,
          selection,
          { type: "beforeinput", inputType: "deleteContent" },
          {
            geometry: geometry ?? undefined,
            readOnly,
          },
        );
        if (deleteResult.ok && deleteResult.handled) {
          documentForComposition =
            deleteResult.patch.length === 0
              ? document.value
              : documentAfterPatch(document.value, deleteResult.patch);
          selection = deleteResult.selectionAfter;
          setHasNativeRangeSelection(false);
          setNativeCursorPreview(selectionSnapshotPoint(selection));
          if (deleteResult.patch.length > 0) {
            document.commit(deleteResult.patch, { selectionAfter: selection });
          } else {
            document.selection?.restore(selection);
          }
          contentEditableEngine.reset(root, documentForComposition);
          const point = selectionSnapshotPoint(selection);
          if (root !== null && point !== null) {
            setContentEditableSelection(root, documentForComposition, point);
          }
        }
      }

      setComposing(true);
      compositionEnterKeyRef.current = false;
      compositionSelectionRef.current = selection;
      contentEditableEngine.beginComposition(
        root,
        documentForComposition,
        selection,
      );
    },
    [
      compositionEnterKeyRef,
      compositionSelectionRef,
      contentEditableEngine,
      document,
      document.value,
      editorSurfaceRef,
      geometry,
      readOnly,
      resetContentEditableView,
      selectionForInput,
      setComposing,
      setHasNativeRangeSelection,
      setNativeCursorPreview,
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
      contentEditableEngine,
      flushContentEditableView,
      readOnly,
      resetContentEditableView,
      setComposing,
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
    contentEditableEngine,
    document.value,
    editorSurfaceRef,
    readOnly,
    resetContentEditableView,
    setHasNativeRangeSelection,
    setNativeCursorPreview,
  ]);

  return {
    handleCompositionEnd,
    handleCompositionStart,
    handleInput,
  };
}
