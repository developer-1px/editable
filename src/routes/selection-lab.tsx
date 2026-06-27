// biome-ignore-all lint/a11y/noNoninteractiveTabindex: custom editor surface owns keyboard input.
import { createFileRoute } from "@tanstack/react-router";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createRichBlock,
  createRichCursorFrame,
  createRichDocument,
  moveRichVirtualSelection,
  RICH_TEXT_ATOM_REPLACEMENT,
  type RichBlock,
  type RichCursorBlockFrame,
  type RichCursorFrame,
  type RichCursorLineFrame,
  type RichCursorMoveCommand,
  type RichDocument,
  type RichVirtualSelection,
  type RichVirtualSelectionRange,
  recoverRichVirtualSelection,
  replaceRichTextRange,
  richCursorSelectionAt,
  richTextPathForBlock,
  richVirtualSelectionRange,
} from "../../packages/rich-document";

export const Route = createFileRoute("/selection-lab")({
  component: SelectionLab,
});

type SelectionLabState = {
  document: RichDocument;
  selection: RichVirtualSelection;
};

type RichKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "preventDefault" | "shiftKey"
>;

function SelectionLab() {
  const [state, setState] = useState(createSelectionLabState);
  const [isReady, setIsReady] = useState(false);
  const [keyDebugLog, setKeyDebugLog] = useState<SelectionLabKeyDebugEntry[]>(
    [],
  );
  const editorRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const frame = useMemo(
    () => createRichCursorFrame(state.document),
    [state.document],
  );
  const selection = useMemo(
    () => recoverRichVirtualSelection(frame, state.selection),
    [frame, state.selection],
  );
  const range = useMemo(
    () => richVirtualSelectionRange(frame, selection),
    [frame, selection],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const appendKeyDebugLog = useCallback(
    (entry: SelectionLabKeyDebugEntryInput) => {
      const snapshot = {
        ...entry,
        at: Math.round(performance.now()),
        activeElement: summarizeSelectionLabElement(
          window.document.activeElement,
        ),
        editorHasFocus: window.document.activeElement === editorRef.current,
        state: summarizeSelectionLabState(stateRef.current),
      };
      console.log("[selection-lab-key-debug]", snapshot);
      setKeyDebugLog((entries) => [...entries.slice(-39), snapshot]);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const edit = editForKey(event);
      const command = commandForKey(event);
      if (shouldLogSelectionLabKey(event)) {
        appendKeyDebugLog({
          command,
          edit,
          event: summarizeSelectionLabKeyboardEvent(event, editorRef.current),
          phase: "before",
        });
      }

      if (edit !== null) {
        event.preventDefault();
        const next = applySelectionLabEdit(stateRef.current, edit);
        stateRef.current = next;
        setState(next);
        if (shouldLogSelectionLabKey(event)) {
          appendKeyDebugLog({
            edit,
            event: summarizeSelectionLabKeyboardEvent(event, editorRef.current),
            phase: "after-edit",
            result: summarizeSelectionLabState(next),
          });
        }
        return;
      }

      if (command !== null) {
        event.preventDefault();
        const current = stateRef.current;
        const currentFrame = createRichCursorFrame(current.document);
        const next = {
          ...current,
          selection: moveRichVirtualSelection(
            currentFrame,
            current.selection,
            command,
          ),
        };
        stateRef.current = next;
        setState(next);
        if (shouldLogSelectionLabKey(event)) {
          appendKeyDebugLog({
            command,
            event: summarizeSelectionLabKeyboardEvent(event, editorRef.current),
            phase: "after-command",
            result: summarizeSelectionLabState(next),
          });
        }
        return;
      }

      if (
        event.key.length === 1 &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
      }
    },
    [appendKeyDebugLog],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }
    editor.addEventListener("keydown", handleKeyDown);
    setIsReady(true);
    return () => {
      editor.removeEventListener("keydown", handleKeyDown);
      setIsReady(false);
    };
  }, [handleKeyDown]);

  return (
    <main className="contenteditable-shell">
      <div className="contenteditable-workspace">
        <section className="contenteditable-main">
          <div className="contenteditable-toolbar selection-lab-toolbar">
            <a className="home-link" href="/">
              Home
            </a>
            <a className="home-link" href="/demo">
              Contenteditable demo
            </a>
          </div>
          <div
            aria-label="Headless rich cursor lab"
            className="contenteditable-editor selection-lab-editor"
            data-ready={isReady ? "true" : "false"}
            data-testid="selection-lab-editor"
            ref={editorRef}
            role="application"
            tabIndex={0}
          >
            {state.document.blocks.map((block, blockIndex) => (
              <RichBlockView
                block={block}
                blockIndex={blockIndex}
                frame={frame}
                key={block.id}
                range={range}
              />
            ))}
          </div>
        </section>
        <aside
          className="contenteditable-state"
          aria-label="Headless cursor state"
        >
          <StateBlock
            label="selection"
            testId="selection-lab-selection"
            value={selectionState(frame, range)}
          />
          <StateBlock
            label="model"
            testId="selection-lab-model"
            value={state.document}
          />
          <StateBlock
            label="frame"
            testId="selection-lab-frame"
            value={{
              lines: frame.lines.map((line) => ({
                blockId: line.blockId,
                startOffset: line.startOffset,
                endOffset: line.endOffset,
                offsets: line.carets.map((caret) => caret.offset),
              })),
            }}
          />
          <StateBlock
            label="key debug log"
            testId="selection-lab-key-debug-log"
            value={keyDebugLog}
          />
        </aside>
      </div>
    </main>
  );
}

