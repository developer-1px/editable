import type { EditorTraceReplay } from "../../testing/editorTraceReplay";

const firstTextPath = "/root/children/0/children/0/text";
const mentionPath = "/root/children/0/children/9";

export const p0HorizontalSelectionTrace: EditorTraceReplay = {
  name: "p0-horizontal-selection",
  schema: "editable-trace-replay@1",
  steps: [
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowRight" },
      expect: {
        before: {
          domSelectionCollapsed: "true",
          domSelectionFocusOffset: "0",
          domSelectionFocusPath: firstTextPath,
          selectionOffset: "0",
          selectionPath: firstTextPath,
        },
        after: {
          selectionOffset: "1",
          selectionPath: firstTextPath,
        },
      },
    },
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowRight" },
      expect: {
        before: {
          selectionOffset: "1",
          selectionPath: firstTextPath,
        },
        after: {
          selectionOffset: "2",
          selectionPath: firstTextPath,
        },
      },
    },
    {
      kind: "selection",
      anchor: { path: firstTextPath, offset: 1 },
      focus: { path: firstTextPath, offset: 3 },
    },
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowRight" },
      expect: {
        before: {
          domSelectionCollapsed: "false",
          domSelectionText: "la",
        },
        after: {
          selectionOffset: "3",
          selectionPath: firstTextPath,
        },
      },
    },
    {
      kind: "selection",
      anchor: { path: firstTextPath, offset: 1 },
      focus: { path: firstTextPath, offset: 3 },
    },
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowLeft" },
      expect: {
        before: {
          domSelectionCollapsed: "false",
          domSelectionText: "la",
        },
        after: {
          selectionOffset: "1",
          selectionPath: firstTextPath,
        },
      },
    },
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowRight", shiftKey: true },
      expect: {
        after: {
          selectionAnchorOffset: "1",
          selectionAnchorPath: firstTextPath,
          selectionFocusOffset: "2",
          selectionFocusPath: firstTextPath,
          selectionPath: firstTextPath,
        },
      },
    },
  ],
};

export const p0RangeReplacementTrace: EditorTraceReplay = {
  name: "p0-range-replacement",
  schema: "editable-trace-replay@1",
  steps: [
    {
      kind: "selection",
      anchor: { path: firstTextPath, offset: 0 },
      focus: { path: firstTextPath, offset: 5 },
    },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "insertText", data: "x" },
      expect: {
        before: {
          domSelectionCollapsed: "false",
          domSelectionText: "Plain",
        },
        after: {
          pathText: {
            [firstTextPath]: "x ",
          },
          selectionOffset: "1",
          selectionPath: firstTextPath,
        },
      },
    },
  ],
};

export const p0RangeBackspaceTrace: EditorTraceReplay = {
  name: "p0-range-backspace",
  schema: "editable-trace-replay@1",
  steps: [
    {
      kind: "selection",
      anchor: { path: firstTextPath, offset: 0 },
      focus: { path: firstTextPath, offset: 5 },
    },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "deleteContentBackward" },
      expect: {
        before: {
          domSelectionCollapsed: "false",
          domSelectionText: "Plain",
        },
        after: {
          pathText: {
            [firstTextPath]: " ",
          },
          selectionOffset: "0",
          selectionPath: firstTextPath,
        },
      },
    },
  ],
};

export const p0RangeDeleteForwardTrace: EditorTraceReplay = {
  name: "p0-range-delete-forward",
  schema: "editable-trace-replay@1",
  steps: [
    {
      kind: "selection",
      anchor: { path: firstTextPath, offset: 0 },
      focus: { path: firstTextPath, offset: 5 },
    },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "deleteContentForward" },
      expect: {
        before: {
          domSelectionCollapsed: "false",
          domSelectionText: "Plain",
        },
        after: {
          pathText: {
            [firstTextPath]: " ",
          },
          selectionOffset: "0",
          selectionPath: firstTextPath,
        },
      },
    },
  ],
};

export const p0EmptyBlockBackspaceTrace: EditorTraceReplay = {
  name: "p0-empty-block-backspace",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "selection", path: firstTextPath, offset: 0 },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "insertText", data: "abc" },
      expect: {
        after: {
          pathText: {
            [firstTextPath]: "abcPlain ",
          },
          selectionOffset: "3",
          selectionPath: firstTextPath,
        },
      },
    },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "insertParagraph" },
      expect: {
        after: {
          pathText: {
            "/root/children/0/children/0/text": "abc",
            "/root/children/1/children/0/text": "Plain ",
          },
          selectionOffset: "0",
          selectionPath: "/root/children/1/children/0/text",
        },
      },
    },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "insertParagraph" },
      expect: {
        after: {
          pathText: {
            "/root/children/0/children/0/text": "abc",
            "/root/children/1/children/0/text": "",
            "/root/children/2/children/0/text": "Plain ",
          },
          selectionOffset: "0",
          selectionPath: "/root/children/1/children/0/text",
        },
      },
    },
    {
      kind: "event",
      event: { type: "beforeinput", inputType: "deleteContentBackward" },
      expect: {
        after: {
          pathText: {
            "/root/children/0/children/0/text": "abc",
            "/root/children/1/children/0/text": "Plain ",
          },
          selectionOffset: "3",
          selectionPath: "/root/children/0/children/0/text",
        },
      },
    },
  ],
};

