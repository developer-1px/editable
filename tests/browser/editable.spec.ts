import { expect, type Page, test } from "@playwright/test";

const ATOM = "\uFFFC";
const INITIAL_VISIBLE = "Plain text. 한글과 日本語 IME. @Ada";
const INITIAL_MODEL = `Plain text. 한글과 日本語 IME. ${ATOM}`;
const PASTE_VISIBLE = "Paste text. 한글과 日本語 IME. @Ada";
const PASTE_MODEL = `Paste text. 한글과 日本語 IME. ${ATOM}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await expect(editor).toContainText(INITIAL_VISIBLE, { timeout: 15_000 });
});

test.describe("chromium clipboard integration", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Playwright exposes clipboard read/write permissions only in Chromium.",
  );

  test("contenteditable demo keyboard paste replaces the current DOM range", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://127.0.0.1:4173",
    });
    const editor = page.getByRole("textbox", { name: "JSON document text" });
    await selectEditorText(page, 0, 5);
    await page.evaluate(() => navigator.clipboard.writeText("Paste"));

    await page.keyboard.press(await platformPasteShortcut(page));

    await expect(editor).toContainText(PASTE_VISIBLE);
    await expectContentEditableFirstBlockText(page, PASTE_MODEL);
    await expectContentEditableSelectionOffset(page, 5);
  });

  test("contenteditable demo paste toolbar reads browser clipboard", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://127.0.0.1:4173",
    });
    const editor = page.getByRole("textbox", { name: "JSON document text" });
    await selectEditorText(page, 0, 5);
    await page.evaluate(() => navigator.clipboard.writeText("Paste"));

    await page.getByRole("button", { name: "Paste" }).click();

    await expect(editor).toContainText(PASTE_VISIBLE);
    await expectContentEditableFirstBlockText(page, PASTE_MODEL);
    await expectContentEditableSelectionOffset(page, 5);
  });
});

test.describe("cross-root editor fixtures", () => {
  test.skip(
    ({ browserName }) => browserName === "firefox",
    "Issue #90 requires minimum Chrome/Safari traces for cross-root browser fixtures.",
  );

  test("same-origin iframe keeps editor selection, clipboard, and overlay sources scoped to the iframe document", async ({
    page,
  }) => {
    const trace = await runCrossRootFixture(page, "iframe");

    expectCrossRootTrace(trace, "iframe");
    expect(trace.activeElement.documentActiveElement).toBe("iframe-editable");
    expect(trace.clipboard.parentSelectionText).toBe("parent selection");
  });

  test("shadow root records Chromium support and the WebKit native selection gap", async ({
    browserName,
    page,
  }) => {
    const trace = await runCrossRootFixture(page, "shadow");

    if (browserName === "webkit") {
      expectWebKitShadowSelectionGap(trace);
    } else {
      expectCrossRootTrace(trace, "shadow");
    }
    expect(trace.activeElement.documentActiveElement).toBe(
      "cross-root-shadow-host",
    );
    expect(trace.activeElement.shadowActiveElement).toBe("shadow-editable");
  });

  test("portal document keeps clipboard source scoped away from the parent document selection", async ({
    page,
  }) => {
    const trace = await runCrossRootFixture(page, "portal");

    expectCrossRootTrace(trace, "portal");
    expect(trace.activeElement.documentActiveElement).toBe("portal-editable");
    expect(trace.clipboard.parentSelectionText).toBe("parent selection");
  });
});

test.describe("focus and selectionchange event-order traces", () => {
  test("records focus restore, blur, toolbar, drag, and history ordering", async ({
    page,
  }) => {
    const editor = page.getByRole("textbox", { name: "JSON document text" });
    await installFocusSelectionTrace(page);
    await ensureFocusSelectionOutsideInput(page);

    await editor.focus();
    await selectEditorText(page, 0, 0);
    await syncEditorDOMSelection(page);
    await recordFocusSelectionCheckpoint(page, "after-focus-restore");

    await page.keyboard.type("Z");
    await waitForBrowserTraceFrame(page);
    await recordFocusSelectionCheckpoint(page, "after-native-input");

    await page.getByLabel("Outside focus target").click();
    await waitForBrowserTraceFrame(page);
    await recordFocusSelectionCheckpoint(page, "after-outside-focus");

    await editor.focus();
    await selectEditorText(page, 1, 6);
    await syncEditorDOMSelection(page);
    await page.getByRole("button", { name: "Bold" }).click();
    await waitForBrowserTraceFrame(page);
    await recordFocusSelectionCheckpoint(page, "after-toolbar-click");

    await dragInsideEditor(page);
    await recordFocusSelectionCheckpoint(page, "after-pointer-drag");

    await editor.focus();
    await selectEditorText(page, 0, 0);
    await syncEditorDOMSelection(page);
    await page.keyboard.type("Y");
    await waitForBrowserTraceFrame(page);
    await recordFocusSelectionCheckpoint(page, "after-history-insert");
    await page.keyboard.press(await platformUndoShortcut(page));
    await waitForBrowserTraceFrame(page);
    await recordFocusSelectionCheckpoint(page, "after-history-undo");
    await page.keyboard.press(await platformRedoShortcut(page));
    await waitForBrowserTraceFrame(page);
    await recordFocusSelectionCheckpoint(page, "after-history-redo");

    const trace = await readFocusSelectionTrace(page);

    expect(trace.length).toBeGreaterThan(20);
    expectTraceHasEvent(trace, "focusin", "editor");
    expectTraceHasEvent(trace, "selectionchange");
    expectTraceHasEvent(trace, "focusout", "editor");
    expectTraceHasEvent(trace, "click", "outside-focus-input");
    expectTraceHasEvent(trace, "pointerdown", "toolbar:Bold");
    expectTraceHasEvent(trace, "click", "toolbar:Bold");
    expectTraceHasEvent(trace, "pointerup", "editor");
    expectTraceHasEvent(trace, "keydown", "editor");

    const focusRestore = traceCheckpoint(trace, "after-focus-restore");
    expect(focusRestore.activeElement).toBe("editor");
    expect(focusRestore.domSelection.anchorInEditor).toBe(true);
    expect(focusRestore.domSelection.focusInEditor).toBe(true);
    expect(focusRestore.overlay.visualLineCount).toBeGreaterThan(0);
    expect(focusRestore.overlay.cursorLineCount).toBeGreaterThan(0);

    const nativeInput = traceCheckpoint(trace, "after-native-input");
    expect(nativeInput.documentText).toBe(`Z${INITIAL_MODEL}`);
    expect(selectionFocusOffset(nativeInput)).toBe(1);

    const outsideFocus = traceCheckpoint(trace, "after-outside-focus");
    expect(outsideFocus.activeElement).toBe("outside-focus-input");
    expect(selectionFocusOffset(outsideFocus)).toBe(1);

    const toolbarDown = traceEventIndex(trace, "pointerdown", "toolbar:Bold");
    const toolbarClick = traceEventIndex(trace, "click", "toolbar:Bold");
    expect(toolbarDown).toBeGreaterThanOrEqual(0);
    expect(toolbarClick).toBeGreaterThan(toolbarDown);
    const toolbarCheckpoint = traceCheckpoint(trace, "after-toolbar-click");
    expect(toolbarCheckpoint.activeElement).toBe("editor");
    expect(toolbarCheckpoint.overlay.visualLayoutOk).toBe(true);

    const dragPointerDown = traceEventIndex(trace, "pointerdown", "editor");
    const dragPointerUp = traceEventIndex(trace, "pointerup", "editor");
    expect(dragPointerDown).toBeGreaterThanOrEqual(0);
    expect(dragPointerUp).toBeGreaterThan(dragPointerDown);

    const afterUndo = traceCheckpoint(trace, "after-history-undo");
    const afterRedo = traceCheckpoint(trace, "after-history-redo");
    expect(afterUndo.documentText.startsWith("Y")).toBe(false);
    expect(afterRedo.documentText.startsWith("Y")).toBe(true);
    expect(afterRedo.domSelection.focusInEditor).toBe(true);
  });
});

test("contenteditable demo exposes model surfaces and canonical DOM anchors", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "text surfaces" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "canonical dom" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "cursor frame" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "key debug log" })).toBeVisible();

  await expect.poll(async () => {
    const surfaces = await getStateValue(page, "text surfaces");
    return surfaces[0];
  }).toMatchObject(
    {
      id: "block-1",
      type: "paragraph",
      surface: {
        textPath: "/blocks/0/text",
        atomsPath: "/blocks/0/atoms",
        rangesPath: "/blocks/0/ranges",
      },
      atoms: {
        "mention-ada": INITIAL_MODEL.indexOf(ATOM),
      },
    },
  );
  await expect.poll(async () => {
    const blocks = await getStateValue(page, "canonical dom");
    return blocks[0];
  }).toMatchObject(
    {
      id: "block-1",
      type: "paragraph",
      textPath: "/blocks/0/text",
      atoms: [{ id: "mention-ada", type: "mention", text: "@Ada" }],
    },
  );
  await expect.poll(async () => {
    const cursorFrame = await getStateValue(page, "cursor frame");
    return {
      blockCount: cursorFrame.blocks.length,
      lineCount: cursorFrame.lines.length,
      keyDebugLog: await getStateValue(page, "key debug log"),
    };
  }).toMatchObject({
    blockCount: 7,
    keyDebugLog: [],
  });
});

test("contenteditable demo keeps key debug side effects opt-in", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });

  await editor.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => getStateValue(page, "key debug log")).toEqual([]);

  await page.goto("/?debugKeys=1");
  await expect(editor).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await editor.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => {
      const log = await getStateValue(page, "key debug log");
      return log.at(-1);
    })
    .toMatchObject({
      key: "ArrowRight",
    });
});

test("contenteditable demo starts with a rich document fixture", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });

  await expect(editor).toContainText("Rich JSON document");
  await expect(editor).toContainText("Ranges can mix");
  await expect(editor).toContainText("#core");
  await expect(editor).toContainText("[[canonical-html]]");
  await expect(editor).toContainText("engine-spec.md");

  await expect
    .poll(async () => {
      const value = await getContentEditableValue(page);
      return value.blocks.map(
        (block: {
          type: string;
          level?: number;
          listKind?: string;
          language?: string;
        }) =>
          [
            block.type,
            block.level,
            block.listKind,
            block.language,
          ].filter((part) => part !== undefined).join(":"),
      );
    })
    .toEqual([
      "paragraph",
      "heading:1",
      "paragraph",
      "listItem:task",
      "quote",
      "code:ts",
      "paragraph",
    ]);
  await expect
    .poll(() => getStateValue(page, "canonical dom"))
    .toMatchObject([
      { id: "block-1", atoms: [{ type: "mention" }] },
      { id: "block-2", type: "heading", headingLevel: "1" },
      {
        id: "block-3",
        atoms: [{ type: "tag" }, { type: "wikiLink" }],
        marks: [
          { type: "bold", text: "bold" },
          { type: "italic", text: "italic" },
          { type: "underline", text: "underline" },
          { type: "code", text: "code" },
          { type: "highlight", text: "highlight" },
          { type: "link", text: "a link" },
        ],
      },
      { id: "block-4", type: "listItem", atoms: [{ type: "taskMarker" }] },
      { id: "block-5", type: "quote" },
      { id: "block-6", type: "code" },
      { id: "block-7", atoms: [{ type: "attachment" }] },
    ]);
});

test("contenteditable demo keeps IME preedit DOM across keyup before commit", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const editor = document.querySelector(".contenteditable-editor");
    if (editor === null) {
      throw new Error("Missing contenteditable editor.");
    }
    const textSurface = editor.querySelector('[data-editable-text="/blocks/0/text"]');
    if (textSurface === null) {
      throw new Error("Missing first text surface.");
    }
    const firstTextNode = Array.from(textSurface.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (firstTextNode === undefined) {
      throw new Error("Missing first text node.");
    }

    const selection = document.getSelection();
    if (selection === null) {
      throw new Error("Missing DOM selection.");
    }
    const range = document.createRange();
    range.setStart(firstTextNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    (editor as HTMLElement).focus();

    editor.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );

    firstTextNode.textContent = `가${firstTextNode.textContent ?? ""}`;
    const composingRange = document.createRange();
    composingRange.setStart(firstTextNode, 1);
    composingRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(composingRange);
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "가",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
    const afterComposingInput = textSurface.textContent;

    editor.dispatchEvent(
      new KeyboardEvent("keyup", { bubbles: true, key: "r" }),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
    const afterKeyup = textSurface.textContent;

    editor.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "가" }),
    );
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "가",
        inputType: "insertFromComposition",
      }),
    );

    return { afterComposingInput, afterKeyup };
  });

  expect(result.afterComposingInput).toBe(`가${INITIAL_VISIBLE}`);
  expect(result.afterKeyup).toBe(`가${INITIAL_VISIBLE}`);
  await expect
    .poll(async () => {
      const value = await getContentEditableValue(page);
      return value.blocks[0].text;
    })
    .toBe(`가${INITIAL_MODEL}`);
});

test("contenteditable demo hands off IME preedit before vertical command", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .contenteditable-editor {
        max-width: 220px !important;
        width: 220px !important;
      }
    `,
  });

  const result = await page.evaluate(async () => {
    const editor = document.querySelector(".contenteditable-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("Missing contenteditable editor.");
    }
    const textSurface = editor.querySelector('[data-editable-text="/blocks/0/text"]');
    if (textSurface === null) {
      throw new Error("Missing first text surface.");
    }
    const firstTextNode = Array.from(textSurface.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (firstTextNode === undefined) {
      throw new Error("Missing first text node.");
    }

    const selection = document.getSelection();
    if (selection === null) {
      throw new Error("Missing DOM selection.");
    }
    const range = document.createRange();
    range.setStart(firstTextNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();

    editor.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );

    firstTextNode.textContent = `반갑${firstTextNode.textContent ?? ""}`;
    const composingRange = document.createRange();
    composingRange.setStart(firstTextNode, 2);
    composingRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(composingRange);
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "반갑",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );

    const arrow = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    const accepted = editor.dispatchEvent(arrow);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    const currentSurface = editor.querySelector(
      '[data-editable-text="/blocks/0/text"]',
    );
    const currentTextNode =
      currentSurface === null
        ? undefined
        : Array.from(currentSurface.childNodes).find(
            (node) => node.nodeType === Node.TEXT_NODE,
          );
    if (currentTextNode === undefined) {
      throw new Error("Missing current text node.");
    }
    currentTextNode.textContent = `반갑${currentTextNode.textContent ?? ""}`;
    editor.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "반갑" }),
    );
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "반갑",
        inputType: "insertFromComposition",
      }),
    );
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    return {
      accepted,
      defaultPrevented: arrow.defaultPrevented,
      visibleText: editor.textContent,
    };
  });

  expect(result.accepted).toBe(false);
  expect(result.defaultPrevented).toBe(true);
  expect(result.visibleText).toContain(`반갑${INITIAL_VISIBLE}`);
  expect(result.visibleText).not.toContain(`반갑반갑${INITIAL_VISIBLE}`);
  await expectContentEditableFirstBlockText(page, `반갑${INITIAL_MODEL}`);
  await expect
    .poll(async () => {
      const range = await getSelectionRange(page);
      return `${range?.focus?.path ?? ""}:${range?.focus?.offset ?? ""}`;
    })
    .not.toBe("/blocks/0/text:2");
});