function createSelectionLabState(): SelectionLabState {
  const atom = RICH_TEXT_ATOM_REPLACEMENT;
  const paragraphText = `Markdown-style rich text mixes bold phrase, italic aside, linked reference, inline code, highlight note, ${atom} mention, ${atom} tag, and struck text.`;
  const taskText = `Ship virtual cursor recovery before ${atom} release`;
  const nestedListText = `Nested item keeps code span and ${atom} beside ordinary words.`;
  const quoteText =
    "A quote can carry emphasis, links, and a soft line break\nwithout changing the headless cursor contract.";
  const codeText = `function move(selection) {
  return recover(selection).focus;
}`;
  const extensionText =
    "Callout payload: parser metadata, source positions, and non-text data stay outside cursor math.";
  const document = createRichDocument({
    id: "selection-lab",
    metadata: {
      source: "markdown-import-preview",
      title: "Headless cursor fixture",
    },
    blocks: [
      {
        ...createRichBlock({
          id: "intro",
          text: `안녕 rich\n둘째 줄과 ${RICH_TEXT_ATOM_REPLACEMENT} atom`,
        }),
        atoms: {
          "mention-ada": {
            type: "mention",
            label: "@Ada",
            offset: 14,
          },
        },
        ranges: {
          bold: {
            type: "bold",
            start: 3,
            end: 7,
          },
          highlight: {
            type: "highlight",
            start: 9,
            end: 13,
          },
        },
      },
      {
        ...createRichBlock({
          id: "heading",
          type: "heading",
          level: 2,
          text: "Markdown import cursor contract",
        }),
        ranges: {
          emphasis: richRange(
            "Markdown import cursor contract",
            "bold",
            "cursor",
          ),
        },
      },
      {
        ...createRichBlock({
          id: "paragraph-rich",
          text: paragraphText,
        }),
        atoms: {
          "mention-reviewer": {
            type: "mention",
            label: "@Reviewer",
            offset: nthOffset(paragraphText, atom, 0),
            target: "user:reviewer",
          },
          "tag-cursor": {
            type: "tag",
            label: "#cursor",
            offset: nthOffset(paragraphText, atom, 1),
            target: "tag:cursor",
          },
        },
        ranges: {
          bold: richRange(paragraphText, "bold", "bold phrase"),
          italic: richRange(paragraphText, "italic", "italic aside"),
          linked: {
            ...richRange(paragraphText, "link", "linked reference"),
            href: "docs://selection-contract",
          },
          code: richRange(paragraphText, "code", "inline code"),
          highlight: richRange(paragraphText, "highlight", "highlight note"),
          struck: richRange(paragraphText, "strike", "struck text"),
          nested: richRange(
            paragraphText,
            "bold",
            "bold phrase, italic aside, linked reference",
          ),
        },
      },
      {
        ...createRichBlock({
          checked: true,
          id: "task-done",
          listKind: "task",
          text: taskText,
          type: "listItem",
        }),
        atoms: {
          release: {
            type: "attachment",
            label: "v0.1",
            offset: nthOffset(taskText, atom, 0),
          },
        },
        ranges: {
          important: richRange(
            taskText,
            "highlight",
            "virtual cursor recovery",
          ),
        },
      },
      {
        ...createRichBlock({
          id: "nested-bullet",
          indent: 1,
          listKind: "bullet",
          text: nestedListText,
          type: "listItem",
        }),
        atoms: {
          wiki: {
            type: "wikiLink",
            label: "[[cursor-frame]]",
            offset: nthOffset(nestedListText, atom, 0),
            target: "cursor-frame",
          },
        },
        ranges: {
          code: richRange(nestedListText, "code", "code span"),
          underline: richRange(nestedListText, "underline", "ordinary words"),
        },
      },
      {
        ...createRichBlock({
          id: "ordered-step",
          indent: 1,
          listKind: "ordered",
          text: "Measure visual lines after render, then commit the snapshot.",
          type: "listItem",
        }),
        ranges: {
          code: {
            type: "code",
            start: 0,
            end: "Measure".length,
          },
        },
      },
      {
        ...createRichBlock({
          id: "notes",
          type: "quote",
          text: quoteText,
        }),
        ranges: {
          emphasis: richRange(quoteText, "italic", "quote"),
          link: {
            ...richRange(quoteText, "link", "headless cursor contract"),
            href: "docs://headless-cursor",
          },
        },
      },
      {
        ...createRichBlock({
          id: "code-sample",
          language: "ts",
          text: codeText,
          type: "code",
        }),
        ranges: {
          keyword: richRange(codeText, "bold", "function"),
        },
      },
      {
        ...createRichBlock({
          data: {
            admonition: "info",
            sourceRange: [128, 214],
          },
          id: "callout",
          kind: "callout",
          text: extensionText,
          type: "extension",
        }),
        ranges: {
          highlight: richRange(
            extensionText,
            "highlight",
            "outside cursor math",
          ),
        },
      },
    ],
  });
  const frame = createRichCursorFrame(document);
  const selection = richCursorSelectionAt(frame, richTextPathForBlock(0), 2);
  if (selection === null) {
    throw new Error("Selection lab requires a non-empty rich document.");
  }
  return { document, selection };
}

