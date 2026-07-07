import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixturesRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../tests/fixtures/manual-editor-traces",
);

type ManualTraceManifest = {
  schema: string;
  status: string;
  issues: Array<{
    issue: number;
    title: string;
    relatedDocs: string[];
    requiredScenarios: Array<{
      id: string;
      environment: {
        platform: string;
        browsers: string[];
        inputMethods: string[];
      };
      requiredOperations: string[];
      requiredFields: string[];
      requiresRealDevice: boolean;
    }>;
    samples: Array<{
      path: string;
      scenario: string;
    }>;
  }>;
};

describe("manual editor trace corpus", () => {
  it("declares the remaining real-device issue order", () => {
    const manifest = readManifest();

    expect(manifest).toMatchObject({
      schema: "interactive-os.manual-editor-trace-corpus@1",
      status: "collecting",
    });
    expect(manifest.issues.map((issue) => issue.issue)).toEqual([
      85, 70, 72, 78, 81,
    ]);
  });

  it("keeps each issue connected to concrete trace scenarios", () => {
    const manifest = readManifest();

    for (const issue of manifest.issues) {
      expect(issue.title).toEqual(expect.any(String));
      expect(issue.relatedDocs.length).toBeGreaterThan(0);
      expect(issue.requiredScenarios.length).toBeGreaterThan(0);

      for (const scenario of issue.requiredScenarios) {
        expect(scenario.id).toEqual(expect.any(String));
        expect(scenario.environment.platform).toEqual(expect.any(String));
        expect(scenario.environment.browsers.length).toBeGreaterThan(0);
        expect(scenario.environment.inputMethods.length).toBeGreaterThan(0);
        expect(scenario.requiredOperations.length).toBeGreaterThan(0);
        expect(scenario.requiredFields.length).toBeGreaterThan(0);
        expect(scenario.requiresRealDevice).toBe(true);
      }
    }
  });

  it("validates any collected trace samples", () => {
    const manifest = readManifest();

    for (const issue of manifest.issues) {
      const scenarioIds = new Set(
        issue.requiredScenarios.map((scenario) => scenario.id),
      );

      for (const sample of issue.samples) {
        expect(scenarioIds.has(sample.scenario)).toBe(true);
        const samplePath = join(fixturesRoot, sample.path);
        expect(existsSync(samplePath), sample.path).toBe(true);

        const payload = JSON.parse(readFileSync(samplePath, "utf8")) as {
          assertions?: unknown;
          events?: unknown[];
          issue?: number;
          notes?: unknown[];
          scenario?: string;
          schema?: string;
          source?: unknown;
        };

        expect(payload.schema).toBe("interactive-os.manual-editor-trace@1");
        expect(payload.issue).toBe(issue.issue);
        expect(payload.scenario).toBe(sample.scenario);
        expect(payload.source).toEqual(expect.any(Object));
        expect(Array.isArray(payload.events)).toBe(true);
        expect(payload.assertions).toEqual(expect.any(Object));
        expect(Array.isArray(payload.notes)).toBe(true);
      }
    }
  });
});

function readManifest(): ManualTraceManifest {
  return JSON.parse(
    readFileSync(join(fixturesRoot, "manifest.json"), "utf8"),
  ) as ManualTraceManifest;
}
