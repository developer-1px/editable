// biome-ignore-all lint/a11y/noNoninteractiveTabindex: custom editor surface owns keyboard input.

import type { SelectionSnap } from "@interactive-os/json-document";
import { createFileRoute } from "@tanstack/react-router";
import {
  type Dispatch,
  memo,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createRichBlock,
  createRichCursorFrame,
  createRichDocument,
  type EditIntent,
  edit,
  RICH_TEXT_ATOM_REPLACEMENT,
  type RichBlock,
  type RichCursorBlockFrame,
  type RichCursorFrame,
  type RichCursorLineFrame,
  type RichDocument,
  type RichVirtualSelection,
  type RichVirtualSelectionRange,
  type RichVisualLineSeed,
  richCursorPointAt,
  richCursorSelectionAt,
  richTextPathForBlock,
  richVirtualSelectionRange,
} from "../../packages/editable";

export const Route = createFileRoute("/selection-lab")({
  component: SelectionLab,
});

type SelectionLabState = {
  document: RichDocument;
  goalX: number | null;
  selection: SelectionSnap | null;
};

type SelectionLabCaretOverlay = {
  height: number;
  left: number;
  top: number;
};

type RichKeyboardEvent = Pick<
  KeyboardEvent,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

type SelectionLabKeyboardResult =
  | {
      kind: "blockedTextInput";
      preventDefault: true;
    }
  | {
      effect: "no-change" | "selection" | "text";
      intent: EditIntent;
      kind: "intent";
      nextState: SelectionLabState;
      preventDefault: true;
    }
  | {
      kind: "ignored";
      preventDefault: false;
    };

type SelectionLabCommittedKeyboardResult = Extract<
  SelectionLabKeyboardResult,
  { kind: "intent" }
>;

type SelectionLabKeyDebugEntry = {
  activeElement: ReturnType<typeof summarizeSelectionLabElement>;
  at: number;
  editorHasFocus: boolean;
  effect: SelectionLabCommittedKeyboardResult["effect"];
  event: ReturnType<typeof summarizeSelectionLabKeyboardEvent>;
  intent: EditIntent;
  result: ReturnType<typeof summarizeSelectionLabState>;
  state: ReturnType<typeof summarizeSelectionLabState>;
};

function SelectionLab() {
  const [state, setState] = useState(createSelectionLabState);
  const [visualLineSeeds, setVisualLineSeeds] = useState<
    RichVisualLineSeed[] | null
  >(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  const renderFrame = useMemo(
    () => createRichCursorFrame(state.document),
    [state.document],
  );
  const frame = useMemo(
    () =>
      createRichCursorFrame(
        state.document,
        visualLineSeeds === null ? {} : { lineSeeds: visualLineSeeds },
      ),
    [state.document, visualLineSeeds],
  );
  const selection = useMemo(
    () => selectionLabVirtualSelection(frame, state.selection, state.goalX),
    [frame, state.selection, state.goalX],
  );
  const range = useMemo(
    () => richVirtualSelectionRange(frame, selection),
    [frame, selection],
  );
  const { caretOverlay, invalidateVisualLines, isReady, visualLineSeedsRef } =
    useSelectionLabDomBoundary({
      document: state.document,
      editorRef,
      focus: range.focus,
      setVisualLineSeeds,
      visualLineSeeds,
    });
  const { keyDebugLog, recordKeyEffect } =
    useSelectionLabKeyDebugBoundary(editorRef);
  const selectionDebugState = useMemo(
    () => selectionState(frame, range),
    [frame, range],
  );
  const frameDebugState = useMemo(
    () => ({
      lines: frame.lines.map((line) => ({
        blockId: line.blockId,
        startOffset: line.startOffset,
        endOffset: line.endOffset,
        caretXs: line.carets.map((caret) => caret.x),
        offsets: line.carets.map((caret) => caret.offset),
      })),
    }),
    [frame],
  );

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const result = applySelectionLabKeyboardInput(
        stateRef.current,
        visualLineSeedsRef.current,
        event,
      );
      if (!result.preventDefault) {
        return;
      }

      event.preventDefault();
      if (result.kind === "blockedTextInput") {
        return;
      }

      stateRef.current = result.nextState;
      if (result.effect === "text") {
        invalidateVisualLines();
      }
      setState(result.nextState);
      recordKeyEffect(event, result);
    },
    [invalidateVisualLines, recordKeyEffect, visualLineSeedsRef],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }
    editor.addEventListener("keydown", handleKeyDown);
    return () => {
      editor.removeEventListener("keydown", handleKeyDown);
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
                cursorFrame={frame}
                key={block.id}
                range={range}
                renderFrame={renderFrame}
              />
            ))}
            {caretOverlay === null ? null : (
              <VirtualCaret overlay={caretOverlay} />
            )}
          </div>
        </section>
        <aside
          className="contenteditable-state"
          aria-label="Headless cursor state"
        >
          <StateBlock
            label="selection"
            testId="selection-lab-selection"
            value={selectionDebugState}
          />
          <StateBlock
            label="model"
            testId="selection-lab-model"
            value={state.document}
          />
          <StateBlock
            label="frame"
            testId="selection-lab-frame"
            value={frameDebugState}
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
  const point = { path: richTextPathForBlock(0), offset: 2 };
  const initial = edit(
    { document, goalX: null, selection: null },
    { type: "setBaseAndExtent", anchor: point, focus: point },
  );
  if (!initial.ok || initial.kind === "history") {
    throw new Error("Selection lab requires a non-empty rich document.");
  }
  return { document, goalX: initial.goalX, selection: initial.selectionAfter };
}

