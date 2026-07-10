import {
  expect,
  type JSHandle,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import type {
  EditableDocumentValue,
  EditorSnapshot,
  JsonEditable,
} from "../../packages/editable";

const EDITOR_NAME = "JSON document editor";
const COMPOSING_BLOCK_ID = "korean-ime";
const INITIAL_COMPOSING_TEXT =
  "한글 IME로 입력하는 동안 조합 중인 DOM 노드를 그대로 유지합니다.";

type DemoWindow = Window & {
  __jsonEditableLab?: {
    document: { readonly value: EditableDocumentValue };
    editor: JsonEditable;
  };
};

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const editor = editorRoot(page);
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute(
    "data-json-editable-owner",
    /json-editable-/,
  );
  await expect(blockSurface(page, COMPOSING_BLOCK_ID)).toHaveText(
    INITIAL_COMPOSING_TEXT,
  );
});

test("keyboard.insertText performs ordinary native browser input", async ({
  page,
}) => {
  await placeCaret(page, COMPOSING_BLOCK_ID, 0);

  await page.keyboard.insertText("직접 입력 ");

  const expected = `직접 입력 ${INITIAL_COMPOSING_TEXT}`;
  await expect(blockSurface(page, COMPOSING_BLOCK_ID)).toHaveText(expected);
  await expect
    .poll(() => readBlockText(page, COMPOSING_BLOCK_ID))
    .toBe(expected);
  await expect.poll(() => readSnapshot(page)).toMatchObject({
    composition: null,
    phase: "idle",
  });
});

test("deleting all text keeps an owned empty surface in every browser", async ({
  page,
}) => {
  await selectText(page, COMPOSING_BLOCK_ID, 0, INITIAL_COMPOSING_TEXT.length);

  await page.keyboard.press("Backspace");

  await expect(blockSurface(page, COMPOSING_BLOCK_ID)).toHaveText("");
  await expect.poll(() => readBlockText(page, COMPOSING_BLOCK_ID)).toBe("");
  await expect(lastFault(page)).toHaveText("null");
});

test("browser select-all replacement maps root element boundaries", async ({
  page,
}) => {
  await editorRoot(page).focus();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.insertText("X");

  await expect.poll(() => readDocumentBlocks(page)).toEqual([
    { id: "welcome", text: "X", type: "heading" },
  ]);
  await expect(editorRoot(page).locator("[data-editable-block]")).toHaveCount(1);
  await expect(lastFault(page)).toHaveText("null");
});

test("a block-end element boundary edits that block, not its next sibling", async ({
  page,
}) => {
  await editorRoot(page)
    .locator(`[data-editable-block="${COMPOSING_BLOCK_ID}"]`)
    .evaluate((block) => {
      const selection = document.getSelection();
      if (selection === null) {
        throw new Error("Document selection is unavailable.");
      }
      selection.setBaseAndExtent(block, block.childNodes.length, block, block.childNodes.length);
    });

  await page.keyboard.insertText("X");

  await expect.poll(() => readBlockText(page, COMPOSING_BLOCK_ID)).toBe(
    `${INITIAL_COMPOSING_TEXT}X`,
  );
  await expect.poll(() => readBlockText(page, "japanese-ime")).toBe(
    "日本語 IME の変換中も、編集中の DOM ノードを置き換えません。",
  );
});

