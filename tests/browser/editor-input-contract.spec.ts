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

type BrowserInputTraceEntry = {
  data: string | null;
  domSelectionCollapsed: string | null;
  domSelectionFocusOffset: string | null;
  domSelectionFocusPath: string | null;
  inputType: string | null;
  isComposing: boolean | null;
  key: string | null;
  scenarioId: string;
  targetRangeCount: number | null;
  targetRangeSupported: boolean;
  type: string;
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document body" });
  await expect(editor).toBeVisible();
  await expect(pathLocator(page, firstTextPath)).toHaveText("Plain ");
  await focusHydratedEditor(page);
  await setNativeTextSelection(page, firstTextPath, 0, 0);
  await expect(editor).toBeFocused();
});

test("keyboard navigation uses browser DOM selection and canonical selection", async ({
  page,
}) => {
  await pressEditorKey(page, "ArrowRight");
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    domSelectionFocusOffset: "1",
    domSelectionFocusPath: firstTextPath,
    selectionOffset: "1",
    selectionPath: firstTextPath,
  });

  await pressEditorKey(page, "ArrowRight");
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

  await pressEditorKey(page, "ArrowRight");
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    selectionOffset: "3",
    selectionPath: firstTextPath,
  });

  await setNativeTextSelection(page, firstTextPath, 1, 3);
  await pressEditorKey(page, "ArrowLeft");
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    selectionOffset: "1",
    selectionPath: firstTextPath,
  });

  await pressEditorKey(page, "Shift+ArrowRight");
  await expectEditorState(page, {
    selectionAnchorOffset: "1",
    selectionAnchorPath: firstTextPath,
    selectionFocusOffset: "2",
    selectionFocusPath: firstTextPath,
    selectionPath: firstTextPath,
    selectedRangeCount: 1,
  });
});

test("printable browser input records event order and target range evidence", async ({
  page,
}) => {
  const scenarioId = "BROWSER-PRINTABLE-EVENT-ORDER";
  await installBrowserInputTrace(page, scenarioId);
  await setNativeTextSelection(page, firstTextPath, 0, 0);

  await pressEditorKey(page, "x");

  const trace = await readBrowserInputTrace(page);
  expect(trace.map((entry) => entry.type)).toContain("keydown");
  const beforeInput = trace.find(
    (entry) => entry.type === "beforeinput" && entry.inputType === "insertText",
  );
  expect(beforeInput, scenarioId).toBeDefined();
  expect(beforeInput?.scenarioId).toBe(scenarioId);
  expect(beforeInput?.domSelectionFocusPath).toBe(firstTextPath);
  expect(typeof beforeInput?.targetRangeSupported).toBe("boolean");
  expect(
    beforeInput?.targetRangeSupported
      ? typeof beforeInput.targetRangeCount
      : beforeInput?.targetRangeCount,
  ).toBe(beforeInput?.targetRangeSupported ? "number" : null);

  await expect(pathLocator(page, firstTextPath)).toHaveText("xPlain ");
  await expectEditorState(page, {
    selectionOffset: "1",
    selectionPath: firstTextPath,
  });
});