function nthOffset(text: string, needle: string, occurrence: number): number {
  let fromIndex = 0;
  for (let index = 0; index <= occurrence; index += 1) {
    const found = text.indexOf(needle, fromIndex);
    if (found < 0) {
      throw new Error(`Missing "${needle}" occurrence ${occurrence}.`);
    }
    if (index === occurrence) {
      return found;
    }
    fromIndex = found + needle.length;
  }
  throw new Error(`Missing "${needle}" occurrence ${occurrence}.`);
}

function richRange(
  text: string,
  type: string,
  needle: string,
): RichBlock["ranges"][string] {
  const start = text.indexOf(needle);
  if (start < 0) {
    throw new Error(`Missing rich range text "${needle}".`);
  }
  return {
    type,
    start,
    end: start + needle.length,
  };
}

function RichBlockView({
  block,
  blockIndex,
  frame,
  range,
}: {
  block: RichBlock;
  blockIndex: number;
  frame: RichCursorFrame;
  range: RichVirtualSelectionRange;
}) {
  const blockFrame = frame.blocks.find(
    (candidate) => candidate.blockId === block.id,
  );
  const lines = frame.lines.filter((line) => line.blockId === block.id);
  if (blockFrame === undefined) {
    return null;
  }
  return (
    <div
      className={richBlockClassName(block)}
      data-block-type={block.type}
      data-block-id={block.id}
      data-block-index={blockIndex}
      data-extension-kind={block.type === "extension" ? block.kind : undefined}
      data-list-indent={block.type === "listItem" ? block.indent : undefined}
      data-list-kind={block.type === "listItem" ? block.listKind : undefined}
    >
      <RichBlockPrefix block={block} />
      {lines.map((line) => (
        <RichLineView
          block={block}
          blockFrame={blockFrame}
          frame={frame}
          key={line.id}
          line={line}
          range={range}
        />
      ))}
    </div>
  );
}

function RichBlockPrefix({ block }: { block: RichBlock }) {
  if (block.type === "listItem") {
    return (
      <span
        aria-hidden="true"
        className="selection-lab-block-prefix"
        data-indent={block.indent}
      >
        {listMarkerText(block)}
      </span>
    );
  }
  if (block.type === "extension") {
    return (
      <span aria-hidden="true" className="selection-lab-block-prefix">
        !
      </span>
    );
  }
  return null;
}

