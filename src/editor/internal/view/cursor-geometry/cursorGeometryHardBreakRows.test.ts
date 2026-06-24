// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  geometryForRoot,
  installCursorGeometryTestCleanup,
  rect,
  rectShape,
  rectShapes,
  setRect,
} from "./cursorGeometryTestUtils";

installCursorGeometryTestCleanup();

describe("DOM cursor geometry hard-break visual rows", () => {
  it("places code block carets after hard newlines on the next visual line", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">A\nB</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    const text = root.querySelector('[data-path="/root/children/0/text"]');
    if (block === null || text === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(20, 50, 120, 48));
    setRect(text, rect(20, 50, 120, 48));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 20, top: 74, width: 1, height: 24 });
  });

  it("keeps a caret rect on the empty visual line after a trailing hard newline", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">A\n</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    const text = root.querySelector('[data-path="/root/children/0/text"]');
    if (block === null || text === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(20, 50, 120, 48));
    setRect(text, rect(20, 50, 120, 48));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 20, top: 74, width: 1, height: 24 });
  });

  it("hit tests whitespace on an empty visual line between hard newlines", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">A\n\nB</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    const text = root.querySelector('[data-path="/root/children/0/text"]');
    if (block === null || text === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(20, 50, 120, 72));
    setRect(text, rect(20, 50, 120, 72));

    const geometry = geometryForRoot(root);

    expect(geometry.pointFromCoordinates(100, 86)).toMatchObject({
      path: "/root/children/0/text",
      offset: 2,
    });
    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 20, top: 74, width: 1, height: 24 });
  });

  it("keeps leading hard-break blank rows anchored before each newline", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">\n\nA</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    const text = root.querySelector('[data-path="/root/children/0/text"]');
    if (block === null || text === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(20, 50, 120, 72));
    setRect(text, rect(20, 50, 120, 72));

    const geometry = geometryForRoot(root);
    const lineStartPoint = geometry.lineStartPoint;
    const lineEndPoint = geometry.lineEndPoint;
    if (lineStartPoint === undefined || lineEndPoint === undefined) {
      throw new Error("Line boundary geometry is unavailable.");
    }

    for (const { offset, y } of [
      { offset: 0, y: 62 },
      { offset: 1, y: 86 },
    ]) {
      const point = { path: "/root/children/0/text", offset };
      expect(geometry.pointFromCoordinates(100, y)).toMatchObject(point);
      expect(lineStartPoint(point)).toMatchObject(point);
      expect(lineEndPoint(point)).toMatchObject(point);
    }
    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/text",
          offset: 2,
        }),
      ),
    ).toEqual({ left: 20, top: 98, width: 1, height: 24 });
  });

  it("keeps consecutive hard-break blank rows separate for hit testing and vertical movement", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">A\n\n\nB</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    const text = root.querySelector('[data-path="/root/children/0/text"]');
    if (block === null || text === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(20, 50, 120, 96));
    setRect(text, rect(20, 50, 120, 96));

    const geometry = geometryForRoot(root);
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    const lineStartPoint = geometry.lineStartPoint;
    const lineEndPoint = geometry.lineEndPoint;
    if (
      pointForVerticalMovement === undefined ||
      lineStartPoint === undefined ||
      lineEndPoint === undefined
    ) {
      throw new Error("Directional line geometry is unavailable.");
    }

    const firstBlank = { path: "/root/children/0/text", offset: 2 };
    const secondBlank = { path: "/root/children/0/text", offset: 3 };
    expect(geometry.pointFromCoordinates(100, 86)).toMatchObject(firstBlank);
    expect(geometry.pointFromCoordinates(100, 110)).toMatchObject(secondBlank);
    expect(lineStartPoint(firstBlank)).toMatchObject(firstBlank);
    expect(lineEndPoint(firstBlank)).toMatchObject(firstBlank);
    expect(lineStartPoint(secondBlank)).toMatchObject(secondBlank);
    expect(lineEndPoint(secondBlank)).toMatchObject(secondBlank);
    expect(
      pointForVerticalMovement(firstBlank, 100, "down", "line"),
    ).toMatchObject(secondBlank);
    expect(
      pointForVerticalMovement(secondBlank, 100, "up", "line"),
    ).toMatchObject(firstBlank);
  });

  it("keeps multiple trailing hard-break blank rows separately addressable", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">A\n\n</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    const text = root.querySelector('[data-path="/root/children/0/text"]');
    if (block === null || text === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(20, 50, 120, 72));
    setRect(text, rect(20, 50, 120, 72));

    const geometry = geometryForRoot(root);
    const lineStartPoint = geometry.lineStartPoint;
    const lineEndPoint = geometry.lineEndPoint;
    if (lineStartPoint === undefined || lineEndPoint === undefined) {
      throw new Error("Line boundary geometry is unavailable.");
    }

    for (const { offset, top, y } of [
      { offset: 2, top: 74, y: 86 },
      { offset: 3, top: 98, y: 110 },
    ]) {
      const point = { path: "/root/children/0/text", offset };
      expect(geometry.pointFromCoordinates(100, y)).toMatchObject(point);
      expect(lineStartPoint(point)).toMatchObject(point);
      expect(lineEndPoint(point)).toMatchObject(point);
      expect(rectShape(geometry.rectForPoint(point))).toEqual({
        left: 20,
        top,
        width: 1,
        height: 24,
      });
    }
  });

  it("hit tests whitespace after a short hard-break line on that line", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<pre class="code-block text-block" data-path="/root/children/0">',
      '<code class="code-block-text text-run" data-path="/root/children/0/text">ABCDEFGHIJ\nB</code>',
      "</pre>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    const text = root.querySelector('[data-path="/root/children/0/text"]');
    if (block === null || text === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(20, 50, 120, 48));
    setRect(text, rect(20, 50, 120, 48));

    const geometry = geometryForRoot(root);

    expect(geometry.pointFromCoordinates(100, 86)).toMatchObject({
      path: "/root/children/0/text",
      offset: 12,
    });
  });

  it("soft-wraps long visual rows even when the text also has hard breaks", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0" style="line-height: 24px">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">ABCD\nEF</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    if (block === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(10, 10, 20, 72));

    const geometry = geometryForRoot(root);

    expect(
      rectShape(
        geometry.rectForPoint({
          path: "/root/children/0/children/0/text",
          offset: 2,
          affinity: "forward",
        }),
      ),
    ).toEqual({ left: 10, top: 34, width: 1, height: 24 });
    expect(geometry.pointFromCoordinates(10, 46)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 2,
    });
  });

  it("draws a selection rect for a selected hard newline", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0" style="line-height: 24px">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">AB\nC</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const block = root.querySelector('[data-path="/root/children/0"]');
    if (block === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(block, rect(10, 10, 40, 48));

    const geometry = geometryForRoot(root);

    expect(
      rectShapes(
        geometry.rectsForRange(
          { path: "/root/children/0/children/0/text", offset: 2 },
          { path: "/root/children/0/children/0/text", offset: 3 },
        ),
      ),
    ).toEqual([{ left: 30, top: 10, width: 1, height: 24 }]);
  });
});