test("contenteditable demo derives stale IME caret before Enter", async ({
  page,
}) => {
  const result = await page.evaluate(async () => {
    const editor = document.querySelector(".contenteditable-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("Missing contenteditable editor.");
    }
    const textSurface = editor.querySelector('[data-editable-text="/blocks/0/text"]');
    if (textSurface === null) {
      throw new Error("Missing first text surface.");
    }
    const firstTextNode = Array.from(textSurface.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE,
    );
    if (firstTextNode === undefined) {
      throw new Error("Missing first text node.");
    }

    const initialEditableText = firstTextNode.textContent ?? "";
    const selection = document.getSelection();
    if (selection === null) {
      throw new Error("Missing DOM selection.");
    }
    const range = document.createRange();
    range.setStart(firstTextNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    editor.focus();

    editor.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );

    firstTextNode.textContent = `안${initialEditableText}`;
    const composingRange = document.createRange();
    composingRange.setStart(firstTextNode, 1);
    composingRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(composingRange);
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "안",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );
    editor.dispatchEvent(new Event("select", { bubbles: true }));

    firstTextNode.textContent = `안녕${initialEditableText}`;
    const staleRange = document.createRange();
    staleRange.setStart(firstTextNode, 1);
    staleRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(staleRange);
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "녕",
        inputType: "insertCompositionText",
        isComposing: true,
      }),
    );

    const enter = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Enter",
    });
    const accepted = editor.dispatchEvent(enter);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    return {
      accepted,
      defaultPrevented: enter.defaultPrevented,
      visibleText: editor.textContent,
    };
  });

  expect(result.accepted).toBe(false);
  expect(result.defaultPrevented).toBe(true);
  expect(result.visibleText).toContain(`안녕\n${INITIAL_VISIBLE}`);
  await expectContentEditableFirstBlockText(page, `안녕\n${INITIAL_MODEL}`);
  await expectContentEditableSelectionOffset(page, 3);
});

