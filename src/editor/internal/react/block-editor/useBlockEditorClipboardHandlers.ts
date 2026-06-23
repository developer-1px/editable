import type { SelectionSnap } from "@interactive-os/json-document";
import {
  type ClipboardEvent,
  type DragEvent,
  type RefObject,
  useCallback,
} from "react";
import { serializeSelectionForClipboard } from "../../model/clipboard";
import { readClipboardTextFromTransfer } from "../../model/clipboardTransfer";
import { normalizeCursorPoint } from "../../model/cursor";
import { selectionFromCursorPoint } from "../../model/cursorCommands";
import type { EditorInput } from "../../model/inputAdapter";
import type { NoteDocument } from "../../model/noteDocument";
import { writeClipboardData } from "../../view/clipboardTransfer";
import type { CursorGeometry } from "../../view/cursorGeometry";

type BlockEditorClipboardDocument = {
  value: NoteDocument;
};

type UseBlockEditorClipboardHandlersInput = {
  document: BlockEditorClipboardDocument;
  editorSurfaceRef: RefObject<HTMLDivElement | null>;
  flushContentEditableViewBeforeCommand: () => SelectionSnap | null;
  geometry: CursorGeometry | null;
  readOnly: boolean;
  resetContentEditableView: (selection?: SelectionSnap) => void;
  runInput: (input: EditorInput, selection?: SelectionSnap) => boolean;
  selectionForInput: () => SelectionSnap;
  selectionForObservedCommand: () => SelectionSnap;
};

export function useBlockEditorClipboardHandlers({
  document,
  editorSurfaceRef,
  flushContentEditableViewBeforeCommand,
  geometry,
  readOnly,
  resetContentEditableView,
  runInput,
  selectionForInput,
  selectionForObservedCommand,
}: UseBlockEditorClipboardHandlersInput) {
  const handleClipboardKeymapCommand = useCallback(
    async (command: "copy" | "cut") => {
      const selectionBeforeFlush = selectionForInput();
      const selection = readOnly
        ? selectionBeforeFlush
        : (flushContentEditableViewBeforeCommand() ?? selectionBeforeFlush);
      const data = serializeSelectionForClipboard(document.value, selection);
      if (data === null) {
        if (readOnly) {
          resetContentEditableView(selection);
        }
        return;
      }

      const clipboard =
        editorSurfaceRef.current?.ownerDocument.defaultView?.navigator
          .clipboard ??
        (typeof navigator === "undefined" ? undefined : navigator.clipboard);
      if (clipboard?.writeText === undefined) {
        return;
      }

      try {
        await clipboard.writeText(data["text/plain"]);
      } catch {
        return;
      }

      if (command !== "cut") {
        return;
      }
      if (readOnly) {
        resetContentEditableView(selection);
        return;
      }

      runInput(
        {
          type: "beforeinput",
          inputType: "deleteByCut",
        },
        selection,
      );
    },
    [
      document.value,
      editorSurfaceRef,
      flushContentEditableViewBeforeCommand,
      readOnly,
      resetContentEditableView,
      runInput,
      selectionForInput,
    ],
  );

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

  return {
    handleClipboardKeymapCommand,
    handleCopy,
    handleCut,
    handleDragOver,
    handleDrop,
    handlePaste,
  };
}
