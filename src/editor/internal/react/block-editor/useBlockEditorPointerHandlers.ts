import type { SelectionSnap } from "@interactive-os/json-document";
import { type PointerEvent, useCallback, useRef } from "react";
import { type CursorPoint, normalizeCursorPoint } from "../../model/cursor";
import {
  selectionFromCursorPoint,
  selectionFromCursorRange,
} from "../../model/cursorCommands";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionFromNodeTarget } from "../../model/richSelection";
import {
  selectableAtomPathFromEventTarget,
  selectionAnchorForPointer,
  selectionForCurrentBlock,
  selectionForWordAtPoint,
} from "../../view/blockEditorSelection";
import {
  readContentEditableCursorPoint,
  setContentEditableSelection,
} from "../../view/contentEditableViewEngine";
import type { CursorGeometry } from "../../view/cursorGeometry";
import { focusElementPreservingScroll } from "../../view/focusScroll";
import {
  capturePointer,
  isTouchPointer,
  releasePointer,
} from "./blockEditorPointerCapture";

type BlockEditorSelectionStore = {
  restore(selection: SelectionSnap): void;
};

type BlockEditorPointerDocument = {
  selection?: BlockEditorSelectionStore;
  value: NoteDocument;
};

type UseBlockEditorPointerHandlersInput = {
  document: BlockEditorPointerDocument;
  flushContentEditableView: () => SelectionSnap | null;
  focusEditor: () => void;
  geometry: CursorGeometry | null;
  selectionSnapshot: () => SelectionSnap;
  setEditorFocused: (focused: boolean) => void;
  setNativeCursorPreview: (point: CursorPoint | null) => void;
};

export function useBlockEditorPointerHandlers({
  document,
  flushContentEditableView,
  focusEditor,
  geometry,
  selectionSnapshot,
  setEditorFocused,
  setNativeCursorPreview,
}: UseBlockEditorPointerHandlersInput) {
  const pointerDragRef = useRef<{
    pointerId: number;
    anchor: CursorPoint;
  } | null>(null);

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      if (isTouchPointer(event)) {
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
        setEditorFocused(focusElementPreservingScroll(event.currentTarget));
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
      if (!event.shiftKey && event.detail < 2) {
        pointerDragRef.current = {
          pointerId: event.pointerId,
          anchor: normalized,
        };
        capturePointer(event.currentTarget, event.pointerId);
      } else {
        pointerDragRef.current = null;
      }
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
      setEditorFocused,
      setNativeCursorPreview,
    ],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isTouchPointer(event)) {
        return;
      }

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
    [document, geometry, setNativeCursorPreview],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (pointerDragRef.current?.pointerId === event.pointerId) {
      pointerDragRef.current = null;
      releasePointer(event.currentTarget, event.pointerId);
    }
  }, []);

  const handlePointerCancel = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (pointerDragRef.current?.pointerId === event.pointerId) {
        pointerDragRef.current = null;
        releasePointer(event.currentTarget, event.pointerId);
      }
    },
    [],
  );

  return {
    handlePointerCancel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