function useSelectionLabDomBoundary({
  document,
  editorRef,
  focus,
  setVisualLineSeeds,
  visualLineSeeds,
}: {
  document: RichDocument;
  editorRef: { current: HTMLDivElement | null };
  focus: RichVirtualSelectionRange["focus"];
  setVisualLineSeeds: Dispatch<SetStateAction<RichVisualLineSeed[] | null>>;
  visualLineSeeds: RichVisualLineSeed[] | null;
}) {
  const [isReady, setIsReady] = useState(false);
  const [caretOverlay, setCaretOverlay] =
    useState<SelectionLabCaretOverlay | null>(null);
  const documentRef = useRef(document);
  const focusRef = useRef(focus);
  const visualLineSeedsRef = useRef<RichVisualLineSeed[] | null>(
    visualLineSeeds,
  );

  useEffect(() => {
    documentRef.current = document;
  }, [document]);

  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);

  useEffect(() => {
    visualLineSeedsRef.current = visualLineSeeds;
  }, [visualLineSeeds]);

  const measureVisualLines = useCallback(
    (nextDocument = documentRef.current) => {
      const editor = editorRef.current;
      if (editor === null) {
        return;
      }
      const measured = measureSelectionLabVisualLineSeeds(editor, nextDocument);
      if (measured === null) {
        return;
      }
      setVisualLineSeeds((current) => {
        if (selectionLabVisualLineSeedsEqual(current, measured)) {
          return current;
        }
        visualLineSeedsRef.current = measured;
        return measured;
      });
    },
    [editorRef, setVisualLineSeeds],
  );

  const measureCaretOverlay = useCallback(
    (nextFocus = focusRef.current) => {
      const editor = editorRef.current;
      if (editor === null) {
        return;
      }
      const nextCaretOverlay = measureSelectionLabCaretOverlay(
        editor,
        nextFocus,
      );
      setCaretOverlay((current) =>
        selectionLabCaretOverlayEqual(current, nextCaretOverlay)
          ? current
          : nextCaretOverlay,
      );
    },
    [editorRef],
  );

  const invalidateVisualLines = useCallback(() => {
    visualLineSeedsRef.current = null;
    setVisualLineSeeds(null);
  }, [setVisualLineSeeds]);

  useLayoutEffect(() => {
    measureVisualLines(document);
  }, [document, measureVisualLines]);

  useLayoutEffect(() => {
    measureCaretOverlay(focus);
  }, [focus, measureCaretOverlay]);

  useEffect(() => {
    const editor = editorRef.current;
    if (editor === null) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        measureVisualLines();
        measureCaretOverlay();
      });
    });
    resizeObserver.observe(editor);
    setIsReady(true);
    return () => {
      resizeObserver.disconnect();
      setIsReady(false);
    };
  }, [editorRef, measureCaretOverlay, measureVisualLines]);

  return {
    caretOverlay,
    invalidateVisualLines,
    isReady,
    visualLineSeedsRef,
  };
}

