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
          const editor = document.querySelector(".codex-editor");
          const textNode = editor?.firstChild;
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
      text: `${ATOM}${INITIAL_MODEL}`,
    });
  await expect
    .poll(async () => {
      const value = await getCodexValue(page);
      return Object.values(value.atoms as Record<string, { offset: number }>)
        .map((atom) => atom.offset)
        .sort((left, right) => left - right);
    })
    .toEqual([0, INITIAL_MODEL.indexOf(ATOM) + 1]);
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
      const textNode = editor?.firstChild;
      if (textNode === undefined || textNode === null) {
        throw new Error("Missing codex editor text node.");
      }
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
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
        return JSON.parse(valueBlock?.querySelector("pre")?.textContent ?? "{}")
          .text;
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
