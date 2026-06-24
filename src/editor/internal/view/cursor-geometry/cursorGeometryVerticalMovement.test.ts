// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  geometryForRoot,
  installCursorGeometryTestCleanup,
  rect,
  setRect,
  setupRoot,
} from "./cursorGeometryTestUtils";

installCursorGeometryTestCleanup();

describe("DOM cursor geometry vertical movement", () => {
  it("moves vertically by ordered rows instead of nearest current-line hit testing", () => {
    const geometry = geometryForRoot(setupRoot());
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    expect(
      pointForVerticalMovement(
        { path: "/root/children/0/children/0/text", offset: 2 },
        20,
        "down",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/1",
      edge: "before",
    });
    expect(
      pointForVerticalMovement(
        { path: "/root/children/1", edge: "before" },
        20,
        "up",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 1,
    });
  });

  it("moves up from an empty paragraph to the previous visual row", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text">Alpha</span>',
      "</p>",
      '<p class="paragraph-block text-block" data-path="/root/children/1">',
      '<span class="text-run" data-path="/root/children/1/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const first = root.querySelector('[data-path="/root/children/0"]');
    const second = root.querySelector('[data-path="/root/children/1"]');
    if (first === null || second === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(first, rect(10, 10, 120, 24));
    setRect(second, rect(10, 40, 120, 24));

    const geometry = geometryForRoot(root);
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    expect(
      pointForVerticalMovement(
        { path: "/root/children/1/children/0/text", offset: 0 },
        10,
        "up",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
  });

  it("moves vertically between consecutive empty paragraphs", () => {
    const root = document.createElement("div");
    root.innerHTML = [
      '<p class="paragraph-block text-block" data-path="/root/children/0">',
      '<span class="text-run" data-path="/root/children/0/children/0/text"></span>',
      "</p>",
      '<p class="paragraph-block text-block" data-path="/root/children/1">',
      '<span class="text-run" data-path="/root/children/1/children/0/text"></span>',
      "</p>",
    ].join("");
    document.body.append(root);

    const first = root.querySelector('[data-path="/root/children/0"]');
    const second = root.querySelector('[data-path="/root/children/1"]');
    if (first === null || second === null) {
      throw new Error("Fixture failed to render.");
    }
    setRect(first, rect(10, 10, 120, 24));
    setRect(second, rect(10, 40, 120, 24));

    const geometry = geometryForRoot(root);
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    expect(
      pointForVerticalMovement(
        { path: "/root/children/1/children/0/text", offset: 0 },
        10,
        "up",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/0/children/0/text",
      offset: 0,
    });
    expect(
      pointForVerticalMovement(
        { path: "/root/children/0/children/0/text", offset: 0 },
        10,
        "down",
        "line",
      ),
    ).toMatchObject({
      path: "/root/children/1/children/0/text",
      offset: 0,
    });
  });

  it("reports a page step from the root viewport height", () => {
    const root = setupRoot();
    setRect(root, rect(0, 0, 320, 240));

    expect(geometryForRoot(root).pageStep()).toBe(240);
  });
});
