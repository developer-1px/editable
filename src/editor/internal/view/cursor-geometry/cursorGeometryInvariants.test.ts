// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  allInvariantFixtures,
  expectFiniteRect,
  setupInvariantFixture,
} from "./cursorGeometryInvariantFixtures";
import {
  geometryForRoot,
  installCursorGeometryTestCleanup,
} from "./cursorGeometryTestUtils";

installCursorGeometryTestCleanup();

describe("DOM cursor geometry invariants", () => {
  it.each(
    allInvariantFixtures,
  )("returns finite rects for every legal cursor stop in $name", ({
    fixture,
  }) => {
    const geometry = geometryForRoot(setupInvariantFixture(fixture));

    for (const { label, point } of fixture.legalStops) {
      expectFiniteRect(label, geometry.rectForPoint(point));
    }
  });

  it.each(
    allInvariantFixtures,
  )("moves vertically through each visual row in $name", ({ fixture }) => {
    const geometry = geometryForRoot(setupInvariantFixture(fixture));
    const pointForVerticalMovement = geometry.pointForVerticalMovement;
    if (pointForVerticalMovement === undefined) {
      throw new Error("Directional vertical geometry is unavailable.");
    }

    for (let index = 0; index < fixture.rowStops.length - 1; index += 1) {
      const current = fixture.rowStops[index];
      const next = fixture.rowStops[index + 1];
      if (current === undefined || next === undefined) {
        throw new Error("Fixture row stop is missing.");
      }

      expect(
        pointForVerticalMovement(current.point, current.x, "down", "line"),
        `${current.label} down`,
      ).toMatchObject(next.point);
      expect(
        pointForVerticalMovement(next.point, next.x, "up", "line"),
        `${next.label} up`,
      ).toMatchObject(current.point);
    }
  });

  it.each(
    allInvariantFixtures,
  )("returns line boundaries for every non-figure row stop in $name", ({
    fixture,
  }) => {
    const geometry = geometryForRoot(setupInvariantFixture(fixture));
    const lineStartPoint = geometry.lineStartPoint;
    const lineEndPoint = geometry.lineEndPoint;
    if (lineStartPoint === undefined || lineEndPoint === undefined) {
      throw new Error("Line boundary geometry is unavailable.");
    }

    for (const { label, point } of fixture.rowStops) {
      if (point.edge !== undefined) {
        continue;
      }

      expect(lineStartPoint(point), `${label} line start`).not.toBeNull();
      expect(lineEndPoint(point), `${label} line end`).not.toBeNull();
    }
  });
});
