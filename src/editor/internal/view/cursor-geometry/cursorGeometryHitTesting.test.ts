// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  geometryForRoot,
  installCursorGeometryTestCleanup,
  rect,
  setRect,
  setupRoot,
} from "./cursorGeometryTestUtils";

installCursorGeometryTestCleanup();

describe("DOM cursor geometry hit testing", () => {
  it("hit tests whitespace inside a rendered empty paragraph", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-empty-text="true" data-path="/root/children/0/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const paragraph = root.querySelector('[data-path="/root/children/0"]');
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 120, 24));

    const geometry = geometryForRoot(root);

    expect(geometry.pointFromCoordinates(100, 20)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("resolves coordinates to the nearest valid cursor point", () => {
    const geometry = geometryForRoot(setupRoot());

    expect(geometry.pointFromCoordinates(40, 12)).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 3,
    });
    expect(geometry.pointFromCoordinates(75, 12)).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "before",
    });
    expect(geometry.pointFromCoordinates(105, 12)).toMatchObject({
      path: "/root/children/0/children/1",
      edge: "after",
    });
    expect(geometry.pointFromCoordinates(40, 60)).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(geometry.pointFromCoordinates(180, 60)).toMatchObject({
      path: "/root/children/1",
      edge: "after",
    });
  });

  it("hit tests against current viewport rects after scrolling changes layout", () => {
    let scrollTop = 0;
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">Alpha</span>',
      "</p>",
      '<p class="paragraph-block text-block" data-path="/root/children/1">',
      '<span class="text-run" data-path="/root/children/1/children/0/text">Beta</span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const firstBlock = root.querySelector('[data-path="/root/children/0"]');
    const secondBlock = root.querySelector('[data-path="/root/children/1"]');
    const firstText = root.querySelector(
      '[data-path="/root/children/0/children/0/text"]',
    );
    const secondText = root.querySelector(
      '[data-path="/root/children/1/children/0/text"]',
    );
    if (
      firstBlock === null ||
      secondBlock === null ||
      firstText === null ||
      secondText === null
    ) {
      throw new Error("Fixture failed to render.");
    }

    vi.spyOn(firstBlock, "getBoundingClientRect").mockImplementation(() =>
      rect(10, 500 - scrollTop, 120, 24),
    );
    vi.spyOn(secondBlock, "getBoundingClientRect").mockImplementation(() =>
      rect(10, 540 - scrollTop, 120, 24),
    );
    vi.spyOn(firstText, "getBoundingClientRect").mockImplementation(() =>
      rect(10, 500 - scrollTop, 50, 20),
    );
    vi.spyOn(secondText, "getBoundingClientRect").mockImplementation(() =>
      rect(10, 540 - scrollTop, 40, 20),
    );

    const geometry = geometryForRoot(root);
    expect(
      geometry.rectForPoint({
        path: "/root/children/0/children/0/text",
        offset: 0,
      })?.top,
    ).toBe(500);

    scrollTop = 500;

    expect(geometry.pointFromCoordinates(10, 44)).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("returns null instead of inventing invalid points", () => {
    const root = document.createElement("div");
    root.innerHTML = '<p data-path="/root/children/0"></p>';
    document.body.append(root);
    const paragraph = root.querySelector("[data-path]");
    if (paragraph === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(paragraph, rect(10, 10, 100, 20));

    const geometry = geometryForRoot(root);

    expect(
      geometry.rectForPoint({ path: "/root/children/0", edge: "before" }),
    ).toBeNull();
    expect(geometry.pointFromCoordinates(20, 20)).toBeNull();
  });
});
