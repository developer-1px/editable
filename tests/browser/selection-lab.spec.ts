import { expect, type Page, test } from "@playwright/test";

const ATOM = "\uFFFC";
const INITIAL_TEXT = `안녕 rich\n둘째 줄과 ${ATOM} atom`;

test.beforeEach(async ({ page }) => {
  await page.goto("/selection-lab");
  const editor = page.getByTestId("selection-lab-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-ready", "true", {
    timeout: 15_000,
  });
  await editor.focus();
});

test("headless cursor lab moves the virtual cursor without native text input", async ({
  page,
}) => {
  await expectSelectionFocus(page, { path: "/blocks/0/text", offset: 2 });

  await page.keyboard.press("ArrowLeft");
  await expectSelectionFocus(page, { path: "/blocks/0/text", offset: 1 });

  await page.keyboard.press("Shift+ArrowRight");
  await expectSelectionRange(page, {
    collapsed: false,
    direction: "forward",
    startOffset: 1,
    endOffset: 2,
  });

  await page.keyboard.type("abc");
  await expectFirstBlockText(page, INITIAL_TEXT);
});

test("headless cursor lab applies model edits and restores the virtual cursor", async ({
  page,
}) => {
  await page.keyboard.press("Enter");

  await expectFirstBlockText(page, `안녕\n rich\n둘째 줄과 ${ATOM} atom`);
  await expectSelectionFocus(page, { path: "/blocks/0/text", offset: 3 });

  await page.keyboard.press("Backspace");

  await expectFirstBlockText(page, INITIAL_TEXT);
  await expectSelectionFocus(page, { path: "/blocks/0/text", offset: 2 });
});

test("headless cursor lab moves across model lines", async ({ page }) => {
  await page.keyboard.press("ArrowDown");

  await expectSelectionFocus(page, { path: "/blocks/0/text", offset: 10 });
  await expectSelectionLine(page, { lineOrder: 1, column: 2 });
});

test("headless cursor lab starts with a markdown-like rich fixture", async ({
  page,
}) => {
  const model = await getModelState(page);

  expect(model.blocks.map((block) => block.type)).toEqual([
    "paragraph",
    "heading",
    "paragraph",
    "listItem",
    "listItem",
    "listItem",
    "quote",
    "code",
    "extension",
  ]);
  expect(model.blocks[2]?.ranges).toMatchObject({
    bold: { type: "bold" },
    code: { type: "code" },
    highlight: { type: "highlight" },
    italic: { type: "italic" },
    linked: { type: "link" },
    struck: { type: "strike" },
  });
  expect(Object.values(model.blocks[2]?.atoms ?? {}).map((atom) => atom.type)).toEqual([
    "mention",
    "tag",
  ]);
  expect(model.blocks[3]).toMatchObject({
    checked: true,
    listKind: "task",
    type: "listItem",
  });
  expect(model.blocks[8]).toMatchObject({
    kind: "callout",
    type: "extension",
  });
});

test("headless cursor lab maps command-right to the current line end", async ({
  page,
}) => {
  await page.keyboard.press("Meta+ArrowRight");

  await expectSelectionFocus(page, { path: "/blocks/0/text", offset: 7 });
});

test("headless cursor lab exposes key debug logs", async ({ page }) => {
  await page.keyboard.press("Meta+ArrowRight");

  await expect
    .poll(async () => {
      const log = await getKeyDebugLog(page);
      return log.at(-1);
    })
    .toMatchObject({
      command: { direction: "forward", unit: "lineBoundary" },
      event: { defaultPrevented: true, key: "ArrowRight", metaKey: true },
      phase: "after-command",
      result: {
        selection: {
          focus: { offset: 7, path: "/blocks/0/text" },
        },
      },
    });
});

async function expectSelectionFocus(
  page: Page,
  expected: { path: string; offset: number },
) {
  await expect
    .poll(async () => {
      const selection = await getSelectionState(page);
      return {
        path: selection.focus.path,
        offset: selection.focus.offset,
      };
    })
    .toEqual(expected);
}

async function expectSelectionRange(
  page: Page,
  expected: {
    collapsed: boolean;
    direction: string;
    startOffset: number;
    endOffset: number;
  },
) {
  await expect
    .poll(async () => {
      const selection = await getSelectionState(page);
      return {
        collapsed: selection.range.collapsed,
        direction: selection.range.direction,
        startOffset: selection.range.start.offset,
        endOffset: selection.range.end.offset,
      };
    })
    .toEqual(expected);
}

async function expectSelectionLine(
  page: Page,
  expected: { lineOrder: number; column: number },
) {
  await expect
    .poll(async () => {
      const selection = await getSelectionState(page);
      return selection.line;
    })
    .toEqual(expected);
}

async function expectFirstBlockText(page: Page, expected: string) {
  await expect
    .poll(async () => {
      const model = await getModelState(page);
      return model.blocks[0].text;
    })
    .toBe(expected);
}

async function getSelectionState(page: Page): Promise<{
  focus: { path: string; offset: number };
  line: { lineOrder: number; column: number } | null;
  range: {
    collapsed: boolean;
    direction: string;
    start: { offset: number };
    end: { offset: number };
  };
}> {
  return JSON.parse(
    (await page.getByTestId("selection-lab-selection").textContent()) ?? "{}",
  );
}

async function getModelState(page: Page): Promise<{
  blocks: Array<{
    atoms?: Record<string, { type: string }>;
    checked?: boolean;
    kind?: string;
    listKind?: string;
    ranges?: Record<string, { type: string }>;
    text: string;
    type: string;
  }>;
}> {
  return JSON.parse(
    (await page.getByTestId("selection-lab-model").textContent()) ?? "{}",
  );
}

async function getKeyDebugLog(page: Page): Promise<Array<unknown>> {
  return JSON.parse(
    (await page.getByTestId("selection-lab-key-debug-log").textContent()) ??
      "[]",
  );
}
