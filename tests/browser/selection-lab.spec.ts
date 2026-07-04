import { expect, type Page, test } from "@playwright/test";

declare global {
  interface Window {
    __selectionLabRectProbe: {
      calls(): number;
      reset(): void;
    };
  }
}

const ATOM = "\uFFFC";
const INITIAL_TEXT = `안녕 rich\n둘째 줄과 ${ATOM} atom`;

test.describe.configure({ timeout: 60_000 });

test.beforeEach(async ({ page }) => {
  await openSelectionLab(page);
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

test("headless cursor lab maps command-right to soft-wrapped inline rich line end", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .selection-lab-editor {
        max-width: 360px !important;
        width: 360px !important;
      }
    `,
  });
  await expect
    .poll(async () => {
      const frame = await getFrameState(page);
      return frame.lines.filter((line) => line.blockId === "paragraph-rich")
        .length;
    })
    .toBeGreaterThan(1);
  await moveSelectionFocusToPath(page, "/blocks/2/text");

  const initialOffset = (await getSelectionState(page)).focus.offset;

  const paragraphLength = (await getModelState(page)).blocks[2]?.text.length ?? 0;
  const frame = await getFrameState(page);
  const expectedLineEnd = frame.lines.find(
    (line) =>
      line.blockId === "paragraph-rich" &&
      line.startOffset <= initialOffset &&
      initialOffset <= line.endOffset,
  )?.endOffset;

  expect(expectedLineEnd).toBeGreaterThan(initialOffset);
  expect(expectedLineEnd).toBeLessThan(paragraphLength);

  await page.keyboard.press("Meta+ArrowRight");

  await expect
    .poll(async () => {
      const selection = await getSelectionState(page);
      return selection.focus;
    })
    .toMatchObject({
      blockId: "paragraph-rich",
      path: "/blocks/2/text",
    });
  await expect
    .poll(async () => {
      const selection = await getSelectionState(page);
      return selection.focus.offset;
    })
    .toBe(expectedLineEnd);
});

test("headless cursor lab keeps soft-wrap measurement stable when the caret moves", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .selection-lab-editor {
        max-width: 360px !important;
        width: 360px !important;
      }
    `,
  });
  await expect
    .poll(async () => (await getParagraphRichLineBoundaries(page)).length)
    .toBeGreaterThan(1);
  await moveSelectionFocusToPath(page, "/blocks/2/text");

  await page.keyboard.press("Meta+ArrowRight");
  const before = await getParagraphRichLineBoundaries(page);
  const lineEndOffset = (await getSelectionState(page)).focus.offset;

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => getParagraphRichLineBoundaries(page))
    .toEqual(before);

  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await getSelectionState(page)).focus.offset)
    .toBeGreaterThan(lineEndOffset);
  await expect
    .poll(async () => getParagraphRichLineBoundaries(page))
    .toEqual(before);
});

test("headless cursor lab aligns the overlay caret to the current text line", async ({
  page,
}) => {
  await page.keyboard.press("Meta+ArrowLeft");

  const caretBox = await page.locator(".selection-lab-caret").boundingBox();
  const segmentBox = await page
    .locator(
      "[data-rich-segment='true'][data-rich-path='/blocks/0/text'][data-rich-start='0']",
    )
    .first()
    .boundingBox();

  expect(caretBox).not.toBeNull();
  expect(segmentBox).not.toBeNull();
  if (caretBox === null || segmentBox === null) return;

  expect(Math.abs(caretBox.x - segmentBox.x)).toBeLessThan(2);
  expect(caretBox.y).toBeGreaterThanOrEqual(segmentBox.y - 2);
  expect(caretBox.y + caretBox.height).toBeLessThanOrEqual(
    segmentBox.y + segmentBox.height + 2,
  );
});

test("headless cursor lab uses measured visual x for vertical movement", async ({
  page,
}) => {
  await page.addStyleTag({
    content: `
      .selection-lab-editor {
        max-width: 360px !important;
        width: 360px !important;
      }
    `,
  });
  await expect
    .poll(async () => findFirstMeasuredVerticalMoveCandidate(page))
    .not.toBeNull();

  const candidate = await findFirstMeasuredVerticalMoveCandidate(page);
  expect(candidate).not.toBeNull();
  if (candidate === null) return;

  await moveSelectionFocusToPoint(
    page,
    "/blocks/2/text",
    candidate.sourceOffset,
  );
  await page.keyboard.press("ArrowDown");

  await expect
    .poll(async () => (await getSelectionState(page)).focus.offset)
    .toBe(candidate.expectedOffset);
});

test("headless cursor lab does not remeasure every rich segment on caret-only movement", async ({
  page,
}) => {
  await page.evaluate(() => {
    const original = Element.prototype.getClientRects;
    let richSegmentCalls = 0;
    Element.prototype.getClientRects = function patchedGetClientRects() {
      if (
        this instanceof HTMLElement &&
        this.matches("[data-rich-segment='true']")
      ) {
        richSegmentCalls += 1;
      }
      return original.call(this);
    };
    Object.assign(window, {
      __selectionLabRectProbe: {
        calls: () => richSegmentCalls,
        reset: () => {
          richSegmentCalls = 0;
        },
      },
    });
  });
  await page.evaluate(() => {
    window.__selectionLabRectProbe.reset();
  });

  await page.keyboard.press("ArrowRight");

  await expect
    .poll(async () => (await getSelectionState(page)).focus.offset)
    .toBe(3);
  const richSegmentRectCalls = await page.evaluate(() =>
    window.__selectionLabRectProbe.calls(),
  );
  expect(richSegmentRectCalls).toBeLessThan(8);
});

