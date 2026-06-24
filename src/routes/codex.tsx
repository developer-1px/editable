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
  createJsonContentEditable,
  isJsonContentEditableFragment,
  type JsonContentEditable,
} from "../../packages/contenteditable-web";
import {
  type ContentEditableDemoDocument,
  contentEditableDemoAtomsPathForTextPath,
  contentEditableDemoBlockActive,
  contentEditableDemoMarkActive,
  contentEditableDemoRangesPathForTextPath,
  createContentEditableDemoDocument,
  createContentEditableDemoValue,
  createMentionFragment,
  renderContentEditableDemoContent,
  toggleContentEditableDemoBlock,
  toggleContentEditableDemoMark,
} from "../contenteditable-demo/document";

export const Route = createFileRoute("/codex")({
  component: ContentEditableDemo,
});

function ContentEditableDemo() {
  const document = useMemo(() => createContentEditableDemoDocument(), []);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const coreRef =
    useRef<JsonContentEditable<ContentEditableDemoDocument> | null>(null);
  const [, refreshState] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const renderEditorContent = useCallback(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    renderContentEditableDemoContent(root, document.value);
    coreRef.current?.restoreSelectionToDOM();
  }, [document]);

  const refresh = useCallback(
    (options: { renderText?: boolean } = {}) => {
      refreshState((revision) => revision + 1);
      if (options.renderText === true) {
        renderEditorContent();
      }
    },
    [renderEditorContent],
  );

  useEffect(() => document.subscribe(() => refresh()), [document, refresh]);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    coreRef.current = createJsonContentEditable({
      root,
      document,
      atomsPath: contentEditableDemoAtomsPathForTextPath,
      rangesPath: contentEditableDemoRangesPathForTextPath,
    });
    renderEditorContent();
    setIsReady(true);
    return () => {
      coreRef.current = null;
      setIsReady(false);
    };
  }, [document, renderEditorContent]);

  const run = useCallback(
    (event: Event) => {
      const result = coreRef.current?.handle(event);
      if (shouldRefreshDemo(result)) {
        refresh({ renderText: shouldRenderEditorText(event) });
      }
    },
    [refresh],
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
    (event: ReactCompositionEvent<HTMLDivElement>) => run(event.nativeEvent),
    [run],
  );
  const handleCompositionEnd = useCallback(
    (event: ReactCompositionEvent<HTMLDivElement>) => run(event.nativeEvent),
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
        core.flush({ intent: "range-command", label: "format heading" });
        if (commandSelection !== null) {
          document.selection?.restore(commandSelection);
        }
        toggleContentEditableDemoBlock(document, "heading1", commandSelection);
      } else if (name === "bold" || name === "underline") {
        core.flush({ intent: "range-command", label: `format ${name}` });
        if (commandSelection !== null) {
          document.selection?.restore(commandSelection);
        }
        toggleContentEditableDemoMark(document, name, commandSelection);
      } else if (name === "paste") {
        const internalPayload = document.clipboard.read();
        if (
          internalPayload.ok &&
          isJsonContentEditableFragment(internalPayload.payload)
        ) {
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
  const isHeading = contentEditableDemoBlockActive(
    document.value,
    selection,
    "heading1",
  );
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
    | ReturnType<JsonContentEditable<ContentEditableDemoDocument>["handle"]>
    | undefined,
): boolean {
  if (result === undefined || !result.ok) {
    return false;
  }
  return !("kind" in result) || result.kind !== "no-change";
}

function shouldRenderEditorText(event: Event): boolean {
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
