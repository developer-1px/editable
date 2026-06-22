import { expect, type Page, test } from "@playwright/test";

const firstTextPath = "/root/children/0/children/0/text";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  const editor = page.getByRole("textbox", { name: "Document body" });
  await expect(editor).toBeVisible();
  await expect(pathLocator(page, firstTextPath)).toHaveText("Plain ");
  await focusHydratedEditor(page);
  await setNativeTextSelection(page, firstTextPath, 0, 0);
  await expect(editor).toBeFocused();
});

test("range overlay stays in viewport coordinates through transform and scroll", async ({
  page,
}) => {
  await page.evaluate(() => {
    document.documentElement.style.minHeight = "1600px";
    document.body.style.minHeight = "1600px";

    const pane = document.querySelector(".editor-pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Editor pane was not found.");
    }

    pane.style.marginTop = "120px";
    pane.style.transform = "scale(0.82)";
    pane.style.transformOrigin = "left top";
    window.scrollTo(0, 80);
  });
  await setNativeTextSelection(page, firstTextPath, 0, 0);

  await pressEditorKey(page, "Shift+ArrowRight");

  await expect
    .poll(() => readRangeOverlayProjection(page))
    .toMatchObject({
      overlayRootParent: "BODY",
      rangeCount: 1,
      styleProjectsToViewport: true,
    });
});

test("range overlay stays in viewport coordinates through CSS zoom", async ({
  page,
}) => {
  const supportsZoom = await page.evaluate(() => CSS.supports("zoom", "1.2"));
  test.skip(!supportsZoom, "CSS zoom is not supported by this browser.");

  await page.evaluate(() => {
    const pane = document.querySelector(".editor-pane");
    if (!(pane instanceof HTMLElement)) {
      throw new Error("Editor pane was not found.");
    }

    pane.style.zoom = "1.2";
  });
  await setNativeTextSelection(page, firstTextPath, 0, 0);

  await pressEditorKey(page, "Shift+ArrowRight");

  await expect
    .poll(() => readRangeOverlayProjection(page))
    .toMatchObject({
      overlayRootParent: "BODY",
      rangeCount: 1,
      styleProjectsToViewport: true,
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

async function pressEditorKey(page: Page, key: string) {
  const editor = page.getByRole("textbox", { name: "Document body" });
  await editor.focus();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute("data-focused", "true");
  await editor.press(key);
}

async function readRangeOverlayProjection(page: Page) {
  return page.evaluate(() => {
    const overlay = document.querySelector('[data-overlay="selected-range"]');
    const overlayRoot = overlay?.closest(".selection-overlay");

    if (!(overlay instanceof HTMLElement)) {
      return {
        overlayRootParent: overlayRoot?.parentElement?.tagName ?? null,
        rangeCount: document.querySelectorAll('[data-overlay="selected-range"]')
          .length,
        styleProjectsToViewport: false,
      };
    }

    const actual = overlay.getBoundingClientRect();
    const styleRect = {
      height: Number.parseFloat(overlay.style.height),
      left: Number.parseFloat(overlay.style.left),
      top: Number.parseFloat(overlay.style.top),
      width: Number.parseFloat(overlay.style.width),
    };
    const styleProjectsToViewport =
      Math.abs(actual.left - styleRect.left) <= 0.5 &&
      Math.abs(actual.top - styleRect.top) <= 0.5 &&
      Math.abs(actual.width - styleRect.width) <= 0.5 &&
      Math.abs(actual.height - styleRect.height) <= 0.5;

    return {
      overlayRootParent: overlayRoot?.parentElement?.tagName ?? null,
      rangeCount: document.querySelectorAll('[data-overlay="selected-range"]')
        .length,
      styleProjectsToViewport,
    };
  });
}
