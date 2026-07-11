import type {
  JSONDocument,
  JSONPatchOperation,
  Pointer,
  SelectionSnap,
  SelectionState,
} from "@interactive-os/json-document";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { ZodType } from "zod";
import type {
  EditableBlock,
  EditableBlockType,
  EditableDocumentValue,
  EditablePoint,
  EditorAction,
  EditorFault,
  EditorPhase,
  EditorResult,
  EditorSnapshot,
  JsonEditable,
  MountJsonEditableOptions,
  OrderedEditableSelection,
} from "./index";
import * as PublicAPI from "./index";

type ExpectedBlockType = "paragraph" | "heading" | "quote" | "code";
type ExpectedBlock = {
  id: string;
  type: ExpectedBlockType;
  text: string;
};
type ExpectedDocument = {
  schema: "interactive-os.editable-document@2";
  id: string;
  blocks: ExpectedBlock[];
};
type ExpectedPoint = { blockId: string; blockIndex: number; offset: number };
type ExpectedOrderedSelection = {
  start: ExpectedPoint;
  end: ExpectedPoint;
};
type ExpectedPhase = "idle" | "native-input" | "composing" | "settling";
type ExpectedSnapshot = {
  phase: ExpectedPhase;
  revision: number;
  queuedChanges: number;
  selection: SelectionSnap | null;
  composition: { blockId: string; from: number; to: number } | null;
};
type ExpectedFault = {
  code:
    | "out_of_band_document_write"
    | "foreign_dom_mutation"
    | "native_change_commit_failed"
    | "input_state_lost"
    | "composition_overlap"
    | "composition_conflict"
    | "queued_change_commit_failed";
  recoverable: boolean;
  reason: string;
};
type ExpectedAction =
  | {
      type: "patch";
      patch: ReadonlyArray<JSONPatchOperation>;
      label?: string;
      origin?: string;
      selectionAfter?: SelectionSnap | null;
    }
  | {
      type: "replaceText";
      blockId: string;
      from: number;
      to: number;
      text: string;
      label?: string;
      origin?: string;
    }
  | {
      type: "replaceSelection";
      text: string;
      label?: string;
      origin?: string;
    }
  | {
      type: "setBlockType";
      blockType: ExpectedBlockType;
      blockId?: string;
    }
  | { type: "insertParagraph" }
  | { type: "deleteBackward" | "deleteForward" }
  | { type: "joinBackward" }
  | { type: "joinForward" }
  | { type: "undo" | "redo" | "reset" };
type ExpectedResult =
  | {
      ok: true;
      change: "none" | "selection" | "document" | "queued";
      patch: ReadonlyArray<JSONPatchOperation>;
    }
  | {
      ok: false;
      code:
        | "destroyed"
        | "reentrant_transaction"
        | "block_not_found"
        | "selection_unavailable"
        | "composition_conflict"
        | "commit_failed";
      reason: string;
    };
type ExpectedEditor = {
  dispatch(action: ExpectedAction): ExpectedResult;
  getSnapshot(): ExpectedSnapshot;
  subscribe(listener: (snapshot: ExpectedSnapshot) => void): () => void;
  destroy(): void;
};
type ExpectedMountOptions = {
  root: HTMLElement;
  document: JSONDocument<ExpectedDocument>;
  onFault?: (fault: ExpectedFault) => void;
};

describe("editable public API", () => {
  it("exposes only the established runtime surface", () => {
    expect(Object.keys(PublicAPI).sort()).toEqual([
      "EditableDocumentSchema",
      "createEditableDocument",
      "createInitialEditableValue",
      "editableBlockIndexFromTextPath",
      "editableTextPath",
      "findEditableBlockIndex",
      "mountJsonEditable",
      "orderedEditableSelection",
      "primaryEditablePoint",
    ]);
  });

  it("preserves the established public type contracts", () => {
    expectTypeOf<EditableBlockType>().toEqualTypeOf<ExpectedBlockType>();
    expectTypeOf<EditableBlock>().toEqualTypeOf<ExpectedBlock>();
    expectTypeOf<EditableDocumentValue>().toEqualTypeOf<ExpectedDocument>();
    expectTypeOf<EditablePoint>().toEqualTypeOf<ExpectedPoint>();
    expectTypeOf<
      OrderedEditableSelection
    >().toEqualTypeOf<ExpectedOrderedSelection>();
    expectTypeOf<EditorPhase>().toEqualTypeOf<ExpectedPhase>();
    expectTypeOf<EditorSnapshot>().toEqualTypeOf<ExpectedSnapshot>();
    expectTypeOf<EditorFault>().toEqualTypeOf<ExpectedFault>();
    expectTypeOf<EditorAction>().toEqualTypeOf<ExpectedAction>();
    expectTypeOf<EditorResult>().toEqualTypeOf<ExpectedResult>();
    expectTypeOf<JsonEditable>().toEqualTypeOf<ExpectedEditor>();
    expectTypeOf<
      MountJsonEditableOptions
    >().toEqualTypeOf<ExpectedMountOptions>();

    expectTypeOf(PublicAPI.EditableDocumentSchema).toEqualTypeOf<
      ZodType<ExpectedDocument>
    >();
    expectTypeOf(PublicAPI.createEditableDocument).toEqualTypeOf<
      (initial?: ExpectedDocument) => JSONDocument<ExpectedDocument>
    >();
    expectTypeOf(PublicAPI.createInitialEditableValue).toEqualTypeOf<
      () => ExpectedDocument
    >();
    expectTypeOf(PublicAPI.editableTextPath).toEqualTypeOf<
      (blockIndex: number) => Pointer
    >();
    expectTypeOf(PublicAPI.editableBlockIndexFromTextPath).toEqualTypeOf<
      (path: Pointer) => number | null
    >();
    expectTypeOf(PublicAPI.findEditableBlockIndex).toEqualTypeOf<
      (value: ExpectedDocument, blockId: string) => number
    >();
    expectTypeOf(PublicAPI.primaryEditablePoint).toEqualTypeOf<
      (
        value: ExpectedDocument,
        selection:
          | Pick<SelectionState, "primaryRange">
          | null
          | undefined,
      ) => ExpectedPoint | null
    >();
    expectTypeOf(PublicAPI.orderedEditableSelection).toEqualTypeOf<
      (
        value: ExpectedDocument,
        selection:
          | Pick<SelectionState, "primaryRange">
          | null
          | undefined,
      ) => ExpectedOrderedSelection | null
    >();
    expectTypeOf(PublicAPI.mountJsonEditable).toEqualTypeOf<
      (options: ExpectedMountOptions) => ExpectedEditor
    >();
  });
});
