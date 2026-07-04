import { createFileRoute } from "@tanstack/react-router";
import {
  AtSign,
  Bold,
  ClipboardPaste,
  Copy,
  Heading1,
  Redo2,
  RotateCcw,
  Scissors,
  Underline,
  Undo2,
} from "lucide-react";
import {
  type FormEvent,
  type ClipboardEvent as ReactClipboardEvent,
  type CompositionEvent as ReactCompositionEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createRichVisualLineSeeds,
  isRichTextFragment,
  type RichProjection,
} from "../../packages/editable";
import {
  createEditableHost,
  createVisualLayoutStore,
  type EditableHost,
  type EditableUpdate,
  type JsonContentEditableSelectionIntent,
  measureVisualLayout,
} from "../../packages/editable/dom";
import {
  type ContentEditableDemoDocument,
  contentEditableDemoAtomsPathForTextPath,
  contentEditableDemoHeadingActive,
  contentEditableDemoMarkActive,
  contentEditableDemoRangesPathForTextPath,
  contentEditableDemoTextProjection,
  createContentEditableDemoDocument,
  createContentEditableDemoProjection,
  createContentEditableDemoValue,
  createMentionFragment,
  renderContentEditableDemoContent,
  summarizeContentEditableDemoDOM,
  summarizeContentEditableDemoModel,
  toggleContentEditableDemoHeading,
  toggleContentEditableDemoMark,
  toggleContentEditableDemoTaskMarker,
} from "../contenteditable-demo/document";

export const Route = createFileRoute("/demo")({
  component: ContentEditableDemo,
});