function useSelectionLabKeyDebugBoundary(editorRef: {
  current: HTMLDivElement | null;
}) {
  const enabled = useMemo(isSelectionLabKeyDebugEnabled, []);
  const [keyDebugLog, setKeyDebugLog] = useState<SelectionLabKeyDebugEntry[]>(
    [],
  );

  const recordKeyEffect = useCallback(
    (event: KeyboardEvent, result: SelectionLabCommittedKeyboardResult) => {
      if (!enabled) {
        return;
      }
      const resultSnapshot = summarizeSelectionLabState(result.nextState);
      const snapshot: SelectionLabKeyDebugEntry = {
        activeElement: summarizeSelectionLabElement(
          window.document.activeElement,
        ),
        at: Math.round(performance.now()),
        editorHasFocus: window.document.activeElement === editorRef.current,
        effect: result.effect,
        event: summarizeSelectionLabKeyboardEvent(event, editorRef.current),
        intent: result.intent,
        result: resultSnapshot,
        state: resultSnapshot,
      };
      setKeyDebugLog((entries) => [...entries.slice(-39), snapshot]);
    },
    [editorRef, enabled],
  );

  return { keyDebugLog, recordKeyEffect };
}

function isSelectionLabKeyDebugEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).has("debugKeys");
}

function applySelectionLabKeyboardInput(
  state: SelectionLabState,
  visualLineSeeds: RichVisualLineSeed[] | null,
  event: RichKeyboardEvent,
): SelectionLabKeyboardResult {
  const intent = selectionLabIntentForKey(event);
  if (intent !== null) {
    const result = edit(
      state,
      intent,
      visualLineSeeds === null ? {} : { lineSeeds: visualLineSeeds },
    );
    if (!result.ok || result.kind === "history") {
      return { kind: "ignored", preventDefault: false };
    }
    return {
      effect: result.kind,
      intent,
      kind: "intent",
      nextState: {
        document: result.value,
        goalX: result.goalX,
        selection: result.selectionAfter,
      },
      preventDefault: true,
    };
  }

  if (
    event.key.length === 1 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    return { kind: "blockedTextInput", preventDefault: true };
  }

  return { kind: "ignored", preventDefault: false };
}

type SelectionLabMeasuredSegment = {
  blockId: string;
  blockIndex: number;
  endOffset: number;
  path: string;
  right: number;
  startOffset: number;
  x: number;
  y: number;
};

function measureSelectionLabVisualLineSeeds(
  editor: HTMLElement,
  document: RichDocument,
): RichVisualLineSeed[] | null {
  const editorRect = editor.getBoundingClientRect();
  const editorLeft = editorRect.left - editor.scrollLeft;
  const blockElements = Array.from(
    editor.querySelectorAll<HTMLElement>("[data-block-id][data-block-index]"),
  );
  if (blockElements.length === 0) {
    return null;
  }

  const seeds: RichVisualLineSeed[] = [];
  for (const blockElement of blockElements) {
    const blockId = blockElement.getAttribute("data-block-id");
    const blockIndex = Number(blockElement.getAttribute("data-block-index"));
    const block = document.blocks[blockIndex];
    if (blockId === null || block === undefined || block.id !== blockId) {
      continue;
    }

    const segments = measureSelectionLabSegments(
      blockElement,
      blockId,
      blockIndex,
      editorLeft,
    );
    const emptyLineSeeds = measureSelectionLabEmptyLineSeeds(
      blockElement,
      block,
      blockIndex,
    );
    const groups = groupSelectionLabSegmentsByVisualLine(segments);
    const blockSeeds = [
      ...groups.map((group) => {
        const sorted = [...group].sort(
          (left, right) =>
            left.x - right.x || left.startOffset - right.startOffset,
        );
        const first = sorted[0];
        const last = sorted.at(-1);
        if (first === undefined || last === undefined) {
          return null;
        }
        return {
          blockId,
          blockIndex,
          caretMetrics: selectionLabCaretMetricsForVisualLine(sorted),
          endOffset: last.endOffset,
          id: "",
          kind: selectionLabVisualLineKind(
            block.text.slice(first.startOffset, last.endOffset),
          ),
          lineIndex: 0,
          path: first.path,
          startOffset: first.startOffset,
        } satisfies RichVisualLineSeed;
      }),
      ...emptyLineSeeds,
    ].filter((seed): seed is RichVisualLineSeed => seed !== null);

    blockSeeds
      .sort(
        (left, right) =>
          left.startOffset - right.startOffset ||
          left.endOffset - right.endOffset,
      )
      .forEach((seed, lineIndex) => {
        seeds.push({
          ...seed,
          id: `${block.id}:measured-line:${lineIndex}:${seed.startOffset}-${seed.endOffset}`,
          lineIndex,
        });
      });
  }

  return seeds.length === 0 ? null : seeds;
}

