import { expect, type Page, test } from "@playwright/test";

const ATOM = "\uFFFC";
const INITIAL_VISIBLE = "Plain text. 한글과 日本語 IME. @Ada";
const INITIAL_MODEL = `Plain text. 한글과 日本語 IME. ${ATOM}`;
const PASTE_VISIBLE = "Paste text. 한글과 日本語 IME. @Ada";
const PASTE_MODEL = `Paste text. 한글과 日本語 IME. ${ATOM}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/codex");
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-ready", "true");
  await expect(editor).toHaveText(INITIAL_VISIBLE);
});

test("codex demo keyboard paste replaces the current DOM range", async ({
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
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 0, 5);
  await page.evaluate(() => navigator.clipboard.writeText("Paste"));

  await page.keyboard.press(await platformPasteShortcut(page));

  await expect(editor).toHaveText(PASTE_VISIBLE);
  await expectCodexValue(page, PASTE_MODEL);
  await expectCodexSelectionOffset(page, 5);
});

test("codex demo paste toolbar reads browser clipboard", async ({
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
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 0, 5);
  await page.evaluate(() => navigator.clipboard.writeText("Paste"));

  await page.getByRole("button", { name: "Paste" }).click();

  await expect(editor).toHaveText(PASTE_VISIBLE);
  await expectCodexValue(page, PASTE_MODEL);
  await expectCodexSelectionOffset(page, 5);
});

test("codex demo paste toolbar uses the command-start selection", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 2, 2);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: async () => {
          const textHost = document.querySelector("[data-json-text]");
          const textNode = textHost?.firstChild;
          if (textNode === undefined || textNode === null) {
            throw new Error("Missing codex editor text node.");
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

  await expect(editor).toHaveText("PlPasteain text. 한글과 日本語 IME. @Ada");
  await expectCodexValue(page, `PlPasteain text. 한글과 日本語 IME. ${ATOM}`);
  await expectCodexSelectionOffset(page, 7);
});

test("codex demo mention copy paste preserves a live atom", async ({ page }) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectMentionAtom(page);

  await page.getByRole("button", { name: "Copy" }).click();
  await selectEditorText(page, 0, 0);
  await page.getByRole("button", { name: "Paste" }).click();

  await expect(editor).toHaveText(`@Ada${INITIAL_VISIBLE}`);
  await expect
    .poll(() => getCodexValue(page))
    .toMatchObject({
      blocks: [{ text: `${ATOM}${INITIAL_MODEL}` }],
    });
  await expect
    .poll(async () => {
      const value = await getCodexValue(page);
      return value.blocks
        .flatMap((block: { atoms: Record<string, { offset: number }> }) =>
          Object.values(block.atoms),
        )
        .map((atom: { offset: number }) => atom.offset)
        .sort((left: number, right: number) => left - right);
    })
    .toEqual([0, INITIAL_MODEL.indexOf(ATOM) + 1]);
});

test("codex demo command-arrow line boundaries include a trailing mention", async ({
  page,
}) => {
  await selectEditorText(page, 0, 0);

  await page.keyboard.press("Meta+ArrowRight");

  await expectCodexSelectionOffset(page, INITIAL_MODEL.length);

  await page.keyboard.press("Meta+Shift+ArrowLeft");

  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(".codex-state-block"),
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

test("codex demo applies heading, bold, and underline ranges", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 0, 5);

  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("button", { name: "Underline" }).click();
  await page.getByRole("button", { name: "Heading 1" }).click();

  const blocks = editor.locator(".codex-block");
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0)).toHaveAttribute("data-block-type", "heading1");
  await expect(blocks.nth(0)).toHaveText("Plain");
  await expect(blocks.nth(1)).toHaveAttribute("data-block-type", "paragraph");
  await expect(editor.locator("strong")).toContainText("Plain");
  await expect(editor.locator("u")).toContainText("Plain");
  await expect
    .poll(async () => {
      const value = await getCodexValue(page);
      return value.blocks.map(
        (block: {
          type: string;
          text: string;
          marks: Record<string, { type: string; start: number; end: number }>;
        }) => ({
          type: block.type,
          text: block.text,
          marks: Object.values(block.marks).sort((left, right) =>
            left.type.localeCompare(right.type),
          ),
        }),
      );
    })
    .toEqual([
      {
        type: "heading1",
        text: "Plain",
        marks: [
          { type: "bold", start: 0, end: 5 },
          { type: "underline", start: 0, end: 5 },
        ],
      },
      {
        type: "paragraph",
        text: INITIAL_MODEL.slice(5),
        marks: [],
      },
    ]);
});

test("codex demo keeps DOM selection after a first mark wraps plain text", async ({
  page,
}) => {
  const editor = page.getByRole("textbox", { name: "JSON document text" });
  await selectEditorText(page, 5, 0);

  await page.getByRole("button", { name: "Bold" }).click();

  await expect(editor.locator("strong")).toContainText("Plain");
  await expect.poll(() => getCodexDOMSelection(page)).toEqual({
    anchorInEditor: true,
    focusInEditor: true,
    isCollapsed: false,
    text: "Plain",
  });
});

test("codex demo rich range copy paste preserves marks", async ({ page }) => {
  await selectEditorText(page, 0, 5);
  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("button", { name: "Copy" }).click();
  await selectEditorText(page, INITIAL_MODEL.length, INITIAL_MODEL.length);

  await page.getByRole("button", { name: "Paste" }).click();

  await expect
    .poll(() => getCodexValue(page))
    .toMatchObject({
      blocks: [{ text: `${INITIAL_MODEL}Plain` }],
    });
  await expect
    .poll(async () => {
      const value = await getCodexValue(page);
      return Object.values(
        value.blocks[0].marks as Record<
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

test("codex demo mention cut does not let React remove browser-owned nodes", async ({
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

  await expect(editor).toHaveText("Plain text. 한글과 日本語 IME. ");
  expect(pageErrors).not.toContainEqual(
    expect.stringContaining("removeChild"),
  );
});

test("codex demo survives when native editing removes the atom DOM before state render", async ({
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
    document.querySelector("[data-json-atom]")?.remove();
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
      const editor = document.querySelector(".codex-editor");
      if (editor === null) {
        throw new Error("Missing codex editor.");
      }
      const locate = (target: number): { node: Node; offset: number } => {
        let remaining = target;
        const visit = (node: Node): { node: Node; offset: number } | null => {
          if (
            node instanceof HTMLElement &&
            node.hasAttribute("data-json-atom")
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
    const atom = document.querySelector("[data-json-atom]");
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

async function expectCodexValue(page: Page, text: string) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(".codex-state-block"),
        );
        const valueBlock = blocks.find(
          (block) => block.querySelector("h2")?.textContent === "value",
        );
        const value = JSON.parse(
          valueBlock?.querySelector("pre")?.textContent ?? "{}",
        );
        return value.blocks
          ?.map((block: { text: string }) => block.text)
          .join("");
      }),
    )
    .toBe(text);
}

async function getCodexValue(page: Page) {
  return page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll(".codex-state-block"));
    const valueBlock = blocks.find(
      (block) => block.querySelector("h2")?.textContent === "value",
    );
    return JSON.parse(valueBlock?.querySelector("pre")?.textContent ?? "{}");
  });
}

async function getCodexDOMSelection(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector(".codex-editor");
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

async function expectCodexSelectionOffset(
  page: Page,
  offset: number,
) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const blocks = Array.from(
          document.querySelectorAll(".codex-state-block"),
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