test("contenteditable demo handles Enter after Korean text without caret drift", async ({
  page,
}) => {
  await page.evaluate(() => {
    const editor = document.querySelector(".contenteditable-editor");
    if (editor === null) {
      throw new Error("Missing contenteditable editor.");
    }
    const textSurface = editor.querySelector('[data-editable-text="/blocks/0/text"]');
    const firstTextNode = textSurface?.firstChild;
    if (firstTextNode === undefined || firstTextNode === null) {
      throw new Error("Missing first text node.");
    }

    firstTextNode.textContent = `안녕하세요.${firstTextNode.textContent ?? ""}`;
    const selection = document.getSelection();
    if (selection === null) {
      throw new Error("Missing DOM selection.");
    }
    const range = document.createRange();
    range.setStart(firstTextNode, 6);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    (editor as HTMLElement).focus();
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        data: "안녕하세요.",
        inputType: "insertText",
      }),
    );
  });
  await expectContentEditableFirstBlockText(page, `안녕하세요.${INITIAL_MODEL}`);
  await expectContentEditableSelectionOffset(page, 6);

  await page.keyboard.press("Enter");

  await expectContentEditableFirstBlockText(
    page,
    `안녕하세요.\n${INITIAL_MODEL}`,
  );
  await expectContentEditableSelectionOffset(page, 7);
});

