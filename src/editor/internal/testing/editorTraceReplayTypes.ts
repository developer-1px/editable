export type EditorTraceReplay = {
  contractIds?: readonly EditorInputContractId[];
  name: string;
  schema: "editable-trace-replay@1";
  steps: EditorTraceStep[];
};

export type EditorInputContractId =
  | "CLIP-01"
  | "CLIP-02"
  | "CLIP-03"
  | "DEL-01"
  | "DEL-02"
  | "DEL-03"
  | "HIST-01"
  | "HIST-02"
  | "IME-01"
  | "IME-02"
  | "IME-03"
  | "IME-04"
  | "MUT-01"
  | "MUT-02"
  | "RO-01"
  | "RO-02"
  | "SEL-01"
  | "SEL-02"
  | "SEL-03"
  | "SEL-04";

export type EditorTraceStep =
  | {
      kind: "event";
      event: EditorTraceEvent;
      expect?: EditorTraceExpectation;
    }
  | {
      kind: "selection";
      anchor?: {
        offset: number;
        path: string;
      };
      focus?: {
        offset: number;
        path: string;
      };
      offset?: number;
      path?: string;
    }
  | {
      kind: "text";
      path: string;
      text: string;
      offset?: number;
    }
  | {
      kind: "timers";
    };

export type EditorTraceEvent =
  | KeyboardTraceEvent
  | CompositionTraceEvent
  | InputTraceEvent
  | TransferTraceEvent
  | FocusTraceEvent
  | PointerTraceEvent;

export type KeyboardTraceEvent = {
  altKey?: boolean;
  code?: string;
  ctrlKey?: boolean;
  isComposing?: boolean;
  key: string;
  keyCode?: number;
  metaKey?: boolean;
  shiftKey?: boolean;
  type: "keydown" | "keyup";
};

export type CompositionTraceEvent = {
  data?: string;
  type: "compositionend" | "compositionstart" | "compositionupdate";
};

export type InputTraceEvent = {
  data?: string | null;
  inputType: string;
  isComposing?: boolean;
  type: "beforeinput" | "input";
};

export type TransferTraceEvent = {
  clientX?: number;
  clientY?: number;
  data?: Record<string, string>;
  format?: "markdown" | "plain";
  text?: string;
  type: "cut" | "drop" | "paste";
};

export type FocusTraceEvent = {
  type: "blur" | "focus";
};

export type PointerTraceEvent = {
  button?: number;
  clientX?: number;
  clientY?: number;
  detail?: number;
  pointerId?: number;
  shiftKey?: boolean;
  targetPath?: string;
  type: "pointerdown";
};

export type EditorTraceExpectation = {
  after?: ReplayedEditorStateExpectation;
  before?: ReplayedEditorStateExpectation;
};

export type ReplayedEditorStateExpectation = Partial<
  Omit<ReplayedEditorState, "pathText">
> & {
  pathText?: Record<string, string>;
};

export type ReplayedEditorState = {
  domSelectionAnchorOffset: string | null;
  domSelectionAnchorPath: string | null;
  domSelectionCollapsed: string | null;
  domSelectionFocusOffset: string | null;
  domSelectionFocusPath: string | null;
  domSelectionText: string;
  pathText: Record<string, string>;
  selectionAnchorEdge: string | null;
  selectionAnchorOffset: string | null;
  selectionAnchorPath: string | null;
  selectionEdge: string | null;
  selectionFocusEdge: string | null;
  selectionFocusOffset: string | null;
  selectionFocusPath: string | null;
  selectionOffset: string | null;
  selectionPath: string | null;
  selectionRangeCount: string | null;
  selectionSelectedPointers: string | null;
  text: string;
};

export type ReplayedEditorEvent = {
  after: ReplayedEditorState;
  before: ReplayedEditorState;
  defaultPrevented: boolean;
  event: EditorTraceEvent;
  index: number;
  stateChanged: boolean;
};
