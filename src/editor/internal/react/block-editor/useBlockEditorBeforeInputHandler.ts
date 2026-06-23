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
} from "react";
import type { CursorPoint } from "../../model/cursor";
import type { EditorCommand } from "../../model/editorCore";
import {
  type EditorInput,
  type EditorInputResult,
  translateEditorInput,
} from "../../model/inputAdapter";
import { selectionHasActiveTextMarks } from "../../model/markCommands";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionSnapshotPoint } from "../../view/blockEditorSelection";
import {
  contentEditableBeforeInputFromEvent,
  type createContentEditableViewEngine,
} from "../../view/contentEditableViewEngine";
import type { CursorGeometry } from "../../view/cursorGeometry";
import { documentAfterPatch } from "./blockEditorSelectionState";

type UseBlockEditorBeforeInputHandlerInput = {
  applyInputResult: (result: EditorInputResult) => boolean;
  compositionEnterKeyRef: { current: boolean };
  compositionSelectionRef: { current: SelectionSnap | null };
  contentEditableEngine: ReturnType<typeof createContentEditableViewEngine>;
  dispatchCommand: (
    command: EditorCommand,
    selection?: SelectionSnap,
  ) => SelectionSnap | null;
  document: JSONDocument<NoteDocument>;
  editorSurfaceElement: HTMLDivElement | null;
  editorSurfaceRef: RefObject<HTMLDivElement | null>;
  flushContentEditableViewBeforeCommand: () => SelectionSnap | null;
  geometry: CursorGeometry | null;
  lastFlushedDocumentRef: { current: NoteDocument | null };
  readOnly: boolean;
  runInput: (input: EditorInput, selection?: SelectionSnap) => boolean;
  selectionForInput: () => SelectionSnap;
  setComposing: Dispatch<SetStateAction<boolean>>;
  setHasNativeRangeSelection: Dispatch<SetStateAction<boolean>>;
  setNativeCursorPreview: Dispatch<SetStateAction<CursorPoint | null>>;
};

export function useBlockEditorBeforeInputHandler({
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
}: UseBlockEditorBeforeInputHandlerInput) {
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
        const selectionAfterFlush = flushContentEditableViewBeforeCommand();
        dispatchCommand(
          { type: decision.direction },
          selectionAfterFlush ?? selectionForInput(),
        );
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
      applyInputResult,
      compositionEnterKeyRef,
      compositionSelectionRef,
      contentEditableEngine,
      dispatchCommand,
      document,
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
}