function measureSelectionLabSegments(
  blockElement: HTMLElement,
  blockId: string,
  blockIndex: number,
  editorLeft: number,
): SelectionLabMeasuredSegment[] {
  const segments: SelectionLabMeasuredSegment[] = [];
  for (const segment of Array.from(
    blockElement.querySelectorAll<HTMLElement>("[data-rich-segment='true']"),
  )) {
    const path = segment.getAttribute("data-rich-path");
    const startOffset = Number(segment.getAttribute("data-rich-start"));
    const endOffset = Number(segment.getAttribute("data-rich-end"));
    const rect = firstVisibleRect(segment);
    if (
      path === null ||
      !Number.isFinite(startOffset) ||
      !Number.isFinite(endOffset) ||
      rect === null
    ) {
      continue;
    }
    segments.push({
      blockId,
      blockIndex,
      endOffset,
      path,
      right: rect.right - editorLeft,
      startOffset,
      x: rect.left - editorLeft,
      y: rect.top,
    });
  }
  return segments;
}

function selectionLabCaretMetricsForVisualLine(
  segments: SelectionLabMeasuredSegment[],
): RichVisualLineSeed["caretMetrics"] {
  const xByOffset = new Map<number, number>();
  for (const segment of segments) {
    if (!xByOffset.has(segment.startOffset)) {
      xByOffset.set(segment.startOffset, segment.x);
    }
    xByOffset.set(segment.endOffset, segment.right);
  }
  return [...xByOffset.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([offset, x]) => ({ offset, x }));
}

function measureSelectionLabEmptyLineSeeds(
  blockElement: HTMLElement,
  block: RichBlock,
  blockIndex: number,
): RichVisualLineSeed[] {
  const seeds: RichVisualLineSeed[] = [];
  for (const line of Array.from(
    blockElement.querySelectorAll<HTMLElement>(".selection-lab-line"),
  )) {
    const startOffset = Number(line.getAttribute("data-line-start"));
    const endOffset = Number(line.getAttribute("data-line-end"));
    const path = line.getAttribute("data-line-path");
    if (
      path === null ||
      startOffset !== endOffset ||
      !Number.isFinite(startOffset)
    ) {
      continue;
    }
    seeds.push({
      blockId: block.id,
      blockIndex,
      endOffset,
      id: "",
      kind: "empty",
      lineIndex: 0,
      path,
      startOffset,
    });
  }
  return seeds;
}

function groupSelectionLabSegmentsByVisualLine(
  segments: SelectionLabMeasuredSegment[],
): SelectionLabMeasuredSegment[][] {
  const sorted = [...segments].sort(
    (left, right) =>
      left.y - right.y ||
      left.x - right.x ||
      left.startOffset - right.startOffset,
  );
  const groups: SelectionLabMeasuredSegment[][] = [];
  for (const segment of sorted) {
    const group = groups.find(
      (candidate) => Math.abs((candidate[0]?.y ?? segment.y) - segment.y) <= 2,
    );
    if (group === undefined) {
      groups.push([segment]);
    } else {
      group.push(segment);
    }
  }
  return groups;
}