test("contenteditable demo refreshes visual lines when line breaks are inserted and deleted", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .contenteditable-editor {
        max-width: 1200px !important;
        width: 1200px !important;
      }
    `,
  });

  await selectEditorText(page, 5, 5);
  await page.keyboard.press("Enter");

  await expectContentEditableSelectionOffset(page, 6);
  await expect
    .poll(() => firstBlockVisualLines(page))
    .toEqual([
      { end: 5, kind: "text", start: 0 },
      { end: INITIAL_MODEL.length + 1, kind: "text", start: 6 },
    ]);

  await page.keyboard.press("ArrowUp");
  await expectContentEditableSelectionOffset(page, 0);
  await page.keyboard.press("ArrowDown");
  await expectContentEditableSelectionOffset(page, 6);

  await page.keyboard.press("Backspace");

  await expectContentEditableFirstBlockText(page, INITIAL_MODEL);
  await expectContentEditableSelectionOffset(page, 5);
  await expect
    .poll(() => firstBlockVisualLines(page))
    .toEqual([{ end: INITIAL_MODEL.length, kind: "text", start: 0 }]);
});

test("contenteditable demo moves through a blank line created by Enter", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .contenteditable-editor {
        max-width: 1200px !important;
        width: 1200px !important;
      }
    `,
  });

  await selectEditorText(page, 5, 5);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");

  await expectContentEditableSelectionOffset(page, 7);
  await expect
    .poll(() => firstBlockVisualLines(page))
    .toEqual(
      expect.arrayContaining([
        { end: 5, kind: "text", start: 0 },
        { end: 6, kind: "empty", start: 6 },
      ]),
    );

  await page.keyboard.press("ArrowUp");
  await expectContentEditableSelectionOffset(page, 6);
  await page.keyboard.press("ArrowUp");
  await expectContentEditableSelectionOffset(page, 0);
});

test("contenteditable demo reflects a trailing blank line created at paragraph end", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .contenteditable-editor {
        max-width: 1200px !important;
        width: 1200px !important;
      }
    `,
  });

  await selectEditorText(page, INITIAL_MODEL.length, INITIAL_MODEL.length);
  await page.keyboard.press("Enter");

  await expectContentEditableFirstBlockText(page, `${INITIAL_MODEL}\n`);
  await expectContentEditableSelectionOffset(page, INITIAL_MODEL.length + 1);
  await expect
    .poll(() => firstBlockDOMFocusOffset(page))
    .toBe(INITIAL_MODEL.length + 1);
  await expect
    .poll(() => firstBlockVisualLines(page))
    .toEqual(
      expect.arrayContaining([
        { end: INITIAL_MODEL.length, kind: "text", start: 0 },
        {
          end: INITIAL_MODEL.length + 1,
          kind: "empty",
          start: INITIAL_MODEL.length + 1,
        },
      ]),
    );

  await page.keyboard.press("ArrowUp");
  await expectContentEditableSelectionOffset(page, 0);
  await page.keyboard.press("ArrowDown");
  await expectContentEditableSelectionOffset(page, INITIAL_MODEL.length + 1);
});

test("contenteditable demo maps task marker line selection to the task text surface", async ({
  page,
}) => {
  await page.getByRole("textbox", { name: "JSON document text" }).focus();
  await page.evaluate(() => {
    const taskBlock = document.querySelector(".contenteditable-block-list-item");
    const textSurface = taskBlock?.querySelector("[data-editable-text]");
    if (textSurface === undefined || textSurface === null) {
      throw new Error("Missing task text surface.");
    }
    const range = document.createRange();
    range.setStart(textSurface, 0);
    range.setEnd(textSurface, textSurface.childNodes.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.getByRole("button", { name: "Copy" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(".contenteditable-state-block"),
        );
        const selectionBlock = blocks.find(
          (block) => block.querySelector("h2")?.textContent === "selection",
        );
        const selection = JSON.parse(
          selectionBlock?.querySelector("pre")?.textContent ?? "null",
        );
        return selection?.selectionRanges?.[0];
      }),
    )
    .toMatchObject({
      anchor: { path: "/blocks/3/text", offset: 0 },
      focus: { path: "/blocks/3/text", offset: 58 },
    });
  await expect.poll(() => getStateValue(page, "clipboard")).toMatchObject({
    text: `${ATOM}Keep the DOM bridge tiny and the model commands headless.`,
    atoms: {
      "task-marker-block-4": {
        type: "taskMarker",
        label: "- [ ] ",
        offset: 0,
      },
    },
  });
});

test("contenteditable demo toggles the task marker atom", async ({ page }) => {
  const incompleteMarker = page.getByRole("checkbox", { name: "Incomplete" });

  await expect(incompleteMarker).toHaveAttribute("aria-checked", "false");
  await incompleteMarker.click();

  const completedMarker = page.getByRole("checkbox", { name: "Completed" });
  await expect(completedMarker).toHaveAttribute("aria-checked", "true");
  await expect
    .poll(async () => {
      const value = await getContentEditableValue(page);
      return {
        atomChecked: value.blocks[3]?.atoms["task-marker-block-4"]?.checked,
        blockChecked: value.blocks[3]?.checked,
      };
    })
    .toEqual({ atomChecked: true, blockChecked: true });
});

test("contenteditable demo paste toolbar uses the command-start selection", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 2, 2);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => {
          const textHost = document.querySelector("[data-editable-text]");
          const textNode = textHost?.firstChild;
          if (textNode === undefined || textNode === null) {
            throw new Error("Missing contenteditable editor text node.");
          }
          const offset = textNode.textContent?.length ?? 0;
          const range = document.createRange();
          range.setStart(textNode, offset);
          range.setEnd(textNode, offset);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          return "Paste";
        },
      },
    });
  });

  await page.getByRole("button", { name: "Paste" }).click();

  await expect(editor).toContainText("PlPasteain text. 한글과 日本語 IME. @Ada");
  await expectContentEditableFirstBlockText(
    page,
    `PlPasteain text. 한글과 日本語 IME. ${ATOM}`,
  );
  await expectContentEditableSelectionOffset(page, 7);
});

test("contenteditable demo mention copy paste preserves a live atom", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectMentionAtom(page);

  await page.getByRole("button", { name: "Copy" }).click();
  await selectEditorText(page, 0, 0);
  await page.getByRole("button", { name: "Paste" }).click();

  await expect(editor).toContainText(`@Ada${INITIAL_VISIBLE}`);
  await expectContentEditableFirstBlockText(page, `${ATOM}${INITIAL_MODEL}`);
  await expect
    .poll(async () => {
      const value = await getContentEditableValue(page);
      const firstBlockAtoms = value.blocks[0].atoms as Record<
        string,
        { offset: number }
      >;
      return Object.values(firstBlockAtoms)
        .map((atom: { offset: number }) => atom.offset)
        .sort((left: number, right: number) => left - right);
    })
    .toEqual([0, INITIAL_MODEL.indexOf(ATOM) + 1]);
});

test("contenteditable demo command-arrow line boundaries include a trailing mention", async ({
  page,
}) => {
  await selectEditorText(page, 0, 0);

  await page.keyboard.press("Meta+ArrowRight");

  await expectContentEditableSelectionOffset(page, INITIAL_MODEL.length);

  await page.keyboard.press("Meta+Shift+ArrowLeft");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(".contenteditable-state-block"),
        );
        const selectionBlock = blocks.find(
          (block) => block.querySelector("h2")?.textContent === "selection",
        );
        const selection = JSON.parse(
          selectionBlock?.querySelector("pre")?.textContent ?? "null",
        );
        return selection?.selectionRanges?.[0];
      }),
    )
    .toMatchObject({
      anchor: { offset: INITIAL_MODEL.length },
      focus: { offset: 0 },
  });
});

test("contenteditable demo command-arrow stops at the measured visual line end", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .contenteditable-editor {
        max-width: 220px !important;
        width: 220px !important;
      }
    `,
  });
  await selectEditorText(page, 0, 0);

  await expect
    .poll(async () => (await firstBlockVisualLines(page)).length)
    .toBeGreaterThan(1);
  const measuredLines = await firstBlockVisualLines(page);
  expect(measuredLines[0]?.end).toBeLessThan(INITIAL_MODEL.length);

  await page.keyboard.press("Meta+ArrowRight");

  await expectContentEditableSelectionOffset(
    page,
    measuredLines[0]?.end ?? -1,
  );
});

