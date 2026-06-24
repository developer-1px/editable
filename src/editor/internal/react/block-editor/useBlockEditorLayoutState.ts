import type { SelectionSnap } from "@interactive-os/json-document";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionRevealKey } from "../../view/blockEditorSelection";
import { scrollContentEditableSelectionIntoView } from "../../view/contentEditableViewEngine";

type UseBlockEditorLayoutStateInput = {
  document: NoteDocument;
  editorSurfaceRef: RefObject<HTMLDivElement | null>;
  isEditorFocused: boolean;
  visibleSelection: SelectionSnap | undefined;
};

export function useBlockEditorLayoutState({
  document,
  editorSurfaceRef,
  isEditorFocused,
  visibleSelection,
}: UseBlockEditorLayoutStateInput) {
  const revealedSelectionKeyRef = useRef<string | null>(null);
  const measuredLayoutKeyRef = useRef<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const layoutMeasureKey = JSON.stringify(document);
  const layoutMeasured = measuredLayoutKeyRef.current === layoutMeasureKey;
  const revealSelectionKey = selectionRevealKey(visibleSelection);

  useLayoutEffect(() => {
    if (!isEditorFocused || revealSelectionKey === null) {
      return;
    }
    if (revealedSelectionKeyRef.current === revealSelectionKey) {
      return;
    }

    scrollContentEditableSelectionIntoView(
      editorSurfaceRef.current,
      document,
      visibleSelection,
    );
    revealedSelectionKeyRef.current = revealSelectionKey;
  }, [
    document,
    editorSurfaceRef,
    isEditorFocused,
    revealSelectionKey,
    visibleSelection,
  ]);

  useLayoutEffect(() => {
    if (measuredLayoutKeyRef.current === layoutMeasureKey) {
      return;
    }
    measuredLayoutKeyRef.current = layoutMeasureKey;

    if (editorSurfaceRef.current !== null) {
      setLayoutVersion((version) => version + 1);
    }
  }, [editorSurfaceRef, layoutMeasureKey]);

  return {
    layoutMeasured,
    layoutVersion,
  };
}
