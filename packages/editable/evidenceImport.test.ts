import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
const importScript = join(repoRoot, "tools/evidence/import-sample.mjs");

describe("evidence sample import CLI", () => {
  it("copies a clipboard sample and updates the clipboard manifest", () => {
    const tempRepo = createTempRepo();
    const samplePath = join(tempRepo, "slack-message.json");
    writeJson(samplePath, {
      schema: "interactive-os.clipboard-html-sample@1",
      mime: {
        "text/html": "<p>Hello <a href=\"https://example.com\">link</a></p>",
        "text/plain": "Hello link",
      },
    });

    try {
      const result = runImport(
        "--repo-root",
        tempRepo,
        "--file",
        samplePath,
        "--source",
        "slack",
        "--shape",
        "message-mention-link-emoji",
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: "clipboard",
        imported: true,
        destination: "slack/message-mention-link-emoji.json",
        destinationPath:
          "tests/fixtures/clipboard-html-corpus/slack/message-mention-link-emoji.json",
        manifestEntry: {
          path: "slack/message-mention-link-emoji.json",
          source: "slack",
          shape: "message-mention-link-emoji",
        },
      });
      expect(
        existsSync(
          join(
            tempRepo,
            "tests/fixtures/clipboard-html-corpus/slack/message-mention-link-emoji.json",
          ),
        ),
      ).toBe(true);
      expect(
        readJson(
          join(tempRepo, "tests/fixtures/clipboard-html-corpus/manifest.json"),
        ).samples,
      ).toEqual([
        {
          path: "slack/message-mention-link-emoji.json",
          source: "slack",
          shape: "message-mention-link-emoji",
        },
      ]);
    } finally {
      rmSync(tempRepo, { force: true, recursive: true });
    }
  });

  it("dry-runs a manual trace import without writing files", () => {
    const tempRepo = createTempRepo();
    const tracePath = join(tempRepo, "trace.json");
    writeJson(tracePath, {
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
    });

    try {
      const result = runImport(
        "--repo-root",
        tempRepo,
        "--file",
        tracePath,
        "--issue",
        "85",
        "--scenario",
        "macos-text-replacement-acceptance",
        "--dry-run",
      );

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        kind: "manual-trace",
        imported: false,
        dryRun: true,
        destination: "issue-85/macos-text-replacement-acceptance.json",
        manifestEntry: {
          path: "issue-85/macos-text-replacement-acceptance.json",
          scenario: "macos-text-replacement-acceptance",
        },
      });
      expect(
        existsSync(
          join(
            tempRepo,
            "tests/fixtures/manual-editor-traces/issue-85/macos-text-replacement-acceptance.json",
          ),
        ),
      ).toBe(false);
      expect(
        readJson(
          join(tempRepo, "tests/fixtures/manual-editor-traces/manifest.json"),
        ).issues[0].samples,
      ).toEqual([]);
    } finally {
      rmSync(tempRepo, { force: true, recursive: true });
    }
  });

  it("rejects duplicate clipboard shape imports unless forced", () => {
    const tempRepo = createTempRepo({
      clipboardSamples: [
        {
          path: "slack/existing.json",
          source: "slack",
          shape: "message-mention-link-emoji",
        },
      ],
    });
    const samplePath = join(tempRepo, "slack-message.json");
    writeJson(samplePath, {
      schema: "interactive-os.clipboard-html-sample@1",
      mime: {
        "text/html": "<p>Hello</p>",
        "text/plain": "Hello",
      },
    });

    try {
      const result = runImport(
        "--repo-root",
        tempRepo,
        "--file",
        samplePath,
        "--source",
        "slack",
        "--shape",
        "message-mention-link-emoji",
        "--destination",
        "slack/new.json",
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Clipboard manifest already covers slack/message-mention-link-emoji",
      );
    } finally {
      rmSync(tempRepo, { force: true, recursive: true });
    }
  });
});

function runImport(...args: string[]) {
  const result = spawnSync(process.execPath, [importScript, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }
  return result;
}

function createTempRepo(options?: {
  clipboardSamples?: Array<Record<string, string>>;
}) {
  const tempRepo = mkdtempSync(join(tmpdir(), "editable-evidence-import-"));
  const clipboardRoot = join(tempRepo, "tests/fixtures/clipboard-html-corpus");
  const manualTraceRoot = join(tempRepo, "tests/fixtures/manual-editor-traces");
  mkdirSync(clipboardRoot, { recursive: true });
  mkdirSync(manualTraceRoot, { recursive: true });
  writeJson(join(clipboardRoot, "manifest.json"), {
    schema: "interactive-os.clipboard-html-corpus@1",
    issue: 74,
    status: "collecting",
    requiredSources: [
      {
        id: "slack",
        name: "Slack",
        requiredShapes: [
          "message-mention-link-emoji",
          "inline-code-code-block",
        ],
      },
    ],
    requiredMimeTypes: ["text/html", "text/plain"],
    optionalMimeTypes: [],
    samples: options?.clipboardSamples ?? [],
  });
  writeJson(join(manualTraceRoot, "manifest.json"), {
    schema: "interactive-os.manual-editor-trace-corpus@1",
    status: "collecting",
    issues: [
      {
        issue: 85,
        title: "OS autocorrect and insertReplacementText history real browser traces",
        relatedDocs: [],
        requiredScenarios: [
          {
            id: "macos-text-replacement-acceptance",
            requiredFields: [],
            requiresRealDevice: true,
          },
        ],
        samples: [],
      },
    ],
  });
  return tempRepo;
}

function writeJson(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}
