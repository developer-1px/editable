import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const planScript = join(repoRoot, "tools/evidence/plan-sample.mjs");

describe("evidence sample plan CLI", () => {
  it("prints the manifest entry for a clipboard sample", () => {
    const result = runPlan(
      "--file",
      "tests/fixtures/clipboard-html-corpus/generic-webpage/paragraph-link-image.json",
      "--source",
      "generic-webpage",
      "--shape",
      "paragraph-link-image",
    );

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      kind: "clipboard",
      valid: true,
      destination: "generic-webpage/paragraph-link-image.json",
      manifestEntry: {
        path: "generic-webpage/paragraph-link-image.json",
        source: "generic-webpage",
        shape: "paragraph-link-image",
      },
    });
  });

  it("prints the manifest entry for a manual trace sample", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "editable-evidence-"));
    const tracePath = join(tempDir, "trace.json");
    writeFileSync(
      tracePath,
      `${JSON.stringify({
        schema: "interactive-os.manual-editor-trace@1",
        issue: 85,
        scenario: "macos-text-replacement-acceptance",
        source: {
          browser: "Safari",
          device: "MacBook",
          keyboard: "System text replacement",
          locale: "en-US",
          os: "macOS",
        },
        events: [],
        assertions: {},
        notes: [],
      })}\n`,
    );

    try {
      const result = runPlan(
        "--file",
        tracePath,
        "--issue",
        "85",
        "--scenario",
        "macos-text-replacement-acceptance",
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: "manual-trace",
        valid: true,
        destination: "issue-85/macos-text-replacement-acceptance.json",
        manifestEntry: {
          path: "issue-85/macos-text-replacement-acceptance.json",
          scenario: "macos-text-replacement-acceptance",
        },
        issue: 85,
      });
    } finally {
      rmSync(tempDir, { force: true, recursive: true });
    }
  });

  it("rejects clipboard samples assigned to the wrong shape", () => {
    const result = runPlan(
      "--file",
      "tests/fixtures/clipboard-html-corpus/generic-webpage/paragraph-link-image.json",
      "--source",
      "slack",
      "--shape",
      "paragraph-link-image",
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Unexpected shape for slack");
  });
});

function runPlan(...args: string[]) {
  const result = spawnSync(process.execPath, [planScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  return result;
}