function RichLineView({
  block,
  blockFrame,
  frame,
  line,
  range,
}: {
  block: RichBlock;
  blockFrame: RichCursorBlockFrame;
  frame: RichCursorFrame;
  line: RichCursorLineFrame;
  range: RichVirtualSelectionRange;
}) {
  const offsets = blockFrame.caretOffsets.filter(
    (offset) => line.startOffset <= offset && offset <= line.endOffset,
  );
  const children: ReactNode[] = [];
  for (let index = 0; index < offsets.length - 1; index += 1) {
    const start = offsets[index] ?? line.startOffset;
    const end = offsets[index + 1] ?? start;
    if (isFocusAt(range.focus, block.id, line.path, start)) {
      children.push(<VirtualCaret key={`caret-${start}`} />);
    }
    children.push(
      <RichTextSegment
        block={block}
        end={end}
        frame={frame}
        key={`segment-${start}-${end}`}
        path={line.path}
        range={range}
        start={start}
      />,
    );
  }

  const lastOffset = offsets.at(-1) ?? line.startOffset;
  if (isFocusAt(range.focus, block.id, line.path, lastOffset)) {
    children.push(<VirtualCaret key={`caret-${lastOffset}`} />);
  }
  if (children.length === 0 || line.startOffset === line.endOffset) {
    children.push(
      <span aria-hidden="true" className="selection-lab-empty-line" key="empty">
        &nbsp;
      </span>,
    );
  }

  return (
    <div className="selection-lab-line" data-line-order={line.order}>
      {children}
    </div>
  );
}

function RichTextSegment({
  block,
  end,
  frame,
  path,
  range,
  start,
}: {
  block: RichBlock;
  end: number;
  frame: RichCursorFrame;
  path: string;
  range: RichVirtualSelectionRange;
  start: number;
}) {
  const text = block.text.slice(start, end);
  const selected = segmentIntersectsSelection(
    frame,
    range,
    block.id,
    path,
    start,
    end,
  );
  const className = [
    "selection-lab-segment",
    selected ? "selection-lab-selected" : "",
    ...richRangeClassNames(block, start, end),
  ]
    .filter(Boolean)
    .join(" ");
  const atom = Object.entries(block.atoms).find(
    ([, candidate]) =>
      candidate.offset === start && text === RICH_TEXT_ATOM_REPLACEMENT,
  );
  if (atom !== undefined) {
    return (
      <span className={className}>
        <span className={`atom-chip ${atomClassName(atom[1].type)}`}>
          {atom[1].label ?? atom[1].text ?? atom[0]}
        </span>
      </span>
    );
  }
  return <span className={className}>{text}</span>;
}

function VirtualCaret() {
  return <span aria-hidden="true" className="selection-lab-caret" />;
}

