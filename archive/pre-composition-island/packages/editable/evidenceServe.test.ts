import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const serveScript = join(repoRoot, "tools/evidence/serve.mjs");

describe("evidence server CLI", () => {
  it("prints deterministic capture URLs without starting a server", () => {
    const result = runServe(
      "--host",
      "127.0.0.1",
      "--port",
      "9876",
      "--print-urls",
    );

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Evidence index: http://127.0.0.1:9876/",
    );
    expect(result.stdout).toContain(
      "Clipboard capture: http://127.0.0.1:9876/clipboard-capture.html",
    );
    expect(result.stdout).toContain(
      "Manual trace recorder: http://127.0.0.1:9876/manual-trace-recorder.html",
    );
  });

  it("documents the default mobile-friendly host", () => {
    const result = runServe("--help");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--host <host>");
    expect(result.stdout).toContain("Defaults to 0.0.0.0");
  });

  it("prints an evidence index with missing targets", () => {
    const result = runServe("--print-index");

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("<title>Evidence Capture</title>");
    expect(result.stdout).toContain("slack/message-mention-link-emoji.json");
    expect(result.stdout).toContain(
      "pnpm run evidence:import -- --file &lt;downloaded-json&gt; --source slack --shape message-mention-link-emoji",
    );
    expect(result.stdout).toContain("issue-85/macos-text-replacement-acceptance.json");
  });
});

function runServe(...args: string[]) {
  const result = spawnSync(process.execPath, [serveScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  return result;
}
