export {
  type CreateEditorOptions,
  createEditor,
  type Editor,
  type EditorCapability,
  type EditorCommand,
  type EditorDeleteUnit,
  type EditorListener,
  type EditorMoveDirection,
  type EditorMoveUnit,
  type EditorQuery,
  type EditorQueryResult,
  type EditorResult,
  type EditorSnapshot,
  type EditorViewAdapter,
  type InsertableEditorNode,
  type ToggleMarkCommandType,
} from "../internal/model/editorCore";
export type {
  Mark,
  NoteDocument,
} from "../internal/model/noteDocument";
export type { RichSelection } from "../internal/model/richSelection";
export {
  type NoteDocumentParseResult,
  parseNoteDocument,
} from "./noteDocument";
