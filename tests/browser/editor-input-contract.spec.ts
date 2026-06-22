import { expect, type Page, test } from "@playwright/test";

const firstTextPath = "/root/children/0/children/0/text";
const documentSelector = '[role="document"]';

type BrowserEditorState = {
  domSelectionAnchorOffset: string | null;
  domSelectionAnchorPath: string | null;
  domSelectionCollapsed: string | null;
  domSelectionFocusOffset: string | null;
  domSelectionFocusPath: string | null;
  domSelectionText: string;
  mentionCount: number;
  selectedRangeCount: number;
  selectionAnchorOffset: string | null;
  selectionAnchorPath: string | null;
  selectionFocusOffset: string | null;
  selectionFocusPath: string | null;
  selectionOffset: string | null;
  selectionPath: string | null;
  text: string;
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document body" });
  await expect(editor).toBeFocused();
  await expect(pathLocator(page, firstTextPath)).toHaveText("Plain ");
});

test("keyboard navigation uses browser DOM selection and canonical selection", async ({
  page,
}) => {
  await page.keyboard.press("ArrowRight");
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    domSelectionFocusOffset: "1",
    domSelectionFocusPath: firstTextPath,
    selectionOffset: "1",
    selectionPath: firstTextPath,
  });

  await page.keyboard.press("ArrowRight");
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    domSelectionFocusOffset: "2",
    selectionOffset: "2",
  });

  await setNativeTextSelection(page, firstTextPath, 1, 3);
  await expectEditorState(page, {
    domSelectionCollapsed: "false",
    domSelectionText: "la",
  });

  await page.keyboard.press("ArrowRight");
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    selectionOffset: "3",
    selectionPath: firstTextPath,
  });

  await setNativeTextSelection(page, firstTextPath, 1, 3);
  await page.keyboard.press("ArrowLeft");
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    selectionOffset: "1",
    selectionPath: firstTextPath,
  });

  await page.keyboard.press("Shift+ArrowRight");
  await expectEditorState(page, {
    selectionAnchorOffset: "1",
    selectionAnchorPath: firstTextPath,
    selectionFocusOffset: "2",
    selectionFocusPath: firstTextPath,
    selectionPath: firstTextPath,
    selectedRangeCount: 1,
  });
});

test("paste replaces the current browser DOM range selection", async ({
  page,
}) => {
  await setNativeTextSelection(page, firstTextPath, 0, 5);
  await expectEditorState(page, {
    domSelectionCollapsed: "false",
    domSelectionText: "Plain",
  });

  await dispatchTransferEvent(page, "paste", { "text/plain": "paste " });

  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    selectionOffset: "6",
    selectionPath: firstTextPath,
  });
  await expect(pathLocator(page, firstTextPath)).toHaveText("paste  ");
});

test("markdown drop uses browser DataTransfer and current DOM selection", async ({
  page,
}) => {
  await setNativeTextSelection(page, firstTextPath, 1, 1);

  await dispatchTransferEvent(page, "drop", {
    "text/markdown": "@[Ada](mention:user-ada)",
  });

  await expectEditorState(page, {
    mentionCount: 2,
  });
});

function pathLocator(page: Page, path: string) {
  return page.locator(`[data-path="${path}"]`).first();
}

async function expectEditorState(
  page: Page,
  expected: Partial<BrowserEditorState>,
) {
  await expect.poll(() => readEditorState(page)).toMatchObject(expected);
}

async function readEditorState(page: Page): Promise<BrowserEditorState> {
  return page.evaluate((selector) => {
    const domSelectionOffset = (offset: number | undefined) =>
      offset === undefined ? null : String(offset);
    const domSelectionPath = (node: Node | null) => {
      const element =
        node instanceof Element ? node : (node?.parentElement ?? null);
      return element?.closest("[data-path]")?.getAttribute("data-path") ?? null;
    };
    const documentView = document.querySelector(selector);
    if (!(documentView instanceof HTMLElement)) {
      throw new Error("Document view was not found.");
    }

    const selection = window.getSelection();
    return {
      domSelectionAnchorOffset: domSelectionOffset(selection?.anchorOffset),
      domSelectionAnchorPath: domSelectionPath(selection?.anchorNode ?? null),
      domSelectionCollapsed:
        selection === null ? null : String(selection.isCollapsed),
      domSelectionFocusOffset: domSelectionOffset(selection?.focusOffset),
      domSelectionFocusPath: domSelectionPath(selection?.focusNode ?? null),
      domSelectionText: selection?.toString() ?? "",
      mentionCount: document.querySelectorAll(".mention-chip").length,
      selectedRangeCount: document.querySelectorAll('[data-overlay="selected-range"]')
        .length,
      selectionAnchorOffset:
        documentView.getAttribute("data-selection-anchor-offset"),
      selectionAnchorPath:
        documentView.getAttribute("data-selection-anchor-path"),
      selectionFocusOffset:
        documentView.getAttribute("data-selection-focus-offset"),
      selectionFocusPath: documentView.getAttribute(
        "data-selection-focus-path",
      ),
      selectionOffset: documentView.getAttribute("data-selection-offset"),
      selectionPath: documentView.getAttribute("data-selection-path"),
      text: documentView.textContent ?? "",
    };
  }, documentSelector);
}

async function setNativeTextSelection(
  page: Page,
  path: string,
  anchorOffset: number,
  focusOffset: number,
) {
  await page.evaluate(
    ({ anchorOffset, focusOffset, path }) => {
      const findDataPathElement = (targetPath: string) =>
        Array.from(document.querySelectorAll("[data-path]")).find(
          (element) => element.getAttribute("data-path") === targetPath,
        );
      const firstTextNode = (element: Element) => {
        const walker = document.createTreeWalker(
          element,
          NodeFilter.SHOW_TEXT,
        );
        return walker.nextNode();
      };
      const root = document.querySelector('[role="textbox"]');
      const run = findDataPathElement(path);
      if (!(root instanceof HTMLElement) || !(run instanceof HTMLElement)) {
        throw new Error(`Cannot set selection for ${path}.`);
      }

      root.focus();
      const text = firstTextNode(run);
      if (text === null) {
        throw new Error(`Selection target has no text node: ${path}.`);
      }

      const range = document.createRange();
      range.setStart(text, anchorOffset);
      range.setEnd(text, focusOffset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      document.dispatchEvent(new Event("selectionchange", { bubbles: true }));
      root.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { anchorOffset, focusOffset, path },
  );
}

async function dispatchTransferEvent(
  page: Page,
  type: "drop" | "paste",
  data: Record<string, string>,
) {
  await page.evaluate(
    ({ data, type }) => {
      const root = document.querySelector('[role="textbox"]');
      if (!(root instanceof HTMLElement)) {
        throw new Error("Editor root was not found.");
      }

      root.focus();
      const transfer = new DataTransfer();
      for (const [format, value] of Object.entries(data)) {
        transfer.setData(format, value);
      }

      if (type === "drop") {
        root.dispatchEvent(
          new DragEvent("drop", {
            bubbles: true,
            cancelable: true,
            dataTransfer: transfer,
          }),
        );
        return;
      }

      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "clipboardData", {
        configurable: true,
        value: transfer,
      });
      root.dispatchEvent(event);
    },
    { data, type },
  );
}
