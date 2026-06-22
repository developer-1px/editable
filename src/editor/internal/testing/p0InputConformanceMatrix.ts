import type {
  EditorInputContractId,
  EditorTraceReplay,
} from "./editorTraceReplay";

export type P0InputArea =
  | "atom-boundary"
  | "browser-event-order"
  | "clipboard"
  | "delete"
  | "enter"
  | "ime"
  | "keyboard-modifier"
  | "selection"
  | "text-mutation";

export type P0EventAuthority = "browser" | "model" | "recorded-trace";

export type P0EditorPlatform = "mac" | "other";

export type P0EditorInput =
  | {
      altGraphKey?: boolean;
      altKey?: boolean;
      code?: string;
      ctrlKey?: boolean;
      isComposing?: boolean;
      key: string;
      metaKey?: boolean;
      shiftKey?: boolean;
      type: "keydown";
    }
  | {
      data?: string | null;
      format?: "markdown" | "plain";
      inputType: string;
      isComposing?: boolean;
      type: "beforeinput";
    }
  | {
      format?: "markdown" | "plain";
      text: string;
      type: "paste";
    };

export type P0RichSelection =
  | {
      point: P0SelectionPointExpectation;
      type: "caret";
    }
  | {
      anchor: P0SelectionPointExpectation;
      focus: P0SelectionPointExpectation;
      type: "range";
    }
  | {
      target: string;
      type: "node";
    };

export type P0NoteBlockInput = {
  readonly [key: string]: unknown;
  readonly children?: readonly unknown[];
  readonly id: string;
  readonly type: string;
};

export type P0InputScenario = {
  area: P0InputArea;
  browser?: {
    trace: readonly string[];
  };
  contractIds: readonly EditorInputContractId[];
  eventAuthority: P0EventAuthority;
  expected: {
    documentText?: string;
    handled?: boolean;
    pathText?: Record<string, string>;
    selection?: P0SelectionExpectation;
  };
  headless?: {
    input: P0EditorInput;
    platform?: P0EditorPlatform;
  };
  id: string;
  replayTraceNames?: readonly EditorTraceReplay["name"][];
  start: {
    blocks: readonly P0NoteBlockInput[];
    selection: P0RichSelection;
  };
  title: string;
  userAction: string;
};

export type P0SelectionExpectation =
  | {
      type: "caret";
      edge?: "after" | "before";
      offset?: number;
      path: string;
    }
  | {
      type: "range";
      anchor: P0SelectionPointExpectation;
      focus: P0SelectionPointExpectation;
      selectedPointers?: readonly string[];
    };

export type P0SelectionPointExpectation = {
  edge?: "after" | "before";
  offset?: number;
  path: string;
};

const firstTextPath = "/root/children/0/children/0/text";
const mentionPath = "/root/children/0/children/9";
const figurePath = "/root/children/1";

const plainBlocks = [
  {
    id: "block-1",
    type: "paragraph",
    children: [{ type: "text", text: "Plain" }],
  },
];

const twoBlockText = [
  {
    id: "block-1",
    type: "paragraph",
    children: [{ type: "text", text: "A" }],
  },
  {
    id: "block-2",
    type: "paragraph",
    children: [{ type: "text", text: "" }],
  },
];

const richBlocks = [
  {
    id: "block-1",
    type: "paragraph",
    children: [
      { type: "text", text: "Plain " },
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
      { type: "text", text: " " },
      { type: "text", text: "italic", marks: [{ type: "italic" }] },
      { type: "text", text: " " },
      { type: "text", text: "code", marks: [{ type: "code" }] },
      { type: "text", text: " " },
      {
        type: "text",
        text: "link",
        marks: [{ type: "link", href: "https://example.com" }],
      },
      { type: "text", text: " " },
      { id: "user-ada", type: "mention", label: "Ada" },
    ],
  },
  {
    id: "figure-1",
    type: "figure",
    src: "/sample-figure.svg",
    alt: "Figure",
  },
  {
    id: "block-2",
    type: "paragraph",
    children: [{ type: "text", text: "After figure." }],
  },
];