export const p0AtomReplacementTrace: EditorTraceReplay = {
  name: "p0-atom-replacement",
  schema: "editable-trace-replay@1",
  steps: [
    {
      kind: "event",
      event: { type: "pointerdown", targetPath: mentionPath },
      expect: {
        after: {
          selectionAnchorEdge: "before",
          selectionAnchorPath: mentionPath,
          selectionFocusEdge: "after",
          selectionFocusPath: mentionPath,
          selectionSelectedPointers: mentionPath,
        },
      },
    },
    {
      kind: "event",
      event: {
        type: "beforeinput",
        inputType: "insertText",
        data: "Ada Lovelace",
      },
      expect: {
        after: {
          pathText: {
            "/root/children/0/children/8/text": " Ada Lovelace",
          },
          selectionOffset: "13",
          selectionPath: "/root/children/0/children/8/text",
          selectionSelectedPointers: "",
        },
      },
    },
  ],
};

export const p0AtomKeyboardNavigationTrace: EditorTraceReplay = {
  name: "p0-atom-keyboard-navigation",
  schema: "editable-trace-replay@1",
  steps: [
    {
      kind: "event",
      event: { type: "pointerdown", targetPath: mentionPath },
      expect: {
        after: {
          selectionAnchorEdge: "before",
          selectionAnchorPath: mentionPath,
          selectionFocusEdge: "after",
          selectionFocusPath: mentionPath,
          selectionSelectedPointers: mentionPath,
        },
      },
    },
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowRight" },
      expect: {
        before: {
          selectionSelectedPointers: mentionPath,
        },
        after: {
          selectionEdge: "after",
          selectionPath: mentionPath,
          selectionSelectedPointers: "",
        },
      },
    },
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowLeft" },
      expect: {
        before: {
          selectionEdge: "after",
          selectionPath: mentionPath,
        },
        after: {
          selectionEdge: "before",
          selectionPath: mentionPath,
          selectionSelectedPointers: "",
        },
      },
    },
    {
      kind: "event",
      event: { type: "keydown", key: "ArrowRight", shiftKey: true },
      expect: {
        before: {
          selectionEdge: "before",
          selectionPath: mentionPath,
        },
        after: {
          selectionAnchorEdge: "before",
          selectionAnchorPath: mentionPath,
          selectionFocusEdge: "after",
          selectionFocusPath: mentionPath,
          selectionSelectedPointers: mentionPath,
        },
      },
    },
  ],
};

export const p0PlainPasteTrace: EditorTraceReplay = {
  name: "p0-plain-paste",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "selection", path: firstTextPath, offset: 0 },
    {
      kind: "event",
      event: { type: "paste", text: "paste " },
      expect: {
        after: {
          pathText: {
            [firstTextPath]: "paste Plain ",
          },
          selectionOffset: "6",
          selectionPath: firstTextPath,
        },
      },
    },
  ],
};

export const p0MarkdownDropTrace: EditorTraceReplay = {
  name: "p0-markdown-drop",
  schema: "editable-trace-replay@1",
  steps: [
    { kind: "selection", path: firstTextPath, offset: 1 },
    {
      kind: "event",
      event: {
        type: "drop",
        data: {
          "text/markdown": "@[Ada](mention:user-ada)",
        },
      },
    },
  ],
};

export const p0CutTrace: EditorTraceReplay = {
  name: "p0-cut",
  schema: "editable-trace-replay@1",
  steps: [
    {
      kind: "selection",
      anchor: { path: firstTextPath, offset: 0 },
      focus: { path: firstTextPath, offset: 5 },
    },
    {
      kind: "event",
      event: { type: "cut" },
      expect: {
        before: {
          domSelectionCollapsed: "false",
          domSelectionText: "Plain",
        },
        after: {
          pathText: {
            [firstTextPath]: " ",
          },
          selectionOffset: "0",
          selectionPath: firstTextPath,
        },
      },
    },
  ],
};

export const p0SelectionDeletionClipboardTraces = [
  p0HorizontalSelectionTrace,
  p0RangeReplacementTrace,
  p0RangeBackspaceTrace,
  p0RangeDeleteForwardTrace,
  p0EmptyBlockBackspaceTrace,
  p0AtomReplacementTrace,
  p0AtomKeyboardNavigationTrace,
  p0PlainPasteTrace,
  p0MarkdownDropTrace,
  p0CutTrace,
] satisfies EditorTraceReplay[];