function StateBlock({
  label,
  testId,
  value,
}: {
  label: string;
  testId: string;
  value: unknown;
}) {
  return (
    <section className="contenteditable-state-block">
      <h2>{label}</h2>
      <pre data-testid={testId}>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}

function commandForKey(event: RichKeyboardEvent): RichCursorMoveCommand | null {
  const extend = event.shiftKey;
  if (event.metaKey && event.key === "ArrowLeft") {
    return { unit: "lineBoundary", direction: "backward", extend };
  }
  if (event.metaKey && event.key === "ArrowRight") {
    return { unit: "lineBoundary", direction: "forward", extend };
  }
  if (event.key === "ArrowLeft") {
    return {
      unit: event.altKey || event.ctrlKey ? "word" : "grapheme",
      direction: "backward",
      extend,
    };
  }
  if (event.key === "ArrowRight") {
    return {
      unit: event.altKey || event.ctrlKey ? "word" : "grapheme",
      direction: "forward",
      extend,
    };
  }
  if (event.key === "ArrowUp") {
    return { unit: "visualLine", direction: "up", extend };
  }
  if (event.key === "ArrowDown") {
    return { unit: "visualLine", direction: "down", extend };
  }
  if (event.key === "Home") {
    return { unit: "lineBoundary", direction: "backward", extend };
  }
  if (event.key === "End") {
    return { unit: "lineBoundary", direction: "forward", extend };
  }
  return null;
}

type SelectionLabKeyDebugEntryInput = {
  command?: RichCursorMoveCommand | null;
  edit?: ReturnType<typeof editForKey>;
  event?: ReturnType<typeof summarizeSelectionLabKeyboardEvent>;
  phase: string;
  result?: ReturnType<typeof summarizeSelectionLabState>;
};

type SelectionLabKeyDebugEntry = SelectionLabKeyDebugEntryInput & {
  activeElement: ReturnType<typeof summarizeSelectionLabElement>;
  at: number;
  editorHasFocus: boolean;
  state: ReturnType<typeof summarizeSelectionLabState>;
};

function shouldLogSelectionLabKey(event: KeyboardEvent): boolean {
  return (
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "Home" ||
    event.key === "End" ||
    event.code === "ArrowLeft" ||
    event.code === "ArrowRight" ||
    event.code === "ArrowUp" ||
    event.code === "ArrowDown" ||
    event.code === "Home" ||
    event.code === "End" ||
    ((event.metaKey || event.ctrlKey) && event.key.startsWith("Arrow"))
  );
}

function summarizeSelectionLabElement(target: EventTarget | null): unknown {
  if (typeof Element !== "undefined" && target instanceof Element) {
    return {
      blockId: target.getAttribute("data-block-id"),
      className: typeof target.className === "string" ? target.className : null,
      lineOrder: target.getAttribute("data-line-order"),
      role: target.getAttribute("role"),
      tag: target.tagName.toLowerCase(),
      testId: target.getAttribute("data-testid"),
    };
  }
  if (typeof Text !== "undefined" && target instanceof Text) {
    return {
      nodeType: "text",
      parent: summarizeSelectionLabElement(target.parentElement),
      text: target.textContent?.slice(0, 80) ?? "",
    };
  }
  return target === null ? null : { nodeType: "unknown" };
}

function summarizeSelectionLabKeyboardEvent(
  event: KeyboardEvent,
  root: HTMLElement | null,
) {
  return {
    altKey: event.altKey,
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    code: event.code,
    ctrlKey: event.ctrlKey,
    defaultPrevented: event.defaultPrevented,
    eventPhase: event.eventPhase,
    isComposing: event.isComposing,
    key: event.key,
    keyCode: event.keyCode,
    location: event.location,
    metaKey: event.metaKey,
    repeat: event.repeat,
    shiftKey: event.shiftKey,
    target: summarizeSelectionLabElement(event.target),
    targetInEditor:
      root !== null &&
      event.target instanceof Node &&
      root.contains(event.target),
    timeStamp: Math.round(event.timeStamp),
    type: event.type,
    which: event.which,
  };
}

function summarizeSelectionLabState(state: SelectionLabState) {
  const frame = createRichCursorFrame(state.document);
  const selection = recoverRichVirtualSelection(frame, state.selection);
  const range = richVirtualSelectionRange(frame, selection);
  return {
    document: {
      blocks: state.document.blocks.map((block) => ({
        id: block.id,
        text: block.text,
        textLength: block.text.length,
        type: block.type,
      })),
    },
    frame: {
      lines: frame.lines.map((line) => ({
        blockId: line.blockId,
        endOffset: line.endOffset,
        id: line.id,
        lineIndex: line.lineIndex,
        order: line.order,
        startOffset: line.startOffset,
      })),
    },
    selection: selectionState(frame, range),
  };
}

function editForKey(
  event: RichKeyboardEvent,
): "break" | "deleteBackward" | "deleteForward" | null {
  if (event.key === "Enter") {
    return "break";
  }
  if (event.key === "Backspace") {
    return "deleteBackward";
  }
  if (event.key === "Delete") {
    return "deleteForward";
  }
  return null;
}

function applySelectionLabEdit(
  state: SelectionLabState,
  edit: "break" | "deleteBackward" | "deleteForward",
): SelectionLabState {
  if (edit === "break") {
    return replaceSelectionText(state, state.selection, "\n");
  }

  const frame = createRichCursorFrame(state.document);
  const selection = recoverRichVirtualSelection(frame, state.selection);
  const range = richVirtualSelectionRange(frame, selection);
  if (!range.collapsed) {
    return replaceSelectionText(state, selection, "");
  }

  const direction = edit === "deleteBackward" ? "backward" : "forward";
  const expanded = moveRichVirtualSelection(frame, selection, {
    unit: "grapheme",
    direction,
    extend: true,
  });
  const expandedRange = richVirtualSelectionRange(frame, expanded);
  if (expandedRange.collapsed) {
    return state;
  }
  return replaceSelectionText(state, expanded, "");
}

function replaceSelectionText(
  state: SelectionLabState,
  selection: RichVirtualSelection,
  replacement: string,
): SelectionLabState {
  const frame = createRichCursorFrame(state.document);
  const range = richVirtualSelectionRange(frame, selection);
  if (range.start.path !== range.end.path) {
    return state;
  }
  const block = frame.blocks.find(
    (candidate) => candidate.path === range.start.path,
  );
  if (block === undefined) {
    return state;
  }
  const result = replaceRichTextRange(
    state.document,
    block.blockId,
    range.start.offset,
    range.end.offset,
    replacement,
  );
  if (!result.ok) {
    return state;
  }

  const nextFrame = createRichCursorFrame(result.value);
  const nextBlock = nextFrame.blocks.find(
    (candidate) => candidate.blockId === block.blockId,
  );
  const nextSelection =
    nextBlock === undefined
      ? recoverRichVirtualSelection(nextFrame, selection)
      : (richCursorSelectionAt(
          nextFrame,
          nextBlock.path,
          range.start.offset + replacement.length,
        ) ?? recoverRichVirtualSelection(nextFrame, selection));
  return {
    document: result.value,
    selection: nextSelection,
  };
}

function richBlockClassName(block: RichBlock): string {
  const classes = ["contenteditable-block"];
  if (block.type === "heading") {
    classes.push("contenteditable-block-heading");
  }
  if (block.type === "quote") {
    classes.push("contenteditable-block-quote");
  }
  if (block.type === "code") {
    classes.push("contenteditable-block-code");
  }
  if (block.type === "listItem") {
    classes.push("contenteditable-block-list-item", "selection-lab-list-item");
  }
  if (block.type === "extension") {
    classes.push("selection-lab-extension-block");
  }
  return classes.join(" ");
}

function listMarkerText(
  block: Extract<RichBlock, { type: "listItem" }>,
): string {
  if (block.listKind === "task") {
    return block.checked ? "x" : " ";
  }
  if (block.listKind === "ordered") {
    return "1.";
  }
  return "-";
}

function isFocusAt(
  point: RichVirtualSelectionRange["focus"],
  blockId: string,
  path: string,
  offset: number,
): boolean {
  return (
    point.blockId === blockId && point.path === path && point.offset === offset
  );
}

function segmentIntersectsSelection(
  frame: RichCursorFrame,
  range: RichVirtualSelectionRange,
  blockId: string,
  path: string,
  start: number,
  end: number,
): boolean {
  if (range.collapsed) {
    return false;
  }
  const startCaret = frame.carets.find(
    (caret) =>
      caret.blockId === blockId &&
      caret.path === path &&
      caret.offset === start,
  );
  const endCaret = frame.carets.find(
    (caret) =>
      caret.blockId === blockId && caret.path === path && caret.offset === end,
  );
  if (startCaret === undefined || endCaret === undefined) {
    return false;
  }
  return (
    startCaret.order < range.end.order && endCaret.order > range.start.order
  );
}

function richRangeClassNames(
  block: RichBlock,
  start: number,
  end: number,
): string[] {
  const classes: string[] = [];
  for (const range of Object.values(block.ranges)) {
    if (range.start >= end || range.end <= start) {
      continue;
    }
    if (range.type === "bold") {
      classes.push("selection-lab-bold");
    }
    if (range.type === "italic") {
      classes.push("selection-lab-italic");
    }
    if (range.type === "underline") {
      classes.push("selection-lab-underline");
    }
    if (range.type === "strike") {
      classes.push("selection-lab-strike");
    }
    if (range.type === "code") {
      classes.push("inline-code");
    }
    if (range.type === "highlight") {
      classes.push("inline-highlight");
    }
    if (range.type === "link") {
      classes.push("inline-link");
    }
  }
  return classes;
}

function atomClassName(type: string): string {
  if (type === "mention") {
    return "mention-chip";
  }
  if (type === "tag") {
    return "tag-chip";
  }
  if (type === "wikiLink") {
    return "wiki-chip";
  }
  if (type === "attachment") {
    return "attachment-chip";
  }
  return "attachment-chip";
}

function selectionState(
  frame: RichCursorFrame,
  range: RichVirtualSelectionRange,
) {
  const focusCaret = frame.carets.find(
    (caret) => caret.order === range.focus.order,
  );
  return {
    anchor: range.anchor,
    focus: range.focus,
    line:
      focusCaret === undefined
        ? null
        : {
            lineOrder: focusCaret.lineOrder,
            column: focusCaret.column,
          },
    range: {
      collapsed: range.collapsed,
      direction: range.direction,
      start: range.start,
      end: range.end,
    },
  };
}
