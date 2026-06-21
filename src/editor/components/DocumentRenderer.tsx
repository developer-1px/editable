import type {
  SelectionPoint,
  SelectionSnap,
} from "@interactive-os/json-document";
import type { ReactNode } from "react";
import type {
  InlineNode,
  Mark,
  NoteBlock,
  NoteDocument,
} from "../model/noteDocument";

type DocumentRendererProps = {
  note: NoteDocument;
  selection?: SelectionSnap;
};

export function DocumentRenderer({ note, selection }: DocumentRendererProps) {
  const focus = selection?.focus ?? null;
  const primaryRange =
    selection === undefined
      ? undefined
      : selection.selectionRanges[selection.primaryIndex];
  const blockKeys = blockRenderKeys(note.root.children);

  return (
    <div
      aria-label="Document"
      className="document-view"
      data-selection-anchor-edge={selectionPointEdge(
        primaryRange?.anchor ?? null,
      )}
      data-selection-anchor-offset={selectionPointOffset(
        primaryRange?.anchor ?? null,
      )}
      data-selection-anchor-path={selectionPointPathOrUndefined(
        primaryRange?.anchor ?? null,
      )}
      data-selection-path={
        focus === null ? undefined : selectionPointPath(focus)
      }
      data-selection-offset={selectionPointOffset(focus)}
      data-selection-edge={selectionPointEdge(focus)}
      data-selection-focus-edge={selectionPointEdge(
        primaryRange?.focus ?? null,
      )}
      data-selection-focus-offset={selectionPointOffset(
        primaryRange?.focus ?? null,
      )}
      data-selection-focus-path={selectionPointPathOrUndefined(
        primaryRange?.focus ?? null,
      )}
      data-selection-range-count={selection?.selectionRanges.length}
      data-selection-selected-pointers={selection?.selectedPointers.join(" ")}
      role="document"
    >
      {note.root.children.map((block, blockIndex) => (
        <BlockView
          key={blockKeys[blockIndex] ?? block.id}
          block={block}
          blockIndex={blockIndex}
          focus={focus}
        />
      ))}
    </div>
  );
}

function blockRenderKeys(blocks: NoteBlock[]): string[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    counts.set(block.id, (counts.get(block.id) ?? 0) + 1);
  }

  const occurrences = new Map<string, number>();
  return blocks.map((block) => {
    if ((counts.get(block.id) ?? 0) <= 1) {
      return block.id;
    }

    const occurrence = occurrences.get(block.id) ?? 0;
    occurrences.set(block.id, occurrence + 1);
    return `${block.id}:${occurrence}`;
  });
}

function BlockView({
  block,
  blockIndex,
  focus,
}: {
  block: NoteBlock;
  blockIndex: number;
  focus: SelectionPoint | null;
}) {
  const blockPath = `/root/children/${blockIndex}`;

  if (block.type === "figure") {
    return (
      <figure
        className="figure-block"
        contentEditable={false}
        data-path={blockPath}
        {...cursorAttributes(blockPath, focus)}
      >
        <img alt={block.alt ?? ""} src={block.src} />
      </figure>
    );
  }

  if (block.type === "codeBlock") {
    return (
      <pre
        className="code-block text-block"
        data-path={blockPath}
        {...cursorAttributes(blockPath, focus)}
      >
        <code
          className="code-block-text text-run"
          data-path={`${blockPath}/text`}
          {...cursorAttributes(`${blockPath}/text`, focus)}
        >
          {block.text}
        </code>
      </pre>
    );
  }

  const children = block.children.map((child, childIndex) => (
    <InlineView
      // biome-ignore lint/suspicious/noArrayIndexKey: Child indexes are the cursor coordinate.
      key={`${block.id}:${childIndex}`}
      child={child}
      path={`${blockPath}/children/${childIndex}`}
      focus={focus}
    />
  ));

  if (block.type === "heading") {
    return (
      <h2
        className="heading-block text-block"
        data-heading-level={block.level}
        data-path={blockPath}
        {...cursorAttributes(blockPath, focus)}
      >
        {children}
      </h2>
    );
  }

  if (block.type === "quote") {
    return (
      <blockquote
        className="quote-block text-block"
        data-path={blockPath}
        {...cursorAttributes(blockPath, focus)}
      >
        {children}
      </blockquote>
    );
  }

  if (block.type === "listItem") {
    return (
      <div
        className="list-item-block text-block"
        data-list-depth={block.depth}
        data-list-ordered={block.ordered}
        data-path={blockPath}
        {...cursorAttributes(blockPath, focus)}
      >
        {children}
      </div>
    );
  }

  return (
    <p
      className="paragraph-block text-block"
      data-path={blockPath}
      {...cursorAttributes(blockPath, focus)}
    >
      {children}
    </p>
  );
}

function InlineView({
  child,
  path,
  focus,
}: {
  child: InlineNode;
  path: string;
  focus: SelectionPoint | null;
}) {
  if (child.type === "mention") {
    return (
      <span
        className="mention-chip"
        contentEditable={false}
        data-mention-id={child.id}
        data-path={path}
        {...cursorAttributes(path, focus)}
      >
        @{child.label}
      </span>
    );
  }

  const textPath = `${path}/text`;

  return (
    <span
      className="text-run"
      data-empty-text={child.text.length === 0 ? "true" : undefined}
      data-path={textPath}
      {...cursorAttributes(textPath, focus)}
    >
      {renderMarkedText(child.text, child.marks)}
    </span>
  );
}

function renderMarkedText(text: string, marks: Mark[] | undefined): ReactNode {
  if (marks === undefined || marks.length === 0) {
    return text;
  }

  return marks.reduceRight<ReactNode>(
    (content, mark) => renderMark(mark, content),
    text,
  );
}

function renderMark(mark: Mark, content: ReactNode): ReactNode {
  if (mark.type === "bold") {
    return <strong className="rich-strong">{content}</strong>;
  }
  if (mark.type === "italic") {
    return <em className="rich-emphasis">{content}</em>;
  }
  if (mark.type === "code") {
    return <code className="rich-code">{content}</code>;
  }

  return (
    <a className="rich-link" href={mark.href} title={mark.title}>
      {content}
    </a>
  );
}

function cursorAttributes(path: string, focus: SelectionPoint | null) {
  if (focus === null || selectionPointPath(focus) !== path) {
    return {};
  }

  return {
    "data-cursor": "focus",
    "data-cursor-offset": selectionPointOffset(focus),
    "data-cursor-edge": selectionPointEdge(focus),
  };
}

function selectionPointPath(point: SelectionPoint): string {
  return typeof point === "string" ? point : point.path;
}

function selectionPointPathOrUndefined(
  point: SelectionPoint | null,
): string | undefined {
  return point === null ? undefined : selectionPointPath(point);
}

function selectionPointOffset(point: SelectionPoint | null) {
  return typeof point === "object" &&
    point !== null &&
    point.offset !== undefined
    ? String(point.offset)
    : undefined;
}

function selectionPointEdge(point: SelectionPoint | null) {
  return typeof point === "object" && point !== null ? point.edge : undefined;
}