function firstVisibleRect(element: HTMLElement): DOMRect | null {
  for (const rect of Array.from(element.getClientRects())) {
    if (rect.width > 0 || rect.height > 0) {
      return rect;
    }
  }
  return null;
}

function measureSelectionLabCaretOverlay(
  editor: HTMLElement,
  point: RichVirtualSelectionRange["focus"],
): SelectionLabCaretOverlay | null {
  const segment = findSelectionLabCaretSegment(editor, point);
  const rect =
    segment === null
      ? measureSelectionLabFallbackCaretRect(editor, point)
      : measureSelectionLabSegmentCaretRect(segment, point.offset);
  if (rect === null) {
    return null;
  }
  const editorRect = editor.getBoundingClientRect();
  return {
    height: rect.height,
    left: rect.left - editorRect.left + editor.scrollLeft,
    top: rect.top - editorRect.top + editor.scrollTop,
  };
}

function findSelectionLabCaretSegment(
  editor: HTMLElement,
  point: RichVirtualSelectionRange["focus"],
): HTMLElement | null {
  const block = editor.querySelector<HTMLElement>(
    `[data-block-id="${selectionLabCssString(point.blockId)}"]`,
  );
  const scope = block ?? editor;
  const pathSelector = `[data-rich-segment='true'][data-rich-path="${selectionLabCssString(point.path)}"]`;
  const edge = point.visualAffinity?.edge ?? "inside";
  const exactSelector =
    edge === "start"
      ? `${pathSelector}[data-rich-start="${point.offset}"]`
      : edge === "end"
        ? `${pathSelector}[data-rich-end="${point.offset}"]`
        : null;
  const exact =
    exactSelector === null
      ? null
      : scope.querySelector<HTMLElement>(exactSelector);
  if (exact !== null) {
    return exact;
  }

  const candidates = Array.from(
    scope.querySelectorAll<HTMLElement>(pathSelector),
  ).filter((segment) => {
    const start = Number(segment.getAttribute("data-rich-start"));
    const end = Number(segment.getAttribute("data-rich-end"));
    return (
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= point.offset &&
      point.offset <= end
    );
  });
  if (candidates.length === 0) {
    return null;
  }

  const affinityMatch = candidates.find((segment) => {
    const start = Number(segment.getAttribute("data-rich-start"));
    const end = Number(segment.getAttribute("data-rich-end"));
    if (edge === "start") {
      return start === point.offset;
    }
    if (edge === "end") {
      return end === point.offset;
    }
    return start < point.offset && point.offset < end;
  });
  return affinityMatch ?? candidates[0] ?? null;
}

function measureSelectionLabSegmentCaretRect(
  segment: HTMLElement,
  offset: number,
): Pick<DOMRect, "height" | "left" | "top"> | null {
  const start = Number(segment.getAttribute("data-rich-start"));
  const end = Number(segment.getAttribute("data-rich-end"));
  const rects = Array.from(segment.getClientRects()).filter(
    (rect) => rect.width > 0 || rect.height > 0,
  );
  const first = rects[0];
  const last = rects.at(-1);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    first === undefined ||
    last === undefined
  ) {
    return null;
  }
  if (offset <= start) {
    return { height: first.height, left: first.left, top: first.top };
  }
  if (offset >= end) {
    return { height: last.height, left: last.right, top: last.top };
  }

  const textNode = firstTextNode(segment);
  if (textNode === null) {
    return { height: first.height, left: first.left, top: first.top };
  }
  const range = document.createRange();
  const localOffset = Math.max(0, Math.min(offset - start, textNode.length));
  range.setStart(textNode, localOffset);
  range.collapse(true);
  const rangeRect =
    Array.from(range.getClientRects()).find(
      (rect) => rect.width > 0 || rect.height > 0,
    ) ?? range.getBoundingClientRect();
  range.detach();
  return rangeRect.height > 0
    ? { height: rangeRect.height, left: rangeRect.left, top: rangeRect.top }
    : { height: first.height, left: first.left, top: first.top };
}