test("headless cursor lab keeps key debug side effects opt-in", async ({
  page,
}) => {
  await page.keyboard.press("ArrowRight");

  await expect
    .poll(async () => (await getSelectionState(page)).focus.offset)
    .toBe(3);
  await expect.poll(async () => getKeyDebugLog(page)).toEqual([]);
});

test("headless cursor lab exposes key debug logs", async ({ page }) => {
  await openSelectionLab(page, "?debugKeys=1");

  await page.keyboard.press("Meta+ArrowRight");

  await expect
    .poll(async () => {
      const log = await getKeyDebugLog(page);
      return log.at(-1);
    })
    .toMatchObject({
      effect: "selection",
      event: { defaultPrevented: true, key: "ArrowRight", metaKey: true },
      intent: {
        alter: "move",
        direction: "forward",
        granularity: "lineboundary",
        type: "modifySelection",
      },
      result: {
        selection: {
          focus: { offset: 7, path: "/blocks/0/text" },
        },
      },
    });
});

async function openSelectionLab(page: Page, search = "") {
  const params = new URLSearchParams(search.replace(/^\?/, ""));
  params.set("surface", "selection-lab");
  await page.goto(`/?${params.toString()}`);
  const editor = page.getByTestId("selection-lab-editor");
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });
  await editor.focus();
}

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

async function moveSelectionFocusToPath(page: Page, path: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const selection = await getSelectionState(page);
    if (selection.focus.path === path) {
      return;
    }
    await page.keyboard.press("ArrowDown");
  }
  throw new Error(`Selection did not reach ${path}.`);
}

async function moveSelectionFocusToPoint(
  page: Page,
  path: string,
  offset: number,
) {
  await moveSelectionFocusToPath(page, path);
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const selection = await getSelectionState(page);
    if (selection.focus.path === path && selection.focus.offset === offset) {
      return;
    }
    await page.keyboard.press(
      selection.focus.offset < offset ? "ArrowRight" : "ArrowLeft",
    );
  }
  throw new Error(`Selection did not reach ${path}:${offset}.`);
}

async function getSelectionState(page: Page): Promise<{
  focus: { blockId: string; path: string; offset: number };
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

async function getFrameState(page: Page): Promise<{
  lines: Array<{
    blockId: string;
    caretXs?: number[];
    endOffset: number;
    offsets?: number[];
    startOffset: number;
  }>;
}> {
  return JSON.parse(
    (await page.getByTestId("selection-lab-frame").textContent()) ?? "{}",
  );
}

async function findFirstMeasuredVerticalMoveCandidate(page: Page): Promise<{
  expectedOffset: number;
  sourceOffset: number;
} | null> {
  const frame = await getFrameState(page);
  const lines = frame.lines.filter(
    (
      line,
    ): line is {
      blockId: string;
      caretXs: number[];
      endOffset: number;
      offsets: number[];
      startOffset: number;
    } =>
      line.blockId === "paragraph-rich" &&
      Array.isArray(line.offsets) &&
      Array.isArray(line.caretXs) &&
      line.offsets.length === line.caretXs.length,
  );
  const source = lines[0];
  const target = lines[1];
  if (source === undefined || target === undefined) {
    return null;
  }
  for (let caretIndex = 1; caretIndex < source.offsets.length - 1; caretIndex += 1) {
    const sourceOffset = source.offsets[caretIndex];
    const sourceX = source.caretXs[caretIndex];
    if (sourceOffset === undefined || sourceX === undefined) {
      continue;
    }
    const expectedIndex = closestCaretXIndex(target.caretXs, sourceX);
    const columnIndex = Math.min(caretIndex, target.offsets.length - 1);
    const expectedOffset = target.offsets[expectedIndex];
    const columnOffset = target.offsets[columnIndex];
    if (
      expectedOffset !== undefined &&
      columnOffset !== undefined &&
      expectedOffset !== columnOffset
    ) {
      return { expectedOffset, sourceOffset };
    }
  }
  return null;
}

function closestCaretXIndex(xs: number[], goalX: number): number {
  return xs.reduce((bestIndex, x, index) => {
    const bestX = xs[bestIndex] ?? x;
    const bestDistance = Math.abs(bestX - goalX);
    const candidateDistance = Math.abs(x - goalX);
    if (candidateDistance < bestDistance) {
      return index;
    }
    if (candidateDistance > bestDistance) {
      return bestIndex;
    }
    return x < bestX ? index : bestIndex;
  }, 0);
}

async function getParagraphRichLineBoundaries(page: Page) {
  const frame = await getFrameState(page);
  return frame.lines
    .filter((line) => line.blockId === "paragraph-rich")
    .map((line) => ({
      startOffset: line.startOffset,
      endOffset: line.endOffset,
    }));
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