function ContentEditableDemo() {
  const document = useMemo(() => createContentEditableDemoDocument(), []);
  const visualLayoutStore = useMemo(() => createVisualLayoutStore(), []);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<EditableHost<ContentEditableDemoDocument> | null>(
    null,
  );
  const projectionRef = useRef<RichProjection | null>(null);
  const composingRef = useRef(false);
  const visualMeasureFrameRef = useRef<number | null>(null);
  const [, refreshState] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const renderEditorContent = useCallback(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    visualLayoutStore.invalidate("Editor content is rendering.");
    const projection = createContentEditableDemoProjection(
      document.value,
      document.selection?.snapshot() ?? null,
      composingRef.current,
    );
    projectionRef.current = projection;
    renderContentEditableDemoContent(root, document.value, projection);
    visualLayoutStore.write(
      measureVisualLayout({
        lineSeeds: createRichVisualLineSeeds(document.value),
        root,
        projection: (path) =>
          contentEditableDemoTextProjection(projection, path),
      }),
    );
    coreRef.current?.restoreSelectionToDOM();
  }, [document, visualLayoutStore]);

  const refresh = useCallback(
    (options: { renderText?: boolean } = {}) => {
      refreshState((revision) => revision + 1);
      if (options.renderText === true) {
        renderEditorContent();
      }
    },
    [renderEditorContent],
  );

  const commitMeasuredVisualLayoutFromDOM = useCallback(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    visualLayoutStore.write(
      measureVisualLayout({
        lineSeeds: createRichVisualLineSeeds(document.value),
        root,
        projection: (path) =>
          contentEditableDemoTextProjection(projectionRef.current, path),
      }),
    );
  }, [document, visualLayoutStore]);

  const scheduleVisualLayoutMeasure = useCallback(
    (reason: string) => {
      visualLayoutStore.invalidate(reason);
      if (visualMeasureFrameRef.current !== null) {
        return;
      }
      visualMeasureFrameRef.current = window.requestAnimationFrame(() => {
        visualMeasureFrameRef.current = null;
        commitMeasuredVisualLayoutFromDOM();
        refresh();
      });
    },
    [commitMeasuredVisualLayoutFromDOM, refresh, visualLayoutStore],
  );

  const replayCommandAfterVisualRefresh = useCallback(
    (command: JsonContentEditableSelectionIntent) => {
      const core = coreRef.current;
      if (core === null) {
        return;
      }
      refresh({ renderText: true });
      const commandResult = core.dispatch(command);
      if (shouldRefreshDemo(commandResult)) {
        refresh({
          renderText: "render" in commandResult ? commandResult.render : false,
        });
      }
    },
    [refresh],
  );

  useEffect(
    () =>
      document.subscribe(() => {
        visualLayoutStore.invalidate("Document model changed.");
        refresh();
      }),
    [document, refresh, visualLayoutStore],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    coreRef.current = createEditableHost({
      root,
      document,
      atomsPath: contentEditableDemoAtomsPathForTextPath,
      projection: (path) =>
        contentEditableDemoTextProjection(projectionRef.current, path),
      rangesPath: contentEditableDemoRangesPathForTextPath,
      visualLayout: visualLayoutStore.read,
    });
    renderEditorContent();
    setIsReady(true);
    const syncNativeSelection = (event: Event) => {
      if (
        event instanceof KeyboardEvent &&
        !shouldSyncSelectionAfterKeyUp(event)
      ) {
        return;
      }
      window.requestAnimationFrame(() => {
        coreRef.current?.syncSelectionFromDOM();
        refresh({ renderText: true });
      });
    };
    root.addEventListener("keyup", syncNativeSelection);
    root.addEventListener("mouseup", syncNativeSelection);
    const resizeObserver = new ResizeObserver(() => {
      scheduleVisualLayoutMeasure("Editor geometry changed.");
    });
    resizeObserver.observe(root);
    return () => {
      resizeObserver.disconnect();
      if (visualMeasureFrameRef.current !== null) {
        window.cancelAnimationFrame(visualMeasureFrameRef.current);
        visualMeasureFrameRef.current = null;
      }
      root.removeEventListener("keyup", syncNativeSelection);
      root.removeEventListener("mouseup", syncNativeSelection);
      coreRef.current = null;
      visualLayoutStore.reset();
      setIsReady(false);
    };
  }, [
    document,
    refresh,
    renderEditorContent,
    scheduleVisualLayoutMeasure,
    visualLayoutStore,
  ]);

  const run = useCallback(
    (event: Event) => {
      const core = coreRef.current;
      const result = core?.handle(event);
      if (isVisualLayoutStaleCommand(result)) {
        replayCommandAfterVisualRefresh(result.command);
        return;
      }
      if (result !== undefined && shouldRefreshDemo(result)) {
        if (
          "flow" in result &&
          result.flow === "dom-to-model" &&
          result.command !== undefined
        ) {
          composingRef.current = false;
          replayCommandAfterVisualRefresh(result.command);
          return;
        }
        if (
          "flow" in result &&
          result.flow === "dom-to-model" &&
          result.kind === "text" &&
          !result.render
        ) {
          commitMeasuredVisualLayoutFromDOM();
        }
        refresh({
          renderText:
            "render" in result ? result.render : shouldRenderEditorText(event),
        });
      }
    },
    [
      commitMeasuredVisualLayoutFromDOM,
      refresh,
      replayCommandAfterVisualRefresh,
    ],
  );

  const handleInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handleBeforeInput = useCallback(
    (event: FormEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handleSelect = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handleCompositionStart = useCallback(
    (event: ReactCompositionEvent<HTMLDivElement>) => {
      composingRef.current = true;
      run(event.nativeEvent);
    },
    [run],
  );
  const handleCompositionEnd = useCallback(
    (event: ReactCompositionEvent<HTMLDivElement>) => {
      composingRef.current = false;
      run(event.nativeEvent);
    },
    [run],
  );
  const handleCopy = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handleCut = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handlePaste = useCallback(
    (event: ReactClipboardEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handleEditorPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const root = rootRef.current;
      const target = event.target;
      if (root === null || !(target instanceof Element)) {
        return;
      }
      const atom = target.closest(
        "[data-editable-atom][data-editable-atom-type='taskMarker']",
      );
      if (!(atom instanceof HTMLElement) || !root.contains(atom)) {
        return;
      }
      const atomId = atom.getAttribute("data-editable-atom");
      if (atomId === null) {
        return;
      }

      event.preventDefault();
      coreRef.current?.flush({ label: "toggle task" });
      toggleContentEditableDemoTaskMarker(
        document,
        atomId,
        document.selection?.snapshot() ?? null,
      );
      refresh({ renderText: true });
    },
    [document, refresh],
  );
  const handleToolbarPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      coreRef.current?.syncSelectionFromDOM();
    },
    [],
  );

  const command = useCallback(
    async (
      name:
        | "bold"
        | "copy"
        | "cut"
        | "h1"
        | "mention"
        | "paste"
        | "redo"
        | "reset"
        | "underline"
        | "undo",
    ) => {
      const core = coreRef.current;
      if (core === null) {
        return;
      }
      const commandSelection = document.selection?.snapshot() ?? null;
      if (name === "copy") {
        core.copy();
      } else if (name === "cut") {
        core.cut();
      } else if (name === "mention") {
        core.pasteFragment(createMentionFragment(), commandSelection);
      } else if (name === "h1") {
        core.flush({ label: "format heading" });
        if (commandSelection !== null) {
          document.selection?.restore(commandSelection);
        }
        toggleContentEditableDemoHeading(document, commandSelection);
      } else if (name === "bold" || name === "underline") {
        core.flush({ label: `format ${name}` });
        if (commandSelection !== null) {
          document.selection?.restore(commandSelection);
        }
        toggleContentEditableDemoMark(document, name, commandSelection);
      } else if (name === "paste") {
        const internalPayload = document.clipboard.read();
        if (internalPayload.ok && isRichTextFragment(internalPayload.payload)) {
          core.pasteFragment(internalPayload.payload, commandSelection);
        } else {
          const text = await readBrowserClipboardText();
          if (text === null) {
            core.paste();
          } else {
            core.pasteText(text, commandSelection);
          }
        }
      } else if (name === "undo") {
        core.undo();
      } else if (name === "redo") {
        core.redo();
      } else {
        document.reset(createContentEditableDemoValue());
        core.reset();
      }
      refresh({ renderText: name !== "copy" });
    },
    [document, refresh],
  );

  const selection = document.selection?.snapshot() ?? null;
  const clipboard = document.clipboard.read();
  const isHeading = contentEditableDemoHeadingActive(document.value, selection);
  const isBold = contentEditableDemoMarkActive(
    document.value,
    selection,
    "bold",
  );
  const isUnderline = contentEditableDemoMarkActive(
    document.value,
    selection,
    "underline",
  );
  const visualLayout = visualLayoutStore.read();

  return (
    <main className="contenteditable-shell">
      <section
        className="contenteditable-workspace"
        aria-label="Contenteditable demo"
      >
        <div className="contenteditable-main">
          <div
            aria-label="Document commands"
            className="contenteditable-toolbar"
            onPointerDown={handleToolbarPointerDown}
            role="toolbar"
          >
            <IconButton label="Copy" onClick={() => command("copy")}>
              <Copy size={16} />
            </IconButton>
            <IconButton label="Cut" onClick={() => command("cut")}>
              <Scissors size={16} />
            </IconButton>
            <IconButton label="Paste" onClick={() => command("paste")}>
              <ClipboardPaste size={16} />
            </IconButton>
            <IconButton label="Mention" onClick={() => command("mention")}>
              <AtSign size={16} />
            </IconButton>
            <span className="contenteditable-toolbar-gap" />
            <IconButton
              active={isHeading}
              label="Heading 1"
              onClick={() => command("h1")}
            >
              <Heading1 size={16} />
            </IconButton>
            <IconButton
              active={isBold}
              label="Bold"
              onClick={() => command("bold")}
            >
              <Bold size={16} />
            </IconButton>
            <IconButton
              active={isUnderline}
              label="Underline"
              onClick={() => command("underline")}
            >
              <Underline size={16} />
            </IconButton>
            <span className="contenteditable-toolbar-gap" />
            <IconButton
              disabled={!document.canUndo().ok}
              label="Undo"
              onClick={() => command("undo")}
            >
              <Undo2 size={16} />
            </IconButton>
            <IconButton
              disabled={!document.canRedo().ok}
              label="Redo"
              onClick={() => command("redo")}
            >
              <Redo2 size={16} />
            </IconButton>
            <span className="contenteditable-toolbar-gap" />
            <IconButton label="Reset" onClick={() => command("reset")}>
              <RotateCcw size={16} />
            </IconButton>
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: this demo must exercise a contenteditable host, not a textarea. */}
          <div
            aria-label="JSON document text"
            className="contenteditable-editor"
            contentEditable="plaintext-only"
            data-ready={isReady ? "true" : "false"}
            onBeforeInput={handleBeforeInput}
            onCompositionEnd={handleCompositionEnd}
            onCompositionStart={handleCompositionStart}
            onCopy={handleCopy}
            onCut={handleCut}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onPointerDown={handleEditorPointerDown}
            onSelect={handleSelect}
            ref={rootRef}
            role="textbox"
            spellCheck={false}
            suppressContentEditableWarning={true}
            tabIndex={0}
          />
        </div>
        <aside
          className="contenteditable-state"
          aria-label="JSON document state"
        >
          <StateBlock label="value" value={document.value} />
          <StateBlock label="selection" value={selection} />
          <StateBlock
            label="clipboard"
            value={clipboard.ok ? clipboard.payload : clipboard.code}
          />
          <StateBlock
            label="text surfaces"
            value={summarizeContentEditableDemoModel(document.value)}
          />
          <StateBlock
            label="canonical dom"
            value={summarizeContentEditableDemoDOM(rootRef.current)}
          />
          <StateBlock
            label="visual layout"
            value={{
              ok: visualLayout.ok,
              revision: visualLayout.revision,
              reason: visualLayout.ok ? null : visualLayout.reason,
              lines:
                visualLayout.layout?.lines.map((line) => ({
                  id: line.id,
                  kind: line.kind,
                  path: line.path,
                  start: line.startOffset,
                  end: line.endOffset,
                  box: line.box,
                })) ?? [],
            }}
          />
          <StateBlock
            label="history"
            value={{
              canUndo: document.canUndo().ok,
              canRedo: document.canRedo().ok,
              undoDepth: document.history.undoDepth,
              redoDepth: document.history.redoDepth,
            }}
          />
        </aside>
      </section>
    </main>
  );
}

