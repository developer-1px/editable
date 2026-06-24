import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { runBuildWithRouteTreeCheck } from "./verify-internal.mjs";

describe("verify-internal route tree stability check", () => {
  it("passes when build leaves the generated route tree unchanged", async () => {
    const root = mkdtempSync(join(tmpdir(), "editable-verify-internal-"));
    try {
      const routeTreePath = join(root, "src", "routeTree.gen.ts");
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(routeTreePath, "original route tree\n");

      await expect(
        runBuildWithRouteTreeCheck(1, {
          routeTreePath,
          runCommand: async () => {},
        }),
      ).resolves.toBeUndefined();
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("restores the generated route tree and fails when build changes it", async () => {
    const root = mkdtempSync(join(tmpdir(), "editable-verify-internal-"));
    try {
      const routeTreePath = join(root, "src", "routeTree.gen.ts");
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(routeTreePath, "original route tree\n");

      await expect(
        runBuildWithRouteTreeCheck(1, {
          routeTreePath,
          runCommand: async () => {
            writeFileSync(routeTreePath, "regenerated route tree\n");
          },
        }),
      ).rejects.toThrow("pnpm build regenerated src/routeTree.gen.ts");
      expect(readFileSync(routeTreePath, "utf8")).toBe("original route tree\n");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