export const p0InputConformanceMatrix: readonly P0InputScenario[] = [
  {
    area: "selection",
    browser: { trace: ["keydown"] },
    contractIds: ["SEL-01"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: { type: "caret", path: firstTextPath, offset: 1 },
    },
    headless: {
      input: { type: "keydown", key: "ArrowRight" },
    },
    id: "SEL-COLLAPSED-ARROW-RIGHT",
    replayTraceNames: ["p0-horizontal-selection"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 0 },
      },
    },
    title: "Collapsed ArrowRight moves by one visible character",
    userAction: "ArrowRight from collapsed caret",
  },
  {
    area: "selection",
    browser: { trace: ["keydown"] },
    contractIds: ["SEL-02"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: { type: "caret", path: firstTextPath, offset: 3 },
    },
    headless: {
      input: { type: "keydown", key: "ArrowRight" },
    },
    id: "SEL-RANGE-ARROWRIGHT-COLLAPSE",
    replayTraceNames: ["p0-horizontal-selection"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 1 },
        focus: { path: firstTextPath, offset: 3 },
      },
    },
    title: "ArrowRight over a range collapses to the focus edge",
    userAction: "ArrowRight from selected text",
  },
  {
    area: "selection",
    browser: { trace: ["keydown"] },
    contractIds: ["SEL-02"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: { type: "caret", path: firstTextPath, offset: 1 },
    },
    headless: {
      input: { type: "keydown", key: "ArrowLeft" },
    },
    id: "SEL-RANGE-ARROWLEFT-COLLAPSE",
    replayTraceNames: ["p0-horizontal-selection"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 1 },
        focus: { path: firstTextPath, offset: 3 },
      },
    },
    title: "ArrowLeft over a range collapses to the anchor edge",
    userAction: "ArrowLeft from selected text",
  },
  {
    area: "selection",
    browser: { trace: ["keydown"] },
    contractIds: ["SEL-03"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 1 },
        focus: { path: firstTextPath, offset: 2 },
      },
    },
    headless: {
      input: { type: "keydown", key: "ArrowRight", shiftKey: true },
    },
    id: "SEL-SHIFT-ARROWRIGHT-EXTEND",
    replayTraceNames: ["p0-horizontal-selection"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 1 },
      },
    },
    title: "Shift+ArrowRight extends range from a stable anchor",
    userAction: "Shift+ArrowRight from collapsed caret",
  },
  {
    area: "atom-boundary",
    browser: { trace: ["keydown"] },
    contractIds: ["SEL-04"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: {
        type: "range",
        anchor: { path: mentionPath, edge: "before" },
        focus: { path: mentionPath, edge: "after" },
        selectedPointers: [mentionPath],
      },
    },
    headless: {
      input: { type: "keydown", key: "ArrowRight", shiftKey: true },
    },
    id: "ATOM-SHIFT-ARROWRIGHT-SELECT",
    replayTraceNames: ["p0-atom-keyboard-navigation"],
    start: {
      blocks: richBlocks,
      selection: {
        type: "caret",
        point: { path: mentionPath, edge: "before" },
      },
    },
    title: "Shift+ArrowRight selects an inline atom as one unit",
    userAction: "Shift+ArrowRight before mention atom",
  },
  {
    area: "atom-boundary",
    browser: { trace: ["keydown"] },
    contractIds: ["SEL-04"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: { type: "caret", path: figurePath, edge: "after" },
    },
    headless: {
      input: { type: "keydown", key: "ArrowRight" },
    },
    id: "FIGURE-ARROWRIGHT-AFTER",
    start: {
      blocks: richBlocks,
      selection: {
        type: "caret",
        point: { path: figurePath, edge: "before" },
      },
    },
    title: "ArrowRight crosses a figure atom from before to after",
    userAction: "ArrowRight before figure atom",
  },
  {
    area: "browser-event-order",
    browser: { trace: ["keydown", "beforeinput", "input"] },
    contractIds: ["MUT-01"],
    eventAuthority: "browser",
    expected: {
      pathText: { [firstTextPath]: "Plain" },
      selection: { type: "caret", path: firstTextPath, offset: 0 },
    },
    id: "BROWSER-PRINTABLE-EVENT-ORDER",
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 0 },
      },
    },
    title: "Printable browser input exposes keydown beforeinput/input evidence",
    userAction: "Type a printable character in the browser runner",
  },
  {
    area: "text-mutation",
    browser: { trace: ["beforeinput", "input"] },
    contractIds: ["MUT-01"],
    eventAuthority: "model",
    expected: {
      handled: true,
      pathText: { [firstTextPath]: "x" },
      selection: { type: "caret", path: firstTextPath, offset: 1 },
    },
    headless: {
      input: { type: "beforeinput", inputType: "insertText", data: "x" },
    },
    id: "MUT-RANGE-REPLACEMENT-TYPING",
    replayTraceNames: ["p0-range-replacement"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 0 },
        focus: { path: firstTextPath, offset: 5 },
      },
    },
    title: "Typing over an open range replaces the selected text",
    userAction: "Insert printable text while a range is selected",
  },
  {
    area: "enter",
    browser: { trace: ["beforeinput", "input"] },
    contractIds: ["DEL-01"],
    eventAuthority: "model",
    expected: {
      handled: true,
      pathText: {
        "/root/children/0/children/0/text": "Pl",
        "/root/children/1/children/0/text": "ain",
      },
      selection: {
        type: "caret",
        path: "/root/children/1/children/0/text",
        offset: 0,
      },
    },
    headless: {
      input: { type: "beforeinput", inputType: "insertParagraph" },
    },
    id: "ENTER-COLLAPSED-SPLIT",
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 2 },
      },
    },
    title: "Enter splits a paragraph at the collapsed caret",
    userAction: "Enter at a collapsed caret",
  },
  {
    area: "clipboard",
    browser: { trace: ["paste"] },
    contractIds: ["CLIP-01"],
    eventAuthority: "model",
    expected: {
      handled: true,
      pathText: { [firstTextPath]: "paste Plain" },
      selection: { type: "caret", path: firstTextPath, offset: 6 },
    },
    headless: {
      input: { type: "paste", text: "paste " },
    },
    id: "CLIP-PLAIN-PASTE",
    replayTraceNames: ["p0-plain-paste"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 0 },
      },
    },
    title: "Plain paste inserts transfer text at the current selection",
    userAction: "Paste plain text",
  },
  {
    area: "delete",
    browser: { trace: ["beforeinput", "input"] },
    contractIds: ["DEL-02"],
    eventAuthority: "model",
    expected: {
      handled: true,
      pathText: { [firstTextPath]: "" },
      selection: { type: "caret", path: firstTextPath, offset: 0 },
    },
    headless: {
      input: { type: "beforeinput", inputType: "deleteContentBackward" },
    },
    id: "DEL-RANGE-BACKSPACE",
    replayTraceNames: ["p0-range-backspace"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 0 },
        focus: { path: firstTextPath, offset: 5 },
      },
    },
    title: "Backspace over a range removes the selected text",
    userAction: "Backspace while a range is selected",
  },
  {
    area: "delete",
    browser: { trace: ["beforeinput", "input"] },
    contractIds: ["DEL-02"],
    eventAuthority: "model",
    expected: {
      handled: true,
      pathText: { [firstTextPath]: "" },
      selection: { type: "caret", path: firstTextPath, offset: 0 },
    },
    headless: {
      input: { type: "beforeinput", inputType: "deleteContentForward" },
    },
    id: "DEL-RANGE-FORWARD",
    replayTraceNames: ["p0-range-delete-forward"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 0 },
        focus: { path: firstTextPath, offset: 5 },
      },
    },
    title: "Delete over a range removes the selected text",
    userAction: "Delete while a range is selected",
  },
  {
    area: "delete",
    contractIds: ["DEL-03"],
    eventAuthority: "model",
    expected: {
      handled: true,
      pathText: { "/root/children/0/children/0/text": "A" },
      selection: {
        type: "caret",
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
    },
    headless: {
      input: { type: "beforeinput", inputType: "deleteContentBackward" },
    },
    id: "DEL-EMPTY-BLOCK-BACKSPACE",
    replayTraceNames: ["p0-empty-block-backspace"],
    start: {
      blocks: twoBlockText,
      selection: {
        type: "caret",
        point: { path: "/root/children/1/children/0/text", offset: 0 },
      },
    },
    title: "Backspace at an empty block joins to the previous block",
    userAction: "Backspace at start of empty block",
  },
  {
    area: "delete",
    contractIds: ["DEL-03"],
    eventAuthority: "model",
    expected: {
      handled: true,
      pathText: { "/root/children/0/children/0/text": "A   " },
      selection: {
        type: "caret",
        path: "/root/children/0/children/0/text",
        offset: 1,
      },
    },
    headless: {
      input: { type: "beforeinput", inputType: "deleteContentBackward" },
    },
    id: "DEL-WHITESPACE-BLOCK-BACKSPACE",
    start: {
      blocks: [
        twoBlockText[0],
        {
          id: "block-2",
          type: "paragraph",
          children: [{ type: "text", text: "   " }],
        },
      ],
      selection: {
        type: "caret",
        point: { path: "/root/children/1/children/0/text", offset: 0 },
      },
    },
    title: "Backspace at a whitespace-only block preserves whitespace on join",
    userAction: "Backspace at start of whitespace-only block",
  },
  {
    area: "keyboard-modifier",
    contractIds: ["SEL-01"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 0 },
        focus: { path: firstTextPath, offset: 5 },
      },
    },
    headless: {
      input: { type: "keydown", key: "a", metaKey: true },
      platform: "mac",
    },
    id: "MOD-MAC-PRIMARY-A-SELECT-ALL",
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 2 },
      },
    },
    title: "macOS primary modifier owns select-all",
    userAction: "Cmd+A on macOS",
  },
  {
    area: "keyboard-modifier",
    contractIds: ["SEL-01"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: {
        type: "range",
        anchor: { path: firstTextPath, offset: 0 },
        focus: { path: firstTextPath, offset: 5 },
      },
    },
    headless: {
      input: { type: "keydown", key: "a", ctrlKey: true },
      platform: "other",
    },
    id: "MOD-OTHER-PRIMARY-A-SELECT-ALL",
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 2 },
      },
    },
    title: "Windows/Linux primary modifier owns select-all",
    userAction: "Ctrl+A outside macOS",
  },
  {
    area: "keyboard-modifier",
    contractIds: ["SEL-01"],
    eventAuthority: "model",
    expected: {
      handled: true,
      selection: { type: "caret", path: firstTextPath, offset: 3 },
    },
    headless: {
      input: { type: "keydown", key: "f", ctrlKey: true },
      platform: "mac",
    },
    id: "MOD-MAC-CTRL-F-NAVIGATION",
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 2 },
      },
    },
    title: "macOS Ctrl-F is navigation, not formatting",
    userAction: "Ctrl+F on macOS",
  },
  {
    area: "keyboard-modifier",
    browser: { trace: ["keydown", "beforeinput", "input"] },
    contractIds: ["MUT-01"],
    eventAuthority: "browser",
    expected: {
      handled: false,
      pathText: { [firstTextPath]: "Plain" },
      selection: { type: "caret", path: firstTextPath, offset: 2 },
    },
    headless: {
      input: {
        type: "keydown",
        key: "@",
        altGraphKey: true,
        altKey: true,
        ctrlKey: true,
      },
      platform: "other",
    },
    id: "MOD-ALTGRAPH-PRINTABLE-KEYDOWN-PASSTHROUGH",
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 2 },
      },
    },
    title: "AltGraph printable keydown is not editor-owned mutation",
    userAction: "AltGraph printable keydown before browser beforeinput",
  },
  {
    area: "ime",
    contractIds: ["IME-01", "IME-02"],
    eventAuthority: "recorded-trace",
    expected: {
      handled: true,
    },
    id: "IME-COMPOSITION-COMMIT-ENTER",
    replayTraceNames: ["korean-hangul-enter-confirm"],
    start: {
      blocks: plainBlocks,
      selection: {
        type: "caret",
        point: { path: firstTextPath, offset: 0 },
      },
    },
    title: "IME Enter first commits composition and then applies Enter",
    userAction: "Korean IME composition confirmed by Enter",
  },
];

export const p0InputScenarioIds = p0InputConformanceMatrix.map(
  (scenario) => scenario.id,
);

export const p0HeadlessInputScenarios = p0InputConformanceMatrix.filter(
  (scenario) => scenario.headless !== undefined,
);

export const p0BrowserInputScenarios = p0InputConformanceMatrix.filter(
  (scenario) => scenario.browser !== undefined,
);

export const p0ReplayTraceScenarioIds = p0InputConformanceMatrix
  .filter((scenario) => scenario.replayTraceNames !== undefined)
  .map((scenario) => scenario.id);
