import { expect, type Page, test } from "@playwright/test";

const firstTextPath = "/root/children/0/children/0/text";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Document body" }),
  ).toBeFocused();
  await expect(pathLocator(page, firstTextPath)).toHaveText("Plain ");
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

  await page.keyboard.press("Shift+ArrowRight");

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

  await page.keyboard.press("Shift+ArrowRight");

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