test("contenteditable demo owns end key as a measured visual line boundary", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .contenteditable-editor {
        max-width: 220px !important;
        width: 220px !important;
      }
    `,
  });
  await selectEditorText(page, 0, 0);

  await expect
    .poll(async () => (await firstBlockVisualLines(page)).length)
    .toBeGreaterThan(1);
  const measuredLines = await firstBlockVisualLines(page);
  const dispatched = await page.evaluate(() => {
    const editor = document.querySelector(".contenteditable-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("Missing editor.");
    }
    editor.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "End",
    });
    const accepted = editor.dispatchEvent(event);
    return {
      accepted,
      defaultPrevented: event.defaultPrevented,
    };
  });

  expect(dispatched).toEqual({ accepted: false, defaultPrevented: true });
  await expectContentEditableSelectionOffset(
    page,
    measuredLines[0]?.end ?? -1,
  );
});

test("contenteditable demo owns arrow-down from measured visual layout", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .contenteditable-editor {
        max-width: 220px !important;
        width: 220px !important;
      }
    `,
  });
  await selectEditorText(page, 0, 0);

  const dispatched = await page.evaluate(() => {
    const editor = document.querySelector(".contenteditable-editor");
    if (!(editor instanceof HTMLElement)) {
      throw new Error("Missing editor.");
    }
    editor.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    const accepted = editor.dispatchEvent(event);
    return {
      accepted,
      defaultPrevented: event.defaultPrevented,
    };
  });

  expect(dispatched).toEqual({ accepted: false, defaultPrevented: true });
  await expect
    .poll(async () => {
      const range = await getSelectionRange(page);
      return `${range?.focus?.path ?? ""}:${range?.focus?.offset ?? ""}`;
    })
    .not.toBe("/blocks/0/text:0");
});

test("contenteditable visual layout keeps blank lines after line breaks", async ({
  page,
}) => {
  const layout = await page.evaluate(async () => {
    const contentEditableModulePath = "/packages/editable/dom.ts";
    const { measureVisualLayout } = await import(contentEditableModulePath);
    const EDITABLE_TEXT_ATTRIBUTE = "data-editable-text";
    const host = document.createElement("div");
    host.style.font = "20px/30px sans-serif";
    host.style.whiteSpace = "pre-wrap";
    host.style.width = "200px";
    const text = document.createElement("span");
    text.setAttribute(EDITABLE_TEXT_ATTRIBUTE, "/text");
    text.textContent = "A\n";
    host.append(text);
    document.body.append(host);
    const measured = measureVisualLayout({ root: host });
    host.remove();
    return measured;
  });

  expect(layout?.lines).toHaveLength(2);
  expect(layout?.lines[1]).toMatchObject({
    path: "/text",
    startOffset: 2,
    endOffset: 2,
  });
  expect(layout?.lines[1]?.carets).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: "/text", offset: 2 }),
    ]),
  );
});

test("contenteditable visual layout models empty lines between text lines", async ({
  page,
}) => {
  const layout = await page.evaluate(async () => {
    const contentEditableModulePath = "/packages/editable/dom.ts";
    const { measureVisualLayout } = await import(contentEditableModulePath);
    const EDITABLE_TEXT_ATTRIBUTE = "data-editable-text";
    const host = document.createElement("div");
    host.style.font = "20px/30px sans-serif";
    host.style.whiteSpace = "pre-wrap";
    host.style.width = "200px";
    const text = document.createElement("span");
    text.setAttribute(EDITABLE_TEXT_ATTRIBUTE, "/text");
    text.textContent = "A\n\nB";
    host.append(text);
    document.body.append(host);
    const measured = measureVisualLayout({ root: host });
    host.remove();
    return measured;
  });

  expect(
    layout?.lines.map((line: { startOffset: number; endOffset: number }) => [
      line.startOffset,
      line.endOffset,
    ]),
  ).toEqual([
    [0, 1],
    [2, 2],
    [3, 4],
  ]);
});

