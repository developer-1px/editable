// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { createDOMCursorGeometry } from "./cursorGeometry";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return new DOMRect(x, y, width, height);
}

function rectShape(value: DOMRect | null) {
  if (value === null) {
    return null;
  }

  return {
    left: value.left,
    top: value.top,
    width: value.width,
    height: value.height,
  };
}

function rectShapes(values: DOMRect[]) {
  return values.map((value) => rectShape(value));
}

function setRect(element: Element, value: DOMRect) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(value);
}

function setupRoot() {
  const root = document.createElement("div");
  root.innerHTML = [
    '<p class="paragraph-block text-block" data-path="/blocks/0">',
    '<span class="text-run" data-path="/blocks/0/children/0/text">Hello</span>',
    '<span class="mention-chip" data-path="/blocks/0/children/1">@Ada</span>',
    "</p>",
    '<figure class="figure-block" data-path="/blocks/1"></figure>',
  ].join("");
  document.body.append(root);

  const text = root.querySelector('[data-path="/blocks/0/children/0/text"]');
  const mention = root.querySelector('[data-path="/blocks/0/children/1"]');
  const paragraph = root.querySelector('[data-path="/blocks/0"]');
  const figure = root.querySelector('[data-path="/blocks/1"]');
  if (
    text === null ||
    mention === null ||
    paragraph === null ||
    figure === null
  ) {
    throw new Error("Fixture failed to render.");
  }

  setRect(paragraph, rect(10, 10, 100, 24));
  setRect(text, rect(10, 10, 50, 20));
  setRect(mention, rect(70, 10, 40, 20));
  setRect(figure, rect(10, 50, 200, 120));

  return root;
}

