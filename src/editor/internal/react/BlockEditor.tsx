import { CursorOverlay } from "./CursorOverlay";
import { DebugRecordingInspector } from "./DebugRecordingInspector";
import { DocumentRenderer } from "./DocumentRenderer";
import { EditorToolbar } from "./EditorToolbar";
import { SelectionOverlay } from "./SelectionOverlay";
import {
  type BlockEditorProps,
  useBlockEditorController,
} from "./useBlockEditorController";

export type { BlockEditorProps };

export function BlockEditor(props: BlockEditorProps = {}) {
  const editor = useBlockEditorController(props);

  return (
    <main className="app-shell">
      <DebugRecordingInspector state={editor.debugRecording} />
      <section className="editor-pane" aria-label="Editor">
        <input
          aria-label="Title"
          className="title-input"
          readOnly={editor.readOnly}
          value={editor.title}
          onChange={(event) => editor.handleTitleChange(event.target.value)}
        />
        <EditorToolbar
          onInsertFigure={editor.insertFigure}
          onInsertMention={editor.insertMention}
          onRedo={editor.handleRedo}
          onUndo={editor.handleUndo}
        />
        <div className="document-stage">
          {/* biome-ignore lint/a11y/useSemanticElements: The editor surface hosts structured atoms that textarea cannot render. */}
          <div
            aria-label="Document body"
            aria-multiline={true}
            aria-readonly={editor.readOnly}
            className="editor-surface"
            contentEditable="plaintext-only"
            data-focused={editor.isEditorFocused ? "true" : undefined}
            data-ime-composing={editor.isComposing ? "true" : undefined}
            onBlur={editor.handleBlur}
            onCompositionEnd={editor.handleCompositionEnd}
            onCompositionStart={editor.handleCompositionStart}
            onCopy={editor.handleCopy}
            onCut={editor.handleCut}
            onDragOver={editor.handleDragOver}
            onDrop={editor.handleDrop}
            onFocus={editor.handleFocus}
            onInput={editor.handleInput}
            onKeyDown={editor.handleKeyDown}
            onPaste={editor.handlePaste}
            onPointerCancel={editor.handlePointerCancel}
            onPointerDown={editor.handlePointerDown}
            onPointerMove={editor.handlePointerMove}
            onPointerUp={editor.handlePointerUp}
            onSelect={editor.handleSelect}
            ref={editor.setEditorSurfaceRef}
            role="textbox"
            spellCheck={false}
            suppressContentEditableWarning={true}
            tabIndex={0}
          >
            <DocumentRenderer
              note={editor.note}
              selection={editor.visibleSelection}
            />
          </div>
          {editor.geometry === null || !editor.layoutMeasured ? null : (
            <>
              <SelectionOverlay
                geometry={editor.geometry}
                key={editor.layoutVersion}
                selection={editor.selectionOverlay}
              />
              <CursorOverlay
                geometry={editor.geometry}
                point={editor.cursorOverlayPoint}
              />
            </>
          )}
        </div>
      </section>
    </main>
  );
}