function measureSelectionLabFallbackCaretRect(
  editor: HTMLElement,
  point: RichVirtualSelectionRange["focus"],
): Pick<DOMRect, "height" | "left" | "top"> | null {
  const line = Array.from(
    editor.querySelectorAll<HTMLElement>(".selection-lab-line"),
  ).find((candidate) => {
    const start = Number(candidate.getAttribute("data-line-start"));
    const end = Number(candidate.getAttribute("data-line-end"));
    return (
      candidate.getAttribute("data-block-id") === point.blockId &&
      candidate.getAttribute("data-line-path") === point.path &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start <= point.offset &&
      point.offset <= end
    );
  });
  const rect = line === undefined ? null : firstVisibleRect(line);
  return rect === null
    ? null
    : { height: rect.height, left: rect.left, top: rect.top };
}

function firstTextNode(element: HTMLElement): Text | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  return node instanceof Text ? node : null;
}

function selectionLabCssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function selectionLabVisualLineKind(text: string): RichVisualLineSeed["kind"] {
  if (text.length === 0) {
    return "empty";
  }
  return Array.from(text).every(
    (character) => character === RICH_TEXT_ATOM_REPLACEMENT,
  )
    ? "atom-only"
    : "text";
}

function selectionLabVisualLineSeedsEqual(
  left: RichVisualLineSeed[] | null,
  right: RichVisualLineSeed[],
): boolean {
  if (left === null || left.length !== right.length) {
    return false;
  }
  return left.every(
    (seed, index) =>
      selectionLabVisualLineSeedKey(seed) ===
      selectionLabVisualLineSeedKey(right[index]),
  );
}

function selectionLabVisualLineSeedKey(
  seed: RichVisualLineSeed | undefined,
): string {
  return seed === undefined
    ? ""
    : [
        seed.blockId,
        seed.blockIndex,
        seed.path,
        seed.lineIndex,
        seed.startOffset,
        seed.endOffset,
        seed.kind,
        selectionLabCaretMetricsKey(seed.caretMetrics),
      ].join(":");
}

function selectionLabCaretMetricsKey(
  caretMetrics: RichVisualLineSeed["caretMetrics"],
): string {
  return (
    caretMetrics
      ?.map((metric) => `${metric.offset}@${metric.x.toFixed(2)}`)
      .join(",") ?? ""
  );
}

function selectionLabCaretOverlayEqual(
  left: SelectionLabCaretOverlay | null,
  right: SelectionLabCaretOverlay | null,
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    Math.abs(left.height - right.height) < 0.5 &&
    Math.abs(left.left - right.left) < 0.5 &&
    Math.abs(left.top - right.top) < 0.5
  );
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
  cursorFrame,
  range,
  renderFrame,
}: {
  block: RichBlock;
  blockIndex: number;
  cursorFrame: RichCursorFrame;
  range: RichVirtualSelectionRange;
  renderFrame: RichCursorFrame;
}) {
  const blockFrame = renderFrame.blocks.find(
    (candidate) => candidate.blockId === block.id,
  );
  const lines = renderFrame.lines.filter((line) => line.blockId === block.id);
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
          cursorFrame={cursorFrame}
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
  cursorFrame,
  line,
  range,
}: {
  block: RichBlock;
  blockFrame: RichCursorBlockFrame;
  cursorFrame: RichCursorFrame;
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
    children.push(
      <RichTextSegment
        block={block}
        end={end}
        frame={cursorFrame}
        key={`segment-${start}-${end}`}
        path={line.path}
        range={range}
        start={start}
      />,
    );
  }

  if (children.length === 0 || line.startOffset === line.endOffset) {
    children.push(
      <span aria-hidden="true" className="selection-lab-empty-line" key="empty">
        &nbsp;
      </span>,
    );
  }

  return (
    <div
      className="selection-lab-line"
      data-block-id={block.id}
      data-line-end={line.endOffset}
      data-line-order={line.order}
      data-line-path={line.path}
      data-line-start={line.startOffset}
    >
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
      <span
        className={className}
        data-rich-end={end}
        data-rich-path={path}
        data-rich-segment="true"
        data-rich-start={start}
      >
        <span className={`atom-chip ${atomClassName(atom[1].type)}`}>
          {atom[1].label ?? atom[1].text ?? atom[0]}
        </span>
      </span>
    );
  }
  return (
    <span
      className={className}
      data-rich-end={end}
      data-rich-path={path}
      data-rich-segment="true"
      data-rich-start={start}
    >
      {text}
    </span>
  );
}

