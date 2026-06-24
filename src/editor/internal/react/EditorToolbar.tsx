import { AtSign, Image, Redo2, Undo2 } from "lucide-react";
import type { MouseEvent } from "react";

type EditorToolbarProps = {
  onInsertFigure: () => void;
  onInsertMention: () => void;
  onRedo: () => void;
  onUndo: () => void;
};

export function EditorToolbar({
  onInsertFigure,
  onInsertMention,
  onRedo,
  onUndo,
}: EditorToolbarProps) {
  return (
    <div className="editor-toolbar" aria-label="Editor tools" role="toolbar">
      <button
        aria-label="Undo"
        className="icon-button"
        onClick={onUndo}
        onMouseDown={preventToolbarFocusSteal}
        type="button"
      >
        <Undo2 aria-hidden={true} size={18} />
      </button>
      <button
        aria-label="Redo"
        className="icon-button"
        onClick={onRedo}
        onMouseDown={preventToolbarFocusSteal}
        type="button"
      >
        <Redo2 aria-hidden={true} size={18} />
      </button>
      <button
        aria-label="Insert mention"
        className="icon-button"
        onClick={onInsertMention}
        onMouseDown={preventToolbarFocusSteal}
        type="button"
      >
        <AtSign aria-hidden={true} size={18} />
      </button>
      <button
        aria-label="Insert figure"
        className="icon-button"
        onClick={onInsertFigure}
        onMouseDown={preventToolbarFocusSteal}
        type="button"
      >
        <Image aria-hidden={true} size={18} />
      </button>
    </div>
  );
}

function preventToolbarFocusSteal(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}