async function readBrowserClipboardText(): Promise<string | null> {
  if (navigator.clipboard?.readText === undefined) {
    return null;
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

function shouldRefreshDemo(
  result:
    | ReturnType<EditableHost<ContentEditableDemoDocument>["handle"]>
    | undefined,
): boolean {
  if (result === undefined || !result.ok) {
    return false;
  }
  if ("render" in result && result.render) {
    return true;
  }
  return !("kind" in result) || result.kind !== "no-change";
}

function isVisualLayoutStaleCommand(
  result: unknown,
): result is Extract<
  EditableUpdate<ContentEditableDemoDocument>,
  { ok: false; code: "visual_layout_stale" }
> {
  return (
    typeof result === "object" &&
    result !== null &&
    "ok" in result &&
    result.ok === false &&
    "code" in result &&
    result.code === "visual_layout_stale" &&
    "command" in result
  );
}

function shouldRenderEditorText(event: Event): boolean {
  if (event.type === "beforeinput" && event instanceof InputEvent) {
    return isLineBreakInput(event) && !event.isComposing;
  }
  if (event.type === "input" || event.type === "compositionend") {
    return false;
  }
  if (event.type === "cut" || event.type === "paste") {
    return true;
  }
  if (event.type === "keydown" && event instanceof KeyboardEvent) {
    const key = event.key.toLowerCase();
    return (event.metaKey || event.ctrlKey) && (key === "z" || key === "y");
  }
  return false;
}

function shouldSyncSelectionAfterKeyUp(event: KeyboardEvent): boolean {
  if (event.isComposing) {
    return false;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a") {
    return true;
  }
  return (
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "Home" ||
    event.key === "End" ||
    event.key === "PageUp" ||
    event.key === "PageDown"
  );
}

function isLineBreakInput(event: InputEvent): boolean {
  return (
    event.inputType === "insertParagraph" ||
    event.inputType === "insertLineBreak"
  );
}

function IconButton({
  active,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
      data-active={active ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function StateBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <section className="contenteditable-state-block">
      <h2>{label}</h2>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
