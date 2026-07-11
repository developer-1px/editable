import {
  Code2,
  Heading1,
  Pilcrow,
  Quote,
  Redo2,
  RefreshCw,
  RotateCcw,
  Undo2,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createEditableDocument,
  type EditableBlockType,
  type EditorFault,
  type EditorSnapshot,
  type JsonEditable,
  mountJsonEditable,
} from "../../packages/editable";

type EditableDocument = ReturnType<typeof createEditableDocument>;

declare global {
  interface Window {
    __jsonEditableLab?: {
      document: EditableDocument;
      editor: JsonEditable;
    };
  }
}

export function JsonEditableDemo() {
  const document = useMemo(() => createEditableDocument(), []);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<JsonEditable | null>(null);
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null);
  const [lastFault, setLastFault] = useState<EditorFault | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (root === null) {
      return;
    }

    const editor = mountJsonEditable({
      root,
      document,
      onFault: setLastFault,
    });
    editorRef.current = editor;
    setSnapshot(editor.getSnapshot());
    const unsubscribe = editor.subscribe(setSnapshot);
    window.__jsonEditableLab = { document, editor };

    return () => {
      if (window.__jsonEditableLab?.editor === editor) {
        delete window.__jsonEditableLab;
      }
      unsubscribe();
      editor.destroy();
      editorRef.current = null;
    };
  }, [document]);

  const setBlockType = useCallback((blockType: EditableBlockType) => {
    editorRef.current?.dispatch({ type: "setBlockType", blockType });
  }, []);

  const updateOtherBlock = useCallback(() => {
    const editor = editorRef.current;
    const currentSnapshot = editor?.getSnapshot();
    const block = [...document.value.blocks]
      .reverse()
      .find(
        (candidate) => candidate.id !== currentSnapshot?.composition?.blockId,
      );
    if (editor === null || block === undefined) {
      return;
    }
    editor.dispatch({
      type: "replaceText",
      blockId: block.id,
      from: block.text.length,
      to: block.text.length,
      text: ` · 외부 변경 ${(currentSnapshot?.revision ?? 0) + 1}`,
      label: "다른 블록 업데이트",
      origin: "remote",
    });
  }, [document]);

  const overlapComposition = useCallback(() => {
    const editor = editorRef.current;
    const composition = editor?.getSnapshot().composition;
    if (editor === null || composition === null || composition === undefined) {
      return;
    }
    editor.dispatch({
      type: "replaceText",
      blockId: composition.blockId,
      from: composition.from,
      to: composition.to,
      text: "[충돌]",
      label: "현재 조합 범위 업데이트",
      origin: "remote",
    });
  }, []);

  return (
    <main className="contenteditable-shell">
      <section
        aria-label="JSON contenteditable demo"
        className="contenteditable-workspace"
      >
        <div className="contenteditable-main">
          <div
            className="contenteditable-toolbar"
            onPointerDown={(event) => event.preventDefault()}
          >
            <IconButton
              label="Paragraph"
              onClick={() => setBlockType("paragraph")}
            >
              <Pilcrow size={16} />
            </IconButton>
            <IconButton label="Heading" onClick={() => setBlockType("heading")}>
              <Heading1 size={16} />
            </IconButton>
            <IconButton label="Quote" onClick={() => setBlockType("quote")}>
              <Quote size={16} />
            </IconButton>
            <IconButton label="Code" onClick={() => setBlockType("code")}>
              <Code2 size={16} />
            </IconButton>
            <span aria-hidden="true" className="contenteditable-toolbar-gap" />
            <IconButton
              label="Undo"
              onClick={() => editorRef.current?.dispatch({ type: "undo" })}
            >
              <Undo2 size={16} />
            </IconButton>
            <IconButton
              label="Redo"
              onClick={() => editorRef.current?.dispatch({ type: "redo" })}
            >
              <Redo2 size={16} />
            </IconButton>
            <IconButton
              label="Reset"
              onClick={() => editorRef.current?.dispatch({ type: "reset" })}
            >
              <RotateCcw size={16} />
            </IconButton>
            <span aria-hidden="true" className="contenteditable-toolbar-gap" />
            <button
              className="text-button"
              onClick={updateOtherBlock}
              type="button"
            >
              <RefreshCw aria-hidden="true" size={15} />
              다른 블록 업데이트
            </button>
            <button
              className="text-button"
              disabled={snapshot === null || snapshot.composition === null}
              onClick={overlapComposition}
              type="button"
            >
              현재 조합과 충돌
            </button>
          </div>

          {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: mountJsonEditable assigns the empty host's editing semantics. */}
          <div
            aria-label="JSON document editor"
            className="contenteditable-editor"
            ref={rootRef}
          />
        </div>

        <aside aria-label="Editor state" className="contenteditable-state">
          <StateBlock label="value" value={document.value} />
          <StateBlock label="selection" value={snapshot?.selection ?? null} />
          <StateBlock
            label="input phase"
            value={{
              composition: snapshot?.composition ?? null,
              phase: snapshot?.phase ?? "mounting",
              queuedChanges: snapshot?.queuedChanges ?? 0,
              revision: snapshot?.revision ?? 0,
            }}
          />
          <StateBlock label="last fault" value={lastFault} />
        </aside>
      </section>
    </main>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="icon-button"
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
      <pre>{stringify(value)}</pre>
    </section>
  );
}

function stringify(value: unknown): string {
  if (value === null) {
    return "null";
  }
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}
