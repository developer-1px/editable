import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const captureHtml = join(repoRoot, "tools/evidence/clipboard-capture.html");

describe("clipboard capture tool", () => {
  it("documents source-specific shapes and the import command", () => {
    const html = readFileSync(captureHtml, "utf8");

    expect(html).toContain('id="import-command"');
    expect(html).toContain('id="copy-import-command"');
    expect(html).toContain("const sourceShapes = {");
    expect(html).toContain("slack: [");
    expect(html).toContain(
      '["message-mention-link-emoji", "message-mention-link-emoji"]',
    );
    expect(html).toContain(
      '["inline-code-code-block", "inline-code-code-block"]',
    );
    expect(html).toContain("shapeInput.replaceChildren(");
    expect(html).toContain(
      "pnpm run evidence:import -- --file <downloaded-json> --source",
    );
  });
});
