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
