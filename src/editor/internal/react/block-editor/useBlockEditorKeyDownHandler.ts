import type { SelectionSnap } from "@interactive-os/json-document";
import { type KeyboardEvent, useCallback } from "react";
import type { EditorCommand } from "../../model/editorCore";
import {
  type EditorInput,
  isReadOnlyEditingKeyDown,
} from "../../model/inputAdapter";
import type { EditorPlatform } from "../../model/platformModifier";
import { isHeadlessKeyDown } from "../../view/editorKeyboardPolicy";
import { matchEditorKeymap } from "../../view/editorKeymap";
import { selectionWithoutCollapsedSelectedPointers } from "./blockEditorSelectionState";

type ContentEditableKeyDownEngine = {
  shouldIgnoreKeyDown(): boolean;
};

type UseBlockEditorKeyDownHandlerInput = {
  compositionEnterKeyRef: { current: boolean };
  contentEditableEngine: ContentEditableKeyDownEngine;
  dispatchCommand: (
    command: EditorCommand,
    selection?: SelectionSnap,
  ) => SelectionSnap | null;
  editorPlatform: EditorPlatform;
  flushContentEditableViewBeforeCommand: () => SelectionSnap | null;
  handleClipboardKeymapCommand: (command: "copy" | "cut") => boolean;
  readOnly: boolean;
  runInput: (input: EditorInput, selection?: SelectionSnap) => boolean;
  selectionForInput: () => SelectionSnap;
};

export function useBlockEditorKeyDownHandler({
  compositionEnterKeyRef,
  contentEditableEngine,
  dispatchCommand,
  editorPlatform,
  flushContentEditableViewBeforeCommand,
  handleClipboardKeymapCommand,
  readOnly,
  runInput,
  selectionForInput,
}: UseBlockEditorKeyDownHandlerInput) {
  return useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (!readOnly && contentEditableEngine.shouldIgnoreKeyDown()) {
        if (isPlainEnterKeyDown(event)) {
          compositionEnterKeyRef.current = true;
        }
        event.preventDefault();
        return;
      }

      const altGraphKey = event.getModifierState("AltGraph");
      const keymapCommand = matchEditorKeymap(
        {
          altGraphKey,
          altKey: event.altKey,
          ctrlKey: event.ctrlKey,
          key: event.key,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
        },
        editorPlatform,
      );
      if (keymapCommand !== null) {
        if (keymapCommand === "copy" || keymapCommand === "cut") {
          if (handleClipboardKeymapCommand(keymapCommand)) {
            event.preventDefault();
          }
          return;
        }
        if (keymapCommand === "paste") {
          return;
        }
        event.preventDefault();
        if (readOnly) {
          return;
        }

        const selectionAfterFlush = flushContentEditableViewBeforeCommand();
        dispatchCommand(
          { type: keymapCommand },
          selectionAfterFlush ?? selectionForInput(),
        );
        return;
      }

      if (
        readOnly &&
        isReadOnlyEditingKeyDown(
          {
            type: "keydown",
            key: event.key,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            altGraphKey,
            isComposing: event.nativeEvent.isComposing,
          },
          { platform: editorPlatform },
        )
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
            altGraphKey,
            isComposing: event.nativeEvent.isComposing,
          },
          selectionForInput(),
        );
        return;
      }
      if (event.nativeEvent.isComposing) {
        return;
      }

      if (
        !isHeadlessKeyDown(
          {
            altGraphKey,
            altKey: event.altKey,
            ctrlKey: event.ctrlKey,
            key: event.key,
            metaKey: event.metaKey,
            shiftKey: event.shiftKey,
          },
          editorPlatform,
        )
      ) {
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
            altGraphKey,
            isComposing: event.nativeEvent.isComposing,
          },
          selectionForCommand,
        )
      ) {
        event.preventDefault();
      }
    },
    [
      compositionEnterKeyRef,
      contentEditableEngine,
      dispatchCommand,
      editorPlatform,
      flushContentEditableViewBeforeCommand,
      handleClipboardKeymapCommand,
      readOnly,
      runInput,
      selectionForInput,
    ],
  );
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
