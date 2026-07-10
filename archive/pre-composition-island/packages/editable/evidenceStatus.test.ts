import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const statusScript = join(repoRoot, "tools/evidence/status.mjs");

type EvidenceStatusReport = {
  complete: boolean;
  clipboard: {
    sources: Array<{
      id: string;
      missingTargets: Array<{
        importCommand: string;
        path: string;
        shape: string;
      }>;
    }>;
  };
  manualTraces: {
    issues: Array<{
      issue: number;
      missingTargets: Array<{
        importCommand: string;
        path: string;
        scenario: string;
      }>;
    }>;
  };
  problems: string[];
};

describe("evidence status CLI", () => {
  it("reports exact target paths for missing issue evidence", () => {
    const result = runStatus("--json");
    expect(result.status).toBe(0);
    const report = JSON.parse(result.stdout) as EvidenceStatusReport;

    expect(report.complete).toBe(false);
    expect(report.problems).toEqual([]);
    expect(
      report.clipboard.sources.find((source) => source.id === "slack")
        ?.missingTargets,
    ).toEqual([
      {
        shape: "message-mention-link-emoji",
        path: "slack/message-mention-link-emoji.json",
        importCommand:
          "pnpm run evidence:import -- --file <downloaded-json> --source slack --shape message-mention-link-emoji",
      },
      {
        shape: "inline-code-code-block",
        path: "slack/inline-code-code-block.json",
        importCommand:
          "pnpm run evidence:import -- --file <downloaded-json> --source slack --shape inline-code-code-block",
      },
    ]);
    expect(
      report.manualTraces.issues.find((issue) => issue.issue === 78)
        ?.missingTargets,
    ).toEqual([
      {
        scenario: "ios-keyboard-viewport-caret",
        path: "issue-78/ios-keyboard-viewport-caret.json",
        importCommand:
          "pnpm run evidence:import -- --file <trace-json> --issue 78 --scenario ios-keyboard-viewport-caret",
      },
      {
        scenario: "android-keyboard-viewport-caret",
        path: "issue-78/android-keyboard-viewport-caret.json",
        importCommand:
          "pnpm run evidence:import -- --file <trace-json> --issue 78 --scenario android-keyboard-viewport-caret",
      },
      {
        scenario: "android-webview-keyboard-viewport-caret",
        path: "issue-78/android-webview-keyboard-viewport-caret.json",
        importCommand:
          "pnpm run evidence:import -- --file <trace-json> --issue 78 --scenario android-webview-keyboard-viewport-caret",
      },
    ]);
  });

  it("fails the completion gate until required evidence is collected", () => {
    const result = runStatus("--require-complete");

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("complete: no");
    expect(result.stdout).toContain("slack/message-mention-link-emoji.json");
    expect(result.stdout).toContain(
      "issue-85/macos-text-replacement-acceptance.json",
    );
  });
});

function runStatus(...args: string[]) {
  const result = spawnSync(process.execPath, [statusScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  return result;
}
