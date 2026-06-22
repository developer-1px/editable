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

import {
  compareTestFileSets,
  forbiddenTestMarkerViolations,
  parseRepeat,
  parseVitestListFiles,
  runBuildWithRouteTreeCheck,
  verifyNoFocusedOrSkippedTests,
  verifyVitestDiscoveryParity,
} from "./verify-internal.mjs";

describe("verify-internal repeat parsing", () => {
  it("uses the default repeat when no repeat argument is provided", () => {
    expect(parseRepeat([])).toBe(3);
  });

  it("uses the explicit positive repeat argument", () => {
    expect(parseRepeat(["--", "--repeat=10"])).toBe(10);
  });

  it.each([
    "--repeat=0",
    "--repeat=-1",
    "--repeat=2x",
    "--repeat=abc",
  ])("rejects invalid repeat argument %s", (repeatArg) => {
    expect(() => parseRepeat([repeatArg])).toThrow("Invalid --repeat value");
  });
});

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

describe("verify-internal test marker scan", () => {
  it("parses Vitest files-only JSON output", () => {
    expect(
      parseVitestListFiles(
        JSON.stringify([
          { file: "/repo/a.test.ts" },
          { file: "/repo/b.test.ts" },
        ]),
      ),
    ).toEqual(["/repo/a.test.ts", "/repo/b.test.ts"]);
  });

  it("compares Vitest discovery with marker scanner discovery", () => {
    expect(
      compareTestFileSets(
        ["/repo/b.test.ts", "/repo/a.test.ts"],
        ["/repo/a.test.ts", "/repo/c.test.ts"],
      ),
    ).toEqual({
      vitestFiles: ["/repo/a.test.ts", "/repo/b.test.ts"],
      scanFiles: ["/repo/a.test.ts", "/repo/c.test.ts"],
      missingFromScan: ["/repo/b.test.ts"],
      extraInScan: ["/repo/c.test.ts"],
    });
  });

  it("fails when Vitest discovery and marker scanner discovery differ", () => {
    expect(() =>
      verifyVitestDiscoveryParity(["/repo/a.test.ts"], {
        vitestFiles: ["/repo/a.test.ts", "/repo/b.test.ts"],
      }),
    ).toThrow("Vitest discovery differs");
  });

  it("scans repo-level test files while ignoring generated dependency directories", () => {
    const root = mkdtempSync(join(tmpdir(), "editable-verify-internal-"));
    try {
      mkdirSync(join(root, "tests"), { recursive: true });
      mkdirSync(join(root, "tests", "browser"), { recursive: true });
      mkdirSync(join(root, "node_modules"), { recursive: true });
      mkdirSync(join(root, "dist"), { recursive: true });
      writeFileSync(
        join(root, "tests", "focused.test.ts"),
        "import { test } from 'vitest';\ntest.only('case', () => {});\n",
      );
      writeFileSync(
        join(root, "tests", "browser", "ignored.spec.ts"),
        "import { test } from '@playwright/test';\ntest.only('case', () => {});\n",
      );
      writeFileSync(
        join(root, "node_modules", "ignored.test.ts"),
        "import { test } from 'vitest';\ntest.only('case', () => {});\n",
      );
      writeFileSync(
        join(root, "dist", "ignored.test.ts"),
        "import { test } from 'vitest';\ntest.only('case', () => {});\n",
      );

      const result = verifyNoFocusedOrSkippedTests(root);

      expect(
        result.testFiles.map((path) => path.replace(`${root}/`, "")),
      ).toEqual(["tests/focused.test.ts"]);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain("tests/focused.test.ts");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("passes ordinary test definitions and ignores marker text in strings", () => {
    const markerText = "test." + "only";
    const source = `
      import { describe, expect, it, test } from "vitest";

      describe("suite", () => {
        it("runs a normal test", () => {
          expect("${markerText}").toContain("test.");
        });

        test.each([1, 2])("case %s", (value) => {
          expect(value).toBeGreaterThan(0);
        });
      });
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([]);
  });

  it("reports forbidden markers through aliased Vitest named imports", () => {
    const source = `
      import { describe as group, test as check } from "vitest";

      group.skip("suite", () => {});
      check.only("case", () => {});
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:4:7 uses forbidden Vitest test marker: group.skip (skip)",
      "src/example.test.ts:5:7 uses forbidden Vitest test marker: check.only (only)",
    ]);
  });

  it("reports forbidden markers through Vitest namespace imports", () => {
    const source = `
      import * as v from "vitest";

      v.suite.skip("suite", () => {});
      v.test.todo("case");
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:4:7 uses forbidden Vitest test marker: v.suite.skip (skip)",
      "src/example.test.ts:5:7 uses forbidden Vitest test marker: v.test.todo (todo)",
    ]);
  });

  it("ignores type-only Vitest import aliases", () => {
    const source = `
      import type { test as typedTest } from "vitest";

      const typedTest = { only: () => {} };
      typedTest.only();
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([]);
  });

  it("reports forbidden markers through local Vitest test aliases", () => {
    const source = `
      import { test } from "vitest";

      const customTest = test.extend({});
      const check = customTest;

      customTest.only("custom case", () => {});
      check.skip("aliased case", () => {});
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:7:7 uses forbidden Vitest test marker: customTest.only (only)",
      "src/example.test.ts:8:7 uses forbidden Vitest test marker: check.skip (skip)",
    ]);
  });

  it("reports forbidden markers through local Vitest namespace aliases", () => {
    const source = `
      import * as v from "vitest";

      const customTest = v.test.extend({});
      const check = v.test;
      customTest.fails("case", () => {});
      check.todo("direct namespace alias");
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:6:7 uses forbidden Vitest test marker: customTest.fails (fails)",
      "src/example.test.ts:7:7 uses forbidden Vitest test marker: check.todo (todo)",
    ]);
  });

  it("reports forbidden marker function aliases at the declaration", () => {
    const source = `
      import { test } from "vitest";

      const focused = test.only;
      focused("case", () => {});
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:4:23 uses forbidden Vitest test marker: test.only (only)",
    ]);
  });

  it("ignores non-Vitest local wrappers with marker-like property names", () => {
    const source = `
      const test = { only: () => {} };
      const customTest = { only: () => {} };
      test.only();
      customTest.only();
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([]);
  });

  it("reports forbidden markers when a reserved global test name is a Vitest alias", () => {
    const source = `
      import { test as baseTest } from "vitest";

      const test = baseTest.extend({});
      test.only("case", () => {});
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:5:7 uses forbidden Vitest test marker: test.only (only)",
    ]);
  });

  it("ignores nested non-Vitest lexical shadows of Vitest globals", () => {
    const source = `
      import { describe, test } from "vitest";

      function helper(test) {
        test.only();
      }

      test("case", () => {
        const describe = { skip: () => {} };
        describe.skip();
      });
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([]);
  });

  it("reports nested Vitest aliases without leaking them outside their scope", () => {
    const source = `
      import { test } from "vitest";

      test("outer", () => {
        const localTest = test.extend({});
        localTest.only("inner", () => {});
      });

      localTest.skip("out of scope", () => {});
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:6:9 uses forbidden Vitest test marker: localTest.only (only)",
    ]);
  });

  it("does not treat later lexical declarations as initialized Vitest aliases", () => {
    const source = `
      import { test as baseTest } from "vitest";

      localTest.skip("before declaration", () => {});
      test.only("before declaration", () => {});

      const localTest = baseTest.extend({});
      const test = baseTest.extend({});

      localTest.skip("after declaration", () => {});
      test.only("after declaration", () => {});
    `;

    expect(
      forbiddenTestMarkerViolations("src/example.test.ts", source),
    ).toEqual([
      "src/example.test.ts:10:7 uses forbidden Vitest test marker: localTest.skip (skip)",
      "src/example.test.ts:11:7 uses forbidden Vitest test marker: test.only (only)",
    ]);
  });

  it.each([
    ["describe.only", "describe.only('suite', () => {});"],
    ["suite.skip", "suite.skip('suite', () => {});"],
    ["it.skip", "it.skip('case', () => {});"],
    ["test.todo", "test.todo('case');"],
    ["test.concurrent.only", "test.concurrent.only('case', () => {});"],
    ["test.skipIf", "test.skipIf(true)('case', () => {});"],
    ["test.runIf", "test.runIf(false)('case', () => {});"],
    ["test.fails", "test.fails('case', () => {});"],
    ["test.each.skip", "test.each([1]).skip('case', () => {});"],
    ["test.only", "test['only']('case', () => {});"],
  ])("reports forbidden marker %s", (label, source) => {
    const violations = forbiddenTestMarkerViolations(
      "src/example.test.ts",
      `import { describe, suite, it, test } from "vitest";\n${source}`,
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain(label);
  });
});