describe("createDOMCursorGeometry", () => {
  it("returns rects for text offsets from the layout map", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/blocks/0/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 30, top: 10, width: 1, height: 24 });
  });

  it("returns rects for text ranges from the layout map", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/blocks/0/children/0/text", offset: 1 },
          { path: "/blocks/0/children/0/text", offset: 3 },
        ),
      ),
    ).toEqual([{ left: 20, top: 10, width: 20, height: 24 }]);
  });

  it("returns text rects across inline atom ranges in model order", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/blocks/0">',
      '<span class="text-run" data-path="/blocks/0/children/0/text">AB</span>',
      '<span class="mention-chip" data-path="/blocks/0/children/1">@Ada</span>',
      '<span class="text-run" data-path="/blocks/0/children/2/text">CD</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/blocks/0"]');
    const mention = root.querySelector('[data-path="/blocks/0/children/1"]');
    if (paragraph === null || mention === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 100, 24));
    setRect(mention, rect(30, 10, 40, 20));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/blocks/0/children/2/text", offset: 1 },
          { path: "/blocks/0/children/0/text", offset: 1 },
        ),
      ),
    ).toEqual([
      { left: 20, top: 10, width: 10, height: 24 },
      { left: 70, top: 10, width: 10, height: 24 },
    ]);
  });

  it("does not invent range rects for atom edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      geometry.rectsForRange(
        { path: "/blocks/1", edge: "before" },
        { path: "/blocks/1", edge: "after" },
      ),
    ).toEqual([]);
  });

  it("maps visible offsets through nested marked text nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/blocks/0">',
      '<span class="text-run" data-path="/blocks/0/children/0/text">',
      '<strong class="rich-strong">bold</strong>',
      "</span>",
      "</p>",
    ].join("");
    document.body.append(root);
    const paragraph = root.querySelector('[data-path="/blocks/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 80, 20));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/blocks/0/children/0/text",
          offset: 3,
        }),
      ),
    ).toEqual({ left: 40, top: 10, width: 1, height: 20 });
  });

  it("returns before and after rects for mention atom edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/blocks/0/children/1",
          edge: "before",
        }),
      ),
    ).toEqual({ left: 60, top: 10, width: 1, height: 24 });
    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/blocks/0/children/1",
          edge: "after",
        }),
      ),
    ).toEqual({ left: 100, top: 10, width: 1, height: 24 });
  });

  it("returns before and after rects for figure block edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(geometry.rectForPoint({ path: "/blocks/1", edge: "before" })),
    ).toEqual({ left: 10, top: 50, width: 1, height: 120 });
    expect(
      rectShape(geometry.rectForPoint({ path: "/blocks/1", edge: "after" })),
    ).toEqual({ left: 210, top: 50, width: 1, height: 120 });
  });

  it("returns before and after rects for paragraph block edges", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(
      rectShape(geometry.rectForPoint({ path: "/blocks/0", edge: "before" })),
    ).toEqual({ left: 10, top: 10, width: 1, height: 24 });
    expect(
      rectShape(geometry.rectForPoint({ path: "/blocks/0", edge: "after" })),
    ).toEqual({ left: 100, top: 10, width: 1, height: 24 });
  });

  it("returns a caret rect for an empty paragraph text point", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/blocks/0">',
      '<span class="text-run" data-path="/blocks/0/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/blocks/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 120, 24));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/blocks/0/children/0/text",
          offset: 0,
        }),
      ),
    ).toEqual({ left: 10, top: 10, width: 1, height: 24 });
  });

  it("returns before and after rects for rich text block edges", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<h2 class="heading-block text-block" data-path="/blocks/0">',
      '<span class="text-run" data-path="/blocks/0/children/0/text">Head</span>',
      "</h2>",
      '<pre class="code-block text-block" data-path="/blocks/1">',
      '<code class="code-block-text text-run" data-path="/blocks/1/text">code</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const heading = root.querySelector('[data-path="/blocks/0"]');
    const codeBlock = root.querySelector('[data-path="/blocks/1"]');
    if (heading === null || codeBlock === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(heading, rect(20, 10, 80, 24));
    setRect(codeBlock, rect(20, 50, 80, 24));

    const geometry = createDOMCursorGeometry(root);

    expect(
      rectShape(geometry.rectForPoint({ path: "/blocks/0", edge: "before" })),
    ).toEqual({ left: 20, top: 10, width: 1, height: 24 });
    expect(
      rectShape(geometry.rectForPoint({ path: "/blocks/1", edge: "after" })),
    ).toEqual({ left: 60, top: 50, width: 1, height: 24 });
  });

  it("positions code block carets inside block padding", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/blocks/0" style="padding: 10px 12px">',
      '<code class="code-block-text text-run" data-path="/blocks/0/text">code</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const codeBlock = root.querySelector('[data-path="/blocks/0"]');
    if (codeBlock === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(codeBlock, rect(20, 50, 120, 44));

    const geometry = createDOMCursorGeometry(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/blocks/0/text",
          offset: 0,
        }),
      ),
    ).toEqual({ left: 32, top: 60, width: 1, height: 24 });
  });

  it("collapses wrapped line-boundary text offsets to the next visual line", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/blocks/0" style="line-height: 24px">',
      '<span class="text-run" data-path="/blocks/0/children/0/text">AB</span>',
      '<span class="text-run" data-path="/blocks/0/children/1/text">CD</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/blocks/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 20, 48));

    const geometry = createDOMCursorGeometry(root);
    const pointForHorizontalMovement = geometry.pointForHorizontalMovement;
    if (pointForHorizontalMovement === undefined) {
      throw new Error("Horizontal geometry is unavailable.");
    }

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/blocks/0/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 10, top: 34, width: 1, height: 24 });
    expect(
      pointForHorizontalMovement(
        {
          path: "/blocks/0/children/0/text",
          offset: 2,
          affinity: "backward",
        },
        "forward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 2,
      affinity: "forward",
    });
    expect(
      pointForHorizontalMovement(
        {
          path: "/blocks/0/children/1/text",
          offset: 0,
          affinity: "forward",
        },
        "backward",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 2,
      affinity: "backward",
    });
  });

  it("resolves coordinates to the nearest valid cursor point", () => {
    const geometry = createDOMCursorGeometry(setupRoot());

    expect(geometry.pointFromCoordinates(40, 12)).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 3,
    });
    expect(geometry.pointFromCoordinates(75, 12)).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "before",
    });
    expect(geometry.pointFromCoordinates(105, 12)).toMatchObject({
      path: "/blocks/0/children/1",
      edge: "after",
    });
    expect(geometry.pointFromCoordinates(40, 60)).toMatchObject({
      path: "/blocks/1",
      edge: "before",
    });
    expect(geometry.pointFromCoordinates(180, 60)).toMatchObject({
      path: "/blocks/1",
      edge: "after",
    });
  });

  it("moves vertically by ordered rows instead of nearest current-line hit testing", () => {
    const geometry = createDOMCursorGeometry(setupRoot());
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    expect(
      pointForVerticalMovement(
        { path: "/blocks/0/children/0/text", offset: 2 },
        20,
        "down",
        "line",
      ),
    ).toMatchObject({
      path: "/blocks/1",
      edge: "before",
    });
    expect(
      pointForVerticalMovement(
        { path: "/blocks/1", edge: "before" },
        20,
        "up",
        "line",
      ),
    ).toMatchObject({
      path: "/blocks/0/children/0/text",
      offset: 1,
    });
  });

  it("reports a page step from the root viewport height", () => {
    const root = setupRoot();
    setRect(root, rect(0, 0, 320, 240));

    expect(createDOMCursorGeometry(root).pageStep()).toBe(240);
  });

  it("returns null instead of inventing invalid points", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p data-path="/blocks/0"></p>';
    document.body.append(root);
    const paragraph = root.querySelector("[data-path]");
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 100, 20));

    const geometry = createDOMCursorGeometry(root);

    expect(
      geometry.rectForPoint({ path: "/blocks/0", edge: "before" }),
    ).toBeNull();
    expect(geometry.pointFromCoordinates(20, 20)).toBeNull();
  });
});