test("contenteditable demo applies heading, bold, and underline ranges", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 0, 5);

  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("button", { name: "Underline" }).click();
  await page.getByRole("button", { name: "Heading 1" }).click();

  const blocks = editor.locator(".contenteditable-block");
  await expect(blocks).toHaveCount(8);
  await expect(blocks.nth(0)).toHaveAttribute("data-block-type", "heading1");
  await expect(blocks.nth(0)).toHaveAttribute(
    "data-editable-block-type",
    "heading",
  );
  await expect(blocks.nth(0)).toHaveAttribute(
    "data-editable-heading-level",
    "1",
  );
  await expect(blocks.nth(0).locator("[data-editable-text]")).toHaveAttribute(
    "data-editable-text",
    "/blocks/0/text",
  );
  await expect(blocks.nth(0)).toHaveText("# **__Plain**__");
  await expect(blocks.nth(1)).toHaveAttribute("data-block-type", "paragraph");
  await expect(blocks.nth(1)).toHaveAttribute(
    "data-editable-block-type",
    "paragraph",
  );
  await expect(blocks.nth(0).locator("strong")).toContainText("Plain");
  await expect(blocks.nth(0).locator("strong")).toHaveAttribute(
    "data-editable-mark",
    "bold",
  );
  await expect(blocks.nth(0).locator("u")).toContainText("Plain");
  await expect(blocks.nth(0).locator("u")).toHaveAttribute(
    "data-editable-mark",
    "underline",
  );
  await expect
    .poll(async () => {
      const value = await getContentEditableValue(page);
      return value.blocks.slice(0, 2).map(
        (block: {
          type: string;
          level?: number;
          text: string;
          ranges: Record<string, { type: string; start: number; end: number }>;
        }) => ({
          type: block.type,
          level: block.level,
          text: block.text,
          ranges: Object.values(block.ranges).sort((left, right) =>
            left.type.localeCompare(right.type),
          ),
        }),
      );
    })
    .toEqual([
      {
        type: "heading",
        level: 1,
        text: "Plain",
        ranges: [
          { type: "bold", start: 0, end: 5 },
          { type: "underline", start: 0, end: 5 },
        ],
      },
      {
        type: "paragraph",
        level: undefined,
        text: INITIAL_MODEL.slice(5),
        ranges: [],
      },
    ]);
});

test("contenteditable demo keeps DOM selection after a first mark wraps plain text", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 5, 0);

  await page.getByRole("button", { name: "Bold" }).click();

  await expect(editor.locator(".contenteditable-block").first().locator("strong")).toContainText(
    "Plain",
  );
  await expect.poll(() => getContentEditableDOMSelection(page)).toEqual({
    anchorInEditor: true,
    focusInEditor: true,
    isCollapsed: false,
    text: "Plain",
  });
});

test("contenteditable demo rich range copy paste preserves marks", async ({ page }) => {
  await selectEditorText(page, 0, 5);
  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("button", { name: "Copy" }).click();
  await selectEditorText(page, INITIAL_MODEL.length, INITIAL_MODEL.length);

  await page.getByRole("button", { name: "Paste" }).click();

  await expectContentEditableFirstBlockText(page, `${INITIAL_MODEL}Plain`);
  await expect
    .poll(async () => {
      const value = await getContentEditableValue(page);
      return Object.values(
        value.blocks[0].ranges as Record<
          string,
          { type: string; start: number; end: number }
        >,
      )
        .map((mark) => ({
          type: mark.type,
          start: mark.start,
          end: mark.end,
        }))
        .sort((left, right) => left.start - right.start);
    })
    .toEqual([
      { type: "bold", start: 0, end: 5 },
      {
        type: "bold",
        start: INITIAL_MODEL.length,
        end: INITIAL_MODEL.length + 5,
      },
    ]);
});

test("contenteditable demo mention cut does not let React remove browser-owned nodes", async ({
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
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectMentionAtom(page);

  await page.keyboard.press(await platformCutShortcut(page));

  await expect(editor).toContainText("Plain text. 한글과 日本語 IME. ");
  expect(pageErrors).not.toContainEqual(
    expect.stringContaining("removeChild"),
  );
});

test("contenteditable demo survives when native editing removes the atom DOM before state render", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      errors.push(message.text());
    }
  });
  await selectMentionAtom(page);
  await page.evaluate(() => {
    document.querySelector("[data-editable-atom]")?.remove();
  });

  await page.getByRole("button", { name: "Cut" }).click();

  await expect
    .poll(() => errors)
    .not.toContainEqual(expect.stringContaining("removeChild"));
});

async function selectEditorText(page: Page, start: number, end: number) {
  await page.getByRole("textbox", { name: "JSON document text" }).focus();
  await page.evaluate(
    ({ start, end }) => {
      const editor = document.querySelector(".contenteditable-editor");
      if (editor === null) {
        throw new Error("Missing contenteditable editor.");
      }
      const locate = (target: number): { node: Node; offset: number } => {
        let remaining = target;
        const visit = (node: Node): { node: Node; offset: number } | null => {
          if (
            node instanceof HTMLElement &&
            node.hasAttribute("data-editable-atom")
          ) {
            const parent = node.parentNode;
            if (parent === null) {
              return null;
            }
            const index = Array.from(parent.childNodes).indexOf(node);
            if (remaining <= 0) {
              return { node: parent, offset: index };
            }
            if (remaining <= 1) {
              return { node: parent, offset: index + 1 };
            }
            remaining -= 1;
            return null;
          }
          if (
            node instanceof HTMLElement &&
            node.contentEditable === "false"
          ) {
            return null;
          }
          if (
            node instanceof HTMLElement &&
            node.classList.contains("editable-syntax-marker")
          ) {
            return null;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            const length = node.textContent?.length ?? 0;
            if (remaining <= length) {
              return { node, offset: remaining };
            }
            remaining -= length;
            return null;
          }
          for (const child of Array.from(node.childNodes)) {
            const found = visit(child);
            if (found !== null) {
              return found;
            }
          }
          return null;
        };
        return (
          visit(editor) ?? {
            node: editor,
            offset: editor.childNodes.length,
          }
        );
      };
      const anchor = locate(start);
      const focus = locate(end);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.collapse(anchor.node, anchor.offset);
      selection?.extend(focus.node, focus.offset);
    },
    { start, end },
  );
}