test("browser trace harness records composition event evidence", async ({
  page,
}) => {
  const scenarioId = "IME-COMPOSITION-COMMIT-ENTER";
  await installBrowserInputTrace(page, scenarioId);
  await dispatchSyntheticCompositionTrace(page, "안");

  const trace = await readBrowserInputTrace(page);
  expect(trace.map((entry) => entry.type)).toEqual([
    "compositionstart",
    "compositionupdate",
    "compositionend",
  ]);
  expect(trace[1]).toMatchObject({
    data: "안",
    scenarioId,
    type: "compositionupdate",
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

test("keyboard cut and paste round-trips editor-owned structured clipboard data", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(
    browserName !== "chromium",
    "Playwright exposes clipboard read/write permissions only in Chromium.",
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173",
  });
  const primary = await platformPrimaryModifier(page);

  await pressEditorKey(page, `${primary}+Shift+ArrowRight`);
  await expectEditorState(page, {
    selectedRangeCount: 10,
  });

  await pressEditorKey(page, `${primary}+X`);

  await expectEditorState(page, {
    mentionCount: 0,
  });
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("@Ada");

  await pathLocator(page, firstTextPath).click({ position: { x: 1, y: 8 } });
  await expectEditorState(page, {
    domSelectionCollapsed: "true",
    domSelectionFocusPath: firstTextPath,
    selectionPath: firstTextPath,
  });
  await dispatchTransferEvent(page, "paste", {
    "text/plain": await page.evaluate(() => navigator.clipboard.readText()),
  });

  await expectEditorState(page, {
    mentionCount: 1,
  });
});

function pathLocator(page: Page, path: string) {
  return page.locator(`[data-path="${path}"]`).first();
}

async function focusHydratedEditor(page: Page) {
  const title = page.getByRole("textbox", { name: "Title" });
  const editor = page.getByRole("textbox", { name: "Document body" });

  await expect(async () => {
    await title.focus();
    await editor.focus();
    await expect(editor).toBeFocused({ timeout: 250 });
    await expect(editor).toHaveAttribute("data-focused", "true", {
      timeout: 250,
    });
  }).toPass({ timeout: 10_000 });
}

async function expectEditorState(
  page: Page,
  expected: Partial<BrowserEditorState>,
) {
  await expect.poll(() => readEditorState(page)).toMatchObject(expected);
}

async function pressEditorKey(page: Page, key: string) {
  const editor = page.getByRole("textbox", { name: "Document body" });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("data-focused", "true");
  await editor.press(key);
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
      selectedRangeCount: document.querySelectorAll(
        '[data-overlay="selected-range"]',
      ).length,
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

async function installBrowserInputTrace(page: Page, scenarioId: string) {
  await page.evaluate(
    ({ scenarioId, selector }) => {
      const domSelectionOffset = (offset: number | undefined) =>
        offset === undefined ? null : String(offset);
      const domSelectionPath = (node: Node | null) => {
        const element =
          node instanceof Element ? node : (node?.parentElement ?? null);
        return (
          element?.closest("[data-path]")?.getAttribute("data-path") ?? null
        );
      };
      const target = document.querySelector(selector);
      if (!(target instanceof HTMLElement)) {
        throw new Error("Editor root was not found.");
      }
      const traceWindow = window as Window & {
        __editableBrowserInputTrace?: BrowserInputTraceEntry[];
      };
      traceWindow.__editableBrowserInputTrace = [];

      const record = (event: Event) => {
        const selection = window.getSelection();
        const inputEvent =
          event instanceof InputEvent ? event : (null as InputEvent | null);
        const keyboardEvent =
          event instanceof KeyboardEvent
            ? event
            : (null as KeyboardEvent | null);
        const compositionEvent =
          event instanceof CompositionEvent
            ? event
            : (null as CompositionEvent | null);
        const targetRanges =
          inputEvent !== null && typeof inputEvent.getTargetRanges === "function"
            ? inputEvent.getTargetRanges()
            : null;

        traceWindow.__editableBrowserInputTrace?.push({
          data: inputEvent?.data ?? compositionEvent?.data ?? null,
          domSelectionCollapsed:
            selection === null ? null : String(selection.isCollapsed),
          domSelectionFocusOffset: domSelectionOffset(selection?.focusOffset),
          domSelectionFocusPath: domSelectionPath(selection?.focusNode ?? null),
          inputType: inputEvent?.inputType ?? null,
          isComposing:
            inputEvent?.isComposing ?? keyboardEvent?.isComposing ?? null,
          key: keyboardEvent?.key ?? null,
          scenarioId,
          targetRangeCount: targetRanges?.length ?? null,
          targetRangeSupported: targetRanges !== null,
          type: event.type,
        });
      };

      for (const type of [
        "keydown",
        "beforeinput",
        "input",
        "compositionstart",
        "compositionupdate",
        "compositionend",
      ]) {
        target.addEventListener(type, record, { capture: true });
      }
    },
    { scenarioId, selector: '[role="textbox"]' },
  );
}

async function readBrowserInputTrace(
  page: Page,
): Promise<BrowserInputTraceEntry[]> {
  return page.evaluate(() => {
    const traceWindow = window as Window & {
      __editableBrowserInputTrace?: BrowserInputTraceEntry[];
    };

    return traceWindow.__editableBrowserInputTrace ?? [];
  });
}

async function platformPrimaryModifier(page: Page): Promise<"Control" | "Meta"> {
  return page.evaluate(() => {
    const navigatorLike = navigator as Navigator & {
      userAgentData?: { platform?: string };
    };
    const platform =
      navigatorLike.userAgentData?.platform ?? navigatorLike.platform ?? "";
    const userAgent = navigatorLike.userAgent ?? "";
    return /mac|darwin|iphone|ipad|ipod/i.test(`${platform} ${userAgent}`)
      ? "Meta"
      : "Control";
  });
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

async function dispatchSyntheticCompositionTrace(page: Page, data: string) {
  await page.evaluate(
    ({ data }) => {
      const root = document.querySelector('[role="textbox"]');
      if (!(root instanceof HTMLElement)) {
        throw new Error("Editor root was not found.");
      }

      for (const type of [
        "compositionstart",
        "compositionupdate",
        "compositionend",
      ] as const) {
        root.dispatchEvent(
          new CompositionEvent(type, {
            bubbles: true,
            cancelable: true,
            data: type === "compositionstart" ? "" : data,
          }),
        );
      }
    },
    { data },
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