// These tests dispatch untrusted CompositionEvent/InputEvent objects in a real
// browser page and manually perform the DOM mutation a browser would perform.
// They validate the coordinator protocol, but they do not create an OS IME
// session and are not evidence that Korean/Japanese IME works on real devices.
test.describe("synthetic composition protocol — not an OS IME reproduction", () => {
  test("synthetic protocol keeps the pinned Text node while another block update is queued", async ({
    page,
  }) => {
    const offset = 3;
    const inserted = "한";
    const pinnedNode = await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );

    const update = await page.evaluate(
      ({ blockId, suffix }) => {
        const lab = (window as DemoWindow).__jsonEditableLab;
        if (lab === undefined) {
          throw new Error("JSON editable lab is not mounted.");
        }
        const block = lab.document.value.blocks.find(
          (candidate) => candidate.id === blockId,
        );
        if (block === undefined) {
          throw new Error(`Unknown block: ${blockId}`);
        }
        const result = lab.editor.dispatch({
          type: "replaceText",
          blockId,
          from: block.text.length,
          to: block.text.length,
          text: suffix,
          origin: "remote",
          label: "disjoint remote update",
        });
        return {
          result,
          snapshot: lab.editor.getSnapshot(),
          text: lab.document.value.blocks.find(
            (candidate) => candidate.id === blockId,
          )?.text,
        };
      },
      { blockId: "render-rule", suffix: " [remote]" },
    );

    expect(update.result).toMatchObject({ ok: true, change: "queued" });
    expect(update.snapshot).toMatchObject({
      composition: {
        blockId: COMPOSING_BLOCK_ID,
        from: offset,
        to: offset + inserted.length,
      },
      phase: "composing",
    });
    expect(update.text).toBe("renderOutside(compositionIsland)");
    await expectPinnedNode(blockSurface(page, COMPOSING_BLOCK_ID), pinnedNode);

    await blockSurface(page, COMPOSING_BLOCK_ID).evaluate((surface, data) => {
      surface.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          composed: true,
          data,
        }),
      );
    }, inserted);
    await expect.poll(() => readBlockText(page, "render-rule")).toBe(
      "renderOutside(compositionIsland) [remote]",
    );
  });

  test("synthetic protocol rejects same-block overlap without claiming OS cancellation", async ({
    page,
  }) => {
    const offset = 4;
    const pinnedNode = await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      "글",
    );

    const outcome = await page.evaluate(
      ({ blockId, from, to }) => {
        const lab = (window as DemoWindow).__jsonEditableLab;
        if (lab === undefined) {
          throw new Error("JSON editable lab is not mounted.");
        }
        const result = lab.editor.dispatch({
          type: "replaceText",
          blockId,
          from,
          to,
          text: "X",
          origin: "remote",
          label: "overlapping remote update",
        });
        return {
          result,
          snapshot: lab.editor.getSnapshot(),
        };
      },
      {
        blockId: COMPOSING_BLOCK_ID,
        from: offset,
        to: offset + 1,
      },
    );

    expect(outcome.result).toMatchObject({
      code: "composition_conflict",
      ok: false,
    });
    expect(outcome.snapshot).toMatchObject({
      composition: {
        blockId: COMPOSING_BLOCK_ID,
        from: offset,
        to: offset + 1,
      },
      phase: "composing",
    });
    await expect
      .poll(() => readBlockText(page, COMPOSING_BLOCK_ID))
      .toBe(insertAt(INITIAL_COMPOSING_TEXT, offset, "글"));
    await expect(lastFault(page)).toContainText("composition_conflict");

    // The coordinator leaves the synthetic composition intact and rejects the
    // command because script cannot cancel an operating-system IME reliably.
    await pinnedNode.dispose();
  });

  test("synthetic compositionend enters settling then canonicalizes to idle", async ({
    page,
  }) => {
    const offset = 5;
    const inserted = "語";
    const pinnedNode = await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );

    const immediate = await blockSurface(
      page,
      COMPOSING_BLOCK_ID,
    ).evaluate((surface, data) => {
      surface.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          composed: true,
          data,
        }),
      );
      const lab = (window as DemoWindow).__jsonEditableLab;
      if (lab === undefined) {
        throw new Error("JSON editable lab is not mounted.");
      }
      return lab.editor.getSnapshot();
    }, inserted);

    expect(immediate).toMatchObject({
      composition: { blockId: COMPOSING_BLOCK_ID },
      phase: "settling",
    });
    await expect.poll(() => readSnapshot(page)).toMatchObject({
      composition: null,
      phase: "idle",
    });

    const expected = insertAt(INITIAL_COMPOSING_TEXT, offset, inserted);
    await expect(blockSurface(page, COMPOSING_BLOCK_ID)).toHaveText(expected);
    await expect
      .poll(() => readBlockText(page, COMPOSING_BLOCK_ID))
      .toBe(expected);
    await expectPinnedNode(blockSurface(page, COMPOSING_BLOCK_ID), pinnedNode);
    expect(await selectionIsInsideEditor(page)).toBe(true);
  });
});

function editorRoot(page: Page): Locator {
  return page.getByRole("textbox", { name: EDITOR_NAME });
}

function blockSurface(page: Page, blockId: string): Locator {
  return editorRoot(page).locator(
    `[data-editable-block="${blockId}"] [data-editable-text]`,
  );
}

function lastFault(page: Page): Locator {
  return page
    .locator(".contenteditable-state-block")
    .filter({ has: page.getByRole("heading", { name: "last fault" }) })
    .locator("pre");
}

