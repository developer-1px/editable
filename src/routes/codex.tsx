import { createFileRoute } from "@tanstack/react-router";
import {
  AtSign,
  ClipboardPaste,
  Copy,
  Redo2,
  RotateCcw,
  Scissors,
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
  JSON_TEXT_ATTRIBUTE,
  type JsonContentEditable,
} from "../../codex/core";
import {
  CODEX_DEMO_ATOMS_PATH,
  type CodexDemoDocument,
  createCodexDemoDocument,
  createCodexDemoValue,
  createMentionFragment,
  renderCodexDemoContent,
} from "../codex-demo/document";

export const Route = createFileRoute("/codex")({ component: CodexDemo });

function CodexDemo() {
  const document = useMemo(() => createCodexDemoDocument(), []);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<JsonContentEditable<CodexDemoDocument> | null>(null);
  const [, refreshState] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const renderEditorContent = useCallback(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    renderCodexDemoContent(root, document.value);
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
      atomsPath: CODEX_DEMO_ATOMS_PATH,
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
      name: "copy" | "cut" | "mention" | "paste" | "undo" | "redo" | "reset",
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
        document.reset(createCodexDemoValue());
        core.reset();
      }
      refresh({ renderText: name !== "copy" });
    },
    [document, refresh],
  );

  const selection = document.selection?.snapshot() ?? null;
  const clipboard = document.clipboard.read();

  return (
    <main className="codex-shell">
      <section className="codex-workspace" aria-label="Codex core demo">
        <div className="codex-main">
          <div
            aria-label="Document commands"
            className="codex-toolbar"
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
            <span className="codex-toolbar-gap" />
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
            <span className="codex-toolbar-gap" />
            <IconButton label="Reset" onClick={() => command("reset")}>
              <RotateCcw size={16} />
            </IconButton>
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: this demo must exercise a contenteditable host, not a textarea. */}
          <div
            aria-label="JSON document text"
            className="codex-editor"
            contentEditable="plaintext-only"
            data-ready={isReady ? "true" : "false"}
            {...{ [JSON_TEXT_ATTRIBUTE]: "/text" }}
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
        <aside className="codex-state" aria-label="JSON document state">
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
    | ReturnType<JsonContentEditable<CodexDemoDocument>["handle"]>
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
  children,
  disabled,
  label,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
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
    <section className="codex-state-block">
      <h2>{label}</h2>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