async function selectMentionAtom(page: Page) {
  await page.getByRole("textbox", { name: "JSON document text" }).focus();
  await page.evaluate(() => {
    const atom = document.querySelector("[data-editable-atom]");
    if (atom === null) {
      throw new Error("Missing mention atom.");
    }
    const range = document.createRange();
    range.setStartBefore(atom);
    range.setEndAfter(atom);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
}

type CrossRootKind = "iframe" | "portal" | "shadow";

type CrossRootTrace = {
  activeElement: {
    documentActiveElement: string | null;
    shadowActiveElement: string | null;
  };
  clipboard: {
    copiedText: string;
    cutText: string;
    ownerDocumentMatched: boolean;
    ownerWindowMatched: boolean;
    parentSelectionText: string;
  };
  composition: {
    afterCommit: string;
    ownerDocumentMatched: boolean;
  };
  geometry: {
    lineCount: number;
    overlayOwnerDocumentMatched: boolean;
    rootOwnerDocumentMatched: boolean;
  };
  rootKind: CrossRootKind;
  selection: {
    afterArrowRight: CrossRootSelectionSnapshot | null;
    afterShiftArrowRight: CrossRootSelectionSnapshot | null;
    sourceDocumentMatched: boolean;
    text: string;
  };
  textAfterDrop: string;
  textAfterPaste: string;
};

type CrossRootSelectionSnapshot = {
  anchor?: unknown;
  focus?: { offset?: number; path?: string } | null;
  primaryIndex?: number;
};

type FocusSelectionTraceEntry = {
  activeElement: string | null;
  canonicalSelection: unknown;
  documentText: string;
  domSelection: {
    anchorInEditor: boolean;
    focusInEditor: boolean;
    isCollapsed: boolean;
    text: string;
  };
  eventType: string;
  label: string;
  overlay: {
    cursorLineCount: number;
    visualLineCount: number;
    visualLayoutOk: boolean;
  };
  target: string | null;
  time: number;
};

async function runCrossRootFixture(
  page: Page,
  rootKind: CrossRootKind,
): Promise<CrossRootTrace> {
  return page.evaluate(async (kind) => {
    const fixturePath = "/tests/browser/fixtures/crossRootFixture.ts";
    const fixture = await import(/* @vite-ignore */ fixturePath);
    if (kind === "iframe") {
      return fixture.runIframeCrossRootTrace();
    }
    if (kind === "shadow") {
      return fixture.runShadowCrossRootTrace();
    }
    return fixture.runPortalDocumentTrace();
  }, rootKind);
}

function expectCrossRootTrace(
  trace: CrossRootTrace,
  rootKind: CrossRootKind,
) {
  expect(trace.rootKind).toBe(rootKind);
  expect(trace.selection.afterArrowRight?.focus).toMatchObject({
    offset: 1,
    path: "/blocks/0/text",
  });
  expect(trace.selection.afterShiftArrowRight?.focus).toMatchObject({
    offset: 2,
    path: "/blocks/0/text",
  });
  expect(trace.selection.sourceDocumentMatched).toBe(true);
  expect(trace.selection.text).toBe("Plain");
  expect(trace.clipboard.copiedText).toBe("Plain");
  expect(trace.clipboard.cutText).toBe("Plain");
  expect(trace.clipboard.ownerDocumentMatched).toBe(true);
  expect(trace.clipboard.ownerWindowMatched).toBe(true);
  expect(trace.textAfterPaste).toBe("Paste  text");
  expect(trace.textAfterDrop).toBe("Paste Drop  text");
  expect(trace.composition.afterCommit).toBe("가Paste Drop  text");
  expect(trace.composition.ownerDocumentMatched).toBe(true);
  expect(trace.geometry.lineCount).toBeGreaterThan(0);
  expect(trace.geometry.overlayOwnerDocumentMatched).toBe(true);
  expect(trace.geometry.rootOwnerDocumentMatched).toBe(true);
}

async function installFocusSelectionTrace(page: Page) {
  await page.evaluate(async () => {
    const fixturePath = "/tests/browser/fixtures/focusSelectionTrace.ts";
    const fixture = await import(/* @vite-ignore */ fixturePath);
    fixture.installFocusSelectionTrace();
  });
}

async function ensureFocusSelectionOutsideInput(page: Page) {
  await page.evaluate(async () => {
    const fixturePath = "/tests/browser/fixtures/focusSelectionTrace.ts";
    const fixture = await import(/* @vite-ignore */ fixturePath);
    fixture.ensureFocusSelectionOutsideInput();
  });
}

async function recordFocusSelectionCheckpoint(page: Page, label: string) {
  await waitForBrowserTraceFrame(page);
  await page.evaluate(async (checkpointLabel) => {
    const fixturePath = "/tests/browser/fixtures/focusSelectionTrace.ts";
    const fixture = await import(/* @vite-ignore */ fixturePath);
    fixture.recordFocusSelectionCheckpoint(checkpointLabel);
  }, label);
}

async function readFocusSelectionTrace(
  page: Page,
): Promise<FocusSelectionTraceEntry[]> {
  return page.evaluate(async () => {
    const fixturePath = "/tests/browser/fixtures/focusSelectionTrace.ts";
    const fixture = await import(/* @vite-ignore */ fixturePath);
    return fixture.readFocusSelectionTrace();
  });
}

async function syncEditorDOMSelection(page: Page) {
  await page.evaluate(() => {
    const editor = document.querySelector(".contenteditable-editor");
    if (editor === null) {
      throw new Error("Missing contenteditable editor.");
    }
    editor.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await waitForBrowserTraceFrame(page);
}

async function dragInsideEditor(page: Page) {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  const box = await editor.boundingBox();
  if (box === null) {
    throw new Error("Missing contenteditable editor box.");
  }
  const y = box.y + Math.min(18, box.height / 2);
  await page.mouse.move(box.x + 12, y);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.min(180, box.width - 12), y, {
    steps: 4,
  });
  await page.mouse.up();
  await waitForBrowserTraceFrame(page);
}

async function waitForBrowserTraceFrame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

function traceCheckpoint(
  trace: ReadonlyArray<FocusSelectionTraceEntry>,
  label: string,
) {
  const entry = trace.find(
    (candidate) => candidate.label === `checkpoint:${label}`,
  );
  if (entry === undefined) {
    throw new Error(`Missing trace checkpoint: ${label}`);
  }
  return entry;
}

function expectTraceHasEvent(
  trace: ReadonlyArray<FocusSelectionTraceEntry>,
  eventType: string,
  target?: string,
) {
  expect(traceEventIndex(trace, eventType, target)).toBeGreaterThanOrEqual(0);
}

function traceEventIndex(
  trace: ReadonlyArray<FocusSelectionTraceEntry>,
  eventType: string,
  target?: string,
) {
  return trace.findIndex(
    (entry) =>
      entry.eventType === eventType &&
      (target === undefined || entry.target === target),
  );
}

function selectionFocusOffset(entry: FocusSelectionTraceEntry): number | null {
  const selection = entry.canonicalSelection;
  if (
    typeof selection !== "object" ||
    selection === null ||
    !("focus" in selection)
  ) {
    return null;
  }
  const focus = selection.focus;
  return typeof focus === "object" &&
    focus !== null &&
    "offset" in focus &&
    typeof focus.offset === "number"
    ? focus.offset
    : null;
}

function expectWebKitShadowSelectionGap(trace: CrossRootTrace) {
  expect(trace.rootKind).toBe("shadow");
  expect(trace.selection.afterArrowRight).toMatchObject({
    anchor: null,
    focus: null,
    primaryIndex: -1,
  });
  expect(trace.selection.afterShiftArrowRight).toMatchObject({
    anchor: null,
    focus: null,
    primaryIndex: -1,
  });
  expect(trace.selection.sourceDocumentMatched).toBe(false);
  expect(trace.selection.text).toBe("");
  expect(trace.clipboard.copiedText).toBe("");
  expect(trace.clipboard.cutText).toBe("");
  expect(trace.textAfterPaste).toBe("Plain text");
  expect(trace.textAfterDrop).toBe("Plain text");
  expect(trace.composition.afterCommit).toBe("Plain text");
  expect(trace.geometry.lineCount).toBeGreaterThan(0);
  expect(trace.geometry.overlayOwnerDocumentMatched).toBe(true);
  expect(trace.geometry.rootOwnerDocumentMatched).toBe(true);
}

async function platformPasteShortcut(page: Page): Promise<string> {
  return (await page.evaluate(() => navigator.platform.includes("Mac")))
    ? "Meta+V"
    : "Control+V";
}

async function platformCutShortcut(page: Page): Promise<string> {
  return (await page.evaluate(() => navigator.platform.includes("Mac")))
    ? "Meta+X"
    : "Control+X";
}

async function platformUndoShortcut(page: Page): Promise<string> {
  return (await page.evaluate(() => navigator.platform.includes("Mac")))
    ? "Meta+Z"
    : "Control+Z";
}

async function platformRedoShortcut(page: Page): Promise<string> {
  return (await page.evaluate(() => navigator.platform.includes("Mac")))
    ? "Meta+Shift+Z"
    : "Control+Y";
}

async function expectContentEditableFirstBlockText(page: Page, text: string) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(".contenteditable-state-block"),
        );
        const valueBlock = blocks.find(
          (block) => block.querySelector("h2")?.textContent === "value",
        );
        const value = JSON.parse(
          valueBlock?.querySelector("pre")?.textContent ?? "{}",
        );
        return value.blocks?.[0]?.text;
      }),
    )
    .toBe(text);
}

