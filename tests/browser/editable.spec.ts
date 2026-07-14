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
const REMOTE_BLOCK_ID = "japanese-ime";
const INITIAL_COMPOSING_TEXT =
  "한글 IME로 입력하는 동안 조합 중인 DOM 노드를 그대로 유지합니다.";
const INITIAL_REMOTE_TEXT =
  "日本語 IME の変換中も、編集中の DOM ノードを置き換えません。";

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
    INITIAL_REMOTE_TEXT,
  );
});

test("ordinary browser Enter splits the selected block through the model", async ({
  page,
}) => {
  const offset = 4;
  const initialCount = (await readDocumentBlocks(page)).length;
  await placeCaret(page, COMPOSING_BLOCK_ID, offset);

  await page.keyboard.press("Enter");

  await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
  const blocks = await readDocumentBlocks(page);
  const composingIndex = blocks.findIndex(
    (block) => block.id === COMPOSING_BLOCK_ID,
  );
  expect(blocks[composingIndex]?.text).toBe(
    INITIAL_COMPOSING_TEXT.slice(0, offset),
  );
  expect(blocks[composingIndex + 1]?.text).toBe(
    INITIAL_COMPOSING_TEXT.slice(offset),
  );
  await expect(lastFault(page)).toHaveText("null");
});

