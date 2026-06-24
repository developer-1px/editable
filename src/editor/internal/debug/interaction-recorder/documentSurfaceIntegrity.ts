import {
  type InlineNode,
  isCodeBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../../model/noteDocument";

export type DocumentSurfaceIntegrityIssue = {
  kind:
    | "missing-document-view"
    | "missing-block"
    | "reparented-block"
    | "invalid-block"
    | "missing-content"
    | "reparented-content"
    | "invalid-content";
  path: string;
};

export function inspectDocumentSurfaceIntegrity(
  root: ParentNode | null,
  document: NoteDocument,
): DocumentSurfaceIntegrityIssue[] {
  if (root === null) {
    return [];
  }

  const issues: DocumentSurfaceIntegrityIssue[] = [];
  const documentView = root.querySelector(".document-view");
  if (!(documentView instanceof Element)) {
    issues.push({ kind: "missing-document-view", path: "/root" });
  }

  document.root.children.forEach((block, blockIndex) => {
    const blockPath = `/root/children/${blockIndex}`;
    const blockElement = findElementByDataPath(root, blockPath);
    if (blockElement === null) {
      issues.push({ kind: "missing-block", path: blockPath });
      return;
    }

    if (
      documentView instanceof Element &&
      blockElement.parentElement !== documentView
    ) {
      issues.push({ kind: "reparented-block", path: blockPath });
    }
    if (!validBlockElement(blockElement, block.type)) {
      issues.push({ kind: "invalid-block", path: blockPath });
    }

    if (isInlineTextBlock(block)) {
      const children =
        block.children.length > 0
          ? block.children
          : ([{ type: "text" }] as Array<Pick<InlineNode, "type">>);
      children.forEach((child, childIndex) => {
        const contentPath =
          child.type === "text"
            ? `${blockPath}/children/${childIndex}/text`
            : `${blockPath}/children/${childIndex}`;
        const contentElement = findElementByDataPath(root, contentPath);
        if (contentElement === null) {
          issues.push({ kind: "missing-content", path: contentPath });
          return;
        }
        if (contentElement.parentElement !== blockElement) {
          issues.push({ kind: "reparented-content", path: contentPath });
        }
        if (!validInlineContentElement(contentElement, child.type)) {
          issues.push({ kind: "invalid-content", path: contentPath });
        }
      });
      return;
    }

    if (isCodeBlock(block)) {
      const contentPath = `${blockPath}/text`;
      const contentElement = findElementByDataPath(root, contentPath);
      if (contentElement === null) {
        issues.push({ kind: "missing-content", path: contentPath });
        return;
      }
      if (contentElement.parentElement !== blockElement) {
        issues.push({ kind: "reparented-content", path: contentPath });
      }
      if (!contentElement.classList.contains("text-run")) {
        issues.push({ kind: "invalid-content", path: contentPath });
      }
    }
  });

  return issues;
}

export function formatDocumentSurfaceIssue(
  issue: DocumentSurfaceIntegrityIssue,
): string {
  return `${issue.kind}: ${issue.path}`;
}

function validBlockElement(element: Element, type: string): boolean {
  if (type === "figure") {
    return element.classList.contains("figure-block");
  }
  if (type === "codeBlock") {
    return (
      element.classList.contains("code-block") &&
      element.classList.contains("text-block")
    );
  }

  return element.classList.contains("text-block");
}

function validInlineContentElement(element: Element, type: string): boolean {
  if (type === "mention") {
    return element.classList.contains("mention-chip");
  }

  return element.classList.contains("text-run");
}

function findElementByDataPath(root: ParentNode, path: string): Element | null {
  for (const element of Array.from(root.querySelectorAll("[data-path]"))) {
    if (element.getAttribute("data-path") === path) {
      return element;
    }
  }

  return null;
}