function VirtualCaret({ overlay }: { overlay: SelectionLabCaretOverlay }) {
  return (
    <span
      aria-hidden="true"
      className="selection-lab-caret"
      style={{
        height: overlay.height,
        left: overlay.left,
        top: overlay.top,
      }}
    />
  );
}

const StateBlock = memo(function StateBlock({
  label,
  testId,
  value,
}: {
  label: string;
  testId: string;
  value: unknown;
}) {
  const serializedValue = useMemo(
    () => JSON.stringify(value, null, 2),
    [value],
  );
  return (
    <section className="contenteditable-state-block">
      <h2>{label}</h2>
      <pre data-testid={testId}>{serializedValue}</pre>
    </section>
  );
});

function selectionLabVirtualSelection(
  frame: RichCursorFrame,
  snap: SelectionSnap | null,
  goalX: number | null,
): RichVirtualSelection {
  const anchor = selectionLabCursorPoint(frame, snap?.anchor ?? null);
  const focus = selectionLabCursorPoint(frame, snap?.focus ?? null);
  if (anchor !== null && focus !== null) {
    return { anchor, focus, goalX };
  }
  const fallback = richCursorSelectionAt(frame, richTextPathForBlock(0), 0);
  if (fallback === null) {
    throw new Error("Selection lab requires a non-empty rich document.");
  }
  return fallback;
}

function selectionLabCursorPoint(
  frame: RichCursorFrame,
  point: SelectionSnap["anchor"],
) {
  if (point === null || point === undefined || typeof point === "string") {
    return null;
  }
  if (typeof point.offset !== "number") {
    return null;
  }
  return richCursorPointAt(
    frame,
    point.path,
    point.offset,
    point.edge === "before" ? "before" : "after",
  );
}

function selectionLabIntentForKey(event: RichKeyboardEvent): EditIntent | null {
  if (event.key === "Enter") {
    return { type: "insertLineBreak" };
  }
  if (event.key === "Backspace") {
    return { type: "deleteContentBackward" };
  }
  if (event.key === "Delete") {
    return { type: "deleteContentForward" };
  }
  const alter = event.shiftKey ? "extend" : "move";
  if (event.metaKey && event.key === "ArrowLeft") {
    return {
      type: "modifySelection",
      alter,
      direction: "backward",
      granularity: "lineboundary",
    };
  }
  if (event.metaKey && event.key === "ArrowRight") {
    return {
      type: "modifySelection",
      alter,
      direction: "forward",
      granularity: "lineboundary",
    };
  }
  if (event.key === "ArrowLeft") {
    return {
      type: "modifySelection",
      alter,
      direction: "backward",
      granularity: event.altKey || event.ctrlKey ? "word" : "character",
    };
  }
  if (event.key === "ArrowRight") {
    return {
      type: "modifySelection",
      alter,
      direction: "forward",
      granularity: event.altKey || event.ctrlKey ? "word" : "character",
    };
  }
  if (event.key === "ArrowUp") {
    return {
      type: "modifySelection",
      alter,
      direction: "backward",
      granularity: "line",
    };
  }
  if (event.key === "ArrowDown") {
    return {
      type: "modifySelection",
      alter,
      direction: "forward",
      granularity: "line",
    };
  }
  if (event.key === "Home") {
    return {
      type: "modifySelection",
      alter,
      direction: "backward",
      granularity: "lineboundary",
    };
  }
  if (event.key === "End") {
    return {
      type: "modifySelection",
      alter,
      direction: "forward",
      granularity: "lineboundary",
    };
  }
  return null;
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
  const selection = selectionLabVirtualSelection(
    frame,
    state.selection,
    state.goalX,
  );
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
