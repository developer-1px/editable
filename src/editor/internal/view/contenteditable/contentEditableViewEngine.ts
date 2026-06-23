import type { SelectionSnap } from "@interactive-os/json-document";
import { selectionHasActiveTextMarks } from "../../model/markCommands";
import type { NoteDocument } from "../../model/noteDocument";
import { selectionIsCollapsed } from "../../model/richSelection";
import type { ContentEditableBeforeInput } from "./contentEditableBeforeInput";
import {
  canUseContentEditableCompositionPoint,
  isCompositionCommitInput,
  isContentEditableTextInsertionInputType,
  isContentEditableTextMutationInputType,
} from "./contentEditableInputPolicy";
import {
  type ContentEditableTextPoint,
  findElementByDataPath,
  isContentEditableDOMSelectionCollapsed,
  readDocumentText,
  textPointFromDOMSelection,
  textPointFromSelection,
} from "./contentEditableSelection";
import { readRootText, restoreDocumentText } from "./contentEditableTextDom";
import {
  type ContentEditableFlushResult,
  flushContentEditableTextChange,
} from "./contentEditableTextFlush";

export {
  type ContentEditableBeforeInput,
  contentEditableBeforeInputFromEvent,
} from "./contentEditableBeforeInput";
export {
  readContentEditableCursorPoint,
  readContentEditableSelection,
  setContentEditableSelection,
} from "./contentEditableSelection";
export { scrollContentEditableSelectionIntoView } from "./contentEditableSelectionScroll";

type ContentEditableBeforeInputDecision =
  | { kind: "history"; direction: "undo" | "redo" }
  | { kind: "commitComposition" }
  | { kind: "deferToContentEditable" }
  | { kind: "ignore" }
  | { kind: "runHeadless" };

type ContentEditableInputPhase =
  | "idle"
  | "native"
  | "composing"
  | "awaitingCommit";

export function createContentEditableViewEngine() {
  let activePath: string | null = null;
  let phase: ContentEditableInputPhase = "idle";
  let compositionStartText: string | null = null;
  let compositionStartOffset: number | null = null;
  let lastCompositionText: string | null = null;
  let finalCompositionCommitText: string | null = null;

  const begin = (point: ContentEditableTextPoint) => {
    activePath = point.path;
    if (phase === "idle") {
      phase = "native";
    }
  };

  const consumeCompositionCommit = (
    inputType: string,
    data?: string | null,
  ) => {
    if (phase !== "awaitingCommit" || !isCompositionCommitInput(inputType)) {
      return false;
    }

    finalCompositionCommitText = data ?? null;
    phase = activePath === null ? "idle" : "native";
    return true;
  };

  const pointForInput = (
    root: HTMLElement | null,
    document: NoteDocument,
    selection: SelectionSnap,
    inputType: string,
  ): ContentEditableTextPoint | null => {
    if (root === null || !isContentEditableTextMutationInputType(inputType)) {
      return null;
    }

    const domPoint = textPointFromDOMSelection(root);
    const domSelectionCollapsed =
      root !== null && isContentEditableDOMSelectionCollapsed(root);
    if (
      !selectionIsCollapsed(selection) &&
      !canUseContentEditableCompositionPoint(
        inputType,
        domPoint,
        selection,
        domSelectionCollapsed,
      )
    ) {
      return null;
    }
    if (
      selectionHasActiveTextMarks(selection) &&
      isContentEditableTextInsertionInputType(inputType)
    ) {
      return null;
    }

    const point = domPoint ?? textPointFromSelection(document, selection);
    if (point === null) {
      return null;
    }
    if (
      activePath !== null &&
      point.path !== activePath &&
      !(phase === "composing" && inputType === "insertCompositionText")
    ) {
      return null;
    }

    const textLength =
      findElementByDataPath(root, point.path)?.textContent?.length ??
      readDocumentText(document, point.path).length;

    if (inputType === "deleteContentBackward" && point.offset <= 0) {
      return null;
    }
    if (inputType === "deleteContentForward" && point.offset >= textLength) {
      return null;
    }

    return point;
  };

  return {
    hasActiveEdit() {
      return activePath !== null || phase !== "idle";
    },
    reset(root: HTMLElement | null, document: NoteDocument) {
      activePath = null;
      phase = "idle";
      compositionStartText = null;
      compositionStartOffset = null;
      lastCompositionText = null;
      finalCompositionCommitText = null;
      if (root !== null) {
        restoreDocumentText(root, document);
      }
    },
    beginComposition(
      root: HTMLElement | null,
      document: NoteDocument,
      selection: SelectionSnap,
    ) {
      phase = "composing";
      const point =
        root === null
          ? null
          : (textPointFromDOMSelection(root) ??
            textPointFromSelection(document, selection));
      if (point !== null) {
        activePath = point.path;
        compositionStartText = readRootText(root, point.path);
        compositionStartOffset = point.offset;
        lastCompositionText = compositionStartText;
      }
    },
    planBeforeInput(
      root: HTMLElement | null,
      document: NoteDocument,
      selection: SelectionSnap,
      input: ContentEditableBeforeInput,
    ): ContentEditableBeforeInputDecision {
      if (
        (phase === "composing" || phase === "awaitingCommit") &&
        (input.inputType === "historyUndo" || input.inputType === "historyRedo")
      ) {
        return { kind: "ignore" };
      }

      if (input.inputType === "historyUndo") {
        return { kind: "history", direction: "undo" };
      }
      if (input.inputType === "historyRedo") {
        return { kind: "history", direction: "redo" };
      }

      if (consumeCompositionCommit(input.inputType, input.data)) {
        return { kind: "commitComposition" };
      }

      const point = pointForInput(root, document, selection, input.inputType);
      if (point !== null) {
        if (
          phase === "composing" &&
          input.inputType === "insertCompositionText" &&
          point.path !== activePath
        ) {
          compositionStartText =
            readRootText(root, point.path) ??
            readDocumentText(document, point.path);
          compositionStartOffset = point.offset;
          lastCompositionText = compositionStartText;
        }
        begin(point);
        return { kind: "deferToContentEditable" };
      }

      return { kind: "runHeadless" };
    },
    shouldIgnoreKeyDown() {
      return phase === "composing" || phase === "awaitingCommit";
    },
    endComposition() {
      if (phase === "composing" || activePath !== null) {
        phase = "awaitingCommit";
      }
    },
    clearCompositionCommit() {
      if (phase !== "awaitingCommit") {
        return false;
      }

      phase = activePath === null ? "idle" : "native";
      return true;
    },
    trackInput(
      root: HTMLElement | null,
      document: NoteDocument,
    ): ContentEditableTextPoint | null {
      const point = root === null ? null : textPointFromDOMSelection(root);
      if (point === null) {
        return null;
      }
      if (
        activePath !== null &&
        point.path !== activePath &&
        phase !== "composing"
      ) {
        return null;
      }

      activePath = point.path;
      if (phase === "idle") {
        phase = "native";
      }
      if (phase === "composing") {
        lastCompositionText =
          readRootText(root, point.path) ??
          readDocumentText(document, point.path);
      }
      return point;
    },
    flush(
      root: HTMLElement | null,
      document: NoteDocument,
    ): ContentEditableFlushResult {
      const path = activePath;
      activePath = null;
      phase = "idle";
      const result = flushContentEditableTextChange(root, document, path, {
        compositionStartText,
        compositionStartOffset,
        lastCompositionText,
        finalCompositionCommitText,
      });
      compositionStartText = null;
      compositionStartOffset = null;
      lastCompositionText = null;
      finalCompositionCommitText = null;
      return result;
    },
  };
}