async function getContentEditableValue(page: Page) {
  return getStateValue(page, "value");
}

async function getStateValue(page: Page, label: string) {
  return page.evaluate((label) => {
    const blocks = Array.from(
      document.querySelectorAll(".contenteditable-state-block"),
    );
    const stateBlock = blocks.find(
      (block) => block.querySelector("h2")?.textContent === label,
    );
    return JSON.parse(stateBlock?.querySelector("pre")?.textContent ?? "null");
  }, label);
}

async function getSelectionRange(page: Page) {
  const selection = await getStateValue(page, "selection");
  return selection?.selectionRanges?.[0] ?? null;
}

async function firstBlockVisualLines(page: Page) {
  const snapshot = await getStateValue(page, "visual layout");
  return (snapshot?.lines ?? [])
    .filter((line: { path: string }) => line.path === "/blocks/0/text")
    .map(
      (line: {
        end: number;
        kind: string;
        start: number;
      }) => ({
        end: line.end,
        kind: line.kind,
        start: line.start,
      }),
    );
}

async function firstBlockDOMFocusOffset(page: Page) {
  return page.evaluate(() => {
    const textSurface = document.querySelector('[data-editable-text="/blocks/0/text"]');
    const selection = window.getSelection();
    if (
      textSurface === null ||
      selection === null ||
      selection.focusNode === null ||
      !textSurface.contains(selection.focusNode)
    ) {
      return null;
    }

    const atomText = "\uFFFC";
    const nodeLength = (node: Node): number => {
      if (
        node instanceof HTMLElement &&
        node.hasAttribute("data-editable-atom")
      ) {
        return atomText.length;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.length ?? 0;
      }
      return Array.from(node.childNodes).reduce(
        (total, child) => total + nodeLength(child),
        0,
      );
    };
    const childOffset = (element: Element, offset: number) =>
      Array.from(element.childNodes)
        .slice(0, offset)
        .reduce((total, child) => total + nodeLength(child), 0);

    let total = 0;
    let found = false;
    const visit = (node: Node): boolean => {
      if (node === selection.focusNode) {
        found = true;
        total +=
          node instanceof Element
            ? childOffset(node, selection.focusOffset)
            : selection.focusOffset;
        return false;
      }
      if (
        node instanceof HTMLElement &&
        node.hasAttribute("data-editable-atom")
      ) {
        total += atomText.length;
        return true;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        total += node.textContent?.length ?? 0;
        return true;
      }
      for (const child of Array.from(node.childNodes)) {
        if (!visit(child)) {
          return false;
        }
      }
      return true;
    };

    for (const child of Array.from(textSurface.childNodes)) {
      if (!visit(child)) {
        break;
      }
    }
    return found ? total : null;
  });
}

async function getContentEditableDOMSelection(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector(".contenteditable-editor");
    const selection = window.getSelection();
    return {
      anchorInEditor:
        editor !== null &&
        selection?.anchorNode !== null &&
        selection?.anchorNode !== undefined &&
        editor.contains(selection.anchorNode),
      focusInEditor:
        editor !== null &&
        selection?.focusNode !== null &&
        selection?.focusNode !== undefined &&
        editor.contains(selection.focusNode),
      isCollapsed: selection?.isCollapsed ?? true,
      text: selection?.toString() ?? "",
    };
  });
}

async function expectContentEditableSelectionOffset(
  page: Page,
  offset: number,
) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(".contenteditable-state-block"),
        );
        const selectionBlock = blocks.find(
          (block) => block.querySelector("h2")?.textContent === "selection",
        );
        const selection = JSON.parse(
          selectionBlock?.querySelector("pre")?.textContent ?? "null",
        );
        return selection?.focus?.offset;
      }),
    )
    .toBe(offset);
}
