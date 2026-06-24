// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  geometryForRoot,
  installCursorGeometryTestCleanup,
  rect,
  rectShape,
  rectShapes,
  setRect,
  setupRoot,
} from "./cursorGeometryTestUtils";

installCursorGeometryTestCleanup();

describe("DOM cursor geometry rect projection", () => {
  it("returns rects for text offsets from the layout map", () => {
    const geometry = geometryForRoot(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 30, top: 10, width: 1, height: 24 });
  });

  it("returns rects for text ranges from the layout map", () => {
    const geometry = geometryForRoot(setupRoot());

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/root/children/0/children/0/text", offset: 1 },
          { path: "/root/children/0/children/0/text", offset: 3 },
        ),
      ),
    ).toEqual([{ left: 20, top: 10, width: 20, height: 24 }]);
  });

  it("returns text rects across inline atom ranges in model order", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">AB</span>',
      '<span class="mention-chip" data-path="/root/children/0/children/1">@Ada</span>',
      '<span class="text-run" data-path="/root/children/0/children/2/text">CD</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    const mention = root.querySelector(
      '[data-path="/root/children/0/children/1"]',
    );
    if (paragraph === null || mention === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 100, 24));
    setRect(mention, rect(30, 10, 40, 20));

    const geometry = geometryForRoot(root);

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/root/children/0/children/2/text", offset: 1 },
          { path: "/root/children/0/children/0/text", offset: 1 },
        ),
      ),
    ).toEqual([
      { left: 20, top: 10, width: 10, height: 24 },
      { left: 70, top: 10, width: 10, height: 24 },
    ]);
  });

  it("does not invent range rects for atom edges", () => {
    const geometry = geometryForRoot(setupRoot());

    expect(
      geometry.rectsForRange(
        { path: "/root/children/1", edge: "before" },
        { path: "/root/children/1", edge: "after" },
      ),
    ).toEqual([]);
  });

  it("keeps block atom edges in document order for range rects", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">AB</span>',
      "</p>",
      '<figure class="figure-block" data-path="/root/children/1"></figure>',
      '<p class="paragraph-block text-block" data-path="/root/children/2">',
      '<span class="text-run" data-path="/root/children/2/children/0/text">CD</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const firstParagraph = root.querySelector('[data-path="/root/children/0"]');
    const figure = root.querySelector('[data-path="/root/children/1"]');
    const secondParagraph = root.querySelector(
      '[data-path="/root/children/2"]',
    );
    if (
      firstParagraph === null ||
      figure === null ||
      secondParagraph === null
    ) {
      throw new Error("Fixture failed to render.");
    }
    setRect(firstParagraph, rect(10, 10, 100, 24));
    setRect(figure, rect(10, 50, 200, 120));
    setRect(secondParagraph, rect(10, 200, 100, 24));

    const geometry = geometryForRoot(root);

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/root/children/0/children/0/text", offset: 1 },
          { path: "/root/children/1", edge: "after" },
        ),
      ),
    ).toEqual([{ left: 20, top: 10, width: 10, height: 24 }]);
  });

  it("maps visible offsets through nested marked text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">',
      '<strong class="rich-strong">bold</strong>',
      "</span>",
      "</p>",
    ].join("");
    document.body.append(root);
    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 80, 20));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 3,
        }),
      ),
    ).toEqual({ left: 40, top: 10, width: 1, height: 20 });
  });

  it("returns before and after rects for mention atom edges", () => {
    const geometry = geometryForRoot(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/1",
          edge: "before",
        }),
      ),
    ).toEqual({ left: 60, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/1",
          edge: "after",
        }),
      ),
    ).toEqual({ left: 100, top: 10, width: 1, height: 24 });
  });

  it("returns before and after rects for figure block edges", () => {
    const geometry = geometryForRoot(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/1", edge: "before" }),
      ),
    ).toEqual({ left: 10, top: 50, width: 1, height: 120 });
    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/1", edge: "after" }),
      ),
    ).toEqual({ left: 210, top: 50, width: 1, height: 120 });
  });

  it("returns before and after rects for paragraph block edges", () => {
    const geometry = geometryForRoot(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/0", edge: "before" }),
      ),
    ).toEqual({ left: 10, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/0", edge: "after" }),
      ),
    ).toEqual({ left: 100, top: 10, width: 1, height: 24 });
  });

  it("returns a caret rect for an empty paragraph text point", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 120, 24));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 0,
        }),
      ),
    ).toEqual({ left: 10, top: 10, width: 1, height: 24 });
  });

  it("returns before and after rects for rich text block edges", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<h2 class="heading-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">Head</span>',
      "</h2>",
      '<pre class="code-block text-block" data-path="/root/children/1">',
      '<code class="code-block-text text-run" data-path="/root/children/1/text">code</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const heading = root.querySelector('[data-path="/root/children/0"]');
    const codeBlock = root.querySelector('[data-path="/root/children/1"]');
    if (heading === null || codeBlock === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(heading, rect(20, 10, 80, 24));
    setRect(codeBlock, rect(20, 50, 80, 24));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/0", edge: "before" }),
      ),
    ).toEqual({ left: 20, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({ path: "/root/children/1", edge: "after" }),
      ),
    ).toEqual({ left: 60, top: 50, width: 1, height: 24 });
  });

  it("positions code block carets inside block padding", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0" style="padding: 10px 12px">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">code</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const codeBlock = root.querySelector('[data-path="/root/children/0"]');
    if (codeBlock === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(codeBlock, rect(20, 50, 120, 44));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/text",
          offset: 0,
        }),
      ),
    ).toEqual({ left: 32, top: 60, width: 1, height: 24 });
  });

  it("collapses wrapped line-boundary text offsets to the next visual line", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0" style="line-height: 24px">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">AB</span>',
      '<span class="text-run" data-path="/root/children/0/children/1/text">CD</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 20, 48));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
          affinity: "backward",
        }),
      ),
    ).toEqual({ left: 30, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 10, top: 34, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
          affinity: "forward",
        }),
      ),
    ).toEqual({ left: 10, top: 34, width: 1, height: 24 });
  });
});