test("the delayed-edit tracer rebases across its local leading insertion", async ({
  page,
}) => {
  const initialCount = (await readDocumentBlocks(page)).length;

  await page.getByRole("button", { name: "지연 편집 추적" }).click();

  await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
  const blocks = await readDocumentBlocks(page);
  expect(blocks[0]).toEqual({
    id: "causal-local-1",
    type: "paragraph",
    text: "로컬 선행 변경 1",
  });
  expect(blocks.find((block) => block.id === "render-rule")?.text).toBe(
    "renderOutside(compositionIsland) · 지연 변경 1",
  );
  await expect(blockSurface(page, "render-rule")).toHaveText(
    "renderOutside(compositionIsland) · 지연 변경 1",
  );
  await expect(lastFault(page)).toHaveText("null");
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

  test("causal retry applies after composition settles while the editor retains focus", async ({
    page,
  }) => {
    const offset = 3;
    const inserted = "한";
    const targetText = "renderOutside(compositionIsland) · 지연 변경 1";
    const targetIndex = (await readDocumentBlocks(page)).findIndex(
      (block) => block.id === "render-rule",
    );
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    const pinnedNode = await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );

    await page.getByRole("button", { name: "지연 편집 추적" }).click();

    expect(await readBlockText(page, "render-rule")).toBe(
      "renderOutside(compositionIsland)",
    );
    expect(
      await page.evaluate(() => {
        const lab = (window as DemoWindow).__jsonEditableLab;
        if (lab === undefined) {
          throw new Error("JSON editable lab is not mounted.");
        }
        return lab.causalInbox.current();
      }),
    ).toMatchObject({
      queued: [{ id: "causal-delayed-1", missing: [] }],
    });
    await expect.poll(() => readSnapshot(page)).toMatchObject({
      composition: { blockId: COMPOSING_BLOCK_ID },
      phase: "composing",
    });

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
      targetText,
    );
    await expect.poll(() => readSnapshot(page)).toMatchObject({
      composition: null,
      phase: "idle",
      selection: {
        focus: {
          path: `/blocks/${targetIndex}/text`,
          offset: targetText.length,
        },
      },
    });
    await expect(blockSurface(page, COMPOSING_BLOCK_ID)).toHaveText(
      insertAt(INITIAL_COMPOSING_TEXT, offset, inserted),
    );
    await expectPinnedNode(blockSurface(page, COMPOSING_BLOCK_ID), pinnedNode);
    await expect(editorRoot(page)).toBeFocused();
    expect(
      await blockSurface(page, "render-rule").evaluate((surface) => {
        const selection = document.getSelection();
        return {
          focusNodeIsTarget: selection?.focusNode === surface.firstChild,
          focusOffset: selection?.focusOffset,
        };
      }),
    ).toEqual({
      focusNodeIsTarget: true,
      focusOffset: targetText.length,
    });
    await expect(lastFault(page)).toHaveText("null");
  });

  test("causal retry applies after settle without reclaiming external focus", async ({
    page,
  }) => {
    const offset = 3;
    const inserted = "한";
    const targetText = "renderOutside(compositionIsland) · 지연 변경 1";
    const targetIndex = (await readDocumentBlocks(page)).findIndex(
      (block) => block.id === "render-rule",
    );
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );

    await page.getByRole("button", { name: "지연 편집 추적" }).click();
    expect(await readBlockText(page, "render-rule")).toBe(
      "renderOutside(compositionIsland)",
    );

    const immediate = await blockSurface(page, COMPOSING_BLOCK_ID).evaluate(
      (surface, data) => {
        const outside = document.createElement("button");
        outside.dataset.testid = "outside-focus-target";
        outside.textContent = "Outside focus target";
        document.body.append(outside);
        surface.dispatchEvent(
          new CompositionEvent("compositionend", {
            bubbles: true,
            composed: true,
            data,
          }),
        );
        outside.focus();
        const lab = (window as DemoWindow).__jsonEditableLab;
        if (lab === undefined) {
          throw new Error("JSON editable lab is not mounted.");
        }
        return {
          activeElementIsOutside: document.activeElement === outside,
          snapshot: lab.editor.getSnapshot(),
        };
      },
      inserted,
    );

    expect(immediate).toMatchObject({
      activeElementIsOutside: true,
      snapshot: {
        composition: { blockId: COMPOSING_BLOCK_ID },
        phase: "settling",
      },
    });
    await expect.poll(() => readBlockText(page, "render-rule")).toBe(
      targetText,
    );
    await expect.poll(() => readSnapshot(page)).toMatchObject({
      composition: null,
      phase: "idle",
      selection: {
        focus: {
          path: `/blocks/${targetIndex}/text`,
          offset: targetText.length,
        },
      },
    });
    await expect(page.getByTestId("outside-focus-target")).toBeFocused();
    await expect(blockSurface(page, COMPOSING_BLOCK_ID)).toHaveText(
      insertAt(INITIAL_COMPOSING_TEXT, offset, inserted),
    );
    await expect(lastFault(page)).toHaveText("null");
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

  test("synthetic insertParagraph is replayed once after composition settles", async ({
    page,
  }) => {
    const offset = 3;
    const inserted = "한";
    const initialCount = (await readDocumentBlocks(page)).length;
    await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );

    const accepted = await blockSurface(page, COMPOSING_BLOCK_ID).evaluate(
      (surface, data) => {
        const beforeInput = new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: true,
          composed: true,
          inputType: "insertParagraph",
          isComposing: true,
        });
        const result = surface.dispatchEvent(beforeInput);
        surface.dispatchEvent(
          new CompositionEvent("compositionend", {
            bubbles: true,
            composed: true,
            data,
          }),
        );
        return result;
      },
      inserted,
    );

    const composed = insertAt(INITIAL_COMPOSING_TEXT, offset, inserted);
    await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
    const blocks = await readDocumentBlocks(page);
    const composingIndex = blocks.findIndex(
      (block) => block.id === COMPOSING_BLOCK_ID,
    );
    expect(accepted).toBe(false);
    expect(blocks[composingIndex]?.text).toBe(composed.slice(0, offset + 1));
    expect(blocks[composingIndex + 1]?.text).toBe(composed.slice(offset + 1));
    await expect(lastFault(page)).toHaveText("null");

    await page.evaluate(() => {
      const lab = (window as DemoWindow).__jsonEditableLab;
      if (lab === undefined) {
        throw new Error("JSON editable lab is not mounted.");
      }
      lab.editor.dispatch({ type: "undo" });
    });
    await expect.poll(() => readBlockText(page, COMPOSING_BLOCK_ID)).toBe(composed);
    await page.evaluate(() => {
      const lab = (window as DemoWindow).__jsonEditableLab;
      if (lab === undefined) {
        throw new Error("JSON editable lab is not mounted.");
      }
      lab.editor.dispatch({ type: "undo" });
    });
    await expect.poll(() => readBlockText(page, COMPOSING_BLOCK_ID)).toBe(
      INITIAL_COMPOSING_TEXT,
    );
  });

  test("synthetic paragraph replay keeps a queued remote update on its original block", async ({
    page,
  }) => {
    const offset = 3;
    const inserted = "한";
    const initialCount = (await readDocumentBlocks(page)).length;
    await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );
    const queued = await page.evaluate((blockId) => {
      const lab = (window as DemoWindow).__jsonEditableLab;
      if (lab === undefined) {
        throw new Error("JSON editable lab is not mounted.");
      }
      return lab.editor.dispatch({
        type: "replaceText",
        blockId,
        from: 0,
        to: 0,
        text: "remote ",
        origin: "remote",
      });
    }, REMOTE_BLOCK_ID);
    expect(queued).toMatchObject({ ok: true, change: "queued" });

    await blockSurface(page, COMPOSING_BLOCK_ID).evaluate(
      (surface, data) => {
        surface.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            composed: true,
            inputType: "insertParagraph",
            isComposing: true,
          }),
        );
        surface.dispatchEvent(
          new CompositionEvent("compositionend", {
            bubbles: true,
            composed: true,
            data,
          }),
        );
      },
      inserted,
    );

    const composed = insertAt(INITIAL_COMPOSING_TEXT, offset, inserted);
    await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
    const blocks = await readDocumentBlocks(page);
    const composingIndex = blocks.findIndex(
      (block) => block.id === COMPOSING_BLOCK_ID,
    );
    expect(blocks[composingIndex]?.text).toBe(composed.slice(0, offset + 1));
    expect(blocks[composingIndex + 1]?.text).toBe(composed.slice(offset + 1));
    expect(blocks.find((block) => block.id === REMOTE_BLOCK_ID)?.text).toBe(
      `remote ${INITIAL_REMOTE_TEXT}`,
    );
    await expect(lastFault(page)).toHaveText("null");
  });

  test("synthetic composition newline becomes one canonical paragraph split", async ({
    page,
  }) => {
    const offset = 3;
    const inserted = "한";
    const initialCount = (await readDocumentBlocks(page)).length;
    await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );

    await blockSurface(page, COMPOSING_BLOCK_ID).evaluate(
      (surface, input) => {
        const node = surface.firstChild;
        if (!(node instanceof Text)) {
          throw new Error("Editable surface has no canonical Text node.");
        }
        const splitOffset = input.offset + input.text.length;
        surface.dispatchEvent(
          new CompositionEvent("compositionend", {
            bubbles: true,
            composed: true,
            data: "\n",
          }),
        );
        node.insertData(splitOffset, "\n");
        const selection = document.getSelection();
        if (selection === null) {
          throw new Error("Document selection is unavailable.");
        }
        selection.setBaseAndExtent(
          node,
          splitOffset + 1,
          node,
          splitOffset + 1,
        );
        surface.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            data: "\n",
            inputType: "insertFromComposition",
            isComposing: false,
          }),
        );
      },
      { offset, text: inserted },
    );

    const composed = insertAt(INITIAL_COMPOSING_TEXT, offset, inserted);
    await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
    const blocks = await readDocumentBlocks(page);
    const composingIndex = blocks.findIndex(
      (block) => block.id === COMPOSING_BLOCK_ID,
    );
    expect(blocks[composingIndex]?.text).toBe(composed.slice(0, offset + 1));
    expect(blocks[composingIndex + 1]?.text).toBe(composed.slice(offset + 1));
    expect(blocks.some((block) => block.text.includes("\n"))).toBe(false);
    await expect(lastFault(page)).toHaveText("null");
  });

  test("synthetic noncancelable native split is validated and canonicalized once", async ({
    page,
  }) => {
    const offset = 3;
    const preedit = "ㄱ";
    const inserted = "글";
    const initialCount = (await readDocumentBlocks(page)).length;
    await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      preedit,
    );

    await blockSurface(page, COMPOSING_BLOCK_ID).evaluate(
      (surface, input) => {
        const node = surface.firstChild;
        const block = surface.closest<HTMLElement>("[data-editable-block]");
        if (!(node instanceof Text) || block === null) {
          throw new Error("Expected an owned composition surface.");
        }
        surface.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: false,
            composed: true,
            inputType: "insertParagraph",
            isComposing: true,
          }),
        );
        node.replaceData(
          input.offset,
          input.preedit.length,
          `${input.finalText}\n`,
        );
        const splitOffset = input.offset + input.finalText.length + 1;
        const right = node.splitText(splitOffset);
        const nativeBlock = document.createElement("div");
        nativeBlock.append(right);
        block.after(nativeBlock);
        const selection = document.getSelection();
        if (selection === null) {
          throw new Error("Document selection is unavailable.");
        }
        selection.setBaseAndExtent(right, 0, right, 0);
        nativeBlock.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            inputType: "insertParagraph",
            isComposing: false,
          }),
        );
        nativeBlock.dispatchEvent(
          new CompositionEvent("compositionend", {
            bubbles: true,
            composed: true,
            data: `${input.finalText}\n`,
          }),
        );
      },
      { offset, preedit, finalText: inserted },
    );

    const composed = insertAt(INITIAL_COMPOSING_TEXT, offset, inserted);
    await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
    const blocks = await readDocumentBlocks(page);
    const composingIndex = blocks.findIndex(
      (block) => block.id === COMPOSING_BLOCK_ID,
    );
    expect(blocks[composingIndex]?.text).toBe(composed.slice(0, 4));
    expect(blocks[composingIndex + 1]?.text).toBe(composed.slice(4));
    await expect(
      editorRoot(page).locator(":scope > :not([data-editable-block])"),
    ).toHaveCount(0);
    await expect(lastFault(page)).toHaveText("null");
  });

  test("synthetic noncancelable Enter accepts a bare-br empty paragraph", async ({
    page,
  }) => {
    const offset = INITIAL_COMPOSING_TEXT.length;
    const inserted = "한";
    const initialCount = (await readDocumentBlocks(page)).length;
    await beginSyntheticComposition(
      page,
      COMPOSING_BLOCK_ID,
      offset,
      inserted,
    );

    await blockSurface(page, COMPOSING_BLOCK_ID).evaluate((surface) => {
      const block = surface.closest<HTMLElement>("[data-editable-block]");
      if (block === null) {
        throw new Error("Expected an owned composition block.");
      }
      surface.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: false,
          composed: true,
          inputType: "insertParagraph",
          isComposing: true,
        }),
      );
      const nativeBlock = document.createElement("div");
      nativeBlock.append(document.createElement("br"));
      block.after(nativeBlock);
      nativeBlock.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertParagraph",
          isComposing: false,
        }),
      );
      nativeBlock.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          composed: true,
          data: "한",
        }),
      );
    });

    await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
    const blocks = await readDocumentBlocks(page);
    const composingIndex = blocks.findIndex(
      (block) => block.id === COMPOSING_BLOCK_ID,
    );
    expect(blocks[composingIndex]?.text).toBe(`${INITIAL_COMPOSING_TEXT}${inserted}`);
    expect(blocks[composingIndex + 1]?.text).toBe("");
    await expect(lastFault(page)).toHaveText("null");
  });

  test("synthetic noncancelable Enter accepts an owned placeholder beside composed text", async ({
    page,
  }) => {
    const initialCount = (await readDocumentBlocks(page)).length;
    await page.evaluate((blockId) => {
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
        from: 0,
        to: block.text.length,
        text: "",
      });
      if (!result.ok) {
        throw new Error(result.reason);
      }
    }, COMPOSING_BLOCK_ID);
    await expect(blockSurface(page, COMPOSING_BLOCK_ID)).toHaveText("");
    await beginSyntheticComposition(page, COMPOSING_BLOCK_ID, 0, "한");

    await blockSurface(page, COMPOSING_BLOCK_ID).evaluate((surface) => {
      const node = surface.firstChild;
      const placeholder = node?.nextSibling;
      const block = surface.closest<HTMLElement>("[data-editable-block]");
      if (
        !(node instanceof Text) ||
        !(placeholder instanceof HTMLBRElement) ||
        !placeholder.hasAttribute("data-editable-placeholder") ||
        block === null
      ) {
        throw new Error("Expected the pinned Text and its owned placeholder.");
      }
      surface.dispatchEvent(
        new InputEvent("beforeinput", {
          bubbles: true,
          cancelable: false,
          composed: true,
          inputType: "insertParagraph",
          isComposing: true,
        }),
      );
      const nativeBlock = document.createElement("div");
      nativeBlock.append(document.createElement("br"));
      block.after(nativeBlock);
      nativeBlock.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertParagraph",
          isComposing: false,
        }),
      );
      nativeBlock.dispatchEvent(
        new CompositionEvent("compositionend", {
          bubbles: true,
          composed: true,
          data: "한",
        }),
      );
    });

    await expect.poll(() => readDocumentBlocks(page)).toHaveLength(initialCount + 1);
    const blocks = await readDocumentBlocks(page);
    const composingIndex = blocks.findIndex(
      (block) => block.id === COMPOSING_BLOCK_ID,
    );
    expect(blocks[composingIndex]?.text).toBe("한");
    expect(blocks[composingIndex + 1]?.text).toBe("");
    await expect(lastFault(page)).toHaveText("null");
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