async function placeCaret(
  page: Page,
  blockId: string,
  offset: number,
): Promise<void> {
  await blockSurface(page, blockId).evaluate((surface, requestedOffset) => {
    const node = surface.firstChild;
    if (!(node instanceof Text)) {
      throw new Error("Editable surface has no canonical Text node.");
    }
    const root = surface.closest<HTMLElement>("[data-json-editable-owner]");
    if (root === null) {
      throw new Error("Editable root was not found.");
    }
    const caret = Math.min(Math.max(requestedOffset, 0), node.data.length);
    root.focus();
    const selection = document.getSelection();
    if (selection === null) {
      throw new Error("Document selection is unavailable.");
    }
    const range = document.createRange();
    range.setStart(node, caret);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, offset);
}

async function selectText(
  page: Page,
  blockId: string,
  from: number,
  to: number,
): Promise<void> {
  await blockSurface(page, blockId).evaluate(
    (surface, requested) => {
      const node = surface.firstChild;
      if (!(node instanceof Text)) {
        throw new Error("Editable surface has no canonical Text node.");
      }
      const selection = document.getSelection();
      if (selection === null) {
        throw new Error("Document selection is unavailable.");
      }
      const range = document.createRange();
      range.setStart(node, Math.min(requested.from, node.data.length));
      range.setEnd(node, Math.min(requested.to, node.data.length));
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { from, to },
  );
}

async function beginSyntheticComposition(
  page: Page,
  blockId: string,
  offset: number,
  text: string,
): Promise<JSHandle<Node>> {
  await placeCaret(page, blockId, offset);
  const surface = blockSurface(page, blockId);
  const pinnedNode = await surface.evaluateHandle<Node>((element) => {
    const node = element.firstChild;
    if (!(node instanceof Text)) {
      throw new Error("Editable surface has no canonical Text node.");
    }
    return node;
  });

  await surface.evaluate(
    (element, input) => {
      const node = element.firstChild;
      if (!(node instanceof Text)) {
        throw new Error("Editable surface has no canonical Text node.");
      }
      element.dispatchEvent(
        new CompositionEvent("compositionstart", {
          bubbles: true,
          composed: true,
          data: "",
        }),
      );
      element.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          data: input.text,
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );

      node.insertData(input.offset, input.text);
      const selection = document.getSelection();
      if (selection === null) {
        throw new Error("Document selection is unavailable.");
      }
      const range = document.createRange();
      range.setStart(node, input.offset + input.text.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);

      element.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          bubbles: true,
          composed: true,
          data: input.text,
        }),
      );
      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          data: input.text,
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );
    },
    { offset, text },
  );

  await expect.poll(() => readSnapshot(page)).toMatchObject({
    composition: {
      blockId,
      from: offset,
      to: offset + text.length,
    },
    phase: "composing",
  });
  return pinnedNode;
}

async function readSnapshot(page: Page): Promise<EditorSnapshot> {
  return page.evaluate(() => {
    const lab = (window as DemoWindow).__jsonEditableLab;
    if (lab === undefined) {
      throw new Error("JSON editable lab is not mounted.");
    }
    return lab.editor.getSnapshot();
  });
}

async function readBlockText(page: Page, blockId: string): Promise<string> {
  return page.evaluate((requestedBlockId) => {
    const lab = (window as DemoWindow).__jsonEditableLab;
    if (lab === undefined) {
      throw new Error("JSON editable lab is not mounted.");
    }
    const block = lab.document.value.blocks.find(
      (candidate) => candidate.id === requestedBlockId,
    );
    if (block === undefined) {
      throw new Error(`Unknown block: ${requestedBlockId}`);
    }
    return block.text;
  }, blockId);
}

async function readDocumentBlocks(
  page: Page,
): Promise<EditableDocumentValue["blocks"]> {
  return page.evaluate(() => {
    const lab = (window as DemoWindow).__jsonEditableLab;
    if (lab === undefined) {
      throw new Error("JSON editable lab is not mounted.");
    }
    return lab.document.value.blocks;
  });
}

async function expectPinnedNode(
  surface: Locator,
  pinnedNode: JSHandle<Node>,
): Promise<void> {
  expect(
    await surface.evaluate(
      (element, expectedNode) => element.firstChild === expectedNode,
      pinnedNode,
    ),
  ).toBe(true);
  await pinnedNode.dispose();
}

async function selectionIsInsideEditor(page: Page): Promise<boolean> {
  return editorRoot(page).evaluate((root) => {
    const selection = document.getSelection();
    return (
      selection?.anchorNode !== null &&
      selection?.anchorNode !== undefined &&
      selection.focusNode !== null &&
      root.contains(selection.anchorNode) &&
      root.contains(selection.focusNode)
    );
  });
}

function insertAt(value: string, offset: number, inserted: string): string {
  return value.slice(0, offset) + inserted + value.slice(offset);
}
