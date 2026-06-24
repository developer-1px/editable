import {
  isCodeBlock,
  isInlineTextBlock,
  type NoteDocument,
} from "../../model/noteDocument";
import { findElementByDataPath } from "./contentEditableTextPoint";

export function restoreDocumentText(root: HTMLElement, document: NoteDocument) {
  document.root.children.forEach((block, blockIndex) => {
    if (isInlineTextBlock(block)) {
      block.children.forEach((child, childIndex) => {
        if (child.type !== "text") {
          return;
        }

        restoreTextElement(
          root,
          `/root/children/${blockIndex}/children/${childIndex}/text`,
          child.text,
        );
      });
      return;
    }

    if (isCodeBlock(block)) {
      restoreTextElement(root, `/root/children/${blockIndex}/text`, block.text);
    }
  });
}

export function restoreTextElement(
  root: HTMLElement,
  path: string,
  text: string,
) {
  const element = findElementByDataPath(root, path);
  if (element === null) {
    return;
  }

  const onlyChild = element.childNodes.length === 1 ? element.firstChild : null;
  if (!(onlyChild instanceof Text) || onlyChild.data !== text) {
    element.textContent = text;
  }
}

export function readRootText(
  root: ParentNode | null,
  path: string,
): string | null {
  return root === null
    ? null
    : (findElementByDataPath(root, path)?.textContent ?? null);
}
