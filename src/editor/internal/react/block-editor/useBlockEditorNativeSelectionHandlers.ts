import type { SelectionSnap } from "@interactive-os/json-document";
import {
  type Dispatch,
  type FocusEvent,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { type CursorPoint, firstCursorPoint } from "../../model/cursor";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionIsCollapsed } from "../../model/richSelection";
import { selectionSnapshotPoint } from "../../view/blockEditorSelection";
import {
  readContentEditableCursorPoint,
  readContentEditableSelection,
  setContentEditableSelection,
} from "../../view/contentEditableViewEngine";
import { focusElementPreservingScroll } from "../../view/focusScroll";
import {
  cursorPointsEqual,
  selectionWithTransientContext,
} from "./blockEditorSelectionState";

type BlockEditorSelectionStore = {
  restore(selection: SelectionSnap): void;
  snapshot(): SelectionSnap | undefined;
};

type BlockEditorNativeSelectionDocument = {
  selection?: BlockEditorSelectionStore;
  value: NoteDocument;
};

type ContentEditableNativeSelectionEngine = {
  hasActiveEdit(): boolean;
};

type UseBlockEditorNativeSelectionHandlersInput = {
  contentEditableEngine: ContentEditableNativeSelectionEngine;
  document: BlockEditorNativeSelectionDocument;
  editorSurfaceElement: HTMLDivElement | null;
  editorSurfaceRef: RefObject<HTMLDivElement | null>;
  hasNativeRangeSelection: boolean;
  nativeCursorPreview: CursorPoint | null;
  selectionSnapshot: () => SelectionSnap;
  setEditorFocused: (focused: boolean) => void;
  setHasNativeRangeSelection: Dispatch<SetStateAction<boolean>>;
  setNativeCursorPreview: Dispatch<SetStateAction<CursorPoint | null>>;
};

export function useBlockEditorNativeSelectionHandlers({
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
}: UseBlockEditorNativeSelectionHandlersInput) {
  const didAutofocusRef = useRef(false);

  useEffect(() => {
    if (didAutofocusRef.current) {
      return;
    }

    const root = editorSurfaceRef.current;
    if (root === null) {
      return;
    }

    didAutofocusRef.current = true;
    setEditorFocused(focusElementPreservingScroll(root));

    const point =
      selectionSnapshotPoint(document.selection?.snapshot()) ??
      firstCursorPoint(document.value);
    setContentEditableSelection(root, document.value, point);
    setNativeCursorPreview(readContentEditableCursorPoint(root) ?? point);
  }, [
    document.selection,
    document.value,
    editorSurfaceRef,
    setEditorFocused,
    setNativeCursorPreview,
  ]);

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
      editorSurfaceRef,
      selectionSnapshot,
      setHasNativeRangeSelection,
      setNativeCursorPreview,
    ],
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
    [
      document.selection,
      document.value,
      setEditorFocused,
      setHasNativeRangeSelection,
      setNativeCursorPreview,
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
    return () => {
      root.removeEventListener("select", handleSelect);
    };
  }, [editorSurfaceElement, handleSelect]);

  return {
    handleFocus,
    handleSelect,
  };
}
